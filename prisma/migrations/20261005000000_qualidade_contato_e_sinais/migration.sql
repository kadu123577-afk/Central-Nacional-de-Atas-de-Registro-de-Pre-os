-- AlterTable
ALTER TABLE "pontos_focais" ADD COLUMN     "fonte" TEXT,
ADD COLUMN     "fonteUrl" TEXT,
ADD COLUMN     "confianca" INTEGER,
ADD COLUMN     "verificadoEm" TIMESTAMP(3),
ADD COLUMN     "contatoErradoEm" TIMESTAMP(3),
ADD COLUMN     "contatoErradoPorId" TEXT,
ADD COLUMN     "contatoErradoMotivo" TEXT;

-- CreateTable
CREATE TABLE "sinais_municipio" (
    "id" TEXT NOT NULL,
    "entidadeAlvoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalhe" TEXT,
    "fonte" TEXT NOT NULL,
    "fonteUrl" TEXT,
    "categoria" TEXT,
    "valorEstimado" DECIMAL(14,2),
    "dataSinal" TIMESTAMP(3) NOT NULL,
    "expiraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sinais_municipio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sinais_municipio_entidadeAlvoId_dataSinal_idx" ON "sinais_municipio"("entidadeAlvoId", "dataSinal");

-- AddForeignKey
ALTER TABLE "sinais_municipio" ADD CONSTRAINT "sinais_municipio_entidadeAlvoId_fkey" FOREIGN KEY ("entidadeAlvoId") REFERENCES "entidades_alvo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
