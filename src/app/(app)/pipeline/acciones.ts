"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verificarSesion } from "@/lib/dal";
import { mesEstaCerrado } from "@/lib/calculos";
import { nombreMes } from "@/lib/constantes";
import {
  erroresDe,
  idRequerido,
  montoUSD,
  montoUSDOpcional,
  textoOpcional,
  textoRequerido,
  type EstadoFormulario,
} from "@/lib/validacion";

/**
 * Los meses cerrados son de solo lectura: devuelve el motivo, o null si se puede tocar.
 * Pasale el cliente de la transacción para que el chequeo y la escritura sean atómicos.
 */
async function mesBloqueado(
  f: Date,
  cliente?: Parameters<typeof mesEstaCerrado>[1],
): Promise<string | null> {
  if (!(await mesEstaCerrado(f, cliente))) return null;
  return `El mes de ${nombreMes(f.getUTCMonth() + 1)} está cerrado. Reabrilo para convertir esta oportunidad.`;
}

/** Igual que EstadoFormulario, pero si la oportunidad ya se convirtió podemos linkear al trabajo. */
export type EstadoConversion = EstadoFormulario & { yaConvertida?: { clienteId: string } };

const casilla = z.preprocess((v) => v === "on" || v === "true", z.boolean());

const Oportunidad = z
  .object({
    nombre: textoRequerido("El nombre"),
    clienteId: textoOpcional,
    monto: montoUSD,
    sena: montoUSDOpcional,
    notas: textoOpcional,
    confirmado: casilla,
  })
  .refine((o) => o.sena === undefined || o.sena <= o.monto, {
    error: "La seña no puede superar el monto.",
    path: ["sena"],
  });

function datosDe(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    clienteId: formData.get("clienteId"),
    monto: formData.get("monto"),
    sena: formData.get("sena"),
    notas: formData.get("notas"),
    confirmado: formData.get("confirmado"),
  };
}

/** Una seña de 0 es "no hay seña": guardarla como 0 generaría un cobro vacío al convertir. */
function senaGuardable(sena: number | undefined) {
  return sena && sena > 0 ? sena : null;
}

function refrescar() {
  revalidatePath("/pipeline");
  revalidatePath("/");
}

/**
 * clienteId viene del formulario y sólo pasó por textoOpcional: si el cliente no existe,
 * la FK explota con P2003 y el usuario ve un 500 en vez de un error de formulario.
 */
async function clienteInexistente(
  tx: Prisma.TransactionClient,
  clienteId: string | undefined,
): Promise<boolean> {
  if (clienteId === undefined) return false;
  const cliente = await tx.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
  return cliente === null;
}

const CLIENTE_INEXISTENTE: EstadoFormulario = { errores: { clienteId: ["Ese cliente ya no existe."] } };

export async function crearOportunidad(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = Oportunidad.safeParse(datosDe(formData));
  if (!parsed.success) return erroresDe(parsed.error);
  const { nombre, clienteId, monto, sena, notas, confirmado } = parsed.data;

  const resultado = await prisma.$transaction(async (tx): Promise<EstadoFormulario> => {
    if (await clienteInexistente(tx, clienteId)) return CLIENTE_INEXISTENTE;

    await tx.oportunidad.create({
      data: { nombre, clienteId: clienteId ?? null, monto, sena: senaGuardable(sena), notas, confirmado },
    });
    return { ok: true };
  });

  if (resultado.ok) refrescar();
  return resultado;
}

export async function actualizarOportunidad(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const id = idRequerido.safeParse(formData.get("id"));
  if (!id.success) return { error: "Falta la oportunidad." };

  const parsed = Oportunidad.safeParse(datosDe(formData));
  if (!parsed.success) return erroresDe(parsed.error);
  const { nombre, clienteId, monto, sena, notas, confirmado } = parsed.data;

  const resultado = await prisma.$transaction(async (tx): Promise<EstadoFormulario> => {
    const actual = await tx.oportunidad.findUnique({
      where: { id: id.data },
      select: { trabajo: { select: { id: true } } },
    });
    if (!actual) return { error: "Esa oportunidad ya no existe." };
    // El trabajo ya nació con estos números: cambiarlos acá los dejaría mintiendo.
    if (actual.trabajo) return { error: "Ya se convirtió en trabajo. Editá el trabajo, no la oportunidad." };

    if (await clienteInexistente(tx, clienteId)) return CLIENTE_INEXISTENTE;

    await tx.oportunidad.update({
      where: { id: id.data },
      data: { nombre, clienteId: clienteId ?? null, monto, sena: senaGuardable(sena), notas, confirmado },
    });
    return { ok: true };
  });

  if (resultado.ok) refrescar();
  return resultado;
}

export async function alternarConfirmado(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const id = idRequerido.safeParse(formData.get("id"));
  if (!id.success) return { error: "Falta la oportunidad." };

  const resultado = await prisma.$transaction(async (tx): Promise<EstadoFormulario> => {
    const op = await tx.oportunidad.findUnique({
      where: { id: id.data },
      select: { id: true, confirmado: true, trabajo: { select: { id: true } } },
    });
    if (!op) return { error: "Esa oportunidad ya no existe." };
    if (op.trabajo) return { error: "Ya se convirtió en trabajo: no se puede desmarcar." };

    await tx.oportunidad.update({ where: { id: op.id }, data: { confirmado: !op.confirmado } });
    return { ok: true };
  });

  if (resultado.ok) refrescar();
  return resultado;
}

