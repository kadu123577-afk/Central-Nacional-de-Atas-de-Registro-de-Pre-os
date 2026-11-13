-- Feriados extras da equipe (passo 4 do plano do workflow): somam aos feriados nacionais
-- (calculados no código) na contagem de prazos em dias úteis.
CREATE TABLE "feriados" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feriados_data_key" ON "feriados"("data");
