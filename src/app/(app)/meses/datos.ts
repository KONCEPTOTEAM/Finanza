import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { nombreMes } from "@/lib/constantes";

// Los meses no se dan de alta a mano: existen porque hay movimientos con esa fecha.
// De acá salen la lista, el orden de cierre y los bloqueos.

export type ClaveMes = { anio: number; mes: number };

/**
 * El cliente de Prisma o el `tx` de un $transaction. Las lecturas que sostienen un guard
 * tienen que poder viajar en la misma transacción que el write que protegen: si leen del
 * singleton global ven un snapshot distinto y el guard no guarda nada.
 */
export type ClientePrisma = Prisma.TransactionClient | typeof prisma;

/** Último instante del mes, en UTC. Es la fecha de corte de la foto de caja. */
export function ultimoDiaDelMes(anio: number, mes: number): Date {
  return new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));
}

/** Hoy a medianoche UTC: para comparar meses sin que la hora local corra el día. */
function hoyUTC(): Date {
  const hoy = new Date();
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
}

function claveDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${fecha.getUTCMonth() + 1}`;
}

export function etiquetaMes({ anio, mes }: ClaveMes): string {
  return `${nombreMes(mes)} de ${anio}`;
}

/**
 * Meses con movimientos, del más viejo al más nuevo.
 * Los pagos entran aunque su gasto sea de otro mes: un pago de agosto sobre un gasto
 * de julio mueve la caja de agosto, y si no estuviera acá ese mes sería invisible.
 * Los borradores no cuentan para nada, tampoco para existir.
 */
export async function mesesConActividad(db: ClientePrisma = prisma): Promise<ClaveMes[]> {
  const [cobros, gastos, pagos, giros, cierres] = await Promise.all([
    db.cobro.findMany({ select: { fecha: true } }),
    db.gasto.findMany({ where: { esBorrador: false }, select: { fecha: true } }),
    db.pagoGasto.findMany({
      where: { gasto: { esBorrador: false } },
      select: { fecha: true },
    }),
    db.pagoASocio.findMany({ select: { fecha: true } }),
    db.cierreMes.findMany({ select: { anio: true, mes: true } }),
  ]);

  return ordenar([...cobros, ...gastos, ...pagos, ...giros], cierres);
}

/**
 * Meses con CUALQUIER registro fechado, borradores incluidos. Es la base del guard de orden
 * de cierre, y por eso no puede usar `mesesConActividad`: un mes cuyo único movimiento es un
 * gasto en borrador es invisible para el listado (correcto: no mueve plata) pero NO puede ser
 * invisible para el guard. Si lo fuera, el mes siguiente se cerraría sin que nadie cerrara
 * este, y confirmar después el borrador movería una caja que ya quedó fotografiada en el
 * CierreMes posterior. Un borrador es plata que todavía puede materializarse.
 */
export async function mesesConRegistros(db: ClientePrisma = prisma): Promise<ClaveMes[]> {
  const [cobros, gastos, pagos, giros, cierres] = await Promise.all([
    db.cobro.findMany({ select: { fecha: true } }),
    db.gasto.findMany({ select: { fecha: true } }),
    db.pagoGasto.findMany({ select: { fecha: true } }),
    db.pagoASocio.findMany({ select: { fecha: true } }),
    db.cierreMes.findMany({ select: { anio: true, mes: true } }),
  ]);

  return ordenar([...cobros, ...gastos, ...pagos, ...giros], cierres);
}

function ordenar(fechados: { fecha: Date }[], cierres: ClaveMes[]): ClaveMes[] {
  const claves = new Set<string>();
  for (const { fecha } of fechados) claves.add(claveDe(fecha));
  for (const c of cierres) claves.add(`${c.anio}-${c.mes}`);

  return [...claves]
    .map((c) => {
      const [anio, mes] = c.split("-").map(Number);
      return { anio, mes };
    })
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes);
}

/**
 * Por qué NO se puede cerrar este mes, o null si se puede.
 * Son las dos únicas condiciones duras: todo lo demás son advertencias.
 */
export async function motivoParaNoCerrar(
  anio: number,
  mes: number,
  db: ClientePrisma = prisma,
): Promise<string | null> {
  const ultimoDia = ultimoDiaDelMes(anio, mes);
  const cierraEl = new Date(Date.UTC(anio, mes, 0));

  if (hoyUTC() < cierraEl) {
    return `${etiquetaMes({ anio, mes })} todavía no terminó. Vas a poder cerrarlo a partir del ${ultimoDia.toLocaleDateString(
      "es-AR",
      { day: "numeric", month: "long", timeZone: "UTC" },
    )}.`;
  }

  const [meses, cerrados] = await Promise.all([
    mesesConRegistros(db),
    db.cierreMes.findMany({ select: { anio: true, mes: true } }),
  ]);
  const yaCerrado = new Set(cerrados.map((c) => `${c.anio}-${c.mes}`));

  const anterior = meses
    .filter((m) => m.anio < anio || (m.anio === anio && m.mes < mes))
    .findLast((m) => !yaCerrado.has(`${m.anio}-${m.mes}`));

  if (anterior) {
    return `Antes tenés que cerrar ${etiquetaMes(anterior)}. Los meses se cierran en orden, si no la caja de apertura de este arrastra un período abierto.`;
  }

  return null;
}

/**
 * Por qué NO se puede reabrir, o null si se puede. Reabrir un mes con otro cerrado
 * después dejaría el cierre posterior apoyado en números que se pueden mover.
 */
export async function motivoParaNoReabrir(
  anio: number,
  mes: number,
  db: ClientePrisma = prisma,
): Promise<string | null> {
  const posterior = await db.cierreMes.findFirst({
    where: { OR: [{ anio: { gt: anio } }, { anio, mes: { gt: mes } }] },
    orderBy: [{ anio: "asc" }, { mes: "asc" }],
    select: { anio: true, mes: true },
  });

  return posterior
    ? `Antes tenés que reabrir ${etiquetaMes(posterior)}, que se cerró después de este.`
    : null;
}
