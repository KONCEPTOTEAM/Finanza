import * as z from "zod";

// Mensajes por defecto en español para todo el proyecto.
z.config(z.locales.es());

// OJO: formData.get() devuelve null si el campo no vino, y "" si vino vacío.
// z.coerce.number() convierte AMBOS a 0 sin chistar — en una app de plata eso
// significa guardar un monto de 0 en silencio. Por eso todo pasa por preprocess
// primero, para que el caso "no vino" llegue como "" y dispare "Requerido".

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Monto en USD escrito por el usuario -> centavos. Rechaza vacío, no-numérico y <= 0. */
export const montoUSD = z
  .preprocess(texto, z.string().min(1, { error: "Ingresá un monto." }))
  .pipe(z.coerce.number({ error: "Tiene que ser un número." }))
  .refine((n) => Number.isFinite(n), { error: "Tiene que ser un número." })
  .refine((n) => n > 0, { error: "Tiene que ser mayor a 0." })
  .transform((n) => Math.round(n * 100));

/** Igual que montoUSD pero admite 0 (para señas, ajustes). */
export const montoUSDCeroOk = z
  .preprocess(texto, z.string().min(1, { error: "Ingresá un monto." }))
  .pipe(z.coerce.number({ error: "Tiene que ser un número." }))
  .refine((n) => Number.isFinite(n) && n >= 0, { error: "No puede ser negativo." })
  .transform((n) => Math.round(n * 100));

/** Monto opcional: "" o ausente -> undefined. */
export const montoUSDOpcional = z
  .preprocess(texto, z.string())
  .transform((s) => (s === "" ? undefined : Number(s)))
  .refine((n) => n === undefined || Number.isFinite(n), { error: "Tiene que ser un número." })
  .refine((n) => n === undefined || n >= 0, { error: "No puede ser negativo." })
  .transform((n) => (n === undefined ? undefined : Math.round(n * 100)));

/** Fecha de un <input type="date">. */
export const fecha = z
  .preprocess(texto, z.string().min(1, { error: "Elegí una fecha." }))
  .pipe(z.coerce.date({ error: "Fecha inválida." }));

export const textoRequerido = (etiqueta = "Este campo") =>
  z.preprocess(texto, z.string().min(1, { error: `${etiqueta} es obligatorio.` }));

export const textoOpcional = z
  .preprocess(texto, z.string())
  .transform((s) => (s === "" ? undefined : s));

export const idRequerido = z.preprocess(texto, z.string().min(1, { error: "Elegí una opción." }));

/** Estado que devuelven todas las acciones a useActionState. */
export type EstadoFormulario = {
  ok?: boolean;
  error?: string;
  errores?: Record<string, string[] | undefined>;
};

/**
 * Convierte un ZodError a errores por campo. z.flattenError es el reemplazo
 * de .flatten(), que quedó deprecado en Zod 4.
 */
export function erroresDe(error: z.ZodError): EstadoFormulario {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return {
    errores: fieldErrors as Record<string, string[] | undefined>,
    error: formErrors[0],
  };
}
