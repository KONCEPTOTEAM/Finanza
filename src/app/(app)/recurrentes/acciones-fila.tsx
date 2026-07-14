"use client";

import Link from "next/link";
import { alternarActivo, borrarRecurrente } from "./acciones";

const claseAccion = "text-sm text-tenue hover:text-foreground transition";

export function AccionesFila({
  id,
  activo,
  concepto,
}: {
  id: string;
  activo: boolean;
  concepto: string;
}) {
  return (
    <div className="flex justify-end gap-3">
      <Link href={`/recurrentes/${id}`} className={claseAccion}>
        Editar
      </Link>

      <form action={alternarActivo}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className={claseAccion}>
          {activo ? "Pausar" : "Activar"}
        </button>
      </form>

      <form
        action={borrarRecurrente}
        onSubmit={(e) => {
          if (
            !confirm(
              `¿Borrar la plantilla “${concepto}”? Los gastos que ya generó no se tocan.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="text-sm text-negativo hover:opacity-70 transition">
          Borrar
        </button>
      </form>
    </div>
  );
}
