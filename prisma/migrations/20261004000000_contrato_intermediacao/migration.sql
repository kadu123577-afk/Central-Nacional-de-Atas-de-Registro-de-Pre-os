-- CreateTable
CREATE TABLE "contratos_intermediacao" (
    "id" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "percentualComissao" DECIMAL(5,4) NOT NULL,
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_intermediacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contratos_intermediacao_ataId_key" ON "contratos_intermediacao"("ataId");

-- AddForeignKey
ALTER TABLE "contratos_intermediacao" ADD CONSTRAINT "contratos_intermediacao_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "atas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
