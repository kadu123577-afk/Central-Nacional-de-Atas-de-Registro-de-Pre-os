-- AlterTable
ALTER TABLE "pontos_focais" DROP COLUMN "esfera",
DROP COLUMN "municipio",
DROP COLUMN "uf",
ADD COLUMN     "area" TEXT,
ADD COLUMN     "entidadeAlvoId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "entidades_alvo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "esfera" TEXT,
    "uf" TEXT,
    "municipio" TEXT,
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "entidades_alvo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pontos_focais" ADD CONSTRAINT "pontos_focais_entidadeAlvoId_fkey" FOREIGN KEY ("entidadeAlvoId") REFERENCES "entidades_alvo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

