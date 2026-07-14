import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 no lee .env por su cuenta y exige datasource.url acá:
// sin este archivo, `prisma migrate` falla aunque DATABASE_URL esté en el entorno.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // Este archivo lo usa SOLO la CLI (migrate, seed, studio): la app conecta por el adapter
    // de src/lib/prisma.ts con DATABASE_URL. Por eso acá va la conexión DIRECTA.
    //
    // Con Neon, DATABASE_URL apunta al pooler (PgBouncer en transaction mode), que no soporta
    // los advisory locks que usa el migrador. En local las dos son la misma y no cambia nada.
    //
    // (En Prisma 7 no existe `directUrl`: el datasource del config solo acepta
    //  `url` y `shadowDatabaseUrl`. Esta es la forma de hacer el split.)
    url: process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
