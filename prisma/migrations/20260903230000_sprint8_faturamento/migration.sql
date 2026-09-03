-- CreateTable
CREATE TABLE "faturamentos" (
    "id" TEXT NOT NULL,
    "adesaoId" TEXT NOT NULL,
    "valorContrato" DECIMAL(14,2) NOT NULL,
    "percentualTaxa" DECIMAL(5,4) NOT NULL,
    "valorTaxaIntermediacao" DECIMAL(14,2) NOT NULL,
    "valorTech10" DECIMAL(14,2) NOT NULL,
    "valorDesenvolvedora" DECIMAL(14,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faturamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faturamentos_adesaoId_key" ON "faturamentos"("adesaoId");

-- AddForeignKey
ALTER TABLE "faturamentos" ADD CONSTRAINT "faturamentos_adesaoId_fkey" FOREIGN KEY ("adesaoId") REFERENCES "adesoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

