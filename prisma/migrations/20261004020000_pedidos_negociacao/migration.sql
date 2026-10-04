-- AlterTable
ALTER TABLE "oportunidades_venda" ADD COLUMN     "prazoEm" TIMESTAMP(3),
ADD COLUMN     "expiradaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pedidos_negociacao" (
    "id" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "entidadeAlvoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decididoEm" TIMESTAMP(3),

    CONSTRAINT "pedidos_negociacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedidos_negociacao_status_idx" ON "pedidos_negociacao"("status");

-- CreateIndex
CREATE INDEX "pedidos_negociacao_vendedorId_idx" ON "pedidos_negociacao"("vendedorId");

-- AddForeignKey
ALTER TABLE "pedidos_negociacao" ADD CONSTRAINT "pedidos_negociacao_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "atas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_negociacao" ADD CONSTRAINT "pedidos_negociacao_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "vendedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_negociacao" ADD CONSTRAINT "pedidos_negociacao_entidadeAlvoId_fkey" FOREIGN KEY ("entidadeAlvoId") REFERENCES "entidades_alvo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
