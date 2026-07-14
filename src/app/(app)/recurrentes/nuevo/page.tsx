import { prisma } from "@/lib/prisma";
import { Card, TituloPagina } from "@/components/ui";
import { FormularioRecurrente } from "../formulario";

export const metadata = { title: "Nueva plantilla — Koncepto" };

export default async function NuevoRecurrentePage() {
  const socios = await prisma.socio.findMany({
    where: { activo: true },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    select: { id: true, nombre: true, sueldoMensual: true },
  });

  return (
    <>
      <TituloPagina
        titulo="Nueva plantilla"
        descripcion="Un gasto que se repite todos los meses"
      />
      <Card className="max-w-2xl">
        <div className="px-5 py-5">
          <FormularioRecurrente socios={socios} />
        </div>
      </Card>
    </>
  );
}
