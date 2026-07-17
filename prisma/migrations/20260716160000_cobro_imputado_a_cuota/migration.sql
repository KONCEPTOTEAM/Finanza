-- El cobro ahora se imputa a una cuota (0..N por cuota), en vez de que la cuota apunte
-- a un solo cobro. Habilita cobros parciales de una cuota.

-- Nuevo lado de la relación en Cobro.
ALTER TABLE "Cobro" ADD COLUMN "cuotaId" TEXT;

-- Preservar los links del modelo viejo (Cuota.cobroId -> Cobro.cuotaId).
UPDATE "Cobro" SET "cuotaId" = c."id" FROM "Cuota" c WHERE c."cobroId" = "Cobro"."id";

-- Quitar el link viejo de Cuota.
ALTER TABLE "Cuota" DROP CONSTRAINT "Cuota_cobroId_fkey";
DROP INDEX "Cuota_cobroId_key";
ALTER TABLE "Cuota" DROP COLUMN "cobroId";

-- Índice + FK del nuevo link.
CREATE INDEX "Cobro_cuotaId_idx" ON "Cobro"("cuotaId");
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "Cuota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
