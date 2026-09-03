-- CreateEnum
CREATE TYPE "OrigemAta" AS ENUM ('MANUAL', 'PNCP');

-- AlterTable
ALTER TABLE "atas" ADD COLUMN     "numeroControlePncp" TEXT,
ADD COLUMN     "origem" "OrigemAta" NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "status" SET DEFAULT 'PENDENTE';

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "atas_numeroControlePncp_key" ON "atas"("numeroControlePncp");

