"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verificarSesion } from "@/lib/dal";
import { mesEstaCerrado } from "@/lib/calculos";
import { formatearUSD } from "@/lib/dinero";
import { METODO, PAGADOR, TIPO_GASTO, nombreMes } from "@/lib/constantes";
import {
  erroresDe,
  fecha,
  montoUSD,
  montoUSDOpcional,
  textoOpcional,
  textoRequerido,
  type EstadoFormulario,
} from "@/lib/validacion";

// El corazón de este módulo: quién pone la plata. Un pago de la EMPRESA baja la caja;
// uno de un SOCIO no la toca, le sube la cuenta corriente. Por eso pagador y socioId
// tienen que quedar siempre consistentes: SOCIO exige socioId, EMPRESA lo exige null.
// Un pago SOCIO sin socioId corrompe la cuenta corriente en silencio.

const pagadorZ = z.preprocess(
  (v) => (typeof v === "string" ? v : ""),
  z.enum([PAGADOR.EMPRESA, PAGADOR.SOCIO], { error: "Elegí quién puso la plata." }),
);

// Para el alta, donde el pago es opcional: si no vino el campo no se asume nada.
// El superRefine lo exige recién cuando hay un pago de verdad.
const pagadorOpcionalZ = z.preprocess(
  (v) => (typeof v === "string" && v !== "" ? v : undefined),
  z.enum([PAGADOR.EMPRESA, PAGADOR.SOCIO], { error: "Elegí quién puso la plata." }).optional(),
);

const metodoZ = z.preprocess(
  (v) => (typeof v === "string" && v !== "" ? v : METODO.TRANSFERENCIA),
  z.enum([METODO.TRANSFERENCIA, METODO.EFECTIVO, METODO.OTRO], { error: "Método inválido." }),
);

const idZ = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : ""),
  z.string().min(1, { error: "Falta el identificador." }),
);

function s(formData: FormData, campo: string) {
  return formData.get(campo);
}

/**
 * Ningún movimiento puede caer en un mes cerrado: el cierre guardó la foto del saldo
 * y tocarlo después la dejaría mintiendo. Se chequea la fecha VIEJA y la NUEVA, porque
 * mover un pago fuera de un mes cerrado lo modifica igual.
 */
async function mesBloqueado(...fechas: Date[]): Promise<string | null> {
  const unicos = new Map<string, Date>();
  for (const f of fechas) unicos.set(`${f.getUTCFullYear()}-${f.getUTCMonth()}`, f);
  for (const f of unicos.values()) {
    if (await mesEstaCerrado(f)) {
      return `${nombreMes(f.getUTCMonth() + 1)} de ${f.getUTCFullYear()} ya está cerrado: no se puede tocar.`;
    }
  }
  return null;
}

/** Confirma que el socio del pago existe y sigue activo antes de imputarle plata. */
async function socioInvalido(socioId: string): Promise<boolean> {
  const socio = await prisma.socio.findUnique({
    where: { id: socioId },
    select: { activo: true },
  });
  return !socio || !socio.activo;
}

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------

// El alta manual es SIEMPRE OPERATIVO: los sueldos nacen de /recurrentes.
// El primer pago es opcional y comparte la fecha del gasto — si hubo más de un
// pagador (Publicidad: 88 de Jorge + 12 de la empresa), el resto se carga en el detalle.
const GastoNuevo = z
  .object({
    concepto: textoRequerido("El concepto"),
    monto: montoUSD,
    fecha,
    notas: textoOpcional,
    pagoMonto: montoUSDOpcional,
    pagoPagador: pagadorOpcionalZ,
    pagoSocioId: textoOpcional,
    pagoMetodo: metodoZ,
  })
  .superRefine((v, ctx) => {
    if (v.pagoMonto === undefined) return;
    if (v.pagoMonto === 0) {
      ctx.addIssue({ code: "custom", path: ["pagoMonto"], message: "Tiene que ser mayor a 0." });
    }
    if (v.pagoMonto > v.monto) {
      ctx.addIssue({
        code: "custom",
        path: ["pagoMonto"],
        message: "El pago no puede superar el monto del gasto.",
      });
    }
    if (!v.pagoPagador) {
      ctx.addIssue({
        code: "custom",
        path: ["pagoPagador"],
        message: "Elegí quién puso la plata.",
      });
    }
    if (v.pagoPagador === PAGADOR.SOCIO && !v.pagoSocioId) {
      ctx.addIssue({
        code: "custom",
        path: ["pagoSocioId"],
        message: "Si lo puso un socio, decinos cuál.",
      });
    }
  });

