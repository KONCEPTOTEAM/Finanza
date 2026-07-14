"use server";

import * as z from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verificarSesion } from "@/lib/dal";
import { mesEstaCerrado, rangoMes } from "@/lib/calculos";
import { TIPO_GASTO, nombreMes } from "@/lib/constantes";
import {
  erroresDe,
  montoUSD,
  textoOpcional,
  type EstadoFormulario,
} from "@/lib/validacion";
import type { EstadoGeneracion } from "./tipos";
import { cobertura } from "./ocupadas";

const recortar = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const diaDelMes = z
  .preprocess(recortar, z.string().min(1, { error: "Elegí un día del mes." }))
  .pipe(z.coerce.number({ error: "Tiene que ser un número." }))
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 31, {
    error: "Tiene que ser un día entre 1 y 31.",
  });

const entero = (min: number, max: number) =>
  z
    .preprocess(recortar, z.string().min(1, { error: "Requerido." }))
    .pipe(z.coerce.number({ error: "Tiene que ser un número." }))
    .refine((n) => Number.isInteger(n) && n >= min && n <= max, {
      error: "Fuera de rango.",
    });

const Recurrente = z
  .object({
    tipo: z.enum([TIPO_GASTO.OPERATIVO, TIPO_GASTO.SUELDO], {
      error: "Elegí un tipo.",
    }),
    concepto: textoOpcional,
    socioId: textoOpcional,
    montoSugerido: montoUSD,
    diaDelMes,
    notas: textoOpcional,
  })
  .superRefine((d, ctx) => {
    // El concepto de un sueldo lo arma el sistema con el nombre del socio, así que
    // cada tipo exige un campo distinto y el otro se ignora.
    if (d.tipo === TIPO_GASTO.SUELDO && !d.socioId) {
      ctx.addIssue({ code: "custom", path: ["socioId"], message: "Elegí de qué socio es el sueldo." });
    }
    if (d.tipo === TIPO_GASTO.OPERATIVO && !d.concepto) {
      ctx.addIssue({ code: "custom", path: ["concepto"], message: "El concepto es obligatorio." });
    }
  });

function datosDe(formData: FormData) {
  return {
    tipo: formData.get("tipo"),
    concepto: formData.get("concepto"),
    socioId: formData.get("socioId"),
    montoSugerido: formData.get("montoSugerido"),
    diaDelMes: formData.get("diaDelMes"),
    notas: formData.get("notas"),
  };
}

type Datos = z.infer<typeof Recurrente>;

type Normalizado =
  | { ok: true; concepto: string; socioId: string | null }
  | { ok: false; estado: EstadoFormulario };

/**
 * Resuelve concepto y socioId según el tipo, y frena el caso que corrompería una
 * cuenta corriente: dos plantillas de sueldo para el mismo socio generarían dos
 * sueldos por mes y le duplicarían el saldo.
 *
 * Recibe `tx` y NO el cliente global a propósito: el chequeo de duplicada y el
 * create/update que lo sigue tienen que ser un solo paso atómico. Fuera de una
 * transacción hay un yield del event loop entre el findFirst y el write, así que
 * dos requests concurrentes ven las dos "no hay duplicada" y crean dos plantillas.
 * La transacción interactiva serializa a los writers.
 */
async function normalizar(
  tx: Prisma.TransactionClient,
  d: Datos,
  idActual?: string,
): Promise<Normalizado> {
  if (d.tipo === TIPO_GASTO.OPERATIVO) {
    return { ok: true, concepto: d.concepto!, socioId: null };
  }

  const socio = await tx.socio.findUnique({
    where: { id: d.socioId! },
    select: { nombre: true, activo: true },
  });
  if (!socio || !socio.activo) {
    return { ok: false, estado: { errores: { socioId: ["Ese socio no existe o está dado de baja."] } } };
  }

  const duplicada = await tx.gastoRecurrente.findFirst({
    where: {
      tipo: TIPO_GASTO.SUELDO,
      socioId: d.socioId!,
      ...(idActual ? { NOT: { id: idActual } } : {}),
    },
    select: { id: true },
  });
  if (duplicada) {
    return {
      ok: false,
      estado: { errores: { socioId: [`${socio.nombre} ya tiene una plantilla de sueldo.`] } },
    };
  }

  return { ok: true, concepto: `Sueldo ${socio.nombre}`, socioId: d.socioId! };
}

function refrescar() {
  revalidatePath("/recurrentes");
  revalidatePath("/gastos");
  revalidatePath("/");
}

export async function crearRecurrente(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = Recurrente.safeParse(datosDe(formData));
  if (!parsed.success) return erroresDe(parsed.error);

  // Chequeo de duplicada + create en una sola transacción: ver el comentario de normalizar.
  const fallo = await prisma.$transaction(async (tx) => {
    const norm = await normalizar(tx, parsed.data);
    if (!norm.ok) return norm.estado;

    await tx.gastoRecurrente.create({
      data: {
        concepto: norm.concepto,
        tipo: parsed.data.tipo,
        montoSugerido: parsed.data.montoSugerido,
        diaDelMes: parsed.data.diaDelMes,
        socioId: norm.socioId,
        notas: parsed.data.notas,
      },
    });
    return null;
  });
  if (fallo) return fallo;

  refrescar();
  redirect("/recurrentes");
}

