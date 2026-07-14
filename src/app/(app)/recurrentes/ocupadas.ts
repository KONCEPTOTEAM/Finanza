import "server-only";
import { TIPO_GASTO } from "@/lib/constantes";

// Cuándo una plantilla "ya tiene su gasto" en un mes. Vive acá y no adentro de la acción
// porque la pantalla también lo necesita: si contara los faltantes con otro criterio, el
// botón diría "Generar 3" y se crearía 1, o al revés.

export type GastoDelMes = {
  recurrenteId: string | null;
  tipo: string;
  socioId: string | null;
};

export type PlantillaMinima = {
  id: string;
  tipo: string;
  socioId: string | null;
};

/**
 * Devuelve un predicado que dice si una plantilla ya está cubierta en el mes.
 *
 * Un sueldo se detecta además por socio, no solo por plantilla: borrar una plantilla deja
 * sus gastos con `recurrenteId = null` (onDelete: SetNull), y regenerar duplicaría el
 * devengado. Un sueldo duplicado es deuda inventada con un socio.
 *
 * A los operativos NO se les aplica ese criterio: un gasto "Publicidad" cargado a mano es
 * legítimo y distinto del recurrente. Saltear la plantilla por eso sería peor que el
 * duplicado que evita — un operativo repetido es un borrador que se borra en un click.
 */
export function cobertura(delMes: GastoDelMes[]) {
  const porPlantilla = new Set(
    delMes.map((g) => g.recurrenteId).filter((v): v is string => v !== null),
  );
  const sueldosPorSocio = new Set(
    delMes
      .filter((g) => g.tipo === TIPO_GASTO.SUELDO && g.socioId !== null)
      .map((g) => g.socioId!),
  );

  return {
    cubre(p: PlantillaMinima): boolean {
      if (porPlantilla.has(p.id)) return true;
      return p.tipo === TIPO_GASTO.SUELDO && p.socioId !== null && sueldosPorSocio.has(p.socioId);
    },
    /** Registra lo recién creado para que dos plantillas del mismo socio no devenguen dos veces. */
    anotar(p: PlantillaMinima) {
      porPlantilla.add(p.id);
      if (p.tipo === TIPO_GASTO.SUELDO && p.socioId !== null) sueldosPorSocio.add(p.socioId);
    },
  };
}
