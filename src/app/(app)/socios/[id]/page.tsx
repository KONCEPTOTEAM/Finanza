import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { socioActual } from "@/lib/dal";
import { calcularCajaReal, calcularCuentasSocios } from "@/lib/calculos";
import { formatearUSD } from "@/lib/dinero";
import { ETIQUETA_METODO, nombreMes, PAGADOR, TIPO_GASTO, type Metodo } from "@/lib/constantes";
import { Card, CardHeader, Monto, Stat, Tabla, Td, Th, TituloPagina, Vacio } from "@/components/ui";
import { BorrarGiro, FormularioClave, FormularioGiro, FormularioSocio } from "./formularios";

type Movimiento = {
  clave: string;
  fecha: Date;
  concepto: string;
  detalle?: string;
  /** Positivo sube la cuenta del socio (la empresa le debe más), negativo la baja. */
  delta: number;
  /** Solo en los giros: es lo único de la cuenta que se edita desde acá. */
  giroId?: string;
  /** Desempata dos movimientos del mismo día. */
  orden: number;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const socio = await prisma.socio.findUnique({ where: { id }, select: { nombre: true } });
  return { title: socio ? `${socio.nombre} — Koncepto` : "Socio — Koncepto" };
}

export default async function SocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const socio = await prisma.socio.findUnique({
    where: { id },
    select: { id: true, nombre: true, email: true, sueldoMensual: true, activo: true },
  });
  if (!socio) notFound();

  const [cuentas, cajaReal, yo, adelantos, sueldos, giros] = await Promise.all([
    calcularCuentasSocios(),
    calcularCajaReal(),
    socioActual(),
    prisma.pagoGasto.findMany({
      where: { pagador: PAGADOR.SOCIO, socioId: id, gasto: { esBorrador: false } },
      select: {
        id: true,
        monto: true,
        fecha: true,
        creadoEn: true,
        metodo: true,
        gasto: { select: { concepto: true } },
      },
    }),
    prisma.gasto.findMany({
      where: { tipo: TIPO_GASTO.SUELDO, socioId: id, esBorrador: false },
      select: { id: true, monto: true, fecha: true, creadoEn: true, concepto: true },
    }),
    prisma.pagoASocio.findMany({
      where: { socioId: id },
      select: { id: true, monto: true, fecha: true, creadoEn: true, metodo: true, notas: true },
    }),
  ]);

  // Los tres orígenes de la cuenta corriente, mergeados en un solo extracto.
  const sinOrdenar: Movimiento[] = [
    ...adelantos.map((p) => ({
      clave: `a-${p.id}`,
      fecha: p.fecha,
      concepto: `Puso la plata de ${p.gasto.concepto}`,
      detalle: ETIQUETA_METODO[p.metodo as Metodo] ?? p.metodo,
      delta: p.monto,
      orden: p.creadoEn.getTime(),
    })),
    ...sueldos.map((g) => ({
      clave: `s-${g.id}`,
      fecha: g.fecha,
      concepto: `Sueldo de ${nombreMes(g.fecha.getUTCMonth() + 1)}`,
      detalle: g.concepto,
      delta: g.monto,
      orden: g.creadoEn.getTime(),
    })),
    ...giros.map((p) => ({
      clave: `g-${p.id}`,
      fecha: p.fecha,
      concepto: "Le giramos",
      detalle: p.notas ?? ETIQUETA_METODO[p.metodo as Metodo] ?? p.metodo,
      delta: -p.monto,
      giroId: p.id,
      orden: p.creadoEn.getTime(),
    })),
  ];

  const movimientos = sinOrdenar.sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime() || a.orden - b.orden,
  );

  // Saldo acumulado línea por línea, como un resumen bancario. La última línea
  // tiene que dar exactamente el saldo del encabezado.
  const extracto = movimientos.reduce<((typeof movimientos)[number] & { saldo: number })[]>(
    (acc, m) => {
      const saldoPrevio = acc.length > 0 ? acc[acc.length - 1].saldo : 0;
      acc.push({ ...m, saldo: saldoPrevio + m.delta });
      return acc;
    },
    [],
  );

  const cuenta = cuentas.find((c) => c.socioId === id);
  if (!cuenta) notFound();

  const saldo = cuenta.saldo;
  const esMiFicha = yo.id === socio.id;
  const hoy = new Date();
  const hoyISO = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, "0")}-${String(hoy.getUTCDate()).padStart(2, "0")}`;

  return (
    <>
      <TituloPagina
        titulo={socio.nombre}
        descripcion={`${socio.email} · sueldo mensual ${formatearUSD(socio.sueldoMensual)}${socio.activo ? "" : " · dado de baja"}`}
        accion={
          <Link href="/socios" className="text-sm text-tenue hover:text-foreground transition">
            ← Todos los socios
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat
          etiqueta={saldo >= 0 ? "Le debemos" : "Nos debe"}
          centavos={Math.abs(saldo)}
          detalle="Adelantos + sueldos − giros"
          tono={saldo > 0 ? "negativo" : saldo < 0 ? "positivo" : "neutro"}
          destacado
        />
        <Stat etiqueta="Adelantos que puso" centavos={cuenta.adelantos} tono="neutro" />
        <Stat etiqueta="Sueldos devengados" centavos={cuenta.sueldosDevengados} tono="neutro" />
        <Stat etiqueta="Giros recibidos" centavos={cuenta.girosRecibidos} tono="neutro" />
      </div>

      {!socio.activo && (
        <div className="mb-6 rounded-lg bg-alerta/10 text-alerta text-sm px-4 py-3">
          Este socio está dado de baja. Lo que se le debe se le sigue debiendo: el saldo cuenta en
          el panorama y le podés girar para saldarlo.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader
            titulo="Extracto"
            descripcion="Todo lo que movió la cuenta, en orden. El saldo de la última línea es el de arriba."
          />
          {extracto.length === 0 ? (
            <Vacio>Todavía no hay movimientos en esta cuenta.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Concepto</Th>
                  <Th alinear="derecha">Movimiento</Th>
                  <Th alinear="derecha">Saldo</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {extracto.map((m) => (
                  <tr key={m.clave}>
                    <Td>
                      <span className="text-tenue text-xs tabular">
                        {m.fecha.toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                      </span>
                    </Td>
                    <Td>
                      <span>{m.concepto}</span>
                      {m.detalle && <p className="text-xs text-tenue mt-0.5">{m.detalle}</p>}
                    </Td>
                    <Td alinear="derecha">
                      <span className={`tabular ${m.delta >= 0 ? "text-negativo" : "text-positivo"}`}>
                        {m.delta >= 0 ? "+" : "−"}
                        {formatearUSD(Math.abs(m.delta))}
                      </span>
                    </Td>
                    <Td alinear="derecha">
                      <Monto centavos={m.saldo} tono="auto" className="font-medium" />
                    </Td>
                    <Td alinear="derecha">
                      {m.giroId && <BorrarGiro id={m.giroId} />}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader titulo="Registrar un giro" descripcion="La empresa le paga: baja la caja y baja su cuenta." />
            <FormularioGiro socioId={socio.id} cajaReal={cajaReal} saldo={saldo} hoy={hoyISO} />
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader titulo="Datos del socio" />
          <FormularioSocio
            socioId={socio.id}
            nombre={socio.nombre}
            sueldoMensual={socio.sueldoMensual}
          />
        </Card>

        <Card>
          <CardHeader
            titulo="Contraseña"
            descripcion={esMiFicha ? "Cambiá la tuya." : `Solo ${socio.nombre} puede cambiar su contraseña.`}
          />
          {esMiFicha ? (
            <FormularioClave socioId={socio.id} />
          ) : (
            <Vacio>Entrá con tu cuenta para cambiar tu propia contraseña.</Vacio>
          )}
        </Card>
      </div>
    </>
  );
}
