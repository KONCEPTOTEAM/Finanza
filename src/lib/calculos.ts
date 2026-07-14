import "server-only";
import { prisma } from "./prisma";
import { PAGADOR, TIPO_GASTO } from "./constantes";

// Acá vive toda la lógica de plata. Dos reglas que sostienen el modelo:
//
//   Caja real    = cobros − pagos que puso la empresa − plata girada a socios
//   Cuenta socio = adelantos que puso + sueldos devengados − plata que recibió
//
// Lo importante: un gasto que pagó un socio de su bolsillo NO baja la caja.
// Sube su cuenta corriente. Es la diferencia entre "cuánta plata hay" y
// "cuánta plata es nuestra", que la planilla mezclaba en un solo número.
//
// Los gastos en borrador (recurrentes autogenerados sin confirmar) no cuentan
// para nada hasta que se confirmen.

const NO_BORRADOR = { esBorrador: false };

/** Filtro de fecha "hasta e incluyendo", o sin filtro si no se pasa nada. */
function hastaFecha(hasta?: Date) {
  return hasta ? { lte: hasta } : undefined;
}

/** Filtro de un mes calendario concreto. */
export function rangoMes(anio: number, mes: number) {
  return {
    gte: new Date(Date.UTC(anio, mes - 1, 1)),
    lt: new Date(Date.UTC(anio, mes, 1)),
  };
}

// ---------------------------------------------------------------------------
// Caja
// ---------------------------------------------------------------------------

/**
 * Plata que hay en la caja. Si se pasa `hasta`, el saldo a esa fecha.
 * El arrastre entre meses sale de acá: no se anota a mano, se calcula.
 */
export async function calcularCajaReal(hasta?: Date): Promise<number> {
  const fecha = hastaFecha(hasta);
  const [cobros, pagosEmpresa, giros] = await Promise.all([
    prisma.cobro.aggregate({ _sum: { monto: true }, where: { fecha } }),
    prisma.pagoGasto.aggregate({
      _sum: { monto: true },
      where: { fecha, pagador: PAGADOR.EMPRESA, gasto: NO_BORRADOR },
    }),
    prisma.pagoASocio.aggregate({ _sum: { monto: true }, where: { fecha } }),
  ]);
  return (
    (cobros._sum.monto ?? 0) -
    (pagosEmpresa._sum.monto ?? 0) -
    (giros._sum.monto ?? 0)
  );
}

// ---------------------------------------------------------------------------
// Por cobrar
// ---------------------------------------------------------------------------

export type SaldoTrabajo = {
  id: string;
  descripcion: string;
  clienteId: string;
  cliente: string;
  fecha: Date;
  monto: number;
  cobrado: number;
  pendiente: number;
};

/**
 * Saldos abiertos de todos los trabajos, sin importar el mes en que se facturaron.
 * Un trabajo de junio cobrado a medias sigue apareciendo acá en julio solo:
 * nunca hay que re-listarlo a mano.
 */
export async function calcularPorCobrar(): Promise<SaldoTrabajo[]> {
  const trabajos = await prisma.trabajo.findMany({
    include: { cliente: { select: { id: true, nombre: true } }, cobros: true },
    orderBy: { fecha: "asc" },
  });

  return trabajos
    .map((t) => {
      const cobrado = t.cobros.reduce((acc, c) => acc + c.monto, 0);
      return {
        id: t.id,
        descripcion: t.descripcion,
        clienteId: t.cliente.id,
        cliente: t.cliente.nombre,
        fecha: t.fecha,
        monto: t.monto,
        cobrado,
        pendiente: t.monto - cobrado,
      };
    })
    .filter((t) => t.pendiente > 0);
}

export async function totalPorCobrar(): Promise<number> {
  const saldos = await calcularPorCobrar();
  return saldos.reduce((acc, s) => acc + s.pendiente, 0);
}

// ---------------------------------------------------------------------------
// Cuentas corrientes de socios
// ---------------------------------------------------------------------------

export type CuentaSocio = {
  socioId: string;
  nombre: string;
  activo: boolean;
  adelantos: number;
  sueldosDevengados: number;
  girosRecibidos: number;
  /** Positivo = la empresa le debe. Negativo = el socio le debe a la empresa. */
  saldo: number;
};

/**
 * Una sola cuenta por socio: adelantos y sueldos van al mismo saldo, y cualquier
 * giro los cancela indistintamente. Jorge poniendo 318 de gastos y teniendo 500
 * de sueldo impago es un único número: 818 a favor.
 *
 * Incluye a los socios dados de baja: darlo de baja no cancela lo que se le debe.
 * Filtrar por `activo` acá haría desaparecer esa plata del panorama. Si querés
 * mostrarlos aparte, filtrá por el campo `activo` del resultado.
 */
export async function calcularCuentasSocios(hasta?: Date): Promise<CuentaSocio[]> {
  const fecha = hastaFecha(hasta);
  const socios = await prisma.socio.findMany({
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    select: { id: true, nombre: true, activo: true },
  });

  return Promise.all(
    socios.map(async (s) => {
      const [adelantos, sueldos, giros] = await Promise.all([
        prisma.pagoGasto.aggregate({
          _sum: { monto: true },
          where: { fecha, pagador: PAGADOR.SOCIO, socioId: s.id, gasto: NO_BORRADOR },
        }),
        prisma.gasto.aggregate({
          _sum: { monto: true },
          where: { fecha, tipo: TIPO_GASTO.SUELDO, socioId: s.id, ...NO_BORRADOR },
        }),
        prisma.pagoASocio.aggregate({
          _sum: { monto: true },
          where: { fecha, socioId: s.id },
        }),
      ]);

      const a = adelantos._sum.monto ?? 0;
      const d = sueldos._sum.monto ?? 0;
      const g = giros._sum.monto ?? 0;

      return {
        socioId: s.id,
        nombre: s.nombre,
        activo: s.activo,
        adelantos: a,
        sueldosDevengados: d,
        girosRecibidos: g,
        saldo: a + d - g,
      };
    }),
  );
}

