-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "senhaProvisoria" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN     "senhaProvisoria" BOOLEAN NOT NULL DEFAULT false;
