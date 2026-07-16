-- CreateTable
CREATE TABLE "Cuota" (
    "id" TEXT NOT NULL,
    "trabajoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "monto" INTEGER NOT NULL,
    "vencimiento" TIMESTAMP(3) NOT NULL,
    "cobroId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cuota_cobroId_key" ON "Cuota"("cobroId");

-- CreateIndex
CREATE INDEX "Cuota_trabajoId_idx" ON "Cuota"("trabajoId");

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_trabajoId_fkey" FOREIGN KEY ("trabajoId") REFERENCES "Trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE SET NULL ON UPDATE CASCADE;
