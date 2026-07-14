import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { verificar, NOMBRE_COOKIE } from "./session";

// El proxy solo hace un chequeo optimista de la cookie. LA VERIFICACIÓN REAL ES ESTA,
// y va pegada a los datos: los Server Actions son endpoints POST que el matcher del
// proxy no cubre, así que toda acción tiene que llamar a verificarSesion() por su cuenta.
//
// cache() de React memoiza dentro de UN render, no entre requests. No cachea plata vieja.

export const verificarSesion = cache(async () => {
  const token = (await cookies()).get(NOMBRE_COOKIE)?.value;
  const sesion = await verificar(token);
  if (!sesion?.socioId) redirect("/login");
  return sesion;
});

/** Confirma contra la base que el socio sigue existiendo y activo. Nunca devuelve el hash. */
export const socioActual = cache(async () => {
  const { socioId } = await verificarSesion();
  const socio = await prisma.socio.findUnique({
    where: { id: socioId },
    select: { id: true, nombre: true, email: true, activo: true, sueldoMensual: true },
  });
  if (!socio || !socio.activo) redirect("/login");
  return socio;
});
