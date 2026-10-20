-- AlterTable
ALTER TABLE "demandas_sem_ata" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'sem_ata',
ADD COLUMN     "ataId" TEXT,
ADD COLUMN     "orgaoId" TEXT;

-- CreateIndex
CREATE INDEX "demandas_sem_ata_ataId_idx" ON "demandas_sem_ata"("ataId");