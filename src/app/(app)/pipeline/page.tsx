import { prisma } from "@/lib/prisma";
import { Card, CardHeader, Stat, Tabla, Th, TituloPagina, Vacio } from "@/components/ui";
import { FilaOportunidad } from "./fila";
import { NuevaOportunidad } from "./nueva";
import type { OportunidadVista } from "./tipos";

export const metadata = { title: "Pipeline — Koncepto" };

export default async function PipelinePage() {
  const [oportunidades, clientes] = await Promise.all([
    prisma.oportunidad.findMany({
      orderBy: [{ confirmado: "desc" }, { creadoEn: "desc" }],
      include: {
        cliente: { select: { id: true, nombre: true } },
        trabajo: { select: { id: true, clienteId: true } },
      },
    }),
    prisma.cliente.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  const vistas: OportunidadVista[] = oportunidades.map((o) => ({
    id: o.id,
    nombre: o.nombre,
    monto: o.monto,
    sena: o.sena,
    confirmado: o.confirmado,
    notas: o.notas,
    clienteId: o.cliente?.id ?? null,
    clienteNombre: o.cliente?.nombre ?? null,
    trabajo: o.trabajo,
  }));

  const abiertas = vistas.filter((o) => o.trabajo === null);
  const sinConfirmar = abiertas.filter((o) => !o.confirmado);
  const confirmadas = abiertas.filter((o) => o.confirmado);
  const convertidas = vistas.filter((o) => o.trabajo !== null);

  const sumar = (lista: OportunidadVista[]) => lista.reduce((acc, o) => acc + o.monto, 0);

  return (
    <>
      <TituloPagina
        titulo="Pipeline"
        descripcion="Nada de acá cuenta como plata por cobrar hasta que lo conviertas en trabajo."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <Stat
          etiqueta="En juego"
          centavos={sumar(abiertas)}
          detalle={`${abiertas.length} ${abiertas.length === 1 ? "oportunidad abierta" : "oportunidades abiertas"}`}
          destacado
        />
        <Stat
          etiqueta="Confirmado sin facturar"
          centavos={sumar(confirmadas)}
          detalle="Esperando que lo conviertas en trabajo"
          tono="neutro"
        />
        <Stat
          etiqueta="Sin confirmar"
          centavos={sumar(sinConfirmar)}
          detalle="Todavía puede no pasar"
          tono="neutro"
        />
      </div>

      <NuevaOportunidad clientes={clientes} />

      <div className="space-y-4">
        <Card>
          <CardHeader
            titulo="Confirmadas sin facturar"
            descripcion="Convertirla la factura con fecha de hoy: recién ahí empieza a contar como algo por cobrar."
          />
          {confirmadas.length === 0 ? (
            <Vacio>No hay nada confirmado esperando factura.</Vacio>
          ) : (
            <TablaOportunidades oportunidades={confirmadas} clientes={clientes} />
          )}
        </Card>

        <Card>
          <CardHeader titulo="Sin confirmar" descripcion="Todavía se está negociando" />
          {sinConfirmar.length === 0 ? (
            <Vacio>No hay oportunidades abiertas.</Vacio>
          ) : (
            <TablaOportunidades oportunidades={sinConfirmar} clientes={clientes} />
          )}
        </Card>

        {convertidas.length > 0 && (
          <Card>
            <CardHeader
              titulo="Ya convertidas en trabajo"
              descripcion="Su saldo vive en el trabajo, no acá"
            />
            <TablaOportunidades oportunidades={convertidas} clientes={clientes} />
          </Card>
        )}
      </div>
    </>
  );
}

function TablaOportunidades({
  oportunidades,
  clientes,
}: {
  oportunidades: OportunidadVista[];
  clientes: { id: string; nombre: string }[];
}) {
  return (
    <Tabla>
      <thead>
        <tr>
          <Th>Oportunidad</Th>
          <Th>Cliente</Th>
          <Th alinear="derecha">Seña</Th>
          <Th alinear="derecha">Monto</Th>
          <Th alinear="derecha" />
        </tr>
      </thead>
      <tbody>
        {oportunidades.map((o) => (
          <FilaOportunidad key={o.id} oportunidad={o} clientes={clientes} />
        ))}
      </tbody>
    </Tabla>
  );
}
