-- AlterTable
ALTER TABLE "liquidacoes" ADD COLUMN     "dataPagamentoEnte" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "contratos_publicos" (
    "id" TEXT NOT NULL,
    "numeroControlePncp" TEXT NOT NULL,
    "orgaoCnpj" TEXT NOT NULL,
    "orgaoNome" TEXT NOT NULL,
    "entidadeAlvoId" TEXT,
    "fornecedorCnpj" TEXT,
    "fornecedorNome" TEXT,
    "numeroControleAta" TEXT,
    "numeroControleCompra" TEXT,
    "frutoAdesao" BOOLEAN,
    "tipo" TEXT,
    "objeto" TEXT NOT NULL,
    "valorInicial" DECIMAL(16,2),
    "valorGlobal" DECIMAL(16,2),
    "valorAcumulado" DECIMAL(16,2),
    "dataAssinatura" TIMESTAMP(3),
    "vigenciaInicio" TIMESTAMP(3),
    "vigenciaFim" TIMESTAMP(3),
    "atualizadoNoPncpEm" TIMESTAMP(3),
    "termosConsultadosEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_publicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "termos_contrato_publico" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "valorAcrescido" DECIMAL(16,2),
    "novaVigenciaFim" TIMESTAMP(3),
    "dataAssinatura" TIMESTAMP(3),
    "cobrancaStatus" TEXT NOT NULL DEFAULT 'a_acompanhar',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "termos_contrato_publico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vinculos_contrato" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "oportunidadeId" TEXT,
    "ataId" TEXT,
    "nivel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sugerido',
    "motivo" TEXT NOT NULL,
    "decididoPorId" TEXT,
    "decididoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vinculos_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contratos_publicos_numeroControlePncp_key" ON "contratos_publicos"("numeroControlePncp");

-- CreateIndex
CREATE INDEX "contratos_publicos_fornecedorCnpj_idx" ON "contratos_publicos"("fornecedorCnpj");

-- CreateIndex
CREATE INDEX "contratos_publicos_entidadeAlvoId_idx" ON "contratos_publicos"("entidadeAlvoId");

-- CreateIndex
CREATE UNIQUE INDEX "termos_contrato_publico_chave_key" ON "termos_contrato_publico"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "vinculos_contrato_contratoId_key" ON "vinculos_contrato"("contratoId");

-- CreateIndex
CREATE INDEX "vinculos_contrato_status_idx" ON "vinculos_contrato"("status");

-- AddForeignKey
ALTER TABLE "contratos_publicos" ADD CONSTRAINT "contratos_publicos_entidadeAlvoId_fkey" FOREIGN KEY ("entidadeAlvoId") REFERENCES "entidades_alvo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "termos_contrato_publico" ADD CONSTRAINT "termos_contrato_publico_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos_publicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_contrato" ADD CONSTRAINT "vinculos_contrato_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos_publicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_contrato" ADD CONSTRAINT "vinculos_contrato_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades_venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_contrato" ADD CONSTRAINT "vinculos_contrato_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "atas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

