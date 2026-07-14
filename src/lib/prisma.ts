import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 exige un driver adapter: `new PrismaClient()` sin argumentos tira excepción.
// Next carga .env solo, así que acá no hace falta dotenv (sí en prisma/seed.ts).
//
// Se usa @prisma/adapter-pg (TCP, protocolo Postgres estándar) y no @prisma/adapter-neon
// a propósito. Sirve igual para un Postgres local y para Neon, así que hay un solo camino
// de código; y sobre todo, soporta las transacciones interactivas
// (`prisma.$transaction(async (tx) => ...)`) que este proyecto usa en cada operación de plata.
//
// Si algún día se pasa a @prisma/adapter-neon: usar `PrismaNeon` (WebSocket, recibe un
// PoolConfig), NUNCA `PrismaNeonHttp` — el modo HTTP de Neon no soporta transacciones
// interactivas y los cobros fallarían en producción andando bien en local.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function crearCliente() {
  // OJO: esto corre al cargar el módulo, y Next evalúa los módulos DURANTE EL BUILD.
  // Si acá tiráramos una excepción por falta de DATABASE_URL, el primer build en Vercel
  // fallaría antes de que se pueda configurar la base. `pg` no conecta hasta la primera
  // query, así que construir con la variable vacía es seguro: el error aparece en runtime,
  // que es cuando la variable realmente tiene que existir.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // En serverless cada instancia atiende pocas requests concurrentes, y con el pooler de
    // Neon del otro lado no tiene sentido abrir muchas conexiones por función.
    max: process.env.VERCEL ? 1 : 10,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? crearCliente();

// Evita abrir una conexión nueva en cada hot-reload de desarrollo.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
