"use client";

import { useActionState, useState } from "react";
import {
  agregarPago,
  borrarGasto,
  borrarPago,
  confirmarBorrador,
  crearGasto,
  editarGasto,
} from "./acciones";
import { ETIQUETA_METODO, METODO, PAGADOR, type Pagador } from "@/lib/constantes";
import { aUSD, formatearUSD } from "@/lib/dinero";
import { Boton, Campo, ErrorAviso, Input, Select, Textarea } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/validacion";

export type SocioOpcion = { id: string; nombre: string };

const hoyUTC = () => new Date().toISOString().slice(0, 10);

/**
 * Quién puso la plata. El select de socio solo aparece con pagador=SOCIO y así el
 * formulario no puede mandar un socio pegado a un pago de la empresa.
 */
function ElegirPagador({
  socios,
  nombrePagador,
  nombreSocio,
  errorPagador,
  errorSocio,
}: {
  socios: SocioOpcion[];
  nombrePagador: string;
  nombreSocio: string;
  errorPagador?: string[];
  errorSocio?: string[];
}) {
  const [pagador, setPagador] = useState<Pagador>(PAGADOR.EMPRESA);

  return (
    <>
      <Campo etiqueta="Quién puso la plata" error={errorPagador}>
        <Select
          name={nombrePagador}
          value={pagador}
          onChange={(e) => setPagador(e.target.value as Pagador)}
        >
          <option value={PAGADOR.EMPRESA}>La empresa</option>
          <option value={PAGADOR.SOCIO}>Un socio</option>
        </Select>
      </Campo>

      {pagador === PAGADOR.SOCIO && (
        <Campo
          etiqueta="Qué socio"
          error={errorSocio}
          ayuda="No baja la caja: le sube la cuenta corriente."
        >
          <Select name={nombreSocio} defaultValue="">
            <option value="">Elegí un socio…</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      )}
    </>
  );
}