export async function totalDeudaSocios(hasta?: Date): Promise<number> {
  const cuentas = await calcularCuentasSocios(hasta);
  return cuentas.reduce((acc, c) => acc + c.saldo, 0);
}

// ---------------------------------------------------------------------------
// Gastos impagos (deuda con proveedores)
// ---------------------------------------------------------------------------

/** Gastos confirmados cuyo monto todavía no está cubierto por sus pagos. */
export async function calcularGastosImpagos(hasta?: Date) {
  const gastos = await prisma.gasto.findMany({
    where: { fecha: hastaFecha(hasta), ...NO_BORRADOR, tipo: TIPO_GASTO.OPERATIVO },
    include: { pagos: true },
    orderBy: { fecha: "asc" },
  });

  return gastos
    .map((g) => {
      const pagado = g.pagos.reduce((acc, p) => acc + p.monto, 0);
      return { id: g.id, concepto: g.concepto, fecha: g.fecha, monto: g.monto, pagado, pendiente: g.monto - pagado };
    })
    .filter((g) => g.pendiente > 0);
}

// ---------------------------------------------------------------------------
// Resumen general
// ---------------------------------------------------------------------------

export type Panorama = {
  cajaReal: number;
  porCobrar: number;
  deudaSocios: number;
  deudaProveedores: number;
  /** Si se cobrara todo lo pendiente. Es el número que la planilla llamaba "CAJA JULIO". */
  cajaProyectada: number;
  /** Lo que realmente queda después de pagarle a todos. */
  posicionNeta: number;
};

export async function calcularPanorama(hasta?: Date): Promise<Panorama> {
  const [cajaReal, porCobrar, deudaSocios, impagos] = await Promise.all([
    calcularCajaReal(hasta),
    totalPorCobrar(),
    totalDeudaSocios(hasta),
    calcularGastosImpagos(hasta),
  ]);
  const deudaProveedores = impagos.reduce((acc, g) => acc + g.pendiente, 0);

  return {
    cajaReal,
    porCobrar,
    deudaSocios,
    deudaProveedores,
    cajaProyectada: cajaReal + porCobrar,
    posicionNeta: cajaReal + porCobrar - deudaSocios - deudaProveedores,
  };
}

// ---------------------------------------------------------------------------
// Resumen de un mes
// ---------------------------------------------------------------------------

export type ResumenMes = {
  anio: number;
  mes: number;
  cajaApertura: number;
  cobrado: number;
  facturado: number;
  gastosOperativos: number;
  sueldosDevengados: number;
  salidaDeCaja: number;
  cajaCierre: number;
  cerrado: boolean;
};

export async function calcularResumenMes(anio: number, mes: number): Promise<ResumenMes> {
  const rango = rangoMes(anio, mes);
  const finMesAnterior = new Date(rango.gte.getTime() - 1);
  const finMes = new Date(rango.lt.getTime() - 1);

  const [cajaApertura, cajaCierre, cobrado, facturado, operativos, sueldos, pagosEmpresa, giros, cierre] =
    await Promise.all([
      calcularCajaReal(finMesAnterior),
      calcularCajaReal(finMes),
      prisma.cobro.aggregate({ _sum: { monto: true }, where: { fecha: rango } }),
      prisma.trabajo.aggregate({ _sum: { monto: true }, where: { fecha: rango } }),
      prisma.gasto.aggregate({
        _sum: { monto: true },
        where: { fecha: rango, tipo: TIPO_GASTO.OPERATIVO, ...NO_BORRADOR },
      }),
      prisma.gasto.aggregate({
        _sum: { monto: true },
        where: { fecha: rango, tipo: TIPO_GASTO.SUELDO, ...NO_BORRADOR },
      }),
      prisma.pagoGasto.aggregate({
        _sum: { monto: true },
        where: { fecha: rango, pagador: PAGADOR.EMPRESA, gasto: NO_BORRADOR },
      }),
      prisma.pagoASocio.aggregate({ _sum: { monto: true }, where: { fecha: rango } }),
      prisma.cierreMes.findUnique({ where: { anio_mes: { anio, mes } } }),
    ]);

  return {
    anio,
    mes,
    cajaApertura,
    cajaCierre,
    cobrado: cobrado._sum.monto ?? 0,
    facturado: facturado._sum.monto ?? 0,
    gastosOperativos: operativos._sum.monto ?? 0,
    sueldosDevengados: sueldos._sum.monto ?? 0,
    salidaDeCaja: (pagosEmpresa._sum.monto ?? 0) + (giros._sum.monto ?? 0),
    cerrado: cierre !== null,
  };
}

/**
 * True si el mes de esa fecha ya está cerrado (bloquea ediciones).
 *
 * Pasale el cliente de la transacción cuando chequees antes de escribir: si leés por el
 * cliente global, entre el chequeo y el write alguien puede cerrar el mes y la plata
 * entra igual, dejando el `cajaFinal` congelado del cierre desfasado de la realidad.
 */
export async function mesEstaCerrado(
  fecha: Date,
  cliente: Pick<typeof prisma, "cierreMes"> = prisma,
): Promise<boolean> {
  const cierre = await cliente.cierreMes.findUnique({
    where: {
      anio_mes: { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 },
    },
    select: { id: true },
  });
  return cierre !== null;
}
