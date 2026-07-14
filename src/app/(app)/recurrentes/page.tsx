import { prisma } from "@/lib/prisma";
import { mesEstaCerrado, rangoMes } from "@/lib/calculos";
import { TIPO_GASTO, nombreMes } from "@/lib/constantes";
import {
  BotonLink,
  Card,
  CardHeader,
  Etiqueta,
  Monto,
  Tabla,
  Td,
  Th,
  TituloPagina,
  Vacio,
} from "@/components/ui";
import { AccionesFila } from "./acciones-fila";
import { PanelGenerar } from "./generar";
import { cobertura } from "./ocupadas";

export const metadata = { title: "Recurrentes — Koncepto" };

type Plantilla = {
  id: string;
  concepto: string;
  montoSugerido: number;
  diaDelMes: number;
  activo: boolean;
  notas: string | null;
  socio: { nombre: string } | null;
};

function enRango(valor: string | undefined, min: number, max: number): number | undefined {
  const n = Number(valor);
  if (!valor || !Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

export default async function RecurrentesPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  const { anio: anioParam, mes: mesParam } = await searchParams;

  const hoy = new Date();
  const anio = enRango(anioParam, 2000, 2100) ?? hoy.getUTCFullYear();
  const mes = enRango(mesParam, 1, 12) ?? hoy.getUTCMonth() + 1;

  const [plantillas, cerrado, generados] = await Promise.all([
    prisma.gastoRecurrente.findMany({
      orderBy: [{ activo: "desc" }, { diaDelMes: "asc" }, { concepto: "asc" }],
      include: { socio: { select: { nombre: true } } },
    }),
    mesEstaCerrado(rangoMes(anio, mes).gte),
    // Se traen TODOS los gastos del mes, no solo los que tienen recurrenteId: `cobertura`
    // también reconoce un sueldo por socio, y esos gastos pueden haber quedado huérfanos.
    prisma.gasto.findMany({
      where: { fecha: rangoMes(anio, mes) },
      select: { recurrenteId: true, tipo: true, socioId: true, esBorrador: true },
    }),
  ]);

  const estadoEnElMes = new Map(
    generados.filter((g) => g.recurrenteId !== null).map((g) => [g.recurrenteId, g.esBorrador]),
  );

  const sueldos = plantillas.filter((p) => p.tipo === TIPO_GASTO.SUELDO);
  const operativos = plantillas.filter((p) => p.tipo === TIPO_GASTO.OPERATIVO);
  const activas = plantillas.filter((p) => p.activo);

  // Mismo criterio que usa generarMes: si contara distinto, el botón diría "Generar 3"
  // y se crearía 1.
  const cubierta = cobertura(generados);
  const faltantes = activas.filter((p) => !cubierta.cubre(p)).length;

  const anios = [hoy.getUTCFullYear() - 1, hoy.getUTCFullYear(), hoy.getUTCFullYear() + 1];
  if (!anios.includes(anio)) anios.push(anio);

  const totalSugerido = activas.reduce((acc, p) => acc + p.montoSugerido, 0);

  return (
    <>
      <TituloPagina
        titulo="Recurrentes"
        descripcion="Las plantillas de todos los meses: sueldos y gastos fijos"
        accion={
          <BotonLink href="/recurrentes/nuevo" variante="primario">
            Nueva plantilla
          </BotonLink>
        }
      />

      <PanelGenerar
        anio={anio}
        mes={mes}
        anios={anios.sort()}
        cerrado={cerrado}
        activas={activas.length}
        faltantes={faltantes}
      />

      <div className="space-y-4">
        <GrupoPlantillas
          titulo="Sueldos"
          descripcion="Se generan sin pago: el giro al socio se carga desde Socios"
          plantillas={sueldos}
          estadoEnElMes={estadoEnElMes}
          mes={mes}
          columnaNombre="Socio"
          vacio="No hay sueldos configurados."
        />

        <GrupoPlantillas
          titulo="Operativos"
          descripcion="Servicios y gastos fijos de la empresa"
          plantillas={operativos}
          estadoEnElMes={estadoEnElMes}
          mes={mes}
          columnaNombre="Concepto"
          vacio="No hay gastos operativos recurrentes."
        />
      </div>

      {activas.length > 0 && (
        <p className="text-sm text-tenue mt-4">
          {activas.length} {activas.length === 1 ? "plantilla activa" : "plantillas activas"} por{" "}
          <Monto centavos={totalSugerido} tono="tenue" /> sugeridos al mes.
        </p>
      )}
    </>
  );
}

function GrupoPlantillas({
  titulo,
  descripcion,
  plantillas,
  estadoEnElMes,
  mes,
  columnaNombre,
  vacio,
}: {
  titulo: string;
  descripcion: string;
  plantillas: Plantilla[];
  estadoEnElMes: Map<string | null, boolean>;
  mes: number;
  columnaNombre: string;
  vacio: string;
}) {
  return (
    <Card>
      <CardHeader titulo={titulo} descripcion={descripcion} />
      {plantillas.length === 0 ? (
        <Vacio>{vacio}</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>{columnaNombre}</Th>
              <Th alinear="derecha">Monto sugerido</Th>
              <Th alinear="derecha">Día</Th>
              <Th>Estado</Th>
              <Th>En {nombreMes(mes)}</Th>
              <Th alinear="derecha" />
            </tr>
          </thead>
          <tbody>
            {plantillas.map((p) => {
              const esBorrador = estadoEnElMes.get(p.id);
              return (
                <tr key={p.id} className={p.activo ? "" : "opacity-50"}>
                  <Td>
                    <span>{p.socio?.nombre ?? p.concepto}</span>
                    {p.notas && <p className="text-xs text-tenue mt-0.5">{p.notas}</p>}
                  </Td>
                  <Td alinear="derecha">
                    <Monto centavos={p.montoSugerido} tono={p.activo ? "neutro" : "tenue"} />
                  </Td>
                  <Td alinear="derecha" className="tabular text-tenue">
                    {p.diaDelMes}
                  </Td>
                  <Td>
                    {p.activo ? (
                      <Etiqueta tono="positivo">Activa</Etiqueta>
                    ) : (
                      <Etiqueta tono="neutro">Pausada</Etiqueta>
                    )}
                  </Td>
                  <Td>
                    {esBorrador === undefined ? (
                      <span className="text-xs text-tenue">Sin generar</span>
                    ) : esBorrador ? (
                      <Etiqueta tono="alerta">Borrador sin confirmar</Etiqueta>
                    ) : (
                      <Etiqueta tono="acento">Confirmado</Etiqueta>
                    )}
                  </Td>
                  <Td alinear="derecha">
                    <AccionesFila
                      id={p.id}
                      activo={p.activo}
                      concepto={p.socio?.nombre ?? p.concepto}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </Card>
  );
}