export async function crearGasto(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = GastoNuevo.safeParse({
    concepto: s(formData, "concepto"),
    monto: s(formData, "monto"),
    fecha: s(formData, "fecha"),
    notas: s(formData, "notas"),
    pagoMonto: s(formData, "pagoMonto"),
    pagoPagador: s(formData, "pagoPagador"),
    pagoSocioId: s(formData, "pagoSocioId"),
    pagoMetodo: s(formData, "pagoMetodo"),
  });
  if (!parsed.success) return erroresDe(parsed.error);
  const d = parsed.data;

  const bloqueo = await mesBloqueado(d.fecha);
  if (bloqueo) return { error: bloqueo };

  const conPago = d.pagoMonto !== undefined;
  const socioId = conPago && d.pagoPagador === PAGADOR.SOCIO ? d.pagoSocioId! : null;
  if (socioId && (await socioInvalido(socioId))) {
    return { errores: { pagoSocioId: ["Ese socio no está disponible."] } };
  }

  const gasto = await prisma.$transaction(async (tx) => {
    const creado = await tx.gasto.create({
      data: {
        concepto: d.concepto,
        tipo: TIPO_GASTO.OPERATIVO,
        monto: d.monto,
        fecha: d.fecha,
        notas: d.notas,
      },
    });
    if (conPago) {
      await tx.pagoGasto.create({
        data: {
          gastoId: creado.id,
          monto: d.pagoMonto!,
          fecha: d.fecha,
          pagador: d.pagoPagador!,
          socioId,
          metodo: d.pagoMetodo,
        },
      });
    }
    return creado;
  });

  revalidatePath("/gastos");
  revalidatePath("/");
  revalidatePath("/socios");
  redirect(`/gastos/${gasto.id}`);
}

// ---------------------------------------------------------------------------
// Editar / borrar / confirmar
// ---------------------------------------------------------------------------

const GastoEditado = z.object({
  id: idZ,
  concepto: textoRequerido("El concepto"),
  monto: montoUSD,
  fecha,
  notas: textoOpcional,
});

export async function editarGasto(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = GastoEditado.safeParse({
    id: s(formData, "id"),
    concepto: s(formData, "concepto"),
    monto: s(formData, "monto"),
    fecha: s(formData, "fecha"),
    notas: s(formData, "notas"),
  });
  if (!parsed.success) return erroresDe(parsed.error);
  const d = parsed.data;

  const gasto = await prisma.gasto.findUnique({
    where: { id: d.id },
    include: { pagos: { select: { monto: true, fecha: true } } },
  });
  if (!gasto) return { error: "Ese gasto no existe." };
  if (gasto.tipo !== TIPO_GASTO.OPERATIVO) {
    return { error: "Los sueldos se administran desde recurrentes, no acá." };
  }

  const bloqueo = await mesBloqueado(gasto.fecha, d.fecha, ...gasto.pagos.map((p) => p.fecha));
  if (bloqueo) return { error: bloqueo };

  const pagado = gasto.pagos.reduce((acc, p) => acc + p.monto, 0);
  if (d.monto < pagado) {
    return {
      errores: {
        monto: [`Ya hay ${formatearUSD(pagado)} pagados: el monto no puede quedar por debajo.`],
      },
    };
  }

  await prisma.gasto.update({
    where: { id: d.id },
    data: { concepto: d.concepto, monto: d.monto, fecha: d.fecha, notas: d.notas ?? null },
  });

  revalidatePath("/gastos");
  revalidatePath(`/gastos/${d.id}`);
  revalidatePath("/");
  revalidatePath("/socios");
  return { ok: true };
}

export async function borrarGasto(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = idZ.safeParse(s(formData, "id"));
  if (!parsed.success) return { error: "Falta el identificador." };
  const id = parsed.data;

  const gasto = await prisma.gasto.findUnique({
    where: { id },
    include: { pagos: { select: { fecha: true } } },
  });
  if (!gasto) return { error: "Ese gasto no existe." };
  if (gasto.tipo !== TIPO_GASTO.OPERATIVO) {
    return { error: "Los sueldos se administran desde recurrentes, no acá." };
  }

  const bloqueo = await mesBloqueado(gasto.fecha, ...gasto.pagos.map((p) => p.fecha));
  if (bloqueo) return { error: bloqueo };

  // Borrar el gasto se lleva sus pagos por cascada: van juntos o no va ninguno.
  await prisma.$transaction(async (tx) => {
    await tx.gasto.delete({ where: { id } });
  });

  revalidatePath("/gastos");
  revalidatePath("/");
  revalidatePath("/socios");
  redirect("/gastos");
}

const Confirmacion = z.object({ id: idZ, monto: montoUSD });

/**
 * Los recurrentes se generan en borrador porque el monto no es fijo (Claude pasó de
 * 100 a 200). Se confirma con el monto corregido y ese monto pasa a ser el sugerido
 * de la próxima vez.
 */
