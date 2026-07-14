"use client";

import { useActionState, useState } from "react";
import { crearCliente } from "./acciones";
import { Boton, Campo, Card, CardHeader, ErrorAviso, Input, Textarea } from "@/components/ui";

export function NuevoCliente() {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(crearCliente, undefined);

  if (!abierto) {
    return (
      <Boton variante="primario" type="button" onClick={() => setAbierto(true)}>
        Nuevo cliente
      </Boton>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader titulo="Nuevo cliente" />
      <form action={accion} className="px-5 py-4 space-y-4">
        {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}

        <Campo etiqueta="Nombre" error={estado?.errores?.nombre}>
          <Input name="nombre" autoFocus placeholder="Inelmap" />
        </Campo>

        <Campo etiqueta="Notas" error={estado?.errores?.notas} ayuda="Opcional.">
          <Textarea name="notas" rows={2} />
        </Campo>

        <div className="flex gap-2">
          <Boton disabled={pendiente}>{pendiente ? "Creando…" : "Crear cliente"}</Boton>
          <Boton variante="secundario" type="button" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Card>
  );
}
