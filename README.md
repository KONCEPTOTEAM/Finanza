# Koncepto — Control de caja

Ingresos, egresos, cuentas de socios y cierre de mes. Reemplaza la planilla mensual.

## Arrancar

Necesitás un Postgres. En local, uno cualquiera; en producción, Neon.

```bash
npm install          # corre `prisma generate` solo, en postinstall
npm run db:migrate   # aplica las migraciones
npm run db:seed      # carga junio y julio 2026
npm run dev
```

Si no tenés el rol de Postgres creado:

```bash
sudo -u postgres psql -c "CREATE ROLE facundo LOGIN SUPERUSER PASSWORD 'facundo'" \
                       -c "CREATE DATABASE koncepto OWNER facundo"
```

Entrás en http://localhost:3000 con cualquiera de los tres socios:

| Correo | Clave |
|---|---|
| facundo@koncepto.com | koncepto2026 |
| jorge@koncepto.com | koncepto2026 |
| lucas@koncepto.com | koncepto2026 |

**Cambiá las claves y el `SESSION_SECRET` del `.env` antes de usar esto en serio.**
Para el secret: `openssl rand -base64 32`.

## La idea

La planilla mezclaba dos cosas en un solo número: **cuánta plata hay** y **cuánta plata es
nuestra**. Cuando Jorge paga la suscripción de Claude con su tarjeta, la plata no salió de la
caja — pero la empresa ahora le debe a Jorge. Son hechos distintos y acá se registran distinto.

De ahí salen las dos únicas fórmulas del sistema (`src/lib/calculos.ts`):

```
Caja real    = cobros − pagos que puso la empresa − plata girada a socios
Cuenta socio = adelantos que puso + sueldos devengados − plata que recibió
```

Todo lo demás se deriva de eso. En particular, **nada se arrastra a mano**: el saldo de un
trabajo cobrado a medias sigue apareciendo como pendiente hasta que se cobre, sin importar
cuántos meses pasen. La caja de apertura de un mes es la de cierre del anterior, calculada.

## El modelo

- **Cliente → Trabajo → Cobros.** Un trabajo se factura una vez y recibe cobros parciales, que
  pueden caer en meses distintos. Inelmap facturó 400 en junio: cobró 200 en junio y 200 en julio.
- **Gasto → Pagos**, y cada pago dice **quién puso la plata** (la empresa o un socio). Un gasto
  puede tener varios pagos con distinto pagador: Publicidad de julio fueron 100, con Jorge
  poniendo 88 y la empresa 12.
- **Cuenta corriente por socio.** Una sola por persona. Sube con los adelantos y con el sueldo
  devengado, baja cuando la empresa le gira. Un giro cancela las dos cosas indistintamente.
- **Gastos recurrentes.** Claude, Higgsfield, Publicidad y los tres sueldos. Se generan como
  borrador editable porque el monto no es fijo: Claude pasó de 100 a 200 y Publicidad de 60 a 100
  entre junio y julio. Un borrador no cuenta para nada hasta que se confirma.
- **Pipeline.** Una oportunidad confirmada no suma a "por cobrar" hasta que la convertís en
  trabajo, explícitamente. Si no, tendrías deuda inventada.
- **Cierre de mes.** Avisa qué quedó sin resolver y bloquea las ediciones del período.

## Convenciones

**La plata va en centavos enteros, nunca en float.** USD 500 se guarda como `50000`. Los float
arrastran errores de redondeo. Los helpers están en `src/lib/dinero.ts`, y los de
`src/lib/validacion.ts` ya devuelven centavos.

**No hay enums.** SQLite no los soporta en Prisma, así que los campos de tipo son `String` y las
constantes viven en `src/lib/constantes.ts`.

**Las fechas van en UTC** (`new Date(Date.UTC(...))`) para que un movimiento no se corra de mes
según la zona horaria.

## Qué se encontró al migrar la planilla

El modelo reproduce todos los totales de junio (2750 facturado, 1850 cobrado, 1500 de sueldos) y
los 600 por cobrar de julio. En el camino aparecieron cuatro cosas:

1. **`TOTAL GASTO` de junio decía 200, pero los ítems suman 190** (100 + 30 + 60). Se importó 190,
   así que junio cierra en 160 y no en los 150 que arrastraba la hoja. Si aparece el gasto de 10
   que falta, cargalo y el número se corrige solo.
