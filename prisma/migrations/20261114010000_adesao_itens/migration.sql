-- CreateTable
CREATE TABLE "adesao_itens" (
    "id" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adesao_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adesao_itens_itemId_idx" ON "adesao_itens"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "adesao_itens_oportunidadeId_itemId_key" ON "adesao_itens"("oportunidadeId", "itemId");

-- AddForeignKey
ALTER TABLE "adesao_itens" ADD CONSTRAINT "adesao_itens_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades_venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adesao_itens" ADD CONSTRAINT "adesao_itens_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
