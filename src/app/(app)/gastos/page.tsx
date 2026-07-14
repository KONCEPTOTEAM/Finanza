import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { rangoMes } from "@/lib/calculos";
import { aUSD } from "@/lib/dinero";
import { TIPO_GASTO, nombreMes } from "@/lib/constantes";
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
import { ConfirmarBorrador, NuevoGasto } from "./formularios";
import { SelectorMes } from "./selector-mes";
import { porBolsillo, quienPago, totalPagado } from "./pagos";

export const metadata = { title: "Gastos — Koncepto" };

const clave = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;

/**
 * "2026-07" -> {anio, mes}. Cualquier cosa rara cae en el mes actual.
 * El año se acota: el rango de `opcionesDeMes` sale de acá y no puede quedar
 * gobernado por la querystring (?mes=9999-12 armaría ~95.700 <option>).
 */
function mesPedido(param: string | undefined) {
  const hoy = new Date();
  const actual = { anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() + 1 };
  const m = /^(\d{4})-(\d{2})$/.exec(param ?? "");
  if (!m) return actual;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const anioValido = anio >= 2000 && anio <= actual.anio + 1;
  return anioValido && mes >= 1 && mes <= 12 ? { anio, mes } : actual;
}

/**
 * Meses desde el gasto más viejo hasta hoy, estirado en cualquiera de las dos
 * puntas para que el mes elegido siempre esté en la lista: si no, el <select>
 * controlado muestra otro mes que el que titula la página.
 */
function opcionesDeMes(desde: Date | null, elegido: { anio: number; mes: number }) {
  const hoy = new Date();
  const elegidoTs = Date.UTC(elegido.anio, elegido.mes - 1, 1);
  const desdeTs = desde
    ? Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1)
    : elegidoTs;
  let cursor = new Date(Math.min(desdeTs, elegidoTs));
  const finTs = Math.max(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1), elegidoTs);

  const opciones: { valor: string; etiqueta: string }[] = [];
  while (cursor.getTime() <= finTs) {
    const anio = cursor.getUTCFullYear();
    const mes = cursor.getUTCMonth() + 1;
    opciones.push({ valor: clave(anio, mes), etiqueta: `${nombreMes(mes)} de ${anio}` });
    cursor = new Date(Date.UTC(anio, mes, 1));
  }
  return opciones.reverse();
}

