-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "sessaoVersao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totpSegredo" TEXT,
ADD COLUMN     "totpAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpUltimoPasso" INTEGER;

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "sessaoVersao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orgaos" ADD COLUMN     "sessaoVersao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "vendedores" ADD COLUMN     "sessaoVersao" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tentativas_login" (
    "chave" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "janelaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueadoAte" TIMESTAMP(3),

    CONSTRAINT "tentativas_login_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ator" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "alvo" TEXT,
    "detalhe" TEXT,
    "ip" TEXT,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logs_auditoria_criadoEm_idx" ON "logs_auditoria"("criadoEm");

-- CreateIndex
CREATE INDEX "logs_auditoria_ator_idx" ON "logs_auditoria"("ator");
