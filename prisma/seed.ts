import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// Datos reales de junio y julio 2026, migrados de la planilla original.
//
// Los montos van en centavos: usd(500) => 50000.
//
// Verificado contra los totales de la planilla:
//   junio  facturado 2750 (B9) | cobrado 1850 (C9) | sueldos 1500 (G11)
//   julio  por cobrar 600 (B9)
//   caja: 160 a fin de junio, 423 a fin de julio
//   cuentas: Jorge 818, Facundo 500, Lucas 500  => deuda total 1818
//
// DESVÍO CONOCIDO: la planilla de junio tiene TOTAL GASTO = 200 hardcodeado, pero la
// suma real de los ítems (Claude 100 + Higgsfield 30 + Publicidad 60) da 190. Se importa
// 190. Por eso la caja de junio cierra en 160 y no en los 150 que arrastraba la hoja.
//
// Las fechas exactas no estaban en la planilla: se usan fechas razonables dentro de cada mes.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Este seed BORRA TODO antes de cargar. Es para desarrollo: no lo corras contra producción.
if (process.env.NODE_ENV === "production" && !process.env.SEED_IGUAL) {
  console.error(
    "Este seed borra todos los datos y NODE_ENV=production. Si es a propósito, corré con SEED_IGUAL=1.",
  );
  process.exit(1);
}

/** USD -> centavos */
const usd = (n: number) => Math.round(n * 100);
/** Fecha UTC, para que no se corra de mes por zona horaria. */
const fecha = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

const CLAVE_INICIAL = "koncepto2026";

async function limpiar() {
  // En orden inverso a las dependencias.
  await prisma.cierreMes.deleteMany();
  await prisma.pagoASocio.deleteMany();
  await prisma.pagoGasto.deleteMany();
  await prisma.gasto.deleteMany();
  await prisma.gastoRecurrente.deleteMany();
  await prisma.cobro.deleteMany();
  await prisma.trabajo.deleteMany();
  await prisma.oportunidad.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.socio.deleteMany();
}