export async function confirmarBorrador(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = Confirmacion.safeParse({ id: s(formData, "id"), monto: s(formData, "monto") });
  if (!parsed.success) return erroresDe(parsed.error);
  const { id, monto } = parsed.data;

  const gasto = await prisma.gasto.findUnique({
    where: { id },
    include: { pagos: { select: { monto: true } } },
  });
  if (!gasto) return { error: "Ese gasto no existe." };
  if (!gasto.esBorrador) return { error: "Ese gasto ya estaba confirmado." };

  const bloqueo = await mesBloqueado(gasto.fecha);
  if (bloqueo) return { error: bloqueo };

  const pagado = gasto.pagos.reduce((acc, p) => acc + p.monto, 0);
  if (monto < pagado) {
    return {
      errores: { monto: [`Ya hay ${formatearUSD(pagado)} pagados: no puede quedar por debajo.`] },
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.gasto.update({ where: { id }, data: { monto, esBorrador: false } });
    if (gasto.recurrenteId) {
      await tx.gastoRecurrente.update({
        where: { id: gasto.recurrenteId },
        data: { montoSugerido: monto },
      });
    }
  });

  revalidatePath("/gastos");
  revalidatePath(`/gastos/${id}`);
  revalidatePath("/");
  revalidatePath("/recurrentes");
  revalidatePath("/socios");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------

const PagoNuevo = z
  .object({
    gastoId: idZ,
    monto: montoUSD,
    fecha,
    pagador: pagadorZ,
    socioId: textoOpcional,
    metodo: metodoZ,
    notas: textoOpcional,
  })
  .superRefine((v, ctx) => {
    if (v.pagador === PAGADOR.SOCIO && !v.socioId) {
      ctx.addIssue({ code: "custom", path: ["socioId"], message: "Si lo puso un socio, decinos cuál." });
    }
  });

export async function agregarPago(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = PagoNuevo.safeParse({
    gastoId: s(formData, "gastoId"),
    monto: s(formData, "monto"),
    fecha: s(formData, "fecha"),
    pagador: s(formData, "pagador"),
    socioId: s(formData, "socioId"),
    metodo: s(formData, "metodo"),
    notas: s(formData, "notas"),
  });
  if (!parsed.success) return erroresDe(parsed.error);
  const d = parsed.data;

  // EMPRESA obliga a socioId null: un socioId colgado de un pago de la empresa le
  // inventaría un adelanto al socio.
  const socioId = d.pagador === PAGADOR.SOCIO ? d.socioId! : null;
  if (socioId && (await socioInvalido(socioId))) {
    return { errores: { socioId: ["Ese socio no está disponible."] } };
  }

  const bloqueo = await mesBloqueado(d.fecha);
  if (bloqueo) return { error: bloqueo };

  const resultado = await prisma.$transaction(async (tx): Promise<EstadoFormulario> => {
    const gasto = await tx.gasto.findUnique({
      where: { id: d.gastoId },
      include: { pagos: { select: { monto: true } } },
    });
    if (!gasto) return { error: "Ese gasto no existe." };
    if (gasto.esBorrador) return { error: "Confirmá el gasto antes de cargarle pagos." };
    if (gasto.tipo !== TIPO_GASTO.OPERATIVO) {
      return { error: "Los sueldos se cancelan girándole plata al socio, desde su cuenta." };
    }

    const pagado = gasto.pagos.reduce((acc, p) => acc + p.monto, 0);
    const resta = gasto.monto - pagado;
    if (d.monto > resta) {
      return {
        errores: {
          monto: [
            resta > 0
              ? `Quedan ${formatearUSD(resta)} por pagar de este gasto.`
              : "Este gasto ya está pagado por completo.",
          ],
        },
      };
    }

    await tx.pagoGasto.create({
      data: {
        gastoId: gasto.id,
        monto: d.monto,
        fecha: d.fecha,
        pagador: d.pagador,
        socioId,
        metodo: d.metodo,
        notas: d.notas,
      },
    });
    return { ok: true };
  });

  if (!resultado.ok) return resultado;

  revalidatePath("/gastos");
  revalidatePath(`/gastos/${d.gastoId}`);
  revalidatePath("/");
  revalidatePath("/socios");
  return { ok: true };
}

export async function borrarPago(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = idZ.safeParse(s(formData, "id"));
  if (!parsed.success) return { error: "Falta el identificador." };

  const pago = await prisma.pagoGasto.findUnique({
    where: { id: parsed.data },
    select: { id: true, fecha: true, gastoId: true },
  });
  if (!pago) return { error: "Ese pago no existe." };

  const bloqueo = await mesBloqueado(pago.fecha);
  if (bloqueo) return { error: bloqueo };

  await prisma.pagoGasto.delete({ where: { id: pago.id } });

  revalidatePath("/gastos");
  revalidatePath(`/gastos/${pago.gastoId}`);
  revalidatePath("/");
  revalidatePath("/socios");
  return { ok: true };
}
