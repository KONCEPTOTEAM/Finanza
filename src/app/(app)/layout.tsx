import { socioActual } from "@/lib/dal";
import { logout } from "@/app/login/actions";
import { Nav } from "@/components/nav";

// Plata al día, siempre. Todas estas páginas leen la cookie de sesión, lo que ya
// las vuelve dinámicas, pero lo dejamos explícito: que nadie vea un número viejo
// porque alguien refactorizó el chequeo de sesión fuera de la página.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const socio = await socioActual();

  return (
    <>
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="font-semibold">Koncepto</span>
            <form action={logout} className="flex items-center gap-3">
              <span className="text-sm text-tenue">{socio.nombre}</span>
              <button
                type="submit"
                className="text-sm text-tenue hover:text-foreground transition"
              >
                Salir
              </button>
            </form>
          </div>
          <div className="pb-2">
            <Nav />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </main>
    </>
  );
}
