# Coleta em lote de dados públicos dos municípios-alvo

Levanta, para os 1.073 municípios de `EntidadeAlvo`, o histórico público de contratações e o contexto financeiro, e guarda tudo em `dados-coletados/` (fora do git).

## Fontes automáticas (scripts, não usam o Claude)

| Fonte | O que traz | Script |
|---|---|---|
| `pncp` | contratos (com fornecedor, valor e vigência), atas de registro de preços e Plano de Contratações Anual, por CNPJ, de 2021 em diante | `coletar.mjs pncp` |
| `compras` | contratações (pregões eletrônicos e presenciais, dispensas, inexigibilidades e concorrências) no Compras.gov.br dados abertos, 2023 em diante, de todos os órgãos do município (prefeitura, Câmara, fundos, autarquias), pelo código IBGE | `coletar.mjs compras` |
| `pncp-orgaos` | contratos e atas dos outros órgãos do município (fundos de saúde e educação, Câmara, autarquias, previdência), a partir dos CNPJs que aparecem nas contratações; roda depois de `compras` para cada município | `coletar.mjs pncp-orgaos` |
| `siconfi` | despesa por função (saúde, educação, etc.) e balanço orçamentário (DCA), últimos 5 exercícios | `coletar.mjs siconfi` |
| `diarios` | trechos de diários oficiais com atas, pregões, dispensas, inexigibilidades, adesões, extratos de contrato e PCA (Querido Diário; cobre ~20% dos alvos) | `coletar.mjs diarios` |

Cada fonte grava um município de cada vez e marca no estado o que já terminou. Se o processo cair, a próxima execução continua de onde parou (perde, no máximo, a consulta em andamento).

## Como usar

```powershell
# 1. gerar a lista de alvos (uma vez, ou quando mudar a base)
npx tsx scripts/coleta/exportar-alvos.ts

# 2. iniciar ou retomar todas as fontes em segundo plano (pode rodar quantas vezes quiser)
powershell -ExecutionPolicy Bypass -File scripts\coleta\rodar-coleta.ps1

# 3. acompanhar
node scripts/coleta/status.mjs
```

Os processos rodam fora do Claude: continuam se a sessão fechar ou o limite de uso acabar. Se o computador desligar ou suspender, basta rodar o passo 2 de novo (ou deixar uma tarefa agendada do Windows fazendo isso).

## Onde ficam os dados

- `dados-coletados/<fonte>/<UF>/<ibge>.ndjson`: uma linha por registro (`{"chave": "contratos:2025", "dado": {...}}`), no formato original da API.
- `dados-coletados/_estado/`: progresso por fonte e município.
- `dados-coletados/_logs/`: log de cada fonte.
- `dados-coletados/agentes/`: arquivos salvos pelos agentes de pesquisa (mapa de fontes por UF e dossiês por município, com verificação).

## Limites conhecidos

- O PNCP devolve 429 a partir de ~10 chamadas em poucos segundos; o coletor espera ~1 s entre chamadas e pausa mais a cada 429.
- As consultas do PNCP e do Compras.gov.br aceitam janelas de no máximo 1 ano.
- Antes de 2023 (Lei 8.666), pouca coisa está no PNCP; esse período depende dos diários oficiais e dos tribunais de contas estaduais (mapeados pelos agentes em `agentes/mapa-uf/`).
