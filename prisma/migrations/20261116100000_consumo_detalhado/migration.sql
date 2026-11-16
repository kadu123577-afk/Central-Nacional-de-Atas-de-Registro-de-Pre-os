-- Consumo detalhado por municipio e categoria (panorama de vendas). Tudo opcional: as linhas do
-- raio-X simples continuam valendo e so ganham estas colunas quando a coleta e consolidada.
ALTER TABLE "historico_consumo_categoria"
  ADD COLUMN "valorTotalNaJanela" DECIMAL(16,2),
  ADD COLUMN "janelaMeses" INTEGER,
  ADD COLUMN "primeiraContratacao" TIMESTAMP(3),
  ADD COLUMN "vigenciaFimMaisRecente" TIMESTAMP(3),
  ADD COLUMN "fornecedoresDistintos" INTEGER,
  ADD COLUMN "orgaosDistintos" INTEGER,
  ADD COLUMN "contratosPorAdesao" INTEGER,
  ADD COLUMN "origemDados" TEXT;
