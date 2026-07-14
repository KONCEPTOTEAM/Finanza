"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

export function SelectorMes({
  valor,
  opciones,
}: {
  valor: string;
  opciones: { valor: string; etiqueta: string }[];
}) {
  const router = useRouter();

  return (
    <Select
      aria-label="Mes"
      value={valor}
      onChange={(e) => router.push(`/gastos?mes=${e.target.value}`)}
      className="w-48"
    >
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </Select>
  );
}
