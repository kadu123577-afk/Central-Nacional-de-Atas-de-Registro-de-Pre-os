-- CreateTable
CREATE TABLE "faixas_comissao" (
    "id" TEXT NOT NULL,
    "valorMinimo" DECIMAL(16,2) NOT NULL,
    "percentual" DECIMAL(5,4) NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faixas_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credenciamentos_consultor" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "integridadeAceitaEm" TIMESTAMP(3),
    "integridadeVersao" INTEGER,
    "credenciadoEm" TIMESTAMP(3),
    "credenciadoPorId" TEXT,
    "suspensoEm" TIMESTAMP(3),
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credenciamentos_consultor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faixas_comissao_valorMinimo_key" ON "faixas_comissao"("valorMinimo");

-- CreateIndex
CREATE UNIQUE INDEX "credenciamentos_consultor_vendedorId_key" ON "credenciamentos_consultor"("vendedorId");

-- CreateIndex
CREATE INDEX "credenciamentos_consultor_status_idx" ON "credenciamentos_consultor"("status");

-- AddForeignKey
ALTER TABLE "credenciamentos_consultor" ADD CONSTRAINT "credenciamentos_consultor_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
