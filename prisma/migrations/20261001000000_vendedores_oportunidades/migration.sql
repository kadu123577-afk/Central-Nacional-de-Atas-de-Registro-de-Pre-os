-- AlterTable
ALTER TABLE "atas" ADD COLUMN     "vendedorId" TEXT;

-- CreateTable
CREATE TABLE "vendedores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vendedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidades_venda" (
    "id" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "entidadeAlvoId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "estagio" TEXT NOT NULL DEFAULT 'a_contatar',
    "observacoes" TEXT,
    "proximoContatoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "oportunidades_venda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendedores_email_key" ON "vendedores"("email");

-- CreateIndex
CREATE UNIQUE INDEX "oportunidades_venda_ataId_entidadeAlvoId_key" ON "oportunidades_venda"("ataId", "entidadeAlvoId");

-- AddForeignKey
ALTER TABLE "atas" ADD CONSTRAINT "atas_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades_venda" ADD CONSTRAINT "oportunidades_venda_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "atas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades_venda" ADD CONSTRAINT "oportunidades_venda_entidadeAlvoId_fkey" FOREIGN KEY ("entidadeAlvoId") REFERENCES "entidades_alvo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades_venda" ADD CONSTRAINT "oportunidades_venda_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