function CampoMetodo({ nombre }: { nombre: string }) {
  return (
    <Campo etiqueta="Método">
      <Select name={nombre} defaultValue={METODO.TRANSFERENCIA}>
        {Object.values(METODO).map((m) => (
          <option key={m} value={m}>
            {ETIQUETA_METODO[m]}
          </option>
        ))}
      </Select>
    </Campo>
  );
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export function NuevoGasto({ socios }: { socios: SocioOpcion[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(crearGasto, undefined);

  if (!abierto) {
    return <Boton type="button" onClick={() => setAbierto(true)}>Cargar gasto</Boton>;
  }

  return (
    <form action={accion} className="space-y-4">
      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Concepto" error={estado?.errores?.concepto}>
          <Input name="concepto" autoFocus placeholder="Publicidad, hosting, Claude…" />
        </Campo>
        <Campo etiqueta="Monto (USD)" error={estado?.errores?.monto}>
          <Input name="monto" inputMode="decimal" placeholder="100" />
        </Campo>
        <Campo etiqueta="Fecha" error={estado?.errores?.fecha}>
          <Input name="fecha" type="date" defaultValue={hoyUTC()} />
        </Campo>
        <Campo etiqueta="Notas" error={estado?.errores?.notas}>
          <Input name="notas" placeholder="Opcional" />
        </Campo>
      </div>

      <div className="rounded-lg border border-borde p-4 space-y-4">
        <p className="text-sm font-medium">
          Primer pago <span className="text-tenue font-normal">— opcional</span>
        </p>
        <p className="text-xs text-tenue -mt-3">
          Dejalo vacío si todavía no lo pagó nadie. Si lo pagaron entre varios, cargá uno acá y
          el resto desde el detalle.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Monto pagado (USD)" error={estado?.errores?.pagoMonto}>
            <Input name="pagoMonto" inputMode="decimal" placeholder="Sin pagar" />
          </Campo>
          <CampoMetodo nombre="pagoMetodo" />
          <ElegirPagador
            socios={socios}
            nombrePagador="pagoPagador"
            nombreSocio="pagoSocioId"
            errorPagador={estado?.errores?.pagoPagador}
            errorSocio={estado?.errores?.pagoSocioId}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Boton disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar gasto"}</Boton>
        <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Borradores
// ---------------------------------------------------------------------------

export function ConfirmarBorrador({ id, montoUSD }: { id: string; montoUSD: number }) {
  const [estado, accion, pendiente] = useActionState(confirmarBorrador, undefined);

  return (
    <form action={accion} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="id" value={id} />
      <div>
        <Input
          name="monto"
          inputMode="decimal"
          defaultValue={montoUSD}
          aria-label="Monto a confirmar"
          className="w-28 tabular"
        />
        {estado?.errores?.monto?.map((e) => (
          <p key={e} className="text-xs text-negativo mt-1">
            {e}
          </p>
        ))}
        {estado?.error && <p className="text-xs text-negativo mt-1">{estado.error}</p>}
      </div>
      <Boton disabled={pendiente}>{pendiente ? "Confirmando…" : "Confirmar"}</Boton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

export function EditarGasto({
  gasto,
}: {
  gasto: { id: string; concepto: string; montoUSD: number; fecha: string; notas: string };
}) {
  const [estado, accion, pendiente] = useActionState(editarGasto, undefined);

  return (
    <form action={accion} className="px-5 py-4 space-y-4">
      <input type="hidden" name="id" value={gasto.id} />
      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
      {estado?.ok && <p className="text-sm text-positivo">Guardado.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Concepto" error={estado?.errores?.concepto}>
          <Input name="concepto" defaultValue={gasto.concepto} />
        </Campo>
        <Campo etiqueta="Monto (USD)" error={estado?.errores?.monto}>
          <Input name="monto" inputMode="decimal" defaultValue={gasto.montoUSD} />
        </Campo>
        <Campo etiqueta="Fecha" error={estado?.errores?.fecha}>
          <Input name="fecha" type="date" defaultValue={gasto.fecha} />
        </Campo>
        <Campo etiqueta="Notas" error={estado?.errores?.notas}>
          <Textarea name="notas" rows={2} defaultValue={gasto.notas} />
        </Campo>
      </div>

      <Boton disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar cambios"}</Boton>
    </form>
  );
}

export function NuevoPago({
  gastoId,
  socios,
  restanteCentavos,
}: {
  gastoId: string;
  socios: SocioOpcion[];
  restanteCentavos: number;
}) {
  const [estado, accion, pendiente] = useActionState(agregarPago, undefined);

  return (
    <form action={accion} className="px-5 py-4 space-y-4">
      <input type="hidden" name="gastoId" value={gastoId} />
      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Monto (USD)"
          error={estado?.errores?.monto}
          ayuda={`Quedan ${formatearUSD(restanteCentavos)} por pagar.`}
        >
          <Input name="monto" inputMode="decimal" defaultValue={aUSD(restanteCentavos)} />
        </Campo>
        <Campo etiqueta="Fecha" error={estado?.errores?.fecha}>
          <Input name="fecha" type="date" defaultValue={hoyUTC()} />
        </Campo>
        <ElegirPagador
          socios={socios}
          nombrePagador="pagador"
          nombreSocio="socioId"
          errorPagador={estado?.errores?.pagador}
          errorSocio={estado?.errores?.socioId}
        />
        <CampoMetodo nombre="metodo" />
        <Campo etiqueta="Notas" error={estado?.errores?.notas}>
          <Input name="notas" placeholder="Opcional" />
        </Campo>
      </div>

      <Boton disabled={pendiente}>{pendiente ? "Guardando…" : "Agregar pago"}</Boton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Borrar
// ---------------------------------------------------------------------------

function Borrador({
  accion,
  id,
  texto,
  aviso,
  chico,
}: {
  accion: (
    estado: EstadoFormulario | undefined,
    formData: FormData,
  ) => Promise<EstadoFormulario>;
  id: string;
  texto: string;
  aviso: string;
  chico?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, undefined);

  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (!confirm(aviso)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendiente}
        className={`text-negativo hover:underline disabled:opacity-50 ${chico ? "text-xs" : "text-sm"}`}
      >
        {pendiente ? "Borrando…" : texto}
      </button>
      {estado?.error && <p className="text-xs text-negativo mt-1">{estado.error}</p>}
    </form>
  );
}

export function BorrarGasto({ id }: { id: string }) {
  return (
    <Borrador
      accion={borrarGasto}
      id={id}
      texto="Borrar gasto"
      aviso="¿Borrar el gasto y todos sus pagos? No se puede deshacer."
    />
  );
}

export function BorrarPago({ id }: { id: string }) {
  return (
    <Borrador accion={borrarPago} id={id} texto="Borrar" aviso="¿Borrar este pago?" chico />
  );
}