async function main() {
  await limpiar();

  // -------------------------------------------------------------------------
  // Socios
  // -------------------------------------------------------------------------
  const hash = await bcrypt.hash(CLAVE_INICIAL, 10);
  const [facundo, jorge, lucas] = await Promise.all([
    prisma.socio.create({
      data: { email: "facundo@koncepto.com", nombre: "Facundo", passwordHash: hash, sueldoMensual: usd(500), orden: 1 },
    }),
    prisma.socio.create({
      data: { email: "jorge@koncepto.com", nombre: "Jorge", passwordHash: hash, sueldoMensual: usd(500), orden: 2 },
    }),
    prisma.socio.create({
      data: { email: "lucas@koncepto.com", nombre: "Lucas", passwordHash: hash, sueldoMensual: usd(500), orden: 3 },
    }),
  ]);

  // -------------------------------------------------------------------------
  // Clientes y trabajos. TODOS facturados en junio: en julio no se facturó nada
  // nuevo — lo que la hoja de julio listaba como "total" era deuda de junio.
  // -------------------------------------------------------------------------
  const trabajos: { cliente: string; monto: number; cobros: { fecha: Date; monto: number }[] }[] = [
    { cliente: "Ana Luna", monto: usd(450), cobros: [{ fecha: fecha(2026, 6, 15), monto: usd(450) }] },
    {
      cliente: "Inelmap",
      monto: usd(400),
      // Pagó una parte en junio y el saldo en julio.
      cobros: [
        { fecha: fecha(2026, 6, 15), monto: usd(200) },
        { fecha: fecha(2026, 7, 5), monto: usd(200) },
      ],
    },
    { cliente: "Psicóloga", monto: usd(200), cobros: [{ fecha: fecha(2026, 6, 15), monto: usd(100) }] },
    {
      cliente: "Milenium Volquetes",
      monto: usd(200),
      cobros: [
        { fecha: fecha(2026, 6, 15), monto: usd(100) },
        { fecha: fecha(2026, 7, 5), monto: usd(100) },
      ],
    },
    { cliente: "Plastitec", monto: usd(500), cobros: [] },
    { cliente: "Fiderza", monto: usd(1000), cobros: [{ fecha: fecha(2026, 6, 15), monto: usd(1000) }] },
  ];

  for (const t of trabajos) {
    const cliente = await prisma.cliente.create({ data: { nombre: t.cliente } });
    await prisma.trabajo.create({
      data: {
        clienteId: cliente.id,
        // Sin el nombre del cliente: las pantallas ya lo muestran al lado y quedaba repetido.
        descripcion: "Trabajo de junio",
        monto: t.monto,
        fecha: fecha(2026, 6, 1),
        cobros: { create: t.cobros.map((c) => ({ monto: c.monto, fecha: c.fecha, metodo: "TRANSFERENCIA" })) },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Gastos operativos.
  // En julio Jorge puso de su bolsillo: Claude 200, Higgsfield 30 y 88 de los 100
  // de Publicidad (los 12 restantes los puso la empresa). Total adelantado: 318.
  // -------------------------------------------------------------------------
  type PagoSeed = { monto: number; pagador: "EMPRESA" | "SOCIO"; socioId?: string };
  const gastos: { concepto: string; monto: number; fecha: Date; notas?: string; pagos: PagoSeed[] }[] = [
    // Junio: sin notas de "se debe a", así que los puso la empresa.
    { concepto: "Claude", monto: usd(100), fecha: fecha(2026, 6, 1), pagos: [{ monto: usd(100), pagador: "EMPRESA" }] },
    { concepto: "Higgsfield", monto: usd(30), fecha: fecha(2026, 6, 1), pagos: [{ monto: usd(30), pagador: "EMPRESA" }] },
    {
      concepto: "Publicidad",
      monto: usd(60),
      fecha: fecha(2026, 6, 1),
      notas: "La planilla sumaba 200 de gasto total, pero los ítems dan 190. Se importó 190.",
      pagos: [{ monto: usd(60), pagador: "EMPRESA" }],
    },
    // Julio.
    {
      concepto: "Claude",
      monto: usd(200),
      fecha: fecha(2026, 7, 1),
      notas: "Lo puso Jorge.",
      pagos: [{ monto: usd(200), pagador: "SOCIO", socioId: jorge.id }],
    },
    {
      concepto: "Higgsfield",
      monto: usd(30),
      fecha: fecha(2026, 7, 1),
      notas: "Lo puso Jorge.",
      pagos: [{ monto: usd(30), pagador: "SOCIO", socioId: jorge.id }],
    },
    {
      concepto: "Publicidad",
      monto: usd(100),
      fecha: fecha(2026, 7, 1),
      notas: "Jorge puso 88, la empresa 12.",
      pagos: [
        { monto: usd(88), pagador: "SOCIO", socioId: jorge.id },
        { monto: usd(12), pagador: "EMPRESA" },
      ],
    },
    {
      concepto: "Comida",
      monto: usd(25),
      fecha: fecha(2026, 7, 6),
      notas: "En la planilla estaba como ingreso negativo (-25) y además como 25 pagado. Acá es un gasto y nada más.",
      pagos: [{ monto: usd(25), pagador: "EMPRESA" }],
    },
  ];

  for (const g of gastos) {
    await prisma.gasto.create({
      data: {
        concepto: g.concepto,
        tipo: "OPERATIVO",
        monto: g.monto,
        fecha: g.fecha,
        notas: g.notas,
        pagos: {
          create: g.pagos.map((p) => ({
            monto: p.monto,
            fecha: g.fecha,
            pagador: p.pagador,
            socioId: p.socioId,
          })),
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Sueldos: 500 por socio, devengados los dos meses.
  // En junio se cobraron los tres. En julio nadie retiró => quedan como deuda.
  // -------------------------------------------------------------------------
  const socios = [facundo, jorge, lucas];
  for (const s of socios) {
    for (const mes of [6, 7]) {
      await prisma.gasto.create({
        data: {
          concepto: `Sueldo ${s.nombre}`,
          tipo: "SUELDO",
          monto: usd(500),
          fecha: fecha(2026, mes, 1),
          socioId: s.id,
        },
      });
    }
    // Solo el de junio se pagó. El giro es lo que baja la caja y la cuenta corriente.
    await prisma.pagoASocio.create({
      data: { socioId: s.id, monto: usd(500), fecha: fecha(2026, 6, 30), notas: "Sueldo de junio." },
    });
  }

  // -------------------------------------------------------------------------
  // Recurrentes. El monto sugerido es el último confirmado: Claude subió de 100 a
  // 200 y Publicidad de 60 a 100, así que se generan como borrador editable.
  // -------------------------------------------------------------------------
  await prisma.gastoRecurrente.createMany({
    data: [
      { concepto: "Claude", tipo: "OPERATIVO", montoSugerido: usd(200), diaDelMes: 1 },
      { concepto: "Higgsfield", tipo: "OPERATIVO", montoSugerido: usd(30), diaDelMes: 1 },
      { concepto: "Publicidad", tipo: "OPERATIVO", montoSugerido: usd(100), diaDelMes: 1 },
    ],
  });
  for (const s of socios) {
    await prisma.gastoRecurrente.create({
      data: {
        concepto: `Sueldo ${s.nombre}`,
        tipo: "SUELDO",
        montoSugerido: s.sueldoMensual,
        diaDelMes: 1,
        socioId: s.id,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Pipeline. En la planilla figuran confirmados pero nunca se facturaron, así que
  // se cargan sin convertir: convertirlos crea el trabajo y recién ahí suman a cobrar.
  // -------------------------------------------------------------------------
  await prisma.oportunidad.createMany({
    data: [
      { nombre: "Viñedo", monto: usd(200), confirmado: true, notas: "Confirmado, sin seña." },
      { nombre: "Desarrollo El Faro", monto: usd(200), confirmado: true, notas: "Confirmado, sin seña." },
      { nombre: "Desarrolladora G", monto: usd(7200), confirmado: true, notas: "Confirmado, sin seña." },
    ],
  });

  // -------------------------------------------------------------------------
  // Control: los números tienen que coincidir con la planilla.
  // -------------------------------------------------------------------------
  const [cobros, pagosEmpresa, giros] = await Promise.all([
    prisma.cobro.aggregate({ _sum: { monto: true } }),
    prisma.pagoGasto.aggregate({ _sum: { monto: true }, where: { pagador: "EMPRESA" } }),
    prisma.pagoASocio.aggregate({ _sum: { monto: true } }),
  ]);
  const caja = (cobros._sum.monto ?? 0) - (pagosEmpresa._sum.monto ?? 0) - (giros._sum.monto ?? 0);

  console.log("Datos de junio y julio cargados.");
  console.log(`  Caja a fin de julio: USD ${caja / 100} (esperado: 423)`);
  console.log(`  Socios: ${socios.map((s) => s.nombre).join(", ")}`);
  console.log(`  Clave inicial para los tres: ${CLAVE_INICIAL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
