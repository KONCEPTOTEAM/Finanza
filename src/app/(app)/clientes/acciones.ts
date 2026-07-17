"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verificarSesion } from "@/lib/dal";
import { formatearUSD } from "@/lib/dinero";
import { METODO, nombreMes } from "@/lib/constantes";
import {
  erroresDe,
  fecha,
  idRequerido,
  montoUSD,
  textoOpcional,
  textoRequerido,
  type EstadoFormulario,
} from "@/lib/validacion";

// El saldo de un trabajo se arrastra solo: es monto − suma de cobros, sin importar
// en qué mes cayó cada cosa. Nada de re-listar pendientes a mano mes a mes.

function refrescar(clienteId?: string) {
  revalidatePath("/clientes");
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/");
  revalidatePath("/meses");
}

/**
 * Los meses cerrados son de solo lectura: devuelve el motivo, o null si se puede tocar.
 *
 * Toma el cliente por parámetro a propósito. `mesEstaCerrado` de @/lib/calculos usa el
 * singleton global, así que llamarlo desde adentro de un $transaction leería el CierreMes
 * FUERA de la transacción: entre el chequeo y el write, otro socio puede cerrar el mes y la
 * mutación pasa igual, dejando un cierre con cajaFinal que ya no cuadra. Pasando el `tx`, el
 * chequeo y el write viajan en la misma transacción.
 */
async function mesBloqueado(tx: Prisma.TransactionClient, f: Date): Promise<string | null> {
  const cierre = await tx.cierreMes.findUnique({
    where: { anio_mes: { anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1 } },
    select: { id: true },
  });
  if (!cierre) return null;
  return `El mes de ${nombreMes(f.getUTCMonth() + 1)} está cerrado. Reabrilo para editarlo.`;
}

function codigoPrisma(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** Cliente.nombre es @unique: Prisma tira P2002 cuando se repite. */
function esNombreRepetido(e: unknown): boolean {
  return codigoPrisma(e) === "P2002";
}

/** P2025: el registro que se quería actualizar/borrar ya no está (otro socio lo borró). */
function esNoEncontrado(e: unknown): boolean {
  return codigoPrisma(e) === "P2025";
}

const metodo = z.enum([METODO.TRANSFERENCIA, METODO.EFECTIVO, METODO.OTRO], {
  error: "Elegí un método.",
});

/** Lo que devuelve una transacción: el estado del formulario más a quién revalidar. */
type Resultado = EstadoFormulario & { clienteId?: string };

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

const ClienteSchema = z.object({
  nombre: textoRequerido("El nombre"),
  notas: textoOpcional,
});

export async function crearCliente(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = ClienteSchema.safeParse({
    nombre: formData.get("nombre"),
    notas: formData.get("notas"),
  });
  if (!parsed.success) return erroresDe(parsed.error);

  let id: string;
  try {
    const cliente = await prisma.cliente.create({ data: parsed.data });
    id = cliente.id;
  } catch (e) {
    if (esNombreRepetido(e)) {
      return { errores: { nombre: ["Ya existe un cliente con ese nombre."] } };
    }
    throw e;
  }

  refrescar(id);
  redirect(`/clientes/${id}`); // redirect() lanza: nada de esto va en un try.
}

export async function editarCliente(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = ClienteSchema.extend({ id: idRequerido }).safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    notas: formData.get("notas"),
  });
  if (!parsed.success) return erroresDe(parsed.error);

  const { id, ...datos } = parsed.data;
  try {
    // notas: textoOpcional manda undefined cuando el textarea viene vacío, y para Prisma
    // undefined es "no toques el campo". Sin el ?? null las notas no se podrían borrar nunca.
    await prisma.cliente.update({
      where: { id },
      data: { ...datos, notas: datos.notas ?? null },
    });
  } catch (e) {
    if (esNombreRepetido(e)) {
      return { errores: { nombre: ["Ya existe un cliente con ese nombre."] } };
    }
    if (esNoEncontrado(e)) return { error: "Ese cliente ya no existe." };
    throw e;
  }

  refrescar(id);
  return { ok: true };
}

