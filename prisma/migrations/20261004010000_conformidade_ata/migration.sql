-- CreateTable
CREATE TABLE "conformidades_ata" (
    "id" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "fornecedorRegular" BOOLEAN NOT NULL DEFAULT false,
    "editalPermiteAdesao" BOOLEAN NOT NULL DEFAULT false,
    "limitesRespeitados" BOOLEAN NOT NULL DEFAULT false,
    "pesquisaPrecos" BOOLEAN NOT NULL DEFAULT false,
    "anuenciaGerenciador" BOOLEAN NOT NULL DEFAULT false,
    "estimativaQuantidades" BOOLEAN NOT NULL DEFAULT false,
    "parecer" TEXT,
    "responsavelId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conformidades_ata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conformidades_ata_ataId_key" ON "conformidades_ata"("ataId");

-- AddForeignKey
ALTER TABLE "conformidades_ata" ADD CONSTRAINT "conformidades_ata_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "atas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
