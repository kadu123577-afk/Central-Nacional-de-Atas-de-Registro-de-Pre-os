-- CreateTable
CREATE TABLE "pontos_focais" (
    "id" TEXT NOT NULL,
    "esfera" TEXT NOT NULL,
    "uf" TEXT,
    "municipio" TEXT,
    "cargo" TEXT NOT NULL,
    "nomeContato" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "particularidades" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pontos_focais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacoes_ponto_focal" (
    "id" TEXT NOT NULL,
    "pontoFocalId" TEXT NOT NULL,
    "ataId" TEXT,
    "resultado" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "interacoes_ponto_focal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parceiros" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "contato" TEXT NOT NULL,
    "categoriasInteresse" TEXT[],
    "ufsInteresse" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "parceiros_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "interacoes_ponto_focal" ADD CONSTRAINT "interacoes_ponto_focal_pontoFocalId_fkey" FOREIGN KEY ("pontoFocalId") REFERENCES "pontos_focais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes_ponto_focal" ADD CONSTRAINT "interacoes_ponto_focal_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "atas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

