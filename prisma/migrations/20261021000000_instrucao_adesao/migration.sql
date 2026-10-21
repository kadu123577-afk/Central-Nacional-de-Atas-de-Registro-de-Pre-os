-- CreateTable
CREATE TABLE "instrucoes_adesao" (
    "id" TEXT NOT NULL,
    "oportunidadeId" TEXT NOT NULL,
    "itens" JSONB NOT NULL DEFAULT '{}',
    "declaracaoEm" TIMESTAMP(3),
    "declaracaoPorTipo" TEXT,
    "declaracaoPorId" TEXT,
    "declaracaoVersao" INTEGER,
    "declaracaoExcecao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instrucoes_adesao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instrucoes_adesao_oportunidadeId_key" ON "instrucoes_adesao"("oportunidadeId");

-- AddForeignKey
ALTER TABLE "instrucoes_adesao" ADD CONSTRAINT "instrucoes_adesao_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades_venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
