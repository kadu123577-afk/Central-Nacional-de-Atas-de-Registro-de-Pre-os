-- AlterEnum
ALTER TYPE "OrigemAta" ADD VALUE 'CIABC';

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "contatoTecnicoNome" TEXT,
ADD COLUMN     "contatoTecnicoTelefone" TEXT,
ADD COLUMN     "contatoTecnicoEmail" TEXT;

-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'interno';

-- AlterTable
ALTER TABLE "oportunidades_venda" ADD COLUMN     "valorAderido" DECIMAL(14,2),
ADD COLUMN     "percentualComissao" DECIMAL(5,4);

-- CreateTable
CREATE TABLE "liquidacoes" (
    "id" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "valorLiquidado" DECIMAL(14,2) NOT NULL,
    "numeroNotaFiscal" TEXT,
    "dataLiquidacao" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "liquidacoes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "liquidacoes" ADD CONSTRAINT "liquidacoes_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades_venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
