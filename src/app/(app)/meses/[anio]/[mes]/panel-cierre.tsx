"use client";

import { useActionState, useState } from "react";
import { nombreMes } from "@/lib/constantes";
import { formatearUSD } from "@/lib/dinero";
import { Boton, Campo, Card, CardHeader, ErrorAviso, Textarea } from "@/components/ui";
import { cerrarMes, reabrirMes } from "../../acciones";

type Cierre = {
  cajaFinal: number;
  notas: string | null;
  cerradoPor: string;
  cerradoEn: string;
};

export function PanelCierre({
  anio,
  mes,
  pendientes,
  motivoCerrar,
  motivoReabrir,
  cierre,
}: {
  anio: number;
  mes: number;
  pendientes: number;
  motivoCerrar: string | null;
  motivoReabrir: string | null;
  cierre: Cierre | null | undefined;
}) {
  return (
    <Card>
      <CardHeader titulo={cierre ? "Mes cerrado" : "Cerrar el mes"} />
      <div className="px-5 py-4 space-y-4">
        {cierre ? (
          <Cerrado anio={anio} mes={mes} cierre={cierre} motivo={motivoReabrir} />
        ) : (
          <Abierto anio={anio} mes={mes} pendientes={pendientes} motivo={motivoCerrar} />
        )}
      </div>
    </Card>
  );
}

function Abierto({
  anio,
  mes,
  pendientes,
  motivo,
}: {
  anio: number;
  mes: number;
  pendientes: number;
  motivo: string | null;
}) {
  const [estado, accion, enviando] = useActionState(cerrarMes, undefined);
  const [confirmando, setConfirmando] = useState(false);

  if (motivo) {
    return (
      <>
        <p className="rounded-lg bg-alerta/10 text-alerta text-sm px-3 py-2 leading-relaxed">
          {motivo}
        </p>
        <p className="text-xs text-tenue leading-relaxed">
          Mientras tanto el mes sigue abierto y todo se puede editar.
        </p>
      </>
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="anio" value={anio} />
      <input type="hidden" name="mes" value={mes} />

      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}

      <p className="text-sm text-tenue leading-relaxed">
        Al cerrar se guarda la foto de la caja y{" "}
        <span className="text-foreground">se bloquean las ediciones del período</span>. Se puede
        reabrir después.
      </p>

      {pendientes > 0 && (
        <p className="text-sm text-alerta leading-relaxed">
          Quedan {pendientes} {pendientes === 1 ? "cosa" : "cosas"} sin resolver. Se puede cerrar
          igual: mirá la lista de abajo.
        </p>
      )}

      <Campo etiqueta="Notas del cierre" ayuda="Opcional. Queda en el resumen del mes.">
        <Textarea name="notas" rows={3} placeholder="Mes flojo, nadie retiró sueldo…" />
      </Campo>

      {confirmando ? (
        <div className="space-y-2">
          <p className="text-sm">
            ¿Cerrás {nombreMes(mes)}
            {pendientes > 0 ? ` con ${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}?` : "?"}
          </p>
          <div className="flex gap-2">
            <Boton disabled={enviando}>{enviando ? "Cerrando…" : "Sí, cerrar"}</Boton>
            <Boton
              type="button"
              variante="secundario"
              disabled={enviando}
              onClick={() => setConfirmando(false)}
            >
              Volver
            </Boton>
          </div>
        </div>
      ) : (
        <Boton type="button" onClick={() => setConfirmando(true)} className="w-full">
          {pendientes > 0 ? "Cerrar igual" : "Cerrar el mes"}
        </Boton>
      )}
    </form>
  );
}

function Cerrado({
  anio,
  mes,
  cierre,
  motivo,
}: {
  anio: number;
  mes: number;
  cierre: Cierre;
  motivo: string | null;
}) {
  const [estado, accion, enviando] = useActionState(reabrirMes, undefined);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <>
      <div>
        <p className="text-sm text-tenue">Caja al cierre</p>
        <p className="tabular text-2xl font-semibold mt-1">{formatearUSD(cierre.cajaFinal)}</p>
        <p className="text-xs text-tenue mt-1.5">
          {cierre.cerradoPor} · {cierre.cerradoEn}
        </p>
      </div>

      {cierre.notas && (
        <p className="rounded-lg bg-background border border-borde text-sm px-3 py-2 whitespace-pre-line leading-relaxed">
          {cierre.notas}
        </p>
      )}

      <form action={accion} className="space-y-3 border-t border-borde pt-4">
        <input type="hidden" name="anio" value={anio} />
        <input type="hidden" name="mes" value={mes} />

        {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}

        {motivo ? (
          <p className="text-xs text-tenue leading-relaxed">{motivo}</p>
        ) : confirmando ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed">
              Reabrir borra el cierre de {nombreMes(mes)} y vuelve a habilitar la edición de todo el
              mes. La foto de caja se pierde: al cerrar de nuevo se recalcula.
            </p>
            <div className="flex gap-2">
              <Boton variante="peligro" disabled={enviando}>
                {enviando ? "Reabriendo…" : "Sí, reabrir"}
              </Boton>
              <Boton
                type="button"
                variante="secundario"
                disabled={enviando}
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </Boton>
            </div>
          </div>
        ) : (
          <Boton type="button" variante="peligro" onClick={() => setConfirmando(true)}>
            Reabrir el mes
          </Boton>
        )}
      </form>
    </>
  );
}
