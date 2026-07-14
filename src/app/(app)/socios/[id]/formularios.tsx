"use client";

import { useActionState, useState } from "react";
import { borrarGiro, cambiarClave, editarSocio, registrarGiro } from "../acciones";
import { aUSD, formatearUSD } from "@/lib/dinero";
import { ETIQUETA_METODO, METODO } from "@/lib/constantes";
import { Boton, Campo, ErrorAviso, Input, Select, Textarea } from "@/components/ui";

export function FormularioGiro({
  socioId,
  cajaReal,
  saldo,
  hoy,
}: {
  socioId: string;
  cajaReal: number;
  saldo: number;
  hoy: string;
}) {
  const [estado, accion, pendiente] = useActionState(registrarGiro, undefined);
  const [monto, setMonto] = useState("");

  const centavos = Math.round((Number(monto) || 0) * 100);
  const cajaDespues = cajaReal - centavos;
  // Se advierte, no se bloquea: la app refleja lo que pasó, no lo autoriza.
  const dejaCajaEnRojo = centavos > 0 && cajaDespues < 0;
  const superaElSaldo = centavos > 0 && centavos > saldo;

  return (
    <form action={accion} className="px-5 py-4 space-y-4">
      <input type="hidden" name="socioId" value={socioId} />

      <div className="rounded-lg bg-background border border-borde px-3 py-2 text-sm">
        <div className="flex justify-between">
          <span className="text-tenue">Caja disponible</span>
          <span className={`tabular ${cajaReal < 0 ? "text-negativo" : ""}`}>
            {formatearUSD(cajaReal)}
          </span>
        </div>
        {centavos > 0 && (
          <div className="flex justify-between mt-1">
            <span className="text-tenue">Queda después del giro</span>
            <span className={`tabular ${cajaDespues < 0 ? "text-negativo" : "text-positivo"}`}>
              {formatearUSD(cajaDespues)}
            </span>
          </div>
        )}
      </div>

      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
      {estado?.ok && (
        <p className="rounded-lg bg-positivo/10 text-positivo text-sm px-3 py-2">Giro registrado.</p>
      )}

      <Campo etiqueta="Monto (USD)" error={estado?.errores?.monto}>
        <Input
          name="monto"
          inputMode="decimal"
          placeholder="500"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </Campo>

      {saldo > 0 && (
        <button
          type="button"
          onClick={() => setMonto(String(aUSD(saldo)))}
          className="text-xs text-acento hover:underline"
        >
          Cancelar todo el saldo ({formatearUSD(saldo)})
        </button>
      )}

      {dejaCajaEnRojo && (
        <p className="rounded-lg bg-alerta/10 text-alerta text-sm px-3 py-2">
          Ojo: con este giro la caja queda en {formatearUSD(cajaDespues)}. Podés registrarlo igual.
        </p>
      )}
      {superaElSaldo && (
        <p className="text-xs text-tenue">
          Es más de lo que se le debe ({formatearUSD(saldo)}): le va a quedar saldo en contra.
        </p>
      )}

      <Campo etiqueta="Fecha" error={estado?.errores?.fecha}>
        <Input name="fecha" type="date" defaultValue={hoy} />
      </Campo>

      <Campo etiqueta="Método" error={estado?.errores?.metodo}>
        <Select name="metodo" defaultValue={METODO.TRANSFERENCIA}>
          {Object.values(METODO).map((m) => (
            <option key={m} value={m}>
              {ETIQUETA_METODO[m]}
            </option>
          ))}
        </Select>
      </Campo>

      <Campo etiqueta="Notas" error={estado?.errores?.notas}>
        <Textarea name="notas" rows={2} placeholder="Opcional" />
      </Campo>

      <Boton disabled={pendiente} className="w-full">
        {pendiente ? "Registrando…" : "Registrar giro"}
      </Boton>
    </form>
  );
}

export function BorrarGiro({ id }: { id: string }) {
  const [estado, accion, pendiente] = useActionState(borrarGiro, undefined);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("¿Borrar este giro? Vuelve a subir la caja y el saldo del socio.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendiente}
        title={estado?.error ?? "Borrar giro"}
        className={`text-xs transition disabled:opacity-50 ${
          estado?.error ? "text-negativo" : "text-tenue hover:text-negativo"
        }`}
      >
        {estado?.error ? "No se pudo" : "Borrar"}
      </button>
    </form>
  );
}

export function FormularioSocio({
  socioId,
  nombre,
  sueldoMensual,
}: {
  socioId: string;
  nombre: string;
  sueldoMensual: number;
}) {
  const [estado, accion, pendiente] = useActionState(editarSocio, undefined);

  return (
    <form action={accion} className="px-5 py-4 space-y-4">
      <input type="hidden" name="socioId" value={socioId} />

      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
      {estado?.ok && (
        <p className="rounded-lg bg-positivo/10 text-positivo text-sm px-3 py-2">Datos guardados.</p>
      )}

      <Campo etiqueta="Nombre" error={estado?.errores?.nombre}>
        <Input name="nombre" defaultValue={nombre} />
      </Campo>

      <Campo
        etiqueta="Sueldo mensual (USD)"
        error={estado?.errores?.sueldoMensual}
        ayuda="Rige de acá en adelante: los sueldos ya devengados no cambian."
      >
        <Input
          name="sueldoMensual"
          inputMode="decimal"
          defaultValue={String(aUSD(sueldoMensual))}
        />
      </Campo>

      <Boton disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</Boton>
    </form>
  );
}

export function FormularioClave({ socioId }: { socioId: string }) {
  const [estado, accion, pendiente] = useActionState(cambiarClave, undefined);

  return (
    <form action={accion} className="px-5 py-4 space-y-4">
      <input type="hidden" name="socioId" value={socioId} />

      {estado?.error && <ErrorAviso>{estado.error}</ErrorAviso>}
      {estado?.ok && (
        <p className="rounded-lg bg-positivo/10 text-positivo text-sm px-3 py-2">
          Listo, ya tenés contraseña nueva.
        </p>
      )}

      <Campo etiqueta="Contraseña actual" error={estado?.errores?.actual}>
        <Input name="actual" type="password" autoComplete="current-password" />
      </Campo>

      <Campo etiqueta="Contraseña nueva" error={estado?.errores?.nueva} ayuda="Mínimo 8 caracteres.">
        <Input name="nueva" type="password" autoComplete="new-password" />
      </Campo>

      <Campo etiqueta="Repetila" error={estado?.errores?.repetida}>
        <Input name="repetida" type="password" autoComplete="new-password" />
      </Campo>

      <Boton disabled={pendiente}>{pendiente ? "Cambiando…" : "Cambiar contraseña"}</Boton>
    </form>
  );
}
