import Link from "next/link";
import { calcularCuentasSocios } from "@/lib/calculos";
import { formatearUSD } from "@/lib/dinero";
import { Card, Monto, Stat, TituloPagina, Vacio } from "@/components/ui";

export const metadata = { title: "Socios — Koncepto" };

export default async function SociosPage() {
  const cuentas = await calcularCuentasSocios();
  const deudaTotal = cuentas.reduce((acc, c) => acc + c.saldo, 0);

  return (
    <>
      <TituloPagina
        titulo="Socios"
        descripcion="Una sola cuenta por socio: los adelantos y los sueldos van al mismo saldo, y cualquier giro los cancela indistintamente."
      />

      <div className="mb-6 sm:max-w-xs">
        <Stat
          etiqueta="Deuda con los socios"
          centavos={deudaTotal}
          detalle="Lo que la empresa les debe en total"
          tono={deudaTotal > 0 ? "negativo" : "neutro"}
          destacado
        />
      </div>

      {cuentas.length === 0 ? (
        <Card>
          <Vacio>Todavía no hay socios cargados.</Vacio>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((c) => (
            <Link key={c.socioId} href={`/socios/${c.socioId}`} className="block">
              <Card className="h-full transition hover:border-acento/50">
                <div className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-semibold">
                      {c.nombre}
                      {!c.activo && <span className="text-xs text-tenue font-normal"> · dado de baja</span>}
                    </h2>
                    <span className="text-xs text-tenue">
                      {c.saldo > 0 ? "a favor" : c.saldo < 0 ? "en contra" : "al día"}
                    </span>
                  </div>
                  <p
                    className={`tabular mt-1 text-2xl font-semibold ${
                      c.saldo > 0 ? "text-negativo" : c.saldo < 0 ? "text-positivo" : "text-foreground"
                    }`}
                  >
                    {formatearUSD(c.saldo)}
                  </p>

                  <dl className="mt-4 space-y-1.5 text-sm border-t border-borde pt-3">
                    <Desglose etiqueta="Adelantos que puso" centavos={c.adelantos} />
                    <Desglose etiqueta="Sueldos devengados" centavos={c.sueldosDevengados} />
                    <Desglose etiqueta="Giros recibidos" centavos={-c.girosRecibidos} />
                  </dl>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function Desglose({ etiqueta, centavos }: { etiqueta: string; centavos: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-tenue">{etiqueta}</dt>
      <dd>
        <Monto centavos={centavos} tono="tenue" />
      </dd>
    </div>
  );
}