export async function editarRecurrente(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const id = recortar(formData.get("id"));
  if (!id) return { error: "No se sabe qué plantilla estás editando." };

  const parsed = Recurrente.safeParse(datosDe(formData));
  if (!parsed.success) return erroresDe(parsed.error);

  // Existencia + chequeo de duplicada + update en una sola transacción. La existencia va
  // primero para que borrar la plantilla en el medio devuelva el mensaje correcto y no un
  // P2025 sin capturar; el resto, por lo que explica el comentario de normalizar: dos
  // ediciones concurrentes que apuntan al mismo socio no se ven entre sí fuera de una tx.
  const fallo = await prisma.$transaction(async (tx) => {
    const existe = await tx.gastoRecurrente.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return { error: "Esa plantilla ya no existe." };

    const norm = await normalizar(tx, parsed.data, id);
    if (!norm.ok) return norm.estado;

    await tx.gastoRecurrente.update({
      where: { id },
      data: {
        concepto: norm.concepto,
        tipo: parsed.data.tipo,
        montoSugerido: parsed.data.montoSugerido,
        diaDelMes: parsed.data.diaDelMes,
        socioId: norm.socioId,
        notas: parsed.data.notas ?? null,
      },
    });
    return null;
  });
  if (fallo) return fallo;

  refrescar();
  redirect("/recurrentes");
}

export async function alternarActivo(formData: FormData) {
  await verificarSesion();

  const id = recortar(formData.get("id"));
  if (!id) return;

  const plantilla = await prisma.gastoRecurrente.findUnique({
    where: { id },
    select: { activo: true },
  });
  if (!plantilla) return;

  await prisma.gastoRecurrente.update({ where: { id }, data: { activo: !plantilla.activo } });
  refrescar();
}

export async function borrarRecurrente(formData: FormData) {
  await verificarSesion();

  const id = recortar(formData.get("id"));
  if (!id) return;

  // recurrenteId es onDelete: SetNull — los gastos ya generados sobreviven huérfanos
  // en vez de desaparecer. Borrar una plantilla nunca borra plata registrada.
  await prisma.gastoRecurrente.deleteMany({ where: { id } });
  refrescar();
}

const Generacion = z.object({ anio: entero(2000, 2100), mes: entero(1, 12) });

/**
 * Crea los borradores del mes a partir de las plantillas activas.
 *
 * Es idempotente: la existencia se chequea DENTRO de la transacción, así dos socios
 * apretando el botón a la vez no generan dos veces el mismo sueldo (un chequeo previo
 * fuera de la transacción no alcanzaría).
 *
 * La dedupe NO puede mirar solo recurrenteId: borrar una plantilla deja sus gastos con
 * recurrenteId = null (onDelete: SetNull), y esos huérfanos serían invisibles para el
 * chequeo. Recrear la plantilla regeneraría el mes entero y devengaría el sueldo dos
 * veces. Por eso se deduplica también por identidad de negocio:
 *  - SUELDO: un solo sueldo por socio por mes, venga de donde venga (es el invariante
 *    que consume calcularCuentasSocios, que suma TODO gasto SUELDO del socio).
 *  - OPERATIVO: un gasto huérfano con el mismo concepto en el mes ya ocupa el lugar.
 *    Se mira solo huérfanos para que dos plantillas activas con igual concepto sigan
 *    generando cada una la suya (cada una lleva su propio recurrenteId).
 */
export async function generarMes(
  _estado: EstadoGeneracion | undefined,
  formData: FormData,
): Promise<EstadoGeneracion> {
  await verificarSesion();

  const parsed = Generacion.safeParse({ anio: formData.get("anio"), mes: formData.get("mes") });
  if (!parsed.success) return { error: "Elegí un mes válido." };
  const { anio, mes } = parsed.data;

  const rango = rangoMes(anio, mes);
  if (await mesEstaCerrado(rango.gte)) {
    return {
      anio,
      mes,
      error: `${nombreMes(mes)} de ${anio} ya está cerrado: no se le pueden agregar gastos.`,
    };
  }

  // Día 0 del mes siguiente = último día de este mes. Un recurrente del 31 cae el 28
  // en febrero en vez de desbordarse a marzo.
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();

  const { creados, salteados } = await prisma.$transaction(async (tx) => {
    const plantillas = await tx.gastoRecurrente.findMany({ where: { activo: true } });
    const delMes = await tx.gasto.findMany({
      where: { fecha: rango },
      select: { recurrenteId: true, tipo: true, socioId: true },
    });

    const cubierta = cobertura(delMes);

    let creados = 0;
    for (const p of plantillas) {
      if (cubierta.cubre(p)) continue;

      await tx.gasto.create({
        data: {
          concepto: p.concepto,
          tipo: p.tipo,
          monto: p.montoSugerido,
          fecha: new Date(Date.UTC(anio, mes - 1, Math.min(p.diaDelMes, ultimoDia))),
          esBorrador: true,
          // Los sueldos se generan sin PagoGasto: el giro al socio se carga desde /socios.
          socioId: p.tipo === TIPO_GASTO.SUELDO ? p.socioId : null,
          recurrenteId: p.id,
        },
      });
      creados++;
      cubierta.anotar(p);
    }

    return { creados, salteados: plantillas.length - creados };
  });

  refrescar();

  if (creados === 0 && salteados === 0) {
    return { anio, mes, error: "No hay plantillas activas para generar." };
  }

  const partes = [`${creados} ${creados === 1 ? "generado" : "generados"}`];
  if (salteados > 0) partes.push(`${salteados} ya ${salteados === 1 ? "existía" : "existían"}`);

  return { ok: true, anio, mes, mensaje: partes.join(", ") };
}
