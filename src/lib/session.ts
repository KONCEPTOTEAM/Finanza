import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "session";
const DURACION_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionPayload = {
  socioId: string;
  nombre: string;
};

function clave() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "Falta SESSION_SECRET en .env — generá una con: openssl rand -base64 32",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function firmar(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(clave());
}

/** Devuelve null si no hay sesión, la firma no valida o expiró. */
export async function verificar(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave(), {
      algorithms: ["HS256"],
    });
    return { socioId: payload.socioId as string, nombre: payload.nombre as string };
  } catch {
    return null;
  }
}

/** Solo se puede llamar desde un Server Action o Route Handler. */
export async function crearSesion(socioId: string, nombre: string) {
  const token = await firmar({ socioId, nombre });
  const store = await cookies(); // async obligatorio en Next 16
  store.set(COOKIE, token, {
    httpOnly: true,
    // El doc oficial hardcodea `secure: true`, lo que rompe http://localhost en dev.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(Date.now() + DURACION_MS),
    path: "/",
  });
}

export async function borrarSesion() {
  const store = await cookies();
  store.delete(COOKIE);
}

export const NOMBRE_COOKIE = COOKIE;