export async function borrarOportunidad(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const id = idRequerido.safeParse(formData.get("id"));
  if (!id.success) return { error: "Falta la oportunidad." };

  const resultado = await prisma.$transaction(async (tx): Promise<EstadoFormulario> => {
    const op = await tx.oportunidad.findUnique({
      where: { id: id.data },
      select: { id: true, trabajo: { select: { id: true } } },
    });
    if (!op) return { ok: true };
    // Borrarla dejaría al trabajo sin origen (origenId pasa a null en silencio).
    if (op.trabajo) return { error: "Ya se convirtió en trabajo: borralo desde el trabajo si fue un error." };

    await tx.oportunidad.delete({ where: { id: op.id } });
    return { ok: true };
  });

  if (resultado.ok) refrescar();
  return resultado;
}

// ---------------------------------------------------------------------------
// Convertir en trabajo
// ---------------------------------------------------------------------------

const Convertir = z
  .object({
    oportunidadId: idRequerido,
    clienteId: textoOpcional,
    nombreClienteNuevo: textoOpcional,
  })
  .refine((c) => c.clienteId !== undefined || c.nombreClienteNuevo !== undefined, {
    error: "Elegí un cliente o escribí el nombre de uno nuevo.",
    path: ["nombreClienteNuevo"],
  });

/** Lo que devuelve la transacción: el estado del formulario más a dónde redirigir. */
type ResultadoConversion = EstadoConversion & { destino?: string };

function esChoqueDeUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002";
}

/**
 * El único punto donde una oportunidad empieza a contar como plata por cobrar.
 * Es explícito a propósito: confirmar una venta no es lo mismo que facturarla.
 */
export async function convertirEnTrabajo(
  _estado: EstadoConversion | undefined,
  formData: FormData,
): Promise<EstadoConversion> {
  const { socioId } = await verificarSesion();

  const parsed = Convertir.safeParse({
    oportunidadId: formData.get("oportunidadId"),
    clienteId: formData.get("clienteId"),
    nombreClienteNuevo: formData.get("nombreClienteNuevo"),
  });
  if (!parsed.success) return erroresDe(parsed.error);
  const { oportunidadId, clienteId, nombreClienteNuevo } = parsed.data;

  const hoy = new Date();
  const fecha = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));

  let resultado: ResultadoConversion;
  try {
    // La oportunidad se lee ADENTRO de la transacción: si quedara suelta, otra pestaña
    // podría bajarle el monto entre el read y el create y el trabajo nacería con el viejo.
    resultado = await prisma.$transaction(async (tx): Promise<ResultadoConversion> => {
      const op = await tx.oportunidad.findUnique({
        where: { id: oportunidadId },
        include: { trabajo: { select: { clienteId: true } } },
      });
      if (!op) return { error: "Esa oportunidad ya no existe." };
      if (op.trabajo) {
        return {
          error: "Esta oportunidad ya se convirtió en trabajo.",
          yaConvertida: { clienteId: op.trabajo.clienteId },
        };
      }
      if (!op.confirmado) return { error: "Confirmá la oportunidad antes de convertirla en trabajo." };
      if (op.sena !== null && op.sena > op.monto) {
        return { error: "La seña quedó por encima del monto. Corregí la oportunidad antes de convertirla." };
      }

      // El trabajo y la seña entran con fecha de hoy: si ese mes ya se cerró, la foto
      // histórica congelada en CierreMes.cajaFinal quedaría mintiendo. Se chequea con `tx`
      // para que nadie cierre el mes entre esta lectura y los create de abajo.
      const bloqueo = await mesBloqueado(fecha, tx);
      if (bloqueo) return { error: bloqueo };

      let cliente: { id: string };
      if (clienteId) {
        const existente = await tx.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
        if (!existente) return { error: "Ese cliente ya no existe." };
        cliente = existente;
      } else {
        // Cliente.nombre es @unique: si ya lo dieron de alta en otra pantalla, lo reusamos.
        cliente = await tx.cliente.upsert({
          where: { nombre: nombreClienteNuevo! },
          update: {},
          create: { nombre: nombreClienteNuevo! },
          select: { id: true },
        });
      }

      // Trabajo.origenId es @unique: si otra pestaña convirtió esta misma oportunidad
      // mientras tanto, el create explota acá y no se duplica la facturación.
      const trabajo = await tx.trabajo.create({
        data: {
          clienteId: cliente.id,
          descripcion: op.nombre,
          monto: op.monto,
          fecha,
          notas: op.notas,
          origenId: op.id,
        },
        select: { id: true },
      });

      if (op.sena !== null && op.sena > 0) {
        await tx.cobro.create({
          data: { trabajoId: trabajo.id, monto: op.sena, fecha, cargadoPorId: socioId },
        });
      }

      if (op.clienteId !== cliente.id) {
        await tx.oportunidad.update({ where: { id: op.id }, data: { clienteId: cliente.id } });
      }

      return { ok: true, destino: cliente.id };
    });
  } catch (e) {
    if (esChoqueDeUnico(e)) return { error: "Esta oportunidad ya se convirtió en trabajo." };
    throw e;
  }

  const { destino, ...estado } = resultado;
  if (!destino) return estado;

  revalidatePath("/pipeline");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${destino}`);
  revalidatePath("/");
  revalidatePath("/meses");
  redirect(`/clientes/${destino}`); // redirect() lanza: nada de esto va dentro del try.
}
