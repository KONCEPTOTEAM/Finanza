import Link from "next/link";
import { formatearUSD } from "@/lib/dinero";

// Primitivas compartidas. Todo Server Component salvo que se marque lo contrario.

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-superficie border border-borde rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-borde">
      <div>
        <h2 className="font-semibold">{titulo}</h2>
        {descripcion && <p className="text-sm text-tenue mt-0.5">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

/** Tarjeta de número grande. `tono` colorea el monto según lo que signifique. */
export function Stat({
  etiqueta,
  centavos,
  detalle,
  tono = "neutro",
  destacado = false,
}: {
  etiqueta: string;
  centavos: number;
  detalle?: string;
  tono?: "neutro" | "positivo" | "negativo" | "auto";
  destacado?: boolean;
}) {
  const color =
    tono === "auto"
      ? centavos >= 0
        ? "text-positivo"
        : "text-negativo"
      : tono === "positivo"
        ? "text-positivo"
        : tono === "negativo"
          ? "text-negativo"
          : "text-foreground";

  return (
    <Card className={destacado ? "ring-1 ring-acento/30" : ""}>
      <div className="px-5 py-4">
        <p className="text-sm text-tenue">{etiqueta}</p>
        <p className={`tabular mt-1 text-2xl font-semibold ${color}`}>
          {formatearUSD(centavos)}
        </p>
        {detalle && <p className="text-xs text-tenue mt-1.5">{detalle}</p>}
      </div>
    </Card>
  );
}

export function Monto({
  centavos,
  tono = "neutro",
  className = "",
}: {
  centavos: number;
  tono?: "neutro" | "positivo" | "negativo" | "auto" | "tenue";
  className?: string;
}) {
  const color =
    tono === "auto"
      ? centavos > 0
        ? "text-positivo"
        : centavos < 0
          ? "text-negativo"
          : "text-tenue"
      : tono === "positivo"
        ? "text-positivo"
        : tono === "negativo"
          ? "text-negativo"
          : tono === "tenue"
            ? "text-tenue"
            : "";
  return <span className={`tabular ${color} ${className}`}>{formatearUSD(centavos)}</span>;
}

export function Boton({
  children,
  variante = "primario",
  type = "submit",
  disabled,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "peligro";
}) {
  const estilos = {
    primario: "bg-acento text-white hover:opacity-90",
    secundario: "bg-transparent border border-borde hover:bg-background",
    peligro: "bg-transparent border border-borde text-negativo hover:bg-negativo/5",
  }[variante];
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${estilos} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function BotonLink({
  href,
  children,
  variante = "secundario",
}: {
  href: string;
  children: React.ReactNode;
  variante?: "primario" | "secundario";
}) {
  const estilos =
    variante === "primario"
      ? "bg-acento text-white hover:opacity-90"
      : "border border-borde hover:bg-background";
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition ${estilos}`}
    >
      {children}
    </Link>
  );
}

export function Campo({
  etiqueta,
  error,
  children,
  ayuda,
}: {
  etiqueta: string;
  error?: string[];
  children: React.ReactNode;
  ayuda?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{etiqueta}</span>
      <div className="mt-1.5">{children}</div>
      {ayuda && !error?.length && <p className="text-xs text-tenue mt-1">{ayuda}</p>}
      {error?.map((e) => (
        <p key={e} className="text-xs text-negativo mt-1">
          {e}
        </p>
      ))}
    </label>
  );
}

const claseInput =
  "w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm outline-none focus:border-acento focus:ring-1 focus:ring-acento";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${claseInput} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${claseInput} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${claseInput} ${props.className ?? ""}`} />;
}

export function Tabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  alinear = "izquierda",
}: {
  children?: React.ReactNode;
  alinear?: "izquierda" | "derecha";
}) {
  return (
    <th
      className={`px-5 py-2.5 text-xs font-medium text-tenue uppercase tracking-wide ${
        alinear === "derecha" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  alinear = "izquierda",
  className = "",
}: {
  children?: React.ReactNode;
  alinear?: "izquierda" | "derecha";
  className?: string;
}) {
  return (
    <td
      className={`px-5 py-3 border-t border-borde ${
        alinear === "derecha" ? "text-right" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function Etiqueta({
  children,
  tono = "neutro",
}: {
  children: React.ReactNode;
  tono?: "neutro" | "positivo" | "negativo" | "alerta" | "acento";
}) {
  const estilos = {
    neutro: "bg-tenue/10 text-tenue",
    positivo: "bg-positivo/10 text-positivo",
    negativo: "bg-negativo/10 text-negativo",
    alerta: "bg-alerta/10 text-alerta",
    acento: "bg-acento/10 text-acento",
  }[tono];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${estilos}`}>
      {children}
    </span>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-tenue">{children}</p>;
}

export function TituloPagina({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        {descripcion && <p className="text-sm text-tenue mt-1">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

export function ErrorAviso({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg bg-negativo/10 text-negativo text-sm px-3 py-2">{children}</p>
  );
}
