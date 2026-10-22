-- AlterTable
ALTER TABLE "itens" ADD COLUMN     "codigoCatalogo" TEXT;

-- CreateTable
CREATE TABLE "referencias_preco" (
    "id" TEXT NOT NULL,
    "codigoCatalogo" TEXT NOT NULL,
    "tipoCatalogo" TEXT NOT NULL DEFAULT 'material',
    "n" INTEGER NOT NULL,
    "nUsadas" INTEGER NOT NULL,
    "minimo" DECIMAL(16,4),
    "p25" DECIMAL(16,4),
    "mediana" DECIMAL(16,4),
    "p75" DECIMAL(16,4),
    "maximo" DECIMAL(16,4),
    "media" DECIMAL(16,4),
    "janelaInicio" TIMESTAMP(3) NOT NULL,
    "janelaFim" TIMESTAMP(3) NOT NULL,
    "unidadeFornecimento" TEXT,
    "consultadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fonte" TEXT NOT NULL DEFAULT 'compras.gov.br/pesquisa-de-preco',
    "erro" TEXT,

    CONSTRAINT "referencias_preco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referencias_preco_consultadoEm_idx" ON "referencias_preco"("consultadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "referencias_preco_codigoCatalogo_tipoCatalogo_key" ON "referencias_preco"("codigoCatalogo", "tipoCatalogo");

-- CreateIndex
CREATE INDEX "itens_codigoCatalogo_idx" ON "itens"("codigoCatalogo");
