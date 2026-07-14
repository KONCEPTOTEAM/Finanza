import { PAGADOR } from "@/lib/constantes";

export type PagoResumen = {
  monto: number;
  pagador: string;
  socio: { nombre: string } | null;
};

export const totalPagado = (pagos: { monto: number }[]) =>
  pagos.reduce((acc, p) => acc + p.monto, 0);

/** "La empresa", "Jorge", "Jorge + la empresa": de un vistazo, de qué bolsillo salió. */
export function quienPago(pagos: PagoResumen[]): string {
  const nombres = new Set<string>();
  for (const p of pagos) {
    nombres.add(p.pagador === PAGADOR.SOCIO ? (p.socio?.nombre ?? "Un socio") : "La empresa");
  }
  return [...nombres].join(" + ");
}

/** Suma de lo que puso cada lado. Lo de los socios NO salió de la caja. */
export function porBolsillo(pagos: PagoResumen[]) {
  let empresa = 0;
  let socios = 0;
  for (const p of pagos) {
    if (p.pagador === PAGADOR.SOCIO) socios += p.monto;
    else empresa += p.monto;
  }
  return { empresa, socios };
}