export async function desactivarCliente(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = z
    .object({ id: idRequerido, activo: z.string() })
    .safeParse({ id: formData.get("id"), activo: formData.get("activo") });
  if (!parsed.success) return erroresDe(parsed.error);

  const activo = parsed.data.activo === "true";
  try {
    await prisma.cliente.update({ where: { id: parsed.data.id }, data: { activo } });
  } catch (e) {
    // Chequear existencia antes del update no alcanza: entre el find y el write el otro
    // socio lo borra igual. El update es de un paso solo, así que atrapar P2025 es exacto.
    if (esNoEncontrado(e)) return { error: "Ese cliente ya no existe." };
    throw e;
  }

  refrescar(parsed.data.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Trabajos
// ---------------------------------------------------------------------------

const TrabajoSchema = z.object({
  descripcion: textoRequerido("La descripción"),
  monto: montoUSD,
  fecha,
  notas: textoOpcional,
});

export async function crearTrabajo(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = TrabajoSchema.extend({ clienteId: idRequerido }).safeParse({
    clienteId: formData.get("clienteId"),
    descripcion: formData.get("descripcion"),
    monto: formData.get("monto"),
    fecha: formData.get("fecha"),
    notas: formData.get("notas"),
  });
  if (!parsed.success) return erroresDe(parsed.error);

  const datos = parsed.data;

  const resultado = await prisma.$transaction(async (tx): Promise<Resultado> => {
    // Una Server Action es un POST abierto: el clienteId no viene necesariamente del
    // <input type="hidden"> del formulario. Sin este chequeo, un id inexistente hace
    // que el create tire P2003 (foreign_keys está ON) y la excepción escapa de la acción.
    const cliente = await tx.cliente.findUnique({
      where: { id: datos.clienteId },
      select: { id: true },
    });
    if (!cliente) return { error: "Ese cliente ya no existe." };

    const bloqueo = await mesBloqueado(tx, datos.fecha);
    if (bloqueo) return { errores: { fecha: [bloqueo] } };

    await tx.trabajo.create({ data: datos });
    return { ok: true, clienteId: datos.clienteId };
  });

  if (resultado.ok) refrescar(resultado.clienteId);
  return resultado;
}

export async function editarTrabajo(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = TrabajoSchema.extend({ id: idRequerido }).safeParse({
    id: formData.get("id"),
    descripcion: formData.get("descripcion"),
    monto: formData.get("monto"),
    fecha: formData.get("fecha"),
    notas: formData.get("notas"),
  });
  if (!parsed.success) return erroresDe(parsed.error);

  const { id, ...datos } = parsed.data;

  const resultado = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const trabajo = await tx.trabajo.findUnique({
      where: { id },
      select: { clienteId: true, fecha: true, cobros: { select: { monto: true } } },
    });
    if (!trabajo) return { error: "Ese trabajo ya no existe." };

    // Se chequean los dos meses: el de donde sale y el de a dónde va.
    for (const f of [trabajo.fecha, datos.fecha]) {
      const bloqueo = await mesBloqueado(tx, f);
      if (bloqueo) return { errores: { fecha: [bloqueo] } };
    }

    const cobrado = trabajo.cobros.reduce((acc, c) => acc + c.monto, 0);
    if (datos.monto < cobrado) {
      return {
        errores: {
          monto: [
            `Ya cobraste ${formatearUSD(cobrado)} de este trabajo: el monto no puede quedar por debajo.`,
          ],
        },
      };
    }

    // notas ?? null: sin esto, vaciar el textarea manda undefined y Prisma deja la nota vieja.
    await tx.trabajo.update({ where: { id }, data: { ...datos, notas: datos.notas ?? null } });
    return { ok: true, clienteId: trabajo.clienteId };
  });

  if (resultado.ok) refrescar(resultado.clienteId);
  return resultado;
}

