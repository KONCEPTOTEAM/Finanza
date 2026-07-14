"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const RUTAS = [
  { href: "/", etiqueta: "Panorama" },
  { href: "/clientes", etiqueta: "Clientes" },
  { href: "/gastos", etiqueta: "Gastos" },
  { href: "/socios", etiqueta: "Socios" },
  { href: "/recurrentes", etiqueta: "Recurrentes" },
  { href: "/pipeline", etiqueta: "Pipeline" },
  { href: "/meses", etiqueta: "Meses" },
];

export function Nav() {
  const ruta = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {RUTAS.map((r) => {
        const activa = r.href === "/" ? ruta === "/" : ruta.startsWith(r.href);
        return (
          <Link
            key={r.href}
            href={r.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activa ? "bg-acento/10 text-acento" : "text-tenue hover:text-foreground"
            }`}
          >
            {r.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
