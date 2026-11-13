-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cargo" TEXT,
ADD COLUMN     "permissoes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- As contas que já existiam eram administradoras completas: ninguém perde acesso.
UPDATE "admins" SET "permissoes" = ARRAY[
    'atas.captar',
    'atas.contrato',
    'atas.conformidade',
    'atas.aprovar',
    'atas.publicar',
    'municipios.liberar',
    'adesao.instruir',
    'adesao.declarar',
    'adesao.registrar',
    'adesao.acompanhar',
    'comissao.cobrar',
    'base.editar',
    'usuarios.gerir'
]::TEXT[];
