-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN "aguardaLiberacao" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orgaos" ADD COLUMN "aguardaLiberacao" BOOLEAN NOT NULL DEFAULT false;
