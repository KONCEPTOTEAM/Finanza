// SQLite no soporta enums en Prisma, así que los tipos viven acá como constantes
// y los campos del schema son String.

export const TIPO_GASTO = {
  OPERATIVO: "OPERATIVO",
  SUELDO: "SUELDO",
} as const;
export type TipoGasto = (typeof TIPO_GASTO)[keyof typeof TIPO_GASTO];

export const PAGADOR = {
  EMPRESA: "EMPRESA",
  SOCIO: "SOCIO",
} as const;
export type Pagador = (typeof PAGADOR)[keyof typeof PAGADOR];

export const METODO = {
  TRANSFERENCIA: "TRANSFERENCIA",
  EFECTIVO: "EFECTIVO",
  OTRO: "OTRO",
} as const;
export type Metodo = (typeof METODO)[keyof typeof METODO];

export const ETIQUETA_METODO: Record<Metodo, string> = {
  TRANSFERENCIA: "Transferencia",
  EFECTIVO: "Efectivo",
  OTRO: "Otro",
};

export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? "";
}
