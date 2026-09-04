-- CreateTable
CREATE TABLE "documentos_ata" (
    "id" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "documentos_ata_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "documentos_ata" ADD CONSTRAINT "documentos_ata_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "atas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

