import "server-only";
import { prisma } from "@/lib/prisma";
import { calcularCuentasSocios, rangoMes } from "@/lib/calculos";
import { TIPO_GASTO } from "@/lib/constantes";
import { formatearUSD } from "@/lib/dinero";
import { ultimoDiaDelMes } from "./datos";

// Lo que queda colgado al cerrar el mes. NINGUNO bloquea: un mes flojo donde nadie
// retiró el sueldo, o un cliente que paga tarde, son situaciones legítimas. La gracia
// es que el cierre las diga en voz alta en vez de que aparezcan en octubre.

/** `id` es el de la entidad real: dos items pueden compartir texto (dos "Publicidad" del mes). */
export type Pendiente = { id: string; texto: string; detalle?: string; monto: number; href: string };

export type Chequeo = {
  clave: string;
  titulo: string;
  explicacion: string;
  items: Pendiente[];
  total: number;
};

export async function chequeosDelMes(anio: number, mes: number): Promise<Chequeo[]> {
  const rango = rangoMes(anio, mes);

  const [borradores, trabajos, gastos, cuentas] = await Promise.all([
    prisma.gasto.findMany({
      where: { fecha: rango, esBorrador: true },
      orderBy: { fecha: "asc" },
      select: { id: true, concepto: true, monto: true, recurrenteId: true },
    }),
    prisma.trabajo.findMany({
      where: { fecha: rango },
      orderBy: { fecha: "asc" },
      include: { cliente: { select: { id: true, nombre: true } }, cobros: { select: { monto: true } } },
    }),
    prisma.gasto.findMany({
      where: { fecha: rango, esBorrador: false, tipo: TIPO_GASTO.OPERATIVO },
      orderBy: { fecha: "asc" },
      include: { pagos: { select: { monto: true } } },
    }),
    // La cuenta del socio es UNA sola y un giro cancela sueldos y adelantos
    // indistintamente. La fórmula vive en @/lib/calculos: no se netea a mano acá.
    calcularCuentasSocios(ultimoDiaDelMes(anio, mes)),
  ]);

  const chequeos: Chequeo[] = [];

  // Todos los borradores, no solo los que siguen enganchados a un recurrente:
  // recurrenteId es SetNull, así que un borrador puede quedar huérfano y seguir
  // siendo igual de invisible para el mes.
  if (borradores.length > 0) {
    chequeos.push(
      armar({
        clave: "borradores",
        titulo: "Gastos recurrentes sin confirmar",
        explicacion:
          "Están en borrador: no bajan la caja ni cuentan en el resumen. Si cerrás así, el mes queda sin ellos.",
        items: borradores.map((g) => ({
          id: g.id,
          texto: g.concepto,
          detalle: g.recurrenteId ? "recurrente en borrador" : "borrador",
          monto: g.monto,
          href: "/gastos",
        })),
      }),
    );
  }

  const sinCobrar = trabajos
    .map((t) => ({ t, pendiente: t.monto - t.cobros.reduce((acc, c) => acc + c.monto, 0) }))
    .filter(({ pendiente }) => pendiente > 0);
  if (sinCobrar.length > 0) {
    chequeos.push(
      armar({
        clave: "por-cobrar",
        titulo: "Trabajos del mes sin cobrar por completo",
        explicacion:
          "El saldo se arrastra solo: va a seguir apareciendo en Por cobrar aunque cierres el mes.",
        items: sinCobrar.map(({ t, pendiente }) => ({
          id: t.id,
          texto: `${t.cliente.nombre} — ${t.descripcion}`,
          monto: pendiente,
          href: `/clientes/${t.cliente.id}`,
        })),
      }),
    );
  }

  const sinPagar = gastos
    .map((g) => ({ g, pendiente: g.monto - g.pagos.reduce((acc, p) => acc + p.monto, 0) }))
    .filter(({ pendiente }) => pendiente > 0);
  if (sinPagar.length > 0) {
    chequeos.push(
      armar({
        clave: "impagos",
        titulo: "Gastos del mes sin terminar de pagar",
        explicacion:
          "El gasto ya está devengado, pero esa plata todavía no salió de la caja: es deuda con proveedores.",
        items: sinPagar.map(({ g, pendiente }) => ({
          id: g.id,
          texto: g.concepto,
          monto: pendiente,
          href: "/gastos",
        })),
      }),
    );
  }

  // Un sueldo se "cobra" cuando la empresa le gira la plata al socio (PagoASocio), no cuando
  // se devenga. Pero el giro no viene etiquetado: cancela sueldos y adelantos del mismo saldo,
  // así que "cuánto sueldo retiró" no es una pregunta que el modelo pueda responder. Lo que sí
  // se puede afirmar al cerrar es el saldo de la cuenta al último día del mes.
  const aFavor = cuentas.filter((c) => c.saldo > 0);
  if (aFavor.length > 0) {
    chequeos.push(
      armar({
        clave: "cuentas-socios",
        titulo: "Saldo a favor de los socios al cierre",
        explicacion:
          "Sueldos devengados y plata que pusieron del bolsillo, menos lo que se les giró. Es una sola cuenta por socio: un giro cancela las dos cosas indistintamente. Es normal en un mes flojo: la plata sigue en la caja.",
        items: aFavor.map((c) => ({
          id: c.socioId,
          texto: c.nombre,
          detalle: `${formatearUSD(c.sueldosDevengados)} de sueldos + ${formatearUSD(
            c.adelantos,
          )} de bolsillo − ${formatearUSD(c.girosRecibidos)} girados`,
          monto: c.saldo,
          href: `/socios/${c.socioId}`,
        })),
      }),
    );
  }

  return chequeos;
}

function armar(c: Omit<Chequeo, "total">): Chequeo {
  return { ...c, total: c.items.reduce((acc, i) => acc + i.monto, 0) };
}
