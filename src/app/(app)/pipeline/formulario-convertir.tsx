"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatearUSD } from "@/lib/dinero";
import { Boton, Campo, ErrorAviso, Input, Select } from "@/components/ui";
import { convertirEnTrabajo } from "./acciones";
import type { ClienteOpcion, OportunidadVista } from "./tipos";

const CLIENTE_NUEVO = "__nuevo__";

export function FormularioConvertir({
  oportunidad,
  clientes,
  alCancelar,
}: {
  oportunidad: OportunidadVista;
  clientes: ClienteOpcion[];
  alCancelar: () => void;
}) {
  const [estado, enviar, pendiente] = useActionState(convertirEnTrabajo, undefined);
  const [eleccion, setEleccion] = useState(oportunidad.clienteId ?? CLIENTE_NUEVO);
  const esNuevo = eleccion === CLIENTE_NUEVO;

  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="oportunidadId" value={oportunidad.id} />
      {!esNuevo && <input type="hidden" name="clienteId" value={eleccion} />}

      <p className="text-sm text-tenue">
        Al convertirla se factura {formatearUSD(oportunidad.monto)} con fecha de hoy y recién ahí
        empieza a contar como plata por cobrar.
        {oportunidad.sena != null && oportunidad.sena > 0 && (
          <> La seña de {formatearUSD(oportunidad.sena)} queda cargada como primer cobro.</>
        )}
      </p>

      {estado?.error && (
        <ErrorAviso>
          {estado.error}
          {estado.yaConvertida && (
            <>
              {" "}
              <Link href={`/clientes/${estado.yaConvertida.clienteId}`} className="underline">
                Ver el trabajo
              </Link>
            </>
          )}
        </ErrorAviso>
      )}

      <Campo etiqueta="Cliente que factura" error={estado?.errores?.clienteId}>
        <Select value={eleccion} onChange={(e) => setEleccion(e.target.value)}>
          <option value={CLIENTE_NUEVO}>Cliente nuevo…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Campo>

      {esNuevo && (
        <Campo
          etiqueta="Nombre del cliente nuevo"
          error={estado?.errores?.nombreClienteNuevo}
          ayuda="Si ya existe uno con ese nombre, se reusa en vez de duplicarlo."
        >
          <Input
            name="nombreClienteNuevo"
            defaultValue={oportunidad.clienteNombre ?? oportunidad.nombre}
            required
          />
        </Campo>
      )}

      <div className="flex gap-2">
        <Boton disabled={pendiente}>{pendiente ? "Convirtiendo…" : "Convertir en trabajo"}</Boton>
        <Boton type="button" variante="secundario" onClick={alCancelar} disabled={pendiente}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
