-- CreateTable
CREATE TABLE "Socio" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "sueldoMensual" INTEGER NOT NULL DEFAULT 50000,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Socio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trabajo" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origenId" TEXT,

    CONSTRAINT "Trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobro" (
    "id" TEXT NOT NULL,
    "trabajoId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cargadoPorId" TEXT,

    CONSTRAINT "Cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'OPERATIVO',
    "monto" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "esBorrador" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "socioId" TEXT,
    "recurrenteId" TEXT,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoGasto" (
    "id" TEXT NOT NULL,
    "gastoId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "pagador" TEXT NOT NULL DEFAULT 'EMPRESA',
    "socioId" TEXT,
    "metodo" TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoASocio" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'TRANSFERENCIA',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoASocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoRecurrente" (
    "id" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'OPERATIVO',
    "montoSugerido" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "diaDelMes" INTEGER NOT NULL DEFAULT 1,
    "socioId" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastoRecurrente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Oportunidad" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clienteId" TEXT,
    "monto" INTEGER NOT NULL,
    "confirmado" BOOLEAN NOT NULL DEFAULT false,
    "sena" INTEGER,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Oportunidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreMes" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "cajaFinal" INTEGER NOT NULL,
    "notas" TEXT,
    "cerradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradoPorId" TEXT NOT NULL,

    CONSTRAINT "CierreMes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Socio_email_key" ON "Socio"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_nombre_key" ON "Cliente"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Trabajo_origenId_key" ON "Trabajo"("origenId");

-- CreateIndex
CREATE INDEX "Trabajo_fecha_idx" ON "Trabajo"("fecha");

-- CreateIndex
CREATE INDEX "Trabajo_clienteId_idx" ON "Trabajo"("clienteId");

-- CreateIndex
CREATE INDEX "Cobro_fecha_idx" ON "Cobro"("fecha");

-- CreateIndex
CREATE INDEX "Cobro_trabajoId_idx" ON "Cobro"("trabajoId");

-- CreateIndex
CREATE INDEX "Gasto_fecha_idx" ON "Gasto"("fecha");

-- CreateIndex
CREATE INDEX "Gasto_tipo_idx" ON "Gasto"("tipo");

-- CreateIndex
CREATE INDEX "Gasto_socioId_idx" ON "Gasto"("socioId");

-- CreateIndex
CREATE INDEX "PagoGasto_fecha_idx" ON "PagoGasto"("fecha");

-- CreateIndex
CREATE INDEX "PagoGasto_gastoId_idx" ON "PagoGasto"("gastoId");

-- CreateIndex
CREATE INDEX "PagoGasto_socioId_idx" ON "PagoGasto"("socioId");

-- CreateIndex
CREATE INDEX "PagoASocio_fecha_idx" ON "PagoASocio"("fecha");

-- CreateIndex
CREATE INDEX "PagoASocio_socioId_idx" ON "PagoASocio"("socioId");

-- CreateIndex
CREATE INDEX "CierreMes_anio_mes_idx" ON "CierreMes"("anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "CierreMes_anio_mes_key" ON "CierreMes"("anio", "mes");

-- AddForeignKey
ALTER TABLE "Trabajo" ADD CONSTRAINT "Trabajo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trabajo" ADD CONSTRAINT "Trabajo_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Oportunidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_trabajoId_fkey" FOREIGN KEY ("trabajoId") REFERENCES "Trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_cargadoPorId_fkey" FOREIGN KEY ("cargadoPorId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_recurrenteId_fkey" FOREIGN KEY ("recurrenteId") REFERENCES "GastoRecurrente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoASocio" ADD CONSTRAINT "PagoASocio_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoRecurrente" ADD CONSTRAINT "GastoRecurrente_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreMes" ADD CONSTRAINT "CierreMes_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
