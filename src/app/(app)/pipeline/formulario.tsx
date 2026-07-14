"use client";

import { useActionState, useEffect } from "react";
import { aUSD } from "@/lib/dinero";
import { Boton, Campo, ErrorAviso, Input, Select, Textarea } from "@/components/ui";
import type { EstadoFormulario } from "@/lib/validacion";
import type { ClienteOpcion, OportunidadVista } from "./tipos";

type Accion = (
  estado: EstadoFormulario | undefined,
  formData: FormData,
) => Promise<EstadoFormulario>;

/** Alta y edición comparten campos: la única diferencia es el id oculto y qué acción corre. */
export function FormularioOportunidad({
  accion,
  clientes,
  oportunidad,
  etiquetaEnviar,
  alGuardar,
}: {
  accion: Accion;
  clientes: ClienteOpcion[];
  oportunidad?: OportunidadVista;
  etiquetaEnviar: string;
  alGuardar?: () => void;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, undefined);

  useEffect(() => {
    if (estado?.ok) alGuardar?.();
  }, [estado, alGuardar]);

  return (
    <form action={enviar} className="space-y-4">
      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
      {oportunidad && <input type="hidden" name="id" value={oportunidad.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Oportunidad" error={estado?.errores?.nombre}>
          <Input
            name="nombre"
            defaultValue={oportunidad?.nombre}
            placeholder="Viñedo — sitio institucional"
            required
          />
        </Campo>

        <Campo
          etiqueta="Cliente"
          error={estado?.errores?.clienteId}
          ayuda="Podés dejarlo vacío: el cliente se define al convertirla."
        >
          <Select name="clienteId" defaultValue={oportunidad?.clienteId ?? ""}>
            <option value="">Todavía no es cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>

        <Campo etiqueta="Monto (USD)" error={estado?.errores?.monto}>
          <Input
            name="monto"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={oportunidad ? aUSD(oportunidad.monto) : ""}
            placeholder="7200"
            required
          />
        </Campo>

        <Campo
          etiqueta="Seña (USD)"
          error={estado?.errores?.sena}
          ayuda="Opcional. Al convertir entra como primer cobro del trabajo."
        >
          <Input
            name="sena"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={oportunidad?.sena != null ? aUSD(oportunidad.sena) : ""}
            placeholder="—"
          />
        </Campo>
      </div>

      <Campo etiqueta="Notas" error={estado?.errores?.notas}>
        <Textarea name="notas" rows={2} defaultValue={oportunidad?.notas ?? ""} />
      </Campo>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="confirmado"
          defaultChecked={oportunidad?.confirmado}
          className="size-4 accent-acento"
        />
        <span>Ya está confirmada</span>
        <span className="text-tenue text-xs">
          — confirmar no factura nada: eso lo hace “Convertir en trabajo”.
        </span>
      </label>

      <Boton disabled={pendiente}>{pendiente ? "Guardando…" : etiquetaEnviar}</Boton>
    </form>
  );
}