export async function borrarTrabajo(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = z.object({ id: idRequerido }).safeParse({ id: formData.get("id") });
  if (!parsed.success) return erroresDe(parsed.error);

  const resultado = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const trabajo = await tx.trabajo.findUnique({
      where: { id: parsed.data.id },
      select: { clienteId: true, fecha: true, _count: { select: { cobros: true } } },
    });
    if (!trabajo) return { error: "Ese trabajo ya no existe." };

    const bloqueo = await mesBloqueado(tx, trabajo.fecha);
    if (bloqueo) return { error: bloqueo };

    // Borrar el trabajo arrastraría sus cobros en cascada y le sacaría plata a la caja
    // sin dejar rastro. Que se borren los cobros primero, de a uno y a conciencia.
    if (trabajo._count.cobros > 0) {
      return {
        error: `Este trabajo tiene ${trabajo._count.cobros} ${
          trabajo._count.cobros === 1 ? "cobro registrado" : "cobros registrados"
        }. Borralos primero si de verdad querés eliminarlo.`,
      };
    }

    await tx.trabajo.delete({ where: { id: parsed.data.id } });
    return { ok: true, clienteId: trabajo.clienteId };
  });

  if (resultado.ok) refrescar(resultado.clienteId);
  return resultado;
}

// ---------------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------------

export async function registrarCobro(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { socioId } = await verificarSesion();

  const parsed = z
    .object({
      trabajoId: idRequerido,
      monto: montoUSD,
      fecha,
      metodo,
      notas: textoOpcional,
    })
    .safeParse({
      trabajoId: formData.get("trabajoId"),
      monto: formData.get("monto"),
      fecha: formData.get("fecha"),
      metodo: formData.get("metodo"),
      notas: formData.get("notas"),
    });
  if (!parsed.success) return erroresDe(parsed.error);

  const { trabajoId, ...datos } = parsed.data;

  // El chequeo del saldo y el insert van juntos: si quedaran sueltos, dos cobros
  // simultáneos podrían pasar los dos y dejar el trabajo sobrecobrado.
  const resultado = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const trabajo = await tx.trabajo.findUnique({
      where: { id: trabajoId },
      select: {
        clienteId: true,
        descripcion: true,
        monto: true,
        cobros: { select: { monto: true } },
      },
    });
    if (!trabajo) return { error: "Ese trabajo ya no existe." };

    // El cobro se valida contra SU propio mes, no contra el del trabajo: cobrar en
    // julio algo facturado en junio es normal y no debería tocar junio.
    const bloqueo = await mesBloqueado(tx, datos.fecha);
    if (bloqueo) return { errores: { fecha: [bloqueo] } };

    const cobrado = trabajo.cobros.reduce((acc, c) => acc + c.monto, 0);
    const pendiente = trabajo.monto - cobrado;

    if (pendiente <= 0) return { error: "Ya está cobrado por completo." };
    if (datos.monto > pendiente) {
      return {
        errores: {
          monto: [
            `El cobro supera el saldo de ${trabajo.descripcion}: quedan ${formatearUSD(pendiente)}.`,
          ],
        },
      };
    }

    await tx.cobro.create({ data: { ...datos, trabajoId, cargadoPorId: socioId } });
    return { ok: true, clienteId: trabajo.clienteId };
  });

  if (resultado.ok) refrescar(resultado.clienteId);
  return resultado;
}

export async function borrarCobro(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = z.object({ id: idRequerido }).safeParse({ id: formData.get("id") });
  if (!parsed.success) return erroresDe(parsed.error);

  // Leer la fecha, chequear el mes y borrar van juntos: sueltos, otro socio puede cerrar el
  // mes entre el chequeo y el delete, y el cierre queda con una cajaFinal que ya no cuadra.
  const resultado = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const cobro = await tx.cobro.findUnique({
      where: { id: parsed.data.id },
      select: { fecha: true, trabajo: { select: { clienteId: true } } },
    });
    if (!cobro) return { error: "Ese cobro ya no existe." };

    const bloqueo = await mesBloqueado(tx, cobro.fecha);
    if (bloqueo) return { error: bloqueo };

    await tx.cobro.delete({ where: { id: parsed.data.id } });
    return { ok: true, clienteId: cobro.trabajo.clienteId };
  });

  if (resultado.ok) refrescar(resultado.clienteId);
  return resultado;
}

