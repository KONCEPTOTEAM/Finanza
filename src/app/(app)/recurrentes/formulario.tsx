"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { crearRecurrente, editarRecurrente } from "./acciones";
import { TIPO_GASTO } from "@/lib/constantes";
import { aUSD } from "@/lib/dinero";
import { Boton, Campo, ErrorAviso, Input, Select, Textarea } from "@/components/ui";

export type SocioOpcion = { id: string; nombre: string; sueldoMensual: number };

export type ValoresRecurrente = {
  id: string;
  tipo: string;
  concepto: string;
  socioId: string;
  montoSugerido: number;
  diaDelMes: number | null;
  notas: string;
};

export function FormularioRecurrente({
  socios,
  valores,
}: {
  socios: SocioOpcion[];
  valores?: ValoresRecurrente;
}) {
  const edicion = valores !== undefined;
  const [estado, accion, pendiente] = useActionState(
    edicion ? editarRecurrente : crearRecurrente,
    undefined,
  );
  const router = useRouter();

  const [tipo, setTipo] = useState(valores?.tipo ?? TIPO_GASTO.OPERATIVO);
  const [socioId, setSocioId] = useState(valores?.socioId ?? "");
  const [monto, setMonto] = useState(
    valores ? String(aUSD(valores.montoSugerido)) : "",
  );

  const esSueldo = tipo === TIPO_GASTO.SUELDO;
  const err = estado?.errores;

  // Elegir el socio de un sueldo trae su sueldo mensual como monto sugerido. Sigue
  // siendo editable: el sugerido es un punto de partida, no un valor fijo.
  function elegirSocio(id: string) {
    setSocioId(id);
    const socio = socios.find((s) => s.id === id);
    if (socio) setMonto(String(aUSD(socio.sueldoMensual)));
  }

  return (
    <form action={accion} className="space-y-4">
      {valores && <input type="hidden" name="id" value={valores.id} />}
      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}

      <Campo etiqueta="Tipo" error={err?.tipo}>
        <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value={TIPO_GASTO.OPERATIVO}>Operativo</option>
          <option value={TIPO_GASTO.SUELDO}>Sueldo</option>
        </Select>
      </Campo>

      {esSueldo ? (
        <Campo
          etiqueta="Socio"
          error={err?.socioId}
          ayuda="El concepto se arma solo: “Sueldo <nombre>”."
        >
          <Select name="socioId" value={socioId} onChange={(e) => elegirSocio(e.target.value)}>
            <option value="">Elegí un socio…</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      ) : (
        <Campo etiqueta="Concepto" error={err?.concepto}>
          <Input name="concepto" defaultValue={valores?.concepto ?? ""} placeholder="Claude, Publicidad, Hosting…" />
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Monto sugerido (USD)"
          error={err?.montoSugerido}
          ayuda="Es solo el arranque del borrador. Al confirmar el gasto se actualiza solo."
        >
          <Input
            name="montoSugerido"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="200"
          />
        </Campo>

        <Campo
          etiqueta="Día del mes (opcional)"
          error={err?.diaDelMes}
          ayuda="Ej: 14 si se paga todos los 14. En blanco = sin día fijo (cae el día 1). Si el mes es más corto, cae el último día."
        >
          <Input
            name="diaDelMes"
            type="number"
            min={1}
            max={31}
            defaultValue={valores?.diaDelMes ?? ""}
            placeholder="Sin día fijo"
          />
        </Campo>
      </div>

      <Campo etiqueta="Notas" error={err?.notas}>
        <Textarea name="notas" rows={2} defaultValue={valores?.notas ?? ""} />
      </Campo>

      <div className="flex gap-2">
        <Boton disabled={pendiente}>
          {pendiente ? "Guardando…" : edicion ? "Guardar cambios" : "Crear plantilla"}
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => router.push("/recurrentes")}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
