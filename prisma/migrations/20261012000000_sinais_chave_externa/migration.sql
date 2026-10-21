-- AlterTable
ALTER TABLE "sinais_municipio" ADD COLUMN     "chaveExterna" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sinais_municipio_chaveExterna_key" ON "sinais_municipio"("chaveExterna");