// ---------------------------------------------------------------------------
// Cuotas (plan de pago de un trabajo)
//
// Una cuota es SOLO un cronograma: no toca la caja. Los cobros se le imputan y su
// estado se deriva (cobrado = suma de sus cobros). Por eso acá no se reimplementa
// nada de @/lib/calculos: la plata sigue viniendo únicamente de los Cobro.
// ---------------------------------------------------------------------------

/** USD "1.234,5" del form -> centavos. NaN/≤0 los filtra el llamador. */
function centavosDe(v: FormDataEntryValue): number {
  const s = typeof v === "string" ? v.trim() : "";
  return Math.round(Number(s) * 100);
}

/** Divide un total en centavos en `n` cuotas lo más parejas posible. Suman el total exacto. */
function dividirEnCuotas(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const resto = total - base * n; // 0..n-1: el sobrante en centavos se reparte de a uno.
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/** `f` + `meses`, clampeando al último día si el mes destino es más corto (31 ene → 28/29 feb). */
function sumarMeses(f: Date, meses: number): Date {
  const y = f.getUTCFullYear();
  const m = f.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(y, m + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + meses, Math.min(f.getUTCDate(), ultimoDia)));
}

export async function generarCuotas(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = z
    .object({
      trabajoId: idRequerido,
      modo: z.enum(["iguales", "manual"], { error: "Elegí cómo dividir." }),
      primerVencimiento: fecha,
    })
    .safeParse({
      trabajoId: formData.get("trabajoId"),
      modo: formData.get("modo"),
      primerVencimiento: formData.get("primerVencimiento"),
    });
  if (!parsed.success) return erroresDe(parsed.error);

  const { trabajoId, modo, primerVencimiento } = parsed.data;

  const resultado = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const trabajo = await tx.trabajo.findUnique({
      where: { id: trabajoId },
      select: {
        clienteId: true,
        monto: true,
        cobros: { select: { monto: true } },
        _count: { select: { cuotas: true } },
      },
    });
    if (!trabajo) return { error: "Ese trabajo ya no existe." };
    if (trabajo._count.cuotas > 0) {
      return { error: "Este trabajo ya tiene un plan de cuotas. Borralo para rehacerlo." };
    }

    // El plan cubre lo que FALTA cobrar, no el monto entero: así se puede armar aunque
    // ya haya un anticipo cargado.
    const cobrado = trabajo.cobros.reduce((acc, c) => acc + c.monto, 0);
    const pendiente = trabajo.monto - cobrado;
    if (pendiente <= 0) {
      return { error: "Este trabajo ya está cobrado por completo: no hay nada para dividir." };
    }

    let montos: number[];
    if (modo === "iguales") {
      const cantidad = Number(String(formData.get("cantidad") ?? "").trim());
      if (!Number.isInteger(cantidad) || cantidad < 2 || cantidad > 60) {
        return { errores: { cantidad: ["Tiene que ser un número entero entre 2 y 60."] } };
      }
      montos = dividirEnCuotas(pendiente, cantidad);
    } else {
      montos = formData.getAll("montoCuota").map(centavosDe);
      if (montos.length < 2 || montos.length > 60) {
        return { error: "Un plan a mano necesita entre 2 y 60 cuotas." };
      }
      if (montos.some((n) => !Number.isFinite(n) || n <= 0)) {
        return { error: "Cada cuota tiene que ser un monto mayor a 0." };
      }
      const suma = montos.reduce((acc, n) => acc + n, 0);
      if (suma !== pendiente) {
        return {
          error: `Las cuotas suman ${formatearUSD(suma)} y tienen que sumar lo pendiente: ${formatearUSD(pendiente)}.`,
        };
      }
    }

    await tx.cuota.createMany({
      data: montos.map((monto, i) => ({
        trabajoId,
        numero: i + 1,
        monto,
        vencimiento: sumarMeses(primerVencimiento, i),
      })),
    });
    return { ok: true, clienteId: trabajo.clienteId };
  });

  if (resultado.ok) refrescar(resultado.clienteId);
  return resultado;
}

