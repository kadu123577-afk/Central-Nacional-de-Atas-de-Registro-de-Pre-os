-- CreateEnum
CREATE TYPE "StatusAta" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "EstagioAdesao" AS ENUM ('MAPEADA', 'CONTATO_FORNECEDOR', 'APRESENTADA_ORGAO', 'OFICIO_EMITIDO', 'AGUARDANDO_GERENCIADOR', 'ACEITE_FORNECEDOR', 'EMPENHADA', 'FATURADA');

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orgaos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "municipio" TEXT NOT NULL,
    "esfera" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orgaos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atas" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "status" "StatusAta" NOT NULL DEFAULT 'PENDENTE',
    "dataAssinatura" TIMESTAMP(3) NOT NULL,
    "dataVigenciaFim" TIMESTAMP(3) NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "orgaoGerenciadorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens" (
    "id" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "marca" TEXT,
    "unidade" TEXT NOT NULL,
    "quantidadeRegistrada" INTEGER NOT NULL,
    "valorUnitario" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldos" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidadeConsumida" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saldos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adesoes" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "orgaoAderenteId" TEXT NOT NULL,
    "quantidadeSolicitada" INTEGER NOT NULL,
    "estagio" "EstagioAdesao" NOT NULL DEFAULT 'MAPEADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adesoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adesoes_historico" (
    "id" TEXT NOT NULL,
    "adesaoId" TEXT NOT NULL,
    "estagioAnterior" "EstagioAdesao",
    "estagioNovo" "EstagioAdesao" NOT NULL,
    "alteradoPor" TEXT NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adesoes_historico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_cnpj_key" ON "fornecedores"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_email_key" ON "fornecedores"("email");

-- CreateIndex
CREATE UNIQUE INDEX "orgaos_cnpj_key" ON "orgaos"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "atas_numero_orgaoGerenciadorId_key" ON "atas"("numero", "orgaoGerenciadorId");

-- CreateIndex
CREATE UNIQUE INDEX "saldos_itemId_key" ON "saldos"("itemId");

-- AddForeignKey
ALTER TABLE "atas" ADD CONSTRAINT "atas_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atas" ADD CONSTRAINT "atas_orgaoGerenciadorId_fkey" FOREIGN KEY ("orgaoGerenciadorId") REFERENCES "orgaos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens" ADD CONSTRAINT "itens_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "atas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos" ADD CONSTRAINT "saldos_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adesoes" ADD CONSTRAINT "adesoes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adesoes" ADD CONSTRAINT "adesoes_orgaoAderenteId_fkey" FOREIGN KEY ("orgaoAderenteId") REFERENCES "orgaos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adesoes_historico" ADD CONSTRAINT "adesoes_historico_adesaoId_fkey" FOREIGN KEY ("adesaoId") REFERENCES "adesoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
