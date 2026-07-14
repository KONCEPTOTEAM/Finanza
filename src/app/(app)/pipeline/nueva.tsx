"use client";

import { useCallback, useState } from "react";
import { Boton, Card, CardHeader } from "@/components/ui";
import { crearOportunidad } from "./acciones";
import { FormularioOportunidad } from "./formulario";
import type { ClienteOpcion } from "./tipos";

export function NuevaOportunidad({ clientes }: { clientes: ClienteOpcion[] }) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);

  return (
    <Card className="mb-6">
      <CardHeader
        titulo="Nueva oportunidad"
        descripcion="Anotá lo que hay en juego. Todavía no factura nada."
        accion={
          <Boton
            type="button"
            variante={abierto ? "secundario" : "primario"}
            onClick={() => setAbierto((a) => !a)}
          >
            {abierto ? "Cerrar" : "Agregar"}
          </Boton>
        }
      />
      {abierto && (
        <div className="px-5 py-4">
          <FormularioOportunidad
            accion={crearOportunidad}
            clientes={clientes}
            etiquetaEnviar="Agregar al pipeline"
            alGuardar={cerrar}
          />
        </div>
      )}
    </Card>
  );
}
