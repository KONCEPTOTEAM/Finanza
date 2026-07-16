-- AlterTable: diaDelMes pasa a opcional (null = sin día fijo, el borrador cae el día 1).
ALTER TABLE "GastoRecurrente" ALTER COLUMN "diaDelMes" DROP NOT NULL,
ALTER COLUMN "diaDelMes" DROP DEFAULT;