const incluirPagos = {
  pagos: {
    select: { monto: true, pagador: true, socio: { select: { nombre: true } } },
  },
  socio: { select: { nombre: true } },
} as const;

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: param } = await searchParams;
  const { anio, mes } = mesPedido(param);

  const [borradores, gastos, socios, masViejo] = await Promise.all([
    // Los borradores se muestran todos, sin filtrar por mes: mientras no se confirmen
    // no cuentan para nada y quedarían escondidos en un mes que nadie mira.
    prisma.gasto.findMany({
      where: { esBorrador: true },
      include: incluirPagos,
      orderBy: { fecha: "asc" },
    }),
    prisma.gasto.findMany({
      where: { esBorrador: false, fecha: rangoMes(anio, mes) },
      include: incluirPagos,
      orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
    }),
    prisma.socio.findMany({
      where: { activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true },
    }),
    prisma.gasto.findFirst({ orderBy: { fecha: "asc" }, select: { fecha: true } }),
  ]);

  const total = gastos.reduce((acc, g) => acc + g.monto, 0);
  const { empresa, socios: deSocios } = porBolsillo(gastos.flatMap((g) => g.pagos));

  // Solo los operativos pueden quedar impagos: un sueldo nunca tiene PagoGasto,
  // se cancela con un giro al socio. Mismo criterio que calcularGastosImpagos().
  const operativos = gastos.filter((g) => g.tipo === TIPO_GASTO.OPERATIVO);
  const totalOperativo = operativos.reduce((acc, g) => acc + g.monto, 0);
  const sinPagar = totalOperativo - totalPagado(operativos.flatMap((g) => g.pagos));

  return (
    <>
      <TituloPagina
        titulo="Gastos"
        descripcion="Un gasto y su pago son cosas distintas: acá se ve quién puso la plata."
        accion={<NuevoGasto socios={socios} />}
      />

      {borradores.length > 0 && (
        <Card className="mb-6 ring-1 ring-alerta/30">
          <CardHeader
            titulo="Sin confirmar"
            descripcion="Recurrentes generados automáticamente. No cuentan para nada hasta que los confirmes — corregí el monto si cambió."
          />
          <Tabla>
            <thead>
              <tr>
                <Th>Concepto</Th>
                <Th>Fecha</Th>
                <Th alinear="derecha">Monto</Th>
                <Th alinear="derecha">Confirmar</Th>
              </tr>
            </thead>
            <tbody>
              {borradores.map((g) => (
                <tr key={g.id} className="bg-alerta/5">
                  <Td>
                    <Link href={`/gastos/${g.id}`} className="hover:underline">
                      {g.concepto}
                    </Link>
                    {g.tipo === TIPO_GASTO.SUELDO && (
                      <span className="ml-2">
                        <Etiqueta tono="neutro">Sueldo{g.socio ? ` · ${g.socio.nombre}` : ""}</Etiqueta>
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-tenue text-xs">
                      {g.fecha.toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                  </Td>
                  <Td alinear="derecha">
                    <Monto centavos={g.monto} tono="tenue" />
                  </Td>
                  <Td alinear="derecha">
                    <div className="flex justify-end">
                      <ConfirmarBorrador id={g.id} montoUSD={aUSD(g.monto)} />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SelectorMes valor={clave(anio, mes)} opciones={opcionesDeMes(masViejo?.fecha ?? null, { anio, mes })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Stat
          etiqueta={`Gastos de ${nombreMes(mes)}`}
          centavos={total}
          detalle={`${gastos.length} ${gastos.length === 1 ? "gasto" : "gastos"}`}
        />
        <Stat
          etiqueta="Puso la empresa"
          centavos={empresa}
          detalle="Baja la caja el día de cada pago"
          tono="negativo"
        />
        <Stat
          etiqueta="Pusieron los socios"
          centavos={deSocios}
          detalle="No baja la caja: les sube la cuenta"
          tono="neutro"
        />
        <Stat
          etiqueta="Sin pagar"
          centavos={sinPagar}
          detalle="Operativos que se deben (los sueldos van por la cuenta del socio)"
          tono={sinPagar > 0 ? "negativo" : "neutro"}
        />
      </div>

      <Card>
        <CardHeader titulo={`${nombreMes(mes)} de ${anio}`} />
        {gastos.length === 0 ? (
          <Vacio>No hay gastos cargados en {nombreMes(mes)}.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Concepto</Th>
                <Th>Fecha</Th>
                <Th>Quién lo pagó</Th>
                <Th alinear="derecha">Monto</Th>
                <Th alinear="derecha">Pagado</Th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => {
                const pagado = totalPagado(g.pagos);
                const resta = g.monto - pagado;
                const esSueldo = g.tipo === TIPO_GASTO.SUELDO;
                return (
                  <tr key={g.id}>
                    <Td>
                      <Link href={`/gastos/${g.id}`} className="hover:underline">
                        {g.concepto}
                      </Link>
                      {esSueldo && (
                        <span className="ml-2">
                          <Etiqueta tono="neutro">
                            Sueldo{g.socio ? ` · ${g.socio.nombre}` : ""}
                          </Etiqueta>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-tenue text-xs">
                        {g.fecha.toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </span>
                    </Td>
                    <Td>
                      {esSueldo ? (
                        <span className="text-tenue">Se cancela con un giro</span>
                      ) : g.pagos.length === 0 ? (
                        <span className="text-tenue">Nadie todavía</span>
                      ) : (
                        quienPago(g.pagos)
                      )}
                    </Td>
                    <Td alinear="derecha">
                      <Monto centavos={g.monto} />
                    </Td>
                    <Td alinear="derecha">
                      {/* Un sueldo no se paga con PagoGasto: su estado real es el saldo
                          de la cuenta corriente del socio, no monto − pagos. */}
                      {esSueldo ? (
                        g.socioId ? (
                          <Link
                            href={`/socios/${g.socioId}`}
                            className="text-acento hover:underline text-xs"
                          >
                            Ver la cuenta →
                          </Link>
                        ) : (
                          <span className="text-tenue text-xs">Sin socio asignado</span>
                        )
                      ) : (
                        <>
                          <Monto centavos={pagado} tono="tenue" />
                          {resta > 0 && (
                            <span className="ml-2">
                              <Etiqueta tono="alerta">
                                {pagado === 0 ? "Impago" : "Parcial"}
                              </Etiqueta>
                            </span>
                          )}
                        </>
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
