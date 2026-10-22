-- CreateTable
CREATE TABLE "radar_atas" (
    "id" TEXT NOT NULL,
    "numeroControlePncpAta" TEXT NOT NULL,
    "orgaoCnpj" TEXT NOT NULL,
    "orgaoNome" TEXT NOT NULL,
    "uf" TEXT,
    "municipioNome" TEXT,
    "objeto" TEXT NOT NULL,
    "categoria" TEXT,
    "vigenciaInicio" TIMESTAMP(3),
    "vigenciaFim" TIMESTAMP(3) NOT NULL,
    "possibilidadeAdesao" BOOLEAN,
    "fornecedorCnpj" TEXT,
    "fornecedorNome" TEXT,
    "municipiosComDemanda" INTEGER NOT NULL DEFAULT 0,
    "pontuacao" INTEGER NOT NULL DEFAULT 0,
    "calculadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radar_atas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospeccao_fornecedores" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "estagio" TEXT NOT NULL DEFAULT 'identificado',
    "observacoes" TEXT,
    "proximoContatoEm" TIMESTAMP(3),
    "atasVigentes" INTEGER NOT NULL DEFAULT 0,
    "pontuacao" INTEGER NOT NULL DEFAULT 0,
    "categorias" TEXT,
    "ufs" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'radar',
    "atualizadoPorTipo" TEXT,
    "atualizadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospeccao_fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "radar_atas_numeroControlePncpAta_key" ON "radar_atas"("numeroControlePncpAta");

-- CreateIndex
CREATE INDEX "radar_atas_categoria_idx" ON "radar_atas"("categoria");

-- CreateIndex
CREATE INDEX "radar_atas_pontuacao_idx" ON "radar_atas"("pontuacao");

-- CreateIndex
CREATE INDEX "radar_atas_fornecedorCnpj_idx" ON "radar_atas"("fornecedorCnpj");

-- CreateIndex
CREATE INDEX "radar_atas_uf_idx" ON "radar_atas"("uf");

-- CreateIndex
CREATE UNIQUE INDEX "prospeccao_fornecedores_cnpj_key" ON "prospeccao_fornecedores"("cnpj");

-- CreateIndex
CREATE INDEX "prospeccao_fornecedores_estagio_idx" ON "prospeccao_fornecedores"("estagio");
