-- AlterTable
ALTER TABLE "liquidacoes" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'original',
ADD COLUMN     "statusCobranca" TEXT NOT NULL DEFAULT 'pendente',
ADD COLUMN     "notaFiscalComissao" TEXT,
ADD COLUMN     "dataCobranca" TIMESTAMP(3),
ADD COLUMN     "dataRecebimento" TIMESTAMP(3);
