-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "acessoFinanceiro" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "socios_scp" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "socios_scp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participacoes_scp" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "percentual" DECIMAL(7,4) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "vigenteAte" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participacoes_scp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despesas_scp" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "pagaPorSocioId" TEXT,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "despesas_scp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participacoes_scp_socioId_idx" ON "participacoes_scp"("socioId");

-- CreateIndex
CREATE INDEX "participacoes_scp_vigenteDesde_idx" ON "participacoes_scp"("vigenteDesde");

-- CreateIndex
CREATE INDEX "despesas_scp_data_idx" ON "despesas_scp"("data");

-- AddForeignKey
ALTER TABLE "participacoes_scp" ADD CONSTRAINT "participacoes_scp_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socios_scp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

