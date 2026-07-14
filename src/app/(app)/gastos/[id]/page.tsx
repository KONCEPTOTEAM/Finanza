import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { aUSD, formatearUSD } from "@/lib/dinero";
import { ETIQUETA_METODO, PAGADOR, TIPO_GASTO, type Metodo } from "@/lib/constantes";
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
import { BorrarGasto, BorrarPago, EditarGasto, NuevoPago } from "../formularios";
import { porBolsillo, totalPagado } from "../pagos";

export const metadata = { title: "Gasto — Koncepto" };

const fechaCorta = (f: Date) =>
  f.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export default async function GastoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [gasto, socios] = await Promise.all([
    prisma.gasto.findUnique({
      where: { id },
      include: {
        socio: { select: { id: true, nombre: true } },
        pagos: {
          orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
          include: { socio: { select: { id: true, nombre: true } } },
        },
      },
    }),
    prisma.socio.findMany({
      where: { activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true },
    }),
  ]);
  if (!gasto) notFound();

  const pagado = totalPagado(gasto.pagos);
  const resta = gasto.monto - pagado;
  const { empresa, socios: deSocios } = porBolsillo(gasto.pagos);
  const esSueldo = gasto.tipo === TIPO_GASTO.SUELDO;

  return (
    <>
      <TituloPagina
        titulo={gasto.concepto}
        descripcion={`${fechaCorta(gasto.fecha)} · ${esSueldo ? "Sueldo" : "Operativo"}`}
        accion={
          <Link href="/gastos" className="text-sm text-tenue hover:text-foreground transition">
            ← Volver a gastos
          </Link>
        }
      />

      {gasto.esBorrador && (
        <div className="rounded-xl border border-alerta/30 bg-alerta/5 px-5 py-3 text-sm mb-6">
          <span className="text-alerta font-medium">Sin confirmar</span>
          <span className="text-tenue">
            {" "}
            — no cuenta para nada hasta que lo confirmes desde la lista.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat etiqueta="Monto" centavos={gasto.monto} destacado />
        <Stat
          etiqueta="Pagado"
          centavos={pagado}
          tono="neutro"
          detalle={resta > 0 ? `Faltan ${formatearUSD(resta)}` : "Pagado por completo"}
        />
        <Stat etiqueta="Puso la empresa" centavos={empresa} detalle="Salió de la caja" tono="negativo" />
        <Stat
          etiqueta="Pusieron los socios"
          centavos={deSocios}
          detalle="Se les debe: no salió de la caja"
          tono="neutro"
        />
      </div>

      {esSueldo && (
        <Card className="mb-6">
          <CardHeader
            titulo="Este gasto es un sueldo"
            descripcion="Los sueldos se generan desde recurrentes y se cancelan girándole la plata al socio. Acá se muestran solo para leer."
          />
          <div className="px-5 py-4 text-sm">
            {gasto.socio ? (
              <Link href={`/socios/${gasto.socio.id}`} className="text-acento hover:underline">
                Ver la cuenta de {gasto.socio.nombre} →
              </Link>
            ) : (
              <span className="text-tenue">Sin socio asignado.</span>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader
            titulo="Pagos"
            descripcion="Un mismo gasto puede tener varios pagadores."
          />
          {gasto.pagos.length === 0 ? (
            <Vacio>Todavía no lo pagó nadie.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Quién</Th>
                  <Th>Fecha</Th>
                  <Th alinear="derecha">Monto</Th>
                  <Th alinear="derecha"></Th>
                </tr>
              </thead>
              <tbody>
                {gasto.pagos.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      {p.pagador === PAGADOR.SOCIO ? (
                        <>
                          {p.socio ? (
                            <Link href={`/socios/${p.socio.id}`} className="hover:underline">
                              {p.socio.nombre}
                            </Link>
                          ) : (
                            <span className="text-negativo">Socio sin identificar</span>
                          )}
                          <span className="ml-2">
                            <Etiqueta tono="acento">De su bolsillo</Etiqueta>
                          </span>
                        </>
                      ) : (
                        "La empresa"
                      )}
                      <p className="text-xs text-tenue mt-0.5">
                        {ETIQUETA_METODO[p.metodo as Metodo] ?? p.metodo}
                        {p.notas ? ` · ${p.notas}` : ""}
                      </p>
                    </Td>
                    <Td>
                      <span className="text-tenue text-xs">{fechaCorta(p.fecha)}</span>
                    </Td>
                    <Td alinear="derecha">
                      <Monto centavos={p.monto} />
                    </Td>
                    <Td alinear="derecha">
                      <div className="flex justify-end">
                        <BorrarPago id={p.id} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}

          {!esSueldo && !gasto.esBorrador && resta > 0 && (
            <div className="border-t border-borde">
              <NuevoPago gastoId={gasto.id} socios={socios} restanteCentavos={resta} />
            </div>
          )}
          {!esSueldo && !gasto.esBorrador && resta <= 0 && (
            <p className="px-5 py-3 border-t border-borde text-sm text-tenue">
              Este gasto ya está pagado por completo.
            </p>
          )}
          {gasto.esBorrador && (
            <p className="px-5 py-3 border-t border-borde text-sm text-tenue">
              Confirmá el gasto desde la lista para poder cargarle pagos.
            </p>
          )}
        </Card>

        {!esSueldo && (
          <Card>
            <CardHeader titulo="Editar" accion={<BorrarGasto id={gasto.id} />} />
            <EditarGasto
              gasto={{
                id: gasto.id,
                concepto: gasto.concepto,
                montoUSD: aUSD(gasto.monto),
                fecha: gasto.fecha.toISOString().slice(0, 10),
                notas: gasto.notas ?? "",
              }}
            />
          </Card>
        )}
      </div>
    </>
  );
}
