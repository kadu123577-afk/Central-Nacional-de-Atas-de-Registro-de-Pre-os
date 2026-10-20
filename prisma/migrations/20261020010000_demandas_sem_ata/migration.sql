-- CreateTable
CREATE TABLE "demandas_sem_ata" (
    "id" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objeto" TEXT NOT NULL,
    "quantidade" TEXT,
    "uf" TEXT,
    "prazo" TEXT,
    "orgao" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "contato" TEXT NOT NULL,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "atendidaEm" TIMESTAMP(3),
    "notaInterna" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "demandas_sem_ata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demandas_sem_ata_status_criadoEm_idx" ON "demandas_sem_ata"("status", "criadoEm");