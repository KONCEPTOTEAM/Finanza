import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatearUSD } from "@/lib/dinero";
import { ETIQUETA_METODO, type Metodo } from "@/lib/constantes";
import {
  Card,
  CardHeader,
  Etiqueta,
  Monto,
  Stat,
  TituloPagina,
  Vacio,
} from "@/components/ui";
import {
  BorrarCobro,
  BorrarTrabajo,
  EditarCliente,
  EditarTrabajo,
  NuevoCobro,
  NuevoTrabajo,
  PlanCuotas,
  type TrabajoVista,
} from "./formularios";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    select: { nombre: true },
  });
  return { title: `${cliente?.nombre ?? "Cliente"} — Koncepto` };
}

const dia = (f: Date) =>
  f.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const mes = (f: Date) =>
  f.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });

/** "YYYY-MM-DD" en UTC, que es lo que come un <input type="date">. */
const paraInput = (f: Date) => f.toISOString().slice(0, 10);

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      trabajos: {
        orderBy: { fecha: "desc" },
        include: {
          cobros: {
            orderBy: { fecha: "asc" },
            include: { cargadoPor: { select: { nombre: true } } },
          },
          cuotas: {
            orderBy: { numero: "asc" },
            include: { cobros: { select: { monto: true } } },
          },
        },
      },
    },
  });
  if (!cliente) notFound();

  const trabajos = cliente.trabajos.map((t) => {
    const cobrado = t.cobros.reduce((acc, c) => acc + c.monto, 0);
    return {
      id: t.id,
      descripcion: t.descripcion,
      monto: t.monto,
      cobrado,
      pendiente: t.monto - cobrado,
      fechaTexto: mes(t.fecha),
      fecha: paraInput(t.fecha),
      notas: t.notas,
      cobros: t.cobros.map((c) => ({
        id: c.id,
        monto: c.monto,
        fechaTexto: dia(c.fecha),
        metodo: c.metodo as Metodo,
        notas: c.notas,
        cargadoPor: c.cargadoPor?.nombre ?? null,
      })),
      cuotas: t.cuotas.map((c) => {
        const cobrado = c.cobros.reduce((acc, x) => acc + x.monto, 0);
        const pendiente = c.monto - cobrado;
        return {
          id: c.id,
          numero: c.numero,
          monto: c.monto,
          cobrado,
          pendiente,
          estado: (pendiente <= 0 ? "cobrada" : cobrado > 0 ? "parcial" : "pendiente") as
            | "cobrada"
            | "parcial"
            | "pendiente",
          vencimientoTexto: dia(c.vencimiento),
        };
      }),
    };
  });

  // Los formularios cliente no reciben Date ni objetos de Prisma: solo lo que serializa.
  const paraFormularios: TrabajoVista[] = trabajos.map((t) => ({
    id: t.id,
    descripcion: t.descripcion,
    monto: t.monto,
    cobrado: t.cobrado,
    pendiente: t.pendiente,
    fecha: t.fecha,
    notas: t.notas,
  }));

  const facturado = trabajos.reduce((acc, t) => acc + t.monto, 0);
  const cobrado = trabajos.reduce((acc, t) => acc + t.cobrado, 0);
  const pendiente = facturado - cobrado;
  const hoy = paraInput(new Date());

  return (
    <>
      <div className="mb-2">
        <Link href="/clientes" className="text-sm text-tenue hover:text-foreground transition">
          ← Clientes
        </Link>
      </div>

      <TituloPagina
        titulo={cliente.nombre}
        descripcion={
          trabajos.length === 0
            ? "Sin trabajos cargados"
            : `${trabajos.length} ${trabajos.length === 1 ? "trabajo" : "trabajos"} desde ${mes(
                cliente.trabajos[cliente.trabajos.length - 1].fecha,
              )}`
        }
        accion={
          <EditarCliente
            id={cliente.id}
            nombre={cliente.nombre}
            notas={cliente.notas}
            activo={cliente.activo}
          />
        }
      />

      {!cliente.activo && (
        <div className="mb-6">
          <Etiqueta>Cliente inactivo — sus saldos siguen contando en el panorama</Etiqueta>
        </div>
      )}

      {cliente.notas && (
        <Card className="mb-6">
          <p className="px-5 py-4 text-sm text-tenue whitespace-pre-wrap">{cliente.notas}</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Stat etiqueta="Facturado" centavos={facturado} tono="neutro" />
        <Stat etiqueta="Cobrado" centavos={cobrado} tono="positivo" />
        <Stat
          etiqueta="Pendiente"
          centavos={pendiente}
          detalle={pendiente > 0 ? "Nos debe" : "Está al día"}
          tono={pendiente > 0 ? "negativo" : "neutro"}
          destacado={pendiente > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <NuevoTrabajo clienteId={cliente.id} hoy={hoy} />
        <NuevoCobro trabajos={paraFormularios} hoy={hoy} />
      </div>

      <Card>
        <CardHeader
          titulo="Trabajos"
          descripcion="Cada trabajo arrastra su saldo hasta que se cobre entero, sin importar el mes"
        />
        {trabajos.length === 0 ? (
          <Vacio>Todavía no hay trabajos para este cliente.</Vacio>
        ) : (
          <ul>
            {trabajos.map((t, i) => (
              <li
                key={t.id}
                className={`px-5 py-4 ${i > 0 ? "border-t border-borde" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{t.descripcion}</p>
                    <p className="text-xs text-tenue mt-0.5">
                      Facturado en {t.fechaTexto} · {formatearUSD(t.monto)}
                      {t.cobrado > 0 && ` · cobrado ${formatearUSD(t.cobrado)}`}
                    </p>
                    {t.notas && (
                      <p className="text-xs text-tenue mt-1 whitespace-pre-wrap">{t.notas}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {t.pendiente > 0 ? (
                      <Etiqueta tono="negativo">
                        Pendiente {formatearUSD(t.pendiente)}
                      </Etiqueta>
                    ) : (
                      <Etiqueta tono="positivo">Cobrado</Etiqueta>
                    )}
                    <EditarTrabajo trabajo={paraFormularios[i]} />
                    <BorrarTrabajo id={t.id} tieneCobros={t.cobros.length > 0} />
                  </div>
                </div>

                {t.cobros.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-l border-borde pl-3">
                    {t.cobros.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-tenue text-xs">
                          {c.fechaTexto} · {ETIQUETA_METODO[c.metodo] ?? c.metodo}
                          {c.cargadoPor && ` · cargó ${c.cargadoPor}`}
                          {c.notas && ` · ${c.notas}`}
                        </span>
                        <span className="flex items-center gap-3">
                          <Monto centavos={c.monto} tono="positivo" />
                          <BorrarCobro id={c.id} monto={c.monto} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <PlanCuotas
                  trabajoId={t.id}
                  pendiente={t.pendiente}
                  cuotas={t.cuotas}
                  hoy={hoy}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
