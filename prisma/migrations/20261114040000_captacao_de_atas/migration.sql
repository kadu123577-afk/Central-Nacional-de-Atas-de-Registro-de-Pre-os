-- CreateTable
CREATE TABLE "captacoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "numeroControlePncpAta" TEXT,
    "estagio" TEXT NOT NULL DEFAULT 'identificada',
    "fornecedorCnpj" TEXT,
    "fornecedorNome" TEXT,
    "orgaoNome" TEXT,
    "uf" TEXT,
    "municipioNome" TEXT,
    "objeto" TEXT NOT NULL,
    "categoria" TEXT,
    "numeroAta" TEXT,
    "vigenciaFim" TIMESTAMP(3),
    "responsavelId" TEXT,
    "proximoContatoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "motivoPerda" TEXT,
    "ataId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "captacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacoes_captacao" (
    "id" TEXT NOT NULL,
    "captacaoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interacoes_captacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contatos_empresa" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "telefone" TEXT,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "comoObteve" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contatos_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "captacoes_numeroControlePncpAta_key" ON "captacoes"("numeroControlePncpAta");

-- CreateIndex
CREATE UNIQUE INDEX "captacoes_ataId_key" ON "captacoes"("ataId");

-- CreateIndex
CREATE INDEX "captacoes_estagio_idx" ON "captacoes"("estagio");

-- CreateIndex
CREATE INDEX "captacoes_responsavelId_idx" ON "captacoes"("responsavelId");

-- CreateIndex
CREATE INDEX "captacoes_fornecedorCnpj_idx" ON "captacoes"("fornecedorCnpj");

-- CreateIndex
CREATE INDEX "interacoes_captacao_captacaoId_idx" ON "interacoes_captacao"("captacaoId");

-- CreateIndex
CREATE INDEX "contatos_empresa_cnpj_idx" ON "contatos_empresa"("cnpj");

-- AddForeignKey
ALTER TABLE "interacoes_captacao" ADD CONSTRAINT "interacoes_captacao_captacaoId_fkey" FOREIGN KEY ("captacaoId") REFERENCES "captacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
