import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { calcularResumenMes, rangoMes } from "@/lib/calculos";
import { ETIQUETA_METODO, PAGADOR, TIPO_GASTO, nombreMes, type Metodo } from "@/lib/constantes";
import { formatearUSD } from "@/lib/dinero";
import {
  Card,
  CardHeader,
  Etiqueta,
  Monto,
  Stat,
  Tabla,
  Td,
  Th,
  TituloPagina,
  Vacio,
} from "@/components/ui";
import { chequeosDelMes } from "../../chequeos";
import { etiquetaMes, motivoParaNoCerrar, motivoParaNoReabrir } from "../../datos";
import { PanelCierre } from "./panel-cierre";

type Params = Promise<{ anio: string; mes: string }>;

/** Los params llegan como strings de la URL: nada garantiza que sean un mes real. */
function periodoDe(anio: string, mes: string) {
  const a = Number(anio);
  const m = Number(mes);
  if (!Number.isInteger(a) || !Number.isInteger(m)) return null;
  if (a < 2000 || a > 2100 || m < 1 || m > 12) return null;
  return { anio: a, mes: m };
}

export async function generateMetadata({ params }: { params: Params }) {
  const { anio, mes } = await params;
  const periodo = periodoDe(anio, mes);
  return { title: periodo ? `${etiquetaMes(periodo)} — Koncepto` : "Koncepto" };
}

