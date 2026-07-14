import Link from "next/link";
import {
  calcularPanorama,
  calcularPorCobrar,
  calcularCuentasSocios,
  calcularResumenMes,
} from "@/lib/calculos";
import { prisma } from "@/lib/prisma";
import { formatearUSD } from "@/lib/dinero";
import { nombreMes } from "@/lib/constantes";
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

export const metadata = { title: "Panorama — Koncepto" };

export default async function PanoramaPage() {
  const hoy = new Date();
  const anio = hoy.getUTCFullYear();
  const mes = hoy.getUTCMonth() + 1;

  const [panorama, porCobrar, cuentas, resumen, borradores] = await Promise.all([
    calcularPanorama(),
    calcularPorCobrar(),
    calcularCuentasSocios(),
    calcularResumenMes(anio, mes),
    prisma.gasto.count({ where: { esBorrador: true } }),
  ]);

  const deudaConSocios = cuentas.filter((c) => c.saldo > 0);

  return (
    <>
      <TituloPagina
        titulo="Panorama"
        descripcion={`${nombreMes(mes)} de ${anio}`}
      />

      {borradores > 0 && (
        <Link href="/gastos" className="block mb-6">
          <div className="rounded-xl border border-alerta/30 bg-alerta/5 px-5 py-3 text-sm">
            <span className="text-alerta font-medium">
              {borradores} {borradores === 1 ? "gasto recurrente sin confirmar" : "gastos recurrentes sin confirmar"}
            </span>
            <span className="text-tenue"> — no cuentan hasta que los confirmes.</span>
          </div>
        </Link>
      )}

      {/* La distinción que la planilla no hacía: la plata que hay no es la plata que es nuestra. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Stat
          etiqueta="Caja real"
          centavos={panorama.cajaReal}
          detalle="Plata disponible hoy"
          tono="auto"
          destacado
        />
        <Stat
          etiqueta="Por cobrar"
          centavos={panorama.porCobrar}
          detalle={`${porCobrar.length} ${porCobrar.length === 1 ? "trabajo abierto" : "trabajos abiertos"}`}
          tono="neutro"
        />
        <Stat
          etiqueta="Deuda con socios"
          centavos={panorama.deudaSocios}
          detalle="Sueldos impagos + adelantos"
          tono={panorama.deudaSocios > 0 ? "negativo" : "neutro"}
        />
        <Stat
          etiqueta="Posición neta"
          centavos={panorama.posicionNeta}
          detalle="Si cobrás todo y pagás todo"
          tono="auto"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader
            titulo={`Cómo viene ${nombreMes(mes)}`}
            descripcion="Movimientos del mes en curso"
          />
          <div className="px-5 py-4 space-y-2.5 text-sm">
            <Fila etiqueta="Caja al empezar el mes" centavos={resumen.cajaApertura} />
            <Fila etiqueta="Cobrado" centavos={resumen.cobrado} tono="positivo" />
            <Fila etiqueta="Facturado" centavos={resumen.facturado} tono="tenue" />
            <Fila etiqueta="Gastos operativos" centavos={-resumen.gastosOperativos} tono="negativo" />
            <Fila etiqueta="Sueldos devengados" centavos={-resumen.sueldosDevengados} tono="negativo" />
            <div className="border-t border-borde pt-2.5 flex justify-between font-medium">
              <span>Caja ahora</span>
              <Monto centavos={resumen.cajaCierre} tono="auto" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader titulo="Se les debe a" />
          {deudaConSocios.length === 0 ? (
            <Vacio>Nadie tiene saldo a favor.</Vacio>
          ) : (
            <ul className="px-5 py-4 space-y-3">
              {deudaConSocios.map((c) => (
                <li key={c.socioId}>
                  <Link href={`/socios/${c.socioId}`} className="flex justify-between text-sm hover:opacity-70">
                    <span>{c.nombre}</span>
                    <Monto centavos={c.saldo} tono="negativo" />
                  </Link>
                  <p className="text-xs text-tenue mt-0.5">
                    {c.adelantos > 0 && `${formatearUSD(c.adelantos)} adelantados · `}
                    {formatearUSD(c.sueldosDevengados - c.girosRecibidos)} de sueldo
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          titulo="Quién nos debe"
          descripcion="Saldos abiertos, sin importar en qué mes se facturaron"
        />
        {porCobrar.length === 0 ? (
          <Vacio>No hay nada pendiente de cobro.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Trabajo</Th>
                <Th alinear="derecha">Facturado</Th>
                <Th alinear="derecha">Cobrado</Th>
                <Th alinear="derecha">Pendiente</Th>
              </tr>
            </thead>
            <tbody>
              {porCobrar.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <Link href={`/clientes/${t.clienteId}`} className="hover:underline">
                      {t.cliente}
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-tenue text-xs">
                      {t.fecha.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })}
                    </span>
                  </Td>
                  <Td alinear="derecha">
                    <Monto centavos={t.monto} tono="tenue" />
                  </Td>
                  <Td alinear="derecha">
                    <Monto centavos={t.cobrado} tono="tenue" />
                  </Td>
                  <Td alinear="derecha">
                    <Monto centavos={t.pendiente} tono="negativo" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>

      {panorama.deudaProveedores > 0 && (
        <div className="mt-4">
          <Etiqueta tono="alerta">
            Además hay {formatearUSD(panorama.deudaProveedores)} de gastos sin terminar de pagar
          </Etiqueta>
        </div>
      )}
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
