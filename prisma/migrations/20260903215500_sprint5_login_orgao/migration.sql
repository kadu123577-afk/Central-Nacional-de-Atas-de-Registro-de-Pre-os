-- AlterTable
ALTER TABLE "orgaos" ADD COLUMN "email" TEXT,
ADD COLUMN "senhaHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orgaos_email_key" ON "orgaos"("email");
