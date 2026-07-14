<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Koncepto — control de caja

Todo el código, la UI y los comentarios van en español.

## Prisma 7 y Zod 4 tampoco son los que conocés

- El cliente de Prisma se importa de `@/generated/prisma/client`, **nunca** de `@prisma/client`.
  Es código TS generado dentro del árbol; `prisma generate` corre en `postinstall` y antes de `build`.
- `new PrismaClient()` sin argumentos tira excepción: la v7 exige un driver adapter. Usá el
  singleton de `@/lib/prisma`.
- `prisma.config.ts` es obligatorio y ahí va el `DATABASE_URL`. La clave `"prisma"` de
  `package.json` se ignora en silencio.
- Zod 4: `z.email({ error: "..." })`, no `z.string().email({ message: "..." })`.
  `.flatten()` está deprecado, usá `z.flattenError()`.
- `z.coerce.number()` convierte `null` y `""` a **0 en silencio**. Para montos usá siempre los
  helpers de `@/lib/validacion`.

Y de Next 16, lo que más rompe acá: `params` / `searchParams` / `cookies()` son promesas;
el archivo es `src/proxy.ts` con la función `proxy`; `use cache` / `cacheLife` / `cacheTag`
tiran excepción porque `cacheComponents` está apagado a propósito; `revalidateTag` exige dos
argumentos (usá `revalidatePath`).

## Reglas del dominio

**La plata va en centavos enteros.** Nunca float. USD 500 => `50000`. Helpers en `@/lib/dinero`.
Los esquemas de `@/lib/validacion` ya devuelven centavos: no multipliques de nuevo.

**Las dos fórmulas viven en `@/lib/calculos`. No las reimplementes en ningún lado.**

```
Caja real    = cobros − pagos con pagador=EMPRESA − giros a socios
Cuenta socio = adelantos (pagos con pagador=SOCIO) + sueldos devengados − giros recibidos
```

Un gasto que pagó un socio de su bolsillo **no baja la caja**: le sube la cuenta corriente. Esa
distinción es la razón de existir de la app.

Un `PagoGasto` con `pagador=SOCIO` **exige** `socioId`; con `pagador=EMPRESA` exige `socioId=null`.
Cualquiera de las dos al revés corrompe la cuenta de un socio.

Los gastos con `esBorrador=true` no cuentan para nada hasta confirmarse.

SQLite no soporta enums: los campos de tipo son `String` y las constantes están en
`@/lib/constantes`. Fechas en UTC, mostradas con `timeZone: "UTC"`.

## Seguridad

**Toda Server Action empieza con `await verificarSesion()`** de `@/lib/dal`. El proxy no cubre los
Server Actions: son endpoints POST que el matcher no intercepta. El proxy es solo un filtro
optimista; la verificación real va pegada a los datos.

Nunca selecciones ni pases `passwordHash` a un componente cliente.

## Base de datos

Postgres, vía `@prisma/adapter-pg` (TCP). El mismo adapter sirve para el Postgres local y para
Neon en producción: hay un solo camino de código.

Envolvé toda mutación de varios pasos en `prisma.$transaction()`. Se usa en 21 lugares, todos
donde se mueve plata. **Si alguna vez se pasa a `@prisma/adapter-neon`, usá `PrismaNeon`
(WebSocket), nunca `PrismaNeonHttp`:** el modo HTTP de Neon no soporta transacciones
interactivas y todas esas operaciones fallarían en producción andando bien en local.

Después de tocar `schema.prisma`: `npm run db:migrate` (crea la migración y la aplica).
En producción: `npm run db:deploy`. Para empezar de cero en local: `npm run db:reset`.
`npm run db:seed` BORRA TODO: nunca contra producción.