export async function cobrarCuota(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { socioId } = await verificarSesion();

  const parsed = z
    .object({ id: idRequerido, monto: montoUSD, fecha, metodo })
    .safeParse({
      id: formData.get("id"),
      monto: formData.get("monto"),
      fecha: formData.get("fecha"),
      metodo: formData.get("metodo"),
    });
  if (!parsed.success) return erroresDe(parsed.error);

  const { id, monto, fecha: fechaCobro, metodo: metodoCobro } = parsed.data;

  // Imputar el cobro a la cuota va en una transacción: chequeo de saldo y create tienen
  // que ser atómicos para que dos cobros simultáneos no sobrepasen la cuota.
  const resultado = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const cuota = await tx.cuota.findUnique({
      where: { id },
      select: {
        monto: true,
        numero: true,
        cobros: { select: { monto: true } },
        trabajo: {
          select: { id: true, clienteId: true, monto: true, cobros: { select: { monto: true } } },
        },
      },
    });
    if (!cuota) return { error: "Esa cuota ya no existe." };

    // El cobro se valida contra SU mes, no el del trabajo: cobrar una cuota de un mes ya
    // cerrado no debería reabrirlo.
    const bloqueo = await mesBloqueado(tx, fechaCobro);
    if (bloqueo) return { errores: { fecha: [bloqueo] } };

    const cuotaPendiente = cuota.monto - cuota.cobros.reduce((acc, c) => acc + c.monto, 0);
    if (cuotaPendiente <= 0) return { error: `La cuota ${cuota.numero} ya está saldada.` };
    if (monto > cuotaPendiente) {
      return { errores: { monto: [`A la cuota ${cuota.numero} le faltan ${formatearUSD(cuotaPendiente)}.`] } };
    }

    // Guarda de sobrecobro del trabajo entero, por si hubo cobros sueltos aparte del plan.
    const trabajoPendiente =
      cuota.trabajo.monto - cuota.trabajo.cobros.reduce((acc, c) => acc + c.monto, 0);
    if (monto > trabajoPendiente) {
      return { errores: { monto: [`Supera el saldo del trabajo: quedan ${formatearUSD(trabajoPendiente)}.`] } };
    }

    await tx.cobro.create({
      data: {
        trabajoId: cuota.trabajo.id,
        cuotaId: id,
        monto,
        fecha: fechaCobro,
        metodo: metodoCobro,
        notas: `Cuota ${cuota.numero}`,
        cargadoPorId: socioId,
      },
    });
    return { ok: true, clienteId: cuota.trabajo.clienteId };
  });

  if (resultado.ok) refrescar(resultado.clienteId);
  return resultado;
}

export async function borrarPlanCuotas(
  _estado: EstadoFormulario | undefined,
  formData: FormData,
): Promise<EstadoFormulario> {
  await verificarSesion();

  const parsed = z.object({ trabajoId: idRequerido }).safeParse({ trabajoId: formData.get("trabajoId") });
  if (!parsed.success) return erroresDe(parsed.error);

  const resultado = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const trabajo = await tx.trabajo.findUnique({
      where: { id: parsed.data.trabajoId },
      select: { clienteId: true },
    });
    if (!trabajo) return { error: "Ese trabajo ya no existe." };

    // Solo las cuotas sin ningún cobro imputado: si una ya recibió plata, para sacarla
    // primero hay que borrar ese cobro (que la reabre).
    await tx.cuota.deleteMany({
      where: { trabajoId: parsed.data.trabajoId, cobros: { none: {} } },
    });
    return { ok: true, clienteId: trabajo.clienteId };
  });

  if (resultado.ok) refrescar(resultado.clienteId);
  return resultado;
}
