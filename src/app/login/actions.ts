"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { crearSesion, borrarSesion } from "@/lib/session";
import type { EstadoFormulario } from "@/lib/validacion";

const Login = z.object({
  email: z.email({ error: "Ingresá un correo válido." }),
  password: z.string().min(1, { error: "Ingresá tu contraseña." }),
});

// Hash descartable con el que comparar cuando el mail no existe: así el login
// tarda lo mismo exista o no el usuario, y no se puede adivinar quién está dado de alta.
const HASH_FALSO = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function login(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = Login.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Revisá el correo y la contraseña." };
  }

  const socio = await prisma.socio.findUnique({
    where: { email: parsed.data.email.toLowerCase().trim() },
  });

  const coincide = await bcrypt.compare(
    parsed.data.password,
    socio?.passwordHash ?? HASH_FALSO,
  );

  // Mismo mensaje para "no existe" y "clave mal": no delata qué correos son válidos.
  if (!socio || !socio.activo || !coincide) {
    return { error: "Correo o contraseña incorrectos." };
  }

  await crearSesion(socio.id, socio.nombre);
  redirect("/"); // redirect() lanza: tiene que quedar fuera de cualquier try/catch.
}

export async function logout() {
  await borrarSesion();
  redirect("/login");
}
