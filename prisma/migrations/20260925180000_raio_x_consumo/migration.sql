-- AlterTable
ALTER TABLE "entidades_alvo" ADD COLUMN     "cnpj" TEXT;

-- CreateTable
CREATE TABLE "historico_consumo_categoria" (
    "id" TEXT NOT NULL,
    "entidadeAlvoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "ultimaContratacao" TIMESTAMP(3) NOT NULL,
    "valorUltimaContratacao" DECIMAL(14,2) NOT NULL,
    "quantidadeContratosNaJanela" INTEGER NOT NULL,
    "objetoUltimaContratacao" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "historico_consumo_categoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "historico_consumo_categoria_entidadeAlvoId_categoria_key" ON "historico_consumo_categoria"("entidadeAlvoId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "entidades_alvo_cnpj_key" ON "entidades_alvo"("cnpj");

-- AddForeignKey
ALTER TABLE "historico_consumo_categoria" ADD CONSTRAINT "historico_consumo_categoria_entidadeAlvoId_fkey" FOREIGN KEY ("entidadeAlvoId") REFERENCES "entidades_alvo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

