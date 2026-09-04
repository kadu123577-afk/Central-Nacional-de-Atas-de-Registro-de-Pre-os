-- AlterTable
ALTER TABLE "faturamentos" DROP COLUMN "valorDesenvolvedora",
DROP COLUMN "valorTech10",
ADD COLUMN     "pago" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pagoEm" TIMESTAMP(3);