2. **`A cobrar mes = B9 − C9` de julio no significaba nada**: restaba plata que entró (425) menos
   plata que te deben (600). El valor correcto ya estaba en `B9`.
3. **Plastitec y la psicóloga estaban re-listados a mano** en julio: eran deuda de junio copiada.
   Acá eso no hace falta.
4. **`CAJA JULIO` no era caja**, era una proyección que asumía cobrar todo lo pendiente. Ahora son
   dos números separados y con nombre propio.

La caja de julio no era 95: era **423**, con 318 de deuda con Jorge y 10 del error de suma.
`423 − 318 − 10 = 95`.

## Estructura

```
prisma/
  schema.prisma      el modelo, comentado
  seed.ts            junio y julio 2026, con los totales esperados documentados
prisma.config.ts     Prisma 7 lo exige: el DATABASE_URL va acá, no en el datasource
src/
  proxy.ts           filtro optimista de sesión (en Next 16 esto ya no se llama middleware)
  lib/
    calculos.ts      LAS FÓRMULAS. Todo lo que es plata sale de acá.
    dinero.ts        centavos <-> USD
    validacion.ts    esquemas de Zod 4 y helpers de FormData
    dal.ts           verificarSesion() — la seguridad real, pegada a los datos
    session.ts       JWT con jose en cookie httpOnly
    prisma.ts        singleton con el driver adapter que Prisma 7 exige
    constantes.ts    los "enums" que SQLite no tiene
  components/        ui.tsx (primitivas) y nav.tsx
  app/
    login/
    (app)/           todo lo privado; el layout fuerza render dinámico
```

## Notas del stack

Next.js 16 y Prisma 7 rompieron cosas respecto de las versiones anteriores. Lo que más sorprende:

- El cliente de Prisma se importa de **`@/generated/prisma/client`**, no de `@prisma/client`. Es
  código TypeScript generado dentro del árbol (gitignoreado), por eso `prisma generate` corre en
  `postinstall` y antes de `build`.
- **`new PrismaClient()` sin argumentos tira excepción**: la v7 exige un driver adapter.
- **`prisma.config.ts` es obligatorio** para `db push` y `db seed`, y la clave `"prisma"` de
  `package.json` se ignora en silencio.
- `params`, `searchParams` y `cookies()` son **promesas**: hay que await.
- El archivo se llama **`proxy.ts`** y la función exportada, `proxy`.
- `use cache` / `cacheLife` / `cacheTag` **tiran excepción** con `cacheComponents` apagado.

## Deploy en Vercel + Neon

La app corre sobre Postgres, así que Neon es solo una connection string distinta.

1. **Creá la base en Neon** (`vercel integration add neon`, o desde el dashboard).
2. **Variables de entorno en Vercel:**
   - `DATABASE_URL` → la connection string **con pooler** (`...-pooler...`). La usa la app.
   - `DIRECT_DATABASE_URL` → la **directa** (sin `-pooler`). Solo para migraciones: el pooler
     de Neon corre PgBouncer en transaction mode y no soporta los advisory locks del migrador.
   - `SESSION_SECRET` → `openssl rand -base64 32`.
3. **Migraciones:** corré `npm run db:deploy` (`prisma migrate deploy`) contra la base nueva,
   o agregalo al build command. No uses `db:seed` en producción: borra todo.
4. **Región:** poné las funciones de Vercel en la misma región que la base de Neon. Cada página
   consulta la base en cada request; cruzar el Atlántico se paga en cada carga.

### Por qué `@prisma/adapter-pg` y no `@prisma/adapter-neon`

`adapter-pg` habla protocolo Postgres por TCP, así que el mismo código sirve para el Postgres
local y para Neon. Un solo camino, sin un adapter que solo se ejercita en producción.

Si algún día se cambia a `@prisma/adapter-neon`, **usá `PrismaNeon` (WebSocket), nunca
`PrismaNeonHttp`**. El modo HTTP de Neon no soporta transacciones interactivas, y este proyecto
usa `prisma.$transaction(async (tx) => ...)` en 21 lugares — todos donde se mueve plata.
Fallarían en producción andando perfecto en local.
