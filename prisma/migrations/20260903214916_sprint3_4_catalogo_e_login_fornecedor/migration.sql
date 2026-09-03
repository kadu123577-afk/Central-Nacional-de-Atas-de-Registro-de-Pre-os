-- AlterTable
ALTER TABLE "atas" ALTER COLUMN "status" SET DEFAULT 'APROVADA';

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "senhaHash" TEXT;
