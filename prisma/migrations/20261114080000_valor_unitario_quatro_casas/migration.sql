-- O valor unitario do item passa a guardar ate quatro casas decimais (ex.: R$ 0,1005 por grama).
-- Os valores ja gravados (duas casas) nao mudam.
ALTER TABLE "itens" ALTER COLUMN "valorUnitario" TYPE DECIMAL(14,4);
