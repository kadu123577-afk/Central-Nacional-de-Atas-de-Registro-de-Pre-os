-- AlterTable
ALTER TABLE "entidades_alvo" ADD COLUMN     "codigoIbgeMunicipio" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "entidades_alvo_codigoIbgeMunicipio_key" ON "entidades_alvo"("codigoIbgeMunicipio");

