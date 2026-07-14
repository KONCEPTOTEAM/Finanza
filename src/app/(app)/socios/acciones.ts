"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verificarSesion, socioActual } from "@/lib/dal";
import { mesEstaCerrado } from "@/lib/calculos";
import { METODO } from "@/lib/constantes";
import {
  erroresDe,
  fecha,
  idRequerido,
  montoUSD,
  montoUSDCeroOk,
  textoOpcional,
  textoRequerido,
  type EstadoFormulario,
} from "@/lib/validacion";

function refrescar(socioId: string) {
  revalidatePath("/socios");
  revalidatePath(`/socios/${socioId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Giros: la empresa le paga al socio
// ---------------------------------------------------------------------------

const Giro = z.object({
  socioId: idRequerido,
  monto: montoUSD,
  fecha,
  metodo: z.enum([METODO.TRANSFERENCIA, METODO.EFECTIVO, METODO.OTRO]),
  notas: textoOpcional,
});

export async function registrarGiro(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = Giro.safeParse({
    socioId: formData.get("socioId"),
    monto: formData.get("monto"),
    fecha: formData.get("fecha"),
    metodo: formData.get("metodo"),
    notas: formData.get("notas"),
  });
  if (!parsed.success) return erroresDe(parsed.error);

  const { socioId, monto, fecha: cuando, metodo, notas } = parsed.data;

  // A un socio dado de baja se le puede girar igual: darlo de baja no cancela lo que se
  // le debe, y saldar esa cuenta es justamente lo que hay que poder hacer después.
  const socio = await prisma.socio.findUnique({
    where: { id: socioId },
    select: { id: true },
  });
  if (!socio) return { error: "Ese socio no existe." };

  if (await mesEstaCerrado(cuando)) {
    return { errores: { fecha: ["Ese mes ya está cerrado. Elegí una fecha de un mes abierto."] } };
  }

  await prisma.pagoASocio.create({
    data: { socioId, monto, fecha: cuando, metodo, notas },
  });

  refrescar(socioId);
  return { ok: true };
}

export async function borrarGiro(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = idRequerido.safeParse(formData.get("id"));
  if (!parsed.success) return { error: "No se pudo identificar el giro." };

  const giro = await prisma.pagoASocio.findUnique({
    where: { id: parsed.data },
    select: { id: true, fecha: true, socioId: true },
  });
  if (!giro) return { error: "Ese giro ya no existe." };

  if (await mesEstaCerrado(giro.fecha)) {
    return { error: "El mes de ese giro ya está cerrado: no se puede borrar." };
  }

  await prisma.pagoASocio.delete({ where: { id: giro.id } });

  refrescar(giro.socioId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ficha del socio
// ---------------------------------------------------------------------------

const Socio = z.object({
  socioId: idRequerido,
  nombre: textoRequerido("El nombre"),
  // Cero es válido: un socio puede dejar de devengar sueldo sin darse de baja.
  sueldoMensual: montoUSDCeroOk,
});

export async function editarSocio(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = Socio.safeParse({
    socioId: formData.get("socioId"),
    nombre: formData.get("nombre"),
    sueldoMensual: formData.get("sueldoMensual"),
  });
  if (!parsed.success) return erroresDe(parsed.error);

  const { socioId, nombre, sueldoMensual } = parsed.data;

  const socio = await prisma.socio.findUnique({ where: { id: socioId }, select: { id: true } });
  if (!socio) return { error: "Ese socio no existe." };

  // El sueldo nuevo rige de acá en adelante: los gastos de sueldo ya devengados
  // guardan su propio monto y no se tocan.
  await prisma.socio.update({ where: { id: socioId }, data: { nombre, sueldoMensual } });

  refrescar(socioId);
  return { ok: true };
}

const Clave = z
  .object({
    socioId: idRequerido,
    actual: z.string().min(1, { error: "Ingresá tu contraseña actual." }),
    nueva: z.string().min(8, { error: "Tiene que tener al menos 8 caracteres." }),
    repetida: z.string().min(1, { error: "Repetí la contraseña nueva." }),
  })
  .refine((d) => d.nueva === d.repetida, {
    error: "Las dos contraseñas no coinciden.",
    path: ["repetida"],
  });

export async function cambiarClave(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = Clave.safeParse({
    socioId: formData.get("socioId"),
    actual: formData.get("actual"),
    nueva: formData.get("nueva"),
    repetida: formData.get("repetida"),
  });
  if (!parsed.success) return erroresDe(parsed.error);

  // Cada uno cambia SOLO su propia clave: el socioId del form no manda, manda la sesión.
  const yo = await socioActual();
  if (yo.id !== parsed.data.socioId) {
    return { error: "Solo podés cambiar tu propia contraseña." };
  }

  const conHash = await prisma.socio.findUnique({
    where: { id: yo.id },
    select: { passwordHash: true },
  });
  if (!conHash) return { error: "No se pudo verificar tu contraseña." };

  const coincide = await bcrypt.compare(parsed.data.actual, conHash.passwordHash);
  if (!coincide) return { errores: { actual: ["La contraseña actual no es correcta."] } };

  await prisma.socio.update({
    where: { id: yo.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.nueva, 10) },
  });

  return { ok: true };
}
