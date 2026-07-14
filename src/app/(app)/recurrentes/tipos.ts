import type { EstadoFormulario } from "@/lib/validacion";

/** Lo que devuelve generarMes: además del ok, el recuento y el mes al que corresponde. */
export type EstadoGeneracion = EstadoFormulario & {
  mensaje?: string;
  anio?: number;
  mes?: number;
};
