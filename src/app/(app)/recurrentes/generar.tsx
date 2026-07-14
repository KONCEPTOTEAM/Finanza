"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { generarMes } from "./acciones";
import { MESES, nombreMes } from "@/lib/constantes";
import { Boton, Card, ErrorAviso, Select } from "@/components/ui";

export function PanelGenerar({
  anio,
  mes,
  anios,
  cerrado,
  activas,
  faltantes,
}: {
  anio: number;
  mes: number;
  anios: number[];
  cerrado: boolean;
  activas: number;
  faltantes: number;
}) {
  const [estado, accion, pendiente] = useActionState(generarMes, undefined);
  const router = useRouter();

  function verMes(a: number, m: number) {
    router.replace(`/recurrentes?anio=${a}&mes=${m}`);
  }

  // El resultado queda pegado al mes que lo produjo: al cambiar de mes sin recargar,
  // el componente no se desmonta y el mensaje viejo mentiría sobre el mes nuevo.
  const resultado = estado?.anio === anio && estado?.mes === mes ? estado : undefined;

  return (
    <Card className="mb-6">
      <div className="px-5 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-sm font-medium">Mes</span>
            <div className="mt-1.5">
              <Select value={mes} onChange={(e) => verMes(anio, Number(e.target.value))}>
                {MESES.map((nombre, i) => (
                  <option key={nombre} value={i + 1}>
                    {nombre}
                  </option>
                ))}
              </Select>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Año</span>
            <div className="mt-1.5">
              <Select value={anio} onChange={(e) => verMes(Number(e.target.value), mes)}>
                {anios.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
          </label>

          <form action={accion} className="flex-1 min-w-60">
            <input type="hidden" name="anio" value={anio} />
            <input type="hidden" name="mes" value={mes} />
            <Boton
              disabled={pendiente || cerrado || activas === 0}
              className="w-full px-5 py-3 text-base"
            >
              {pendiente ? "Generando…" : `Generar los gastos de ${nombreMes(mes)}`}
            </Boton>
          </form>
        </div>

        <p className="text-sm text-tenue mt-3">
          Se crean como <strong className="font-medium text-foreground">borrador</strong> con el
          monto sugerido, y no cuentan para nada hasta que los confirmes desde Gastos. El monto no
          es fijo: Claude pasó de 100 a 200 y Publicidad de 60 a 100 entre junio y julio, así que
          revisá cada uno antes de confirmarlo.
        </p>

        <div className="mt-3 space-y-2">
          {cerrado ? (
            <ErrorAviso>
              {nombreMes(mes)} de {anio} ya está cerrado: no se le pueden agregar gastos.
            </ErrorAviso>
          ) : activas === 0 ? (
            <p className="text-sm text-tenue">No hay plantillas activas todavía.</p>
          ) : (
            <p className="text-sm text-tenue">
              {faltantes === 0
                ? `Las ${activas} plantillas activas ya están generadas en ${nombreMes(mes)}.`
                : `${faltantes} de ${activas} plantillas activas todavía no se generaron en ${nombreMes(mes)}.`}
            </p>
          )}

          {resultado?.error && <ErrorAviso>{resultado.error}</ErrorAviso>}
          {resultado?.ok && (
            <p className="rounded-lg bg-positivo/10 text-positivo text-sm px-3 py-2">
              {resultado.mensaje} en {nombreMes(mes)} de {anio}.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
