import Link from "next/link";
import { calcularResumenMes } from "@/lib/calculos";
import { nombreMes } from "@/lib/constantes";
import {
  Card,
  CardHeader,
  Etiqueta,
  Monto,
  Tabla,
  Td,
  Th,
  TituloPagina,
  Vacio,
} from "@/components/ui";
import { mesesConRegistros } from "./datos";

export const metadata = { title: "Meses — Koncepto" };

export default async function MesesPage() {
  // Se listan también los meses cuyo único registro es un borrador. No mueven plata, pero
  // el guard de orden de cierre sí los nombra ("antes tenés que cerrar junio"): si el
  // listado los escondiera, ese mensaje mandaría a una pantalla donde el mes no existe.
  const meses = (await mesesConRegistros()).reverse();
  const resumenes = await Promise.all(meses.map((m) => calcularResumenMes(m.anio, m.mes)));

  const abiertos = resumenes.filter((r) => !r.cerrado).length;

  return (
    <>
      <TituloPagina
        titulo="Meses"
        descripcion="Cada mes con movimientos. La caja de apertura no se anota: sale de arrastrar todo lo anterior."
      />

      <Card>
        <CardHeader
          titulo="Historial"
          descripcion={
            meses.length === 0
              ? undefined
              : `${meses.length} ${meses.length === 1 ? "mes" : "meses"} · ${abiertos} ${abiertos === 1 ? "abierto" : "abiertos"}`
          }
        />
        {meses.length === 0 ? (
          <Vacio>Todavía no hay movimientos cargados.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th alinear="derecha">Apertura</Th>
                <Th alinear="derecha">Cobrado</Th>
                <Th alinear="derecha">Gastado</Th>
                <Th alinear="derecha">Salió de caja</Th>
                <Th alinear="derecha">Cierre</Th>
                <Th alinear="derecha">Estado</Th>
              </tr>
            </thead>
            <tbody>
              {resumenes.map((r) => {
                const gastado = r.gastosOperativos + r.sueldosDevengados;
                return (
                  <tr key={`${r.anio}-${r.mes}`}>
                    <Td>
                      <Link
                        href={`/meses/${r.anio}/${r.mes}`}
                        className="font-medium hover:underline"
                      >
                        {nombreMes(r.mes)}
                      </Link>
                      <span className="text-tenue text-xs ml-1.5">{r.anio}</span>
                    </Td>
                    <Td alinear="derecha">
                      <Monto centavos={r.cajaApertura} tono="tenue" />
                    </Td>
                    <Td alinear="derecha">
                      <Monto centavos={r.cobrado} tono={r.cobrado > 0 ? "positivo" : "tenue"} />
                    </Td>
                    <Td alinear="derecha">
                      <Monto centavos={gastado} tono="tenue" />
                    </Td>
                    <Td alinear="derecha">
                      <Monto centavos={r.salidaDeCaja} tono={r.salidaDeCaja > 0 ? "negativo" : "tenue"} />
                    </Td>
                    <Td alinear="derecha" className="font-medium">
                      <Monto centavos={r.cajaCierre} tono="auto" />
                    </Td>
                    <Td alinear="derecha">
                      {r.cerrado ? (
                        <Etiqueta tono="neutro">Cerrado</Etiqueta>
                      ) : (
                        <Etiqueta tono="acento">Abierto</Etiqueta>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Card>

      {/* Que las dos columnas no cierren entre sí es el punto, no un error de la tabla. */}
      <p className="text-xs text-tenue mt-3 leading-relaxed">
        <strong className="font-medium">Gastado</strong> es lo que el mes devengó: gastos
        operativos más sueldos, los haya pagado la empresa o un socio de su bolsillo.{" "}
        <strong className="font-medium">Salió de caja</strong> es solo la plata que puso la
        empresa más lo que se le giró a los socios. La diferencia entre las dos es lo que la
        planilla mezclaba en un solo número.
      </p>
    </>
  );
}
