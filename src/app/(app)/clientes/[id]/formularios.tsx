"use client";

import { useActionState, useState } from "react";
import {
  borrarCobro,
  borrarPlanCuotas,
  borrarTrabajo,
  cobrarCuota,
  crearTrabajo,
  desactivarCliente,
  editarCliente,
  editarTrabajo,
  generarCuotas,
  registrarCobro,
} from "../acciones";
import {
  Boton,
  Campo,
  Card,
  CardHeader,
  ErrorAviso,
  Etiqueta,
  Input,
  Monto,
  Select,
  Textarea,
} from "@/components/ui";
import { formatearUSD } from "@/lib/dinero";
import { ETIQUETA_METODO, METODO } from "@/lib/constantes";
import type { EstadoFormulario } from "@/lib/validacion";

// Los montos entran y salen en USD porque es lo que la gente escribe; los esquemas de
// @/lib/validacion los pasan a centavos del otro lado.

type Accion = (
  estado: EstadoFormulario | undefined,
  formData: FormData,
) => Promise<EstadoFormulario>;

export type TrabajoVista = {
  id: string;
  descripcion: string;
  monto: number;
  cobrado: number;
  pendiente: number;
  fecha: string;
  notas: string | null;
};

/** Un submit con confirmación previa. Los errores del server se muestran al lado. */
function BotonAccion({
  accion,
  id,
  children,
  confirmar,
}: {
  accion: Accion;
  id: string;
  children: React.ReactNode;
  confirmar: string;
}) {
  const [estado, act, pendiente] = useActionState(accion, undefined);

  return (
    <form
      action={act}
      onSubmit={(e) => {
        if (!window.confirm(confirmar)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendiente}
        className="text-xs text-tenue hover:text-negativo transition disabled:opacity-50"
      >
        {children}
      </button>
      {estado?.error && <p className="text-xs text-negativo mt-1">{estado.error}</p>}
    </form>
  );
}

export function EditarCliente({
  id,
  nombre,
  notas,
  activo,
}: {
  id: string;
  nombre: string;
  notas: string | null;
  activo: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(editarCliente, undefined);
  const [estadoActivo, accionActivo, pendienteActivo] = useActionState(
    desactivarCliente,
    undefined,
  );

  if (!abierto) {
    return (
      <div className="flex gap-2">
        <Boton variante="secundario" type="button" onClick={() => setAbierto(true)}>
          Editar
        </Boton>
        <form
          action={accionActivo}
          onSubmit={(e) => {
            if (
              activo &&
              !window.confirm("¿Desactivar el cliente? Sus trabajos y saldos se mantienen.")
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="activo" value={activo ? "false" : "true"} />
          <Boton
            variante={activo ? "peligro" : "secundario"}
            disabled={pendienteActivo}
          >
            {activo ? "Desactivar" : "Reactivar"}
          </Boton>
          {estadoActivo?.error && <ErrorAviso>{estadoActivo.error}</ErrorAviso>}
        </form>
      </div>
    );
  }

  return (
    <Card className="w-full sm:w-96">
      <CardHeader titulo="Editar cliente" />
      <form action={accion} className="px-5 py-4 space-y-4">
        {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
        <input type="hidden" name="id" value={id} />

        <Campo etiqueta="Nombre" error={estado?.errores?.nombre}>
          <Input name="nombre" defaultValue={nombre} autoFocus />
        </Campo>

        <Campo etiqueta="Notas" error={estado?.errores?.notas}>
          <Textarea name="notas" rows={2} defaultValue={notas ?? ""} />
        </Campo>

        <div className="flex gap-2">
          <Boton disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Boton>
          <Boton variante="secundario" type="button" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </Card>
  );
}

export function NuevoTrabajo({ clienteId, hoy }: { clienteId: string; hoy: string }) {
  const [estado, accion, pendiente] = useActionState(crearTrabajo, undefined);

  return (
    <Card>
      <CardHeader titulo="Cargar un trabajo" descripcion="Lo facturado, cobrado o no" />
      <form action={accion} className="px-5 py-4 space-y-4">
        {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
        {estado?.ok && (
          <p className="rounded-lg bg-positivo/10 text-positivo text-sm px-3 py-2">
            Trabajo cargado.
          </p>
        )}
        <input type="hidden" name="clienteId" value={clienteId} />

        <Campo etiqueta="Descripción" error={estado?.errores?.descripcion}>
          <Input name="descripcion" placeholder="Renders torre norte" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Monto (USD)" error={estado?.errores?.monto}>
            <Input name="monto" inputMode="decimal" placeholder="400" />
          </Campo>
          <Campo
            etiqueta="Fecha de facturación"
            error={estado?.errores?.fecha}
            ayuda="El mes en que se facturó."
          >
            <Input name="fecha" type="date" defaultValue={hoy} />
          </Campo>
        </div>

        <Campo etiqueta="Notas" error={estado?.errores?.notas}>
          <Textarea name="notas" rows={2} />
        </Campo>

        <Boton disabled={pendiente}>{pendiente ? "Cargando…" : "Cargar trabajo"}</Boton>
      </form>
    </Card>
  );
}

export function NuevoCobro({
  trabajos,
  hoy,
}: {
  trabajos: TrabajoVista[];
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(registrarCobro, undefined);
  const abiertos = trabajos.filter((t) => t.pendiente > 0);

  return (
    <Card>
      <CardHeader
        titulo="Registrar un cobro"
        descripcion="Puede caer en un mes distinto al del trabajo"
      />
      {abiertos.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-tenue">
          No hay trabajos con saldo abierto. Está todo cobrado.
        </p>
      ) : (
        <form action={accion} className="px-5 py-4 space-y-4">
          {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
          {estado?.ok && (
            <p className="rounded-lg bg-positivo/10 text-positivo text-sm px-3 py-2">
              Cobro registrado.
            </p>
          )}

          <Campo etiqueta="Trabajo" error={estado?.errores?.trabajoId}>
            <Select name="trabajoId" defaultValue={abiertos[0].id}>
              {abiertos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.descripcion} — quedan {formatearUSD(t.pendiente)}
                </option>
              ))}
            </Select>
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Monto (USD)" error={estado?.errores?.monto}>
              <Input name="monto" inputMode="decimal" placeholder="200" />
            </Campo>
            <Campo
              etiqueta="Fecha del cobro"
              error={estado?.errores?.fecha}
              ayuda="Cuándo entró la plata."
            >
              <Input name="fecha" type="date" defaultValue={hoy} />
            </Campo>
          </div>

          <Campo
            etiqueta="Método"
            error={estado?.errores?.metodo}
            ayuda="Solo una etiqueta: hay una sola caja."
          >
            <Select name="metodo" defaultValue={METODO.TRANSFERENCIA}>
              {Object.values(METODO).map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO[m]}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo etiqueta="Notas" error={estado?.errores?.notas}>
            <Textarea name="notas" rows={2} />
          </Campo>

          <Boton disabled={pendiente}>{pendiente ? "Registrando…" : "Registrar cobro"}</Boton>
        </form>
      )}
    </Card>
  );
}

export function EditarTrabajo({ trabajo }: { trabajo: TrabajoVista }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(editarTrabajo, undefined);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs text-tenue hover:text-foreground transition"
      >
        Editar
      </button>
    );
  }

  return (
    <form action={accion} className="w-full space-y-3 mt-3">
      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
      <input type="hidden" name="id" value={trabajo.id} />

      <Campo etiqueta="Descripción" error={estado?.errores?.descripcion}>
        <Input name="descripcion" defaultValue={trabajo.descripcion} />
      </Campo>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Monto (USD)"
          error={estado?.errores?.monto}
          ayuda={
            trabajo.cobrado > 0
              ? `No puede bajar de ${formatearUSD(trabajo.cobrado)} ya cobrados.`
              : undefined
          }
        >
          <Input
            name="monto"
            inputMode="decimal"
            defaultValue={(trabajo.monto / 100).toString()}
          />
        </Campo>
        <Campo etiqueta="Fecha" error={estado?.errores?.fecha}>
          <Input name="fecha" type="date" defaultValue={trabajo.fecha} />
        </Campo>
      </div>

      <Campo etiqueta="Notas" error={estado?.errores?.notas}>
        <Textarea name="notas" rows={2} defaultValue={trabajo.notas ?? ""} />
      </Campo>

      <div className="flex gap-2">
        <Boton disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Boton>
        <Boton variante="secundario" type="button" onClick={() => setAbierto(false)}>
          Cerrar
        </Boton>
      </div>
    </form>
  );
}

export function BorrarTrabajo({ id, tieneCobros }: { id: string; tieneCobros: boolean }) {
  return (
    <BotonAccion
      accion={borrarTrabajo}
      id={id}
      confirmar={
        tieneCobros
          ? "Este trabajo tiene cobros. Se va a rechazar."
          : "¿Borrar el trabajo?"
      }
    >
      Borrar
    </BotonAccion>
  );
}

export function BorrarCobro({ id, monto }: { id: string; monto: number }) {
  return (
    <BotonAccion
      accion={borrarCobro}
      id={id}
      confirmar={`¿Borrar el cobro de ${formatearUSD(monto)}? Baja la caja y reabre el saldo.`}
    >
      Borrar
    </BotonAccion>
  );
}

// ---------------------------------------------------------------------------
// Cuotas
// ---------------------------------------------------------------------------

export type CuotaVista = {
  id: string;
  numero: number;
  monto: number;
  vencimientoTexto: string;
  cobrada: boolean;
  cobradaTexto: string | null;
};

/**
 * El plan de cuotas de un trabajo. Sin cuotas todavía, ofrece dividir (solo si el
 * trabajo está limpio, sin cobros sueltos). Con cuotas, muestra el cronograma.
 */
export function PlanCuotas({
  trabajoId,
  monto,
  tieneCobros,
  cuotas,
  hoy,
}: {
  trabajoId: string;
  monto: number;
  tieneCobros: boolean;
  cuotas: CuotaVista[];
  hoy: string;
}) {
  if (cuotas.length === 0) {
    if (tieneCobros) return null;
    return <DividirEnCuotas trabajoId={trabajoId} monto={monto} hoy={hoy} />;
  }

  return (
    <div className="mt-3 border-l border-borde pl-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-tenue uppercase tracking-wide">
          Plan de {cuotas.length} cuotas
        </p>
        <BorrarPlanCuotas trabajoId={trabajoId} />
      </div>
      <ul className="mt-2 space-y-1.5">
        {cuotas.map((c) => (
          <FilaCuota key={c.id} cuota={c} total={cuotas.length} hoy={hoy} />
        ))}
      </ul>
    </div>
  );
}

function DividirEnCuotas({
  trabajoId,
  monto,
  hoy,
}: {
  trabajoId: string;
  monto: number;
  hoy: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cantidad, setCantidad] = useState(3);
  const [estado, accion, pendiente] = useActionState(generarCuotas, undefined);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-3 text-xs text-tenue hover:text-foreground transition"
      >
        Dividir en cuotas
      </button>
    );
  }

  const porCuota = cantidad >= 2 ? Math.floor(monto / cantidad) : 0;

  return (
    <form action={accion} className="mt-3 border-l border-borde pl-3 space-y-3">
      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
      <input type="hidden" name="trabajoId" value={trabajoId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Cantidad de cuotas" error={estado?.errores?.cantidad}>
          <Input
            name="cantidad"
            type="number"
            min={2}
            max={60}
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value) || 0)}
          />
        </Campo>
        <Campo
          etiqueta="Vence la primera"
          error={estado?.errores?.primerVencimiento}
          ayuda="Las siguientes, un mes después cada una."
        >
          <Input name="primerVencimiento" type="date" defaultValue={hoy} />
        </Campo>
      </div>

      <p className="text-xs text-tenue">
        {cantidad >= 2
          ? `${cantidad} cuotas de ~${formatearUSD(porCuota)} (suman el total exacto).`
          : "Elegí al menos 2 cuotas."}
      </p>

      <div className="flex gap-2">
        <Boton disabled={pendiente}>{pendiente ? "Generando…" : "Generar cuotas"}</Boton>
        <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

function FilaCuota({ cuota, total, hoy }: { cuota: CuotaVista; total: number; hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(cobrarCuota, undefined);

  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-tenue text-xs">
          Cuota {cuota.numero}/{total} · vence {cuota.vencimientoTexto}
        </span>
        <span className="flex items-center gap-3">
          <Monto centavos={cuota.monto} tono={cuota.cobrada ? "positivo" : "tenue"} />
          {cuota.cobrada ? (
            <Etiqueta tono="positivo">Cobrada {cuota.cobradaTexto}</Etiqueta>
          ) : (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className="text-xs text-acento hover:opacity-70 transition"
            >
              {abierto ? "Cancelar" : "Cobrar"}
            </button>
          )}
        </span>
      </div>

      {!cuota.cobrada && abierto && (
        <form action={accion} className="mt-2 space-y-2">
          {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
          <input type="hidden" name="id" value={cuota.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Campo etiqueta="Fecha del cobro" error={estado?.errores?.fecha}>
              <Input name="fecha" type="date" defaultValue={hoy} />
            </Campo>
            <Campo etiqueta="Método" error={estado?.errores?.metodo}>
              <Select name="metodo" defaultValue={METODO.TRANSFERENCIA}>
                {Object.values(METODO).map((m) => (
                  <option key={m} value={m}>
                    {ETIQUETA_METODO[m]}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <Boton disabled={pendiente}>
            {pendiente ? "Cobrando…" : `Cobrar ${formatearUSD(cuota.monto)}`}
          </Boton>
        </form>
      )}
    </li>
  );
}

function BorrarPlanCuotas({ trabajoId }: { trabajoId: string }) {
  const [estado, accion, pendiente] = useActionState(borrarPlanCuotas, undefined);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "¿Borrar las cuotas pendientes de este plan? Las ya cobradas se mantienen.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="trabajoId" value={trabajoId} />
      <button
        type="submit"
        disabled={pendiente}
        className="text-xs text-tenue hover:text-negativo transition disabled:opacity-50"
      >
        Borrar plan
      </button>
      {estado?.error && <p className="text-xs text-negativo mt-1">{estado.error}</p>}
    </form>
  );
}
