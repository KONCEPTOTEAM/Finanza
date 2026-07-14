import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, TituloPagina } from "@/components/ui";
import { FormularioRecurrente } from "../formulario";

export const metadata = { title: "Editar plantilla — Koncepto" };

export default async function EditarRecurrentePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [plantilla, socios, generados] = await Promise.all([
    prisma.gastoRecurrente.findUnique({ where: { id } }),
    prisma.socio.findMany({
      where: { activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, sueldoMensual: true },
    }),
    prisma.gasto.count({ where: { recurrenteId: id } }),
  ]);

  if (!plantilla) notFound();

  return (
    <>
      <TituloPagina
        titulo="Editar plantilla"
        descripcion={
          generados === 0
            ? "Todavía no generó ningún gasto"
            : `Ya generó ${generados} ${generados === 1 ? "gasto" : "gastos"}. Los cambios solo afectan a los que generes de acá en adelante.`
        }
      />
      <Card className="max-w-2xl">
        <div className="px-5 py-5">
          <FormularioRecurrente
            socios={socios}
            valores={{
              id: plantilla.id,
              tipo: plantilla.tipo,
              concepto: plantilla.concepto,
              socioId: plantilla.socioId ?? "",
              montoSugerido: plantilla.montoSugerido,
              diaDelMes: plantilla.diaDelMes,
              notas: plantilla.notas ?? "",
            }}
          />
        </div>
      </Card>
    </>
  );
}
