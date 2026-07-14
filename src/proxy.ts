import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// En Next 16 esto se llama proxy.ts (antes middleware.ts) y la función exportada
// tiene que llamarse `proxy`. El runtime es nodejs y no se puede configurar:
// poner `export const runtime` acá tira excepción.
//
// Esto es SOLO un filtro optimista para no renderizar páginas privadas sin cookie.
// No toca la base. La seguridad real está en src/lib/dal.ts.

const RUTAS_PUBLICAS = ["/login"];

async function sesionValida(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.includes(ruta);
  const haySesion = await sesionValida(req.cookies.get("session")?.value);

  if (!esPublica && !haySesion) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (esPublica && haySesion) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
