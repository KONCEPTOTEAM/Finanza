// La plata se guarda SIEMPRE en centavos enteros. Nunca en Float.
// USD 500 => 50000. USD 0.88 => 88.

/** Convierte lo que escribe el usuario (USD) a centavos para guardar. */
export function aCentavos(usd: number): number {
  return Math.round(usd * 100);
}

/** Convierte centavos guardados a USD para mostrar o calcular. */
export function aUSD(centavos: number): number {
  return centavos / 100;
}

/** Formatea centavos como "USD 1.234,56". Sin decimales si es un monto redondo. */
export function formatearUSD(centavos: number): string {
  const usd = aUSD(centavos);
  const tieneDecimales = centavos % 100 !== 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: tieneDecimales ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(usd);
}

/** Igual que formatearUSD pero con signo explícito. Para movimientos. */
export function formatearConSigno(centavos: number): string {
  const signo = centavos > 0 ? "+" : "";
  return signo + formatearUSD(centavos);
}
