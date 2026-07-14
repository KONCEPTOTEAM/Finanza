"use client";

import Link from "next/link";
import { useActionState, useCallback, useState } from "react";
import { Etiqueta, ErrorAviso, Monto, Td } from "@/components/ui";
import { actualizarOportunidad, alternarConfirmado, borrarOportunidad } from "./acciones";
import { FormularioConvertir } from "./formulario-convertir";
import { FormularioOportunidad } from "./formulario";
import type { ClienteOpcion, OportunidadVista } from "./tipos";

const COLUMNAS = 5;

export function FilaOportunidad({
  oportunidad: o,
  clientes,
}: {
  oportunidad: OportunidadVista;
  clientes: ClienteOpcion[];
}) {
  const [panel, setPanel] = useState<"editar" | "convertir" | null>(null);
  const [estadoConfirmar, confirmar, confirmando] = useActionState(alternarConfirmado, undefined);
  const [estadoBorrar, borrar, borrando] = useActionState(borrarOportunidad, undefined);

  const cerrar = useCallback(() => setPanel(null), []);
  const error = estadoConfirmar?.error ?? estadoBorrar?.error;
  const convertida = o.trabajo !== null;

  return (
    <>
      <tr>
        <Td>
          <span className="font-medium">{o.nombre}</span>
          {o.notas && <p className="text-xs text-tenue mt-0.5">{o.notas}</p>}
        </Td>
        <Td>
          {o.clienteNombre ? (
            o.clienteId ? (
              <Link href={`/clientes/${o.clienteId}`} className="hover:underline">
                {o.clienteNombre}
              </Link>
            ) : (
              o.clienteNombre
            )
          ) : (
            <span className="text-tenue">Todavía no es cliente</span>
          )}
        </Td>
        <Td alinear="derecha">
          {o.sena != null && o.sena > 0 ? (
            <Monto centavos={o.sena} tono="tenue" />
          ) : (
            <span className="text-tenue">—</span>
          )}
        </Td>
        <Td alinear="derecha">
          <Monto centavos={o.monto} />
        </Td>
        <Td alinear="derecha">
          {convertida ? (
            <div className="flex items-center justify-end gap-3">
              <Etiqueta tono="positivo">Facturado</Etiqueta>
              <Link
                href={`/clientes/${o.trabajo!.clienteId}`}
                className="text-sm text-tenue hover:text-foreground transition"
              >
                Ver trabajo
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              {o.confirmado && (
                <Accion
                  className="text-acento font-medium"
                  onClick={() => setPanel(panel === "convertir" ? null : "convertir")}
                >
                  Convertir en trabajo
                </Accion>
              )}
              <form action={confirmar} className="inline">
                <input type="hidden" name="id" value={o.id} />
                <Accion type="submit" disabled={confirmando}>
                  {o.confirmado ? "Desmarcar" : "Confirmar"}
                </Accion>
              </form>
              <Accion onClick={() => setPanel(panel === "editar" ? null : "editar")}>Editar</Accion>
              <form action={borrar} className="inline">
                <input type="hidden" name="id" value={o.id} />
                <Accion
                  type="submit"
                  disabled={borrando}
                  className="hover:text-negativo"
                  onClick={(e) => {
                    if (!window.confirm(`¿Borrar la oportunidad “${o.nombre}”?`)) e.preventDefault();
                  }}
                >
                  Borrar
                </Accion>
              </form>
            </div>
          )}
        </Td>
      </tr>

      {(panel !== null || error) && (
        <tr>
          <td colSpan={COLUMNAS} className="border-t border-borde bg-background px-5 py-4">
            {error && <ErrorAviso>{error}</ErrorAviso>}
            {panel === "convertir" && (
              <FormularioConvertir oportunidad={o} clientes={clientes} alCancelar={cerrar} />
            )}
            {panel === "editar" && (
              <FormularioOportunidad
                accion={actualizarOportunidad}
                clientes={clientes}
                oportunidad={o}
                etiquetaEnviar="Guardar cambios"
                alGuardar={cerrar}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Accion({
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`text-sm text-tenue hover:text-foreground transition disabled:opacity-50 ${className}`}
    />
  );
}
