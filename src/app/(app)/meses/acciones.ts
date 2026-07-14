"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { socioActual, verificarSesion } from "@/lib/dal";
import { calcularCajaReal } from "@/lib/calculos";
import { erroresDe, textoOpcional, type EstadoFormulario } from "@/lib/validacion";
import {
  etiquetaMes,
  motivoParaNoCerrar,
  motivoParaNoReabrir,
  ultimoDiaDelMes,
} from "./datos";

const entero = (etiqueta: string) =>
  z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim() : ""),
      z.string().regex(/^\d+$/, { error: `${etiqueta} inválido.` }),
    )
    .transform(Number);

const Periodo = {
  anio: entero("El año").refine((n) => n >= 2000 && n <= 2100, { error: "Año fuera de rango." }),
  mes: entero("El mes").refine((n) => n >= 1 && n <= 12, { error: "Mes fuera de rango." }),
};

const Cerrar = z.object({ ...Periodo, notas: textoOpcional });
const Reabrir = z.object(Periodo);

function refrescar(anio: number, mes: number) {
  revalidatePath("/meses");
  revalidatePath(`/meses/${anio}/${mes}`);
  revalidatePath("/");
}

export async function cerrarMes(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = Cerrar.safeParse({
    anio: formData.get("anio"),
    mes: formData.get("mes"),
    notas: formData.get("notas"),
  });
  if (!parsed.success) return erroresDe(parsed.error);
  const { anio, mes, notas } = parsed.data;

  const socio = await socioActual();
  const cajaFinal = await calcularCajaReal(ultimoDiaDelMes(anio, mes));

  try {
    // El botón ya no se muestra cuando hay motivo, pero esto es un POST: sin este
    // chequeo cualquiera podría cerrar julio a mitad de mes con un fetch a mano.
    //
    // Chequeo y write van en la MISMA transacción: el guard de orden no lo sostiene
    // ninguna constraint de la base, vive entero en esta lectura. Leyéndolo afuera,
    // entre el chequeo y el create otro socio puede reabrir el mes anterior y las dos
    // escrituras entran, dejando este mes cerrado sobre un período abierto.
    const motivo = await prisma.$transaction(async (tx) => {
      const razon = await motivoParaNoCerrar(anio, mes, tx);
      if (razon) return razon;

      await tx.cierreMes.create({
        data: { anio, mes, cajaFinal, notas, cerradoPorId: socio.id },
      });
      return null;
    });
    if (motivo) return { error: motivo };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      refrescar(anio, mes);
      return { error: `${etiquetaMes({ anio, mes })} ya lo había cerrado alguien.` };
    }
    throw e;
  }

  refrescar(anio, mes);
  return { ok: true };
}

export async function reabrirMes(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = Reabrir.safeParse({ anio: formData.get("anio"), mes: formData.get("mes") });
  if (!parsed.success) return erroresDe(parsed.error);
  const { anio, mes } = parsed.data;

  try {
    // Mismo motivo que en cerrarMes: si el chequeo lee fuera de la transacción, otro socio
    // puede cerrar el mes siguiente en el hueco y este delete lo deja apoyado en un
    // período abierto.
    const motivo = await prisma.$transaction(async (tx) => {
      const razon = await motivoParaNoReabrir(anio, mes, tx);
      if (razon) return razon;

      await tx.cierreMes.delete({ where: { anio_mes: { anio, mes } } });
      return null;
    });
    if (motivo) return { error: motivo };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      refrescar(anio, mes);
      return { error: `${etiquetaMes({ anio, mes })} ya estaba abierto.` };
    }
    throw e;
  }

  refrescar(anio, mes);
  return { ok: true };
}