export default async function MesPage({ params }: { params: Params }) {
  const crudos = await params;
  const periodo = periodoDe(crudos.anio, crudos.mes);
  if (!periodo) notFound();
  const { anio, mes } = periodo;

  const rango = rangoMes(anio, mes);

  const [resumen, chequeos, cierre, cobros, pagosGasto, giros, gastos, motivoCerrar, motivoReabrir] =
    await Promise.all([
      calcularResumenMes(anio, mes),
      chequeosDelMes(anio, mes),
      prisma.cierreMes.findUnique({
        where: { anio_mes: { anio, mes } },
        include: { cerradoPor: { select: { nombre: true } } },
      }),
      prisma.cobro.findMany({
        where: { fecha: rango },
        orderBy: { fecha: "asc" },
        include: { trabajo: { include: { cliente: { select: { nombre: true } } } } },
      }),
      prisma.pagoGasto.findMany({
        where: { fecha: rango, gasto: { esBorrador: false } },
        orderBy: { fecha: "asc" },
        include: { gasto: { select: { concepto: true } }, socio: { select: { nombre: true } } },
      }),
      prisma.pagoASocio.findMany({
        where: { fecha: rango },
        orderBy: { fecha: "asc" },
        include: { socio: { select: { nombre: true } } },
      }),
      prisma.gasto.findMany({
        where: { fecha: rango, esBorrador: false },
        orderBy: { fecha: "asc" },
        include: {
          socio: { select: { nombre: true } },
          pagos: { include: { socio: { select: { nombre: true } } } },
        },
      }),
      motivoParaNoCerrar(anio, mes),
      motivoParaNoReabrir(anio, mes),
    ]);

  const movimientos = [
    ...cobros.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      detalle: `${c.trabajo.cliente.nombre} — ${c.trabajo.descripcion}`,
      concepto: "Cobro",
      metodo: c.metodo as Metodo,
      monto: c.monto,
    })),
    ...pagosGasto
      .filter((p) => p.pagador === PAGADOR.EMPRESA)
      .map((p) => ({
        id: p.id,
        fecha: p.fecha,
        detalle: p.gasto.concepto,
        concepto: "Pago de la empresa",
        metodo: p.metodo as Metodo,
        monto: -p.monto,
      })),
    ...giros.map((g) => ({
      id: g.id,
      fecha: g.fecha,
      detalle: g.socio.nombre,
      concepto: "Giro a socio",
      metodo: g.metodo as Metodo,
      monto: -g.monto,
    })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const adelantosDeSocios = pagosGasto.filter((p) => p.pagador === PAGADOR.SOCIO);
  const totalAdelantos = adelantosDeSocios.reduce((acc, p) => acc + p.monto, 0);
  const pendientes = chequeos.reduce((acc, c) => acc + c.items.length, 0);

  // La cadena de caja tiene que cerrar sola: cajaCierre − cajaApertura es exactamente
  // cobrado − salidaDeCaja (ver calcularResumenMes). Los giros salen de las filas que ya
  // muestra la tabla de movimientos y los pagos de la empresa se derivan de salidaDeCaja,
  // así que el desglose no puede desincronizarse del total.
  const totalGiros = giros.reduce((acc, g) => acc + g.monto, 0);
  const pagosDeLaEmpresa = resumen.salidaDeCaja - totalGiros;

  return (
    <>
      <TituloPagina
        titulo={`${nombreMes(mes)} de ${anio}`}
        descripcion={
          cierre
            ? `Cerrado por ${cierre.cerradoPor.nombre} el ${fechaLarga(cierre.cerradoEn)}`
            : "Mes abierto: los movimientos todavía se pueden editar."
        }
        accion={
          <div className="flex items-center gap-2">
            {cierre ? <Etiqueta tono="neutro">Cerrado</Etiqueta> : <Etiqueta tono="acento">Abierto</Etiqueta>}
            <Link href="/meses" className="text-sm text-tenue hover:text-foreground transition">
              Todos los meses
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Stat etiqueta="Caja al abrir" centavos={resumen.cajaApertura} detalle="Arrastre del mes anterior" tono="auto" />
        <Stat etiqueta="Cobrado" centavos={resumen.cobrado} detalle={`${cobros.length} ${cobros.length === 1 ? "cobro" : "cobros"}`} tono={resumen.cobrado > 0 ? "positivo" : "neutro"} />
        <Stat etiqueta="Salió de caja" centavos={resumen.salidaDeCaja} detalle="Pagos de la empresa + giros" tono={resumen.salidaDeCaja > 0 ? "negativo" : "neutro"} />
        <Stat etiqueta="Caja al cerrar" centavos={resumen.cajaCierre} detalle="Apertura + cobrado − salidas" tono="auto" destacado />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Card className="lg:col-span-2">
          <CardHeader titulo="El mes en números" descripcion="Lo que reemplaza a la planilla" />
          <div className="px-5 py-4 space-y-2.5 text-sm">
            <p className="text-xs uppercase tracking-wide text-tenue">La caja</p>
            <Fila etiqueta="Caja al empezar" centavos={resumen.cajaApertura} />
            <Fila etiqueta="Cobrado" centavos={resumen.cobrado} tono="positivo" />
            <Fila etiqueta="Pagos de la empresa" centavos={-pagosDeLaEmpresa} tono="negativo" />
            <Fila etiqueta="Giros a socios" centavos={-totalGiros} tono="negativo" />
            <div className="border-t border-borde pt-2.5 flex justify-between font-medium">
              <span>Caja al terminar</span>
              <Monto centavos={resumen.cajaCierre} tono="auto" />
            </div>
          </div>

          {/* Bloque aparte y SIN total: lo devengado no es una cadena que termine en la caja.
              Un sueldo devengado que nadie retiró no sacó un peso de la caja, y un gasto que
              puso un socio del bolsillo tampoco. Sumarlos debajo de "Caja al terminar" daría
              un número que no existe en ninguna cuenta. */}
          <div className="px-5 pb-4 space-y-2.5 text-sm border-t border-borde pt-4">
            <p className="text-xs uppercase tracking-wide text-tenue">Lo devengado</p>
            <p className="text-xs text-tenue -mt-1.5 pb-0.5">
              Lo que el mes generó y consumió, sin importar cuándo se mueve la plata.
            </p>
            <Fila etiqueta="Facturado a clientes" centavos={resumen.facturado} tono="positivo" />
            <Fila etiqueta="Gastos operativos" centavos={-resumen.gastosOperativos} tono="negativo" />
            <Fila etiqueta="Sueldos devengados" centavos={-resumen.sueldosDevengados} tono="negativo" />
            <Fila
              etiqueta="De eso, puesto por socios de su bolsillo"
              centavos={totalAdelantos}
              tono="tenue"
            />
            <p className="text-xs text-tenue leading-relaxed pt-1">
              {totalAdelantos > 0 ? (
                <>
                  Lo que gastó el mes y lo que salió de la caja no son el mismo número: de lo
                  pagado este mes, {formatearUSD(totalAdelantos)} los puso un socio del bolsillo,
                  así que no bajaron la caja sino que subieron su cuenta corriente. Los sueldos
                  devengados tampoco bajan la caja hasta que se giran.
                </>
              ) : (
                <>
                  Estos números no suman a la caja: un sueldo devengado no sale de la caja hasta
                  que se gira, y un gasto impago todavía no salió.
                </>
              )}
            </p>
          </div>
        </Card>

        <PanelCierre
          anio={anio}
          mes={mes}
          pendientes={pendientes}
          motivoCerrar={motivoCerrar}
          motivoReabrir={motivoReabrir}
          cierre={
            cierre && {
              cajaFinal: cierre.cajaFinal,
              notas: cierre.notas,
              cerradoPor: cierre.cerradoPor.nombre,
              cerradoEn: fechaLarga(cierre.cerradoEn),
            }
          }
        />
      </div>

      {chequeos.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            titulo={cierre ? "Qué quedó pendiente" : "Antes de cerrar, mirá esto"}
            descripcion="Ninguno impide cerrar. Son cosas que siguen abiertas después del cierre."
          />
          <div className="divide-y divide-borde">
            {chequeos.map((c) => (
              <div key={c.clave} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-alerta">{c.titulo}</p>
                    <p className="text-xs text-tenue mt-0.5 max-w-xl leading-relaxed">{c.explicacion}</p>
                  </div>
                  <Monto centavos={c.total} tono="tenue" className="text-sm shrink-0" />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {c.items.map((i) => (
                    <li key={i.id}>
                      <Link
                        href={i.href}
                        className="flex items-baseline justify-between gap-4 text-sm hover:opacity-70"
                      >
                        <span>
                          {i.texto}
                          {i.detalle && <span className="text-tenue text-xs ml-1.5">{i.detalle}</span>}
                        </span>
                        <Monto centavos={i.monto} tono="tenue" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader
          titulo="Movimientos de caja"
          descripcion="Solo lo que entró y salió de la caja de la empresa"
        />
        {movimientos.length === 0 ? (
          <Vacio>No hubo movimientos de caja este mes.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Concepto</Th>
                <Th>Detalle</Th>
                <Th>Método</Th>
                <Th alinear="derecha">Monto</Th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <Td className="text-tenue whitespace-nowrap">{fechaCorta(m.fecha)}</Td>
                  <Td>{m.concepto}</Td>
                  <Td className="text-tenue">{m.detalle}</Td>
                  <Td className="text-tenue text-xs">{ETIQUETA_METODO[m.metodo] ?? m.metodo}</Td>
                  <Td alinear="derecha">
                    <Monto centavos={m.monto} tono="auto" />
                  </Td>
                </tr>
              ))}
              <tr>
                <Td className="font-medium">Variación de la caja</Td>
                <Td />
                <Td />
                <Td />
                <Td alinear="derecha" className="font-medium">
                  <Monto centavos={resumen.cajaCierre - resumen.cajaApertura} tono="auto" />
                </Td>
              </tr>
            </tbody>
          </Tabla>
        )}
      </Card>

      <Card>
        <CardHeader
          titulo="Gastos del mes"
          descripcion="Devengados, con quién puso la plata de cada uno"
        />
        {gastos.length === 0 ? (
          <Vacio>No hay gastos confirmados en este mes.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Concepto</Th>
                <Th>Quién lo pagó</Th>
                <Th alinear="derecha">Monto</Th>
                <Th alinear="derecha">Sin pagar</Th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => {
                const pagado = g.pagos.reduce((acc, p) => acc + p.monto, 0);
                return (
                  <tr key={g.id}>
                    <Td className="text-tenue whitespace-nowrap">{fechaCorta(g.fecha)}</Td>
                    <Td>
                      {g.concepto}
                      {g.tipo === TIPO_GASTO.SUELDO && (
                        <span className="text-tenue text-xs ml-1.5">
                          sueldo{g.socio && ` de ${g.socio.nombre}`}
                        </span>
                      )}
                    </Td>
                    <Td className="text-tenue text-xs">
                      {g.pagos.length === 0
                        ? "—"
                        : g.pagos
                            .map((p) =>
                              p.pagador === PAGADOR.SOCIO
                                ? `${p.socio?.nombre ?? "socio"} ${formatearUSD(p.monto)}`
                                : `empresa ${formatearUSD(p.monto)}`,
                            )
                            .join(" · ")}
                    </Td>
                    <Td alinear="derecha">
                      <Monto centavos={g.monto} />
                    </Td>
                    <Td alinear="derecha">
                      {/* Un sueldo NUNCA se salda con un PagoGasto: se salda con un giro
                          (PagoASocio), contra la cuenta corriente del socio. Mostrar acá
                          "sin pagar = monto − pagos" lo dejaría impago para siempre y
                          contradiría al chequeo de saldos de arriba. */}
                      {g.tipo === TIPO_GASTO.SUELDO ? (
                        <span className="text-tenue text-xs">vía giro</span>
                      ) : g.monto - pagado > 0 ? (
                        <Monto centavos={g.monto - pagado} tono="negativo" />
                      ) : (
                        <span className="text-tenue text-xs">saldado</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Card>
    </>
  );
}

function Fila({
  etiqueta,
  centavos,
  tono = "neutro",
}: {
  etiqueta: string;
  centavos: number;
  tono?: "neutro" | "positivo" | "negativo" | "tenue";
}) {
  return (
    <div className="flex justify-between">
      <span className="text-tenue">{etiqueta}</span>
      <Monto centavos={centavos} tono={tono} />
    </div>
  );
}

function fechaCorta(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function fechaLarga(d: Date) {
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
