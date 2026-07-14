import Link from "next/link";
import { prisma } from "@/lib/prisma";
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
import { NuevoCliente } from "./formularios";

export const metadata = { title: "Clientes — Koncepto" };

export default async function ClientesPage() {
  const clientes = await prisma.cliente.findMany({
    orderBy: { nombre: "asc" },
    include: {
      trabajos: { select: { monto: true, cobros: { select: { monto: true } } } },
    },
  });

  const filas = clientes
    .map((c) => {
      const facturado = c.trabajos.reduce((acc, t) => acc + t.monto, 0);
      const cobrado = c.trabajos.reduce(
        (acc, t) => acc + t.cobros.reduce((s, co) => s + co.monto, 0),
        0,
      );
      return {
        id: c.id,
        nombre: c.nombre,
        activo: c.activo,
        trabajos: c.trabajos.length,
        facturado,
        cobrado,
        pendiente: facturado - cobrado,
      };
    })
    // Los que deben plata primero: es lo único que hay que mirar todos los días.
    .sort(
      (a, b) =>
        Number(b.activo) - Number(a.activo) ||
        b.pendiente - a.pendiente ||
        a.nombre.localeCompare(b.nombre, "es"),
    );

  const totales = filas.reduce(
    (acc, f) => ({
      facturado: acc.facturado + f.facturado,
      cobrado: acc.cobrado + f.cobrado,
      pendiente: acc.pendiente + f.pendiente,
    }),
    { facturado: 0, cobrado: 0, pendiente: 0 },
  );

  const deudores = filas.filter((f) => f.pendiente > 0).length;

  return (
    <>
      <TituloPagina
        titulo="Clientes"
        descripcion="Facturado, cobrado y lo que queda pendiente de cada uno"
        accion={<NuevoCliente />}
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Stat
          etiqueta="Facturado histórico"
          centavos={totales.facturado}
          detalle={`${filas.length} ${filas.length === 1 ? "cliente" : "clientes"}`}
        />
        <Stat etiqueta="Cobrado" centavos={totales.cobrado} tono="positivo" />
        <Stat
          etiqueta="Pendiente de cobro"
          centavos={totales.pendiente}
          detalle={
            deudores === 0
              ? "Está todo cobrado"
              : `${deudores} ${deudores === 1 ? "cliente debe plata" : "clientes deben plata"}`
          }
          tono={totales.pendiente > 0 ? "negativo" : "neutro"}
          destacado={totales.pendiente > 0}
        />
      </div>

      <Card>
        <CardHeader
          titulo="Todos los clientes"
          descripcion="El saldo se arrastra solo: un trabajo de junio cobrado a medias sigue acá en julio"
        />
        {filas.length === 0 ? (
          <Vacio>Todavía no hay clientes. Creá el primero.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th alinear="derecha">Trabajos</Th>
                <Th alinear="derecha">Facturado</Th>
                <Th alinear="derecha">Cobrado</Th>
                <Th alinear="derecha">Pendiente</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={f.pendiente > 0 ? "bg-negativo/[0.03]" : ""}>
                  <Td>
                    <Link
                      href={`/clientes/${f.id}`}
                      className="font-medium hover:underline"
                    >
                      {f.nombre}
                    </Link>
                    {!f.activo && (
                      <span className="ml-2">
                        <Etiqueta>Inactivo</Etiqueta>
                      </span>
                    )}
                  </Td>
                  <Td alinear="derecha">
                    <span className="tabular text-tenue">{f.trabajos}</span>
                  </Td>
                  <Td alinear="derecha">
                    <Monto centavos={f.facturado} tono="tenue" />
                  </Td>
                  <Td alinear="derecha">
                    <Monto centavos={f.cobrado} tono="tenue" />
                  </Td>
                  <Td alinear="derecha">
                    {f.pendiente > 0 ? (
                      <Monto centavos={f.pendiente} tono="negativo" className="font-medium" />
                    ) : (
                      <span className="text-tenue text-xs">al día</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>
    </>
  );
}
