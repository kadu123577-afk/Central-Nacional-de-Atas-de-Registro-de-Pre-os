# Robô do raio-X: levantar e SALVAR o consumo de cada município, para o match com as atas

**Instrução permanente deixada por Carlos Eduardo em 15 e 16/11/2026.** Quem rodar o robô (uma pessoa, uma tarefa agendada ou o Claude) segue este roteiro.

## Para que serve

O robô levanta **o que cada município consome** (o que contrata, de quê, por quanto, de quem, até quando) e **salva esse consumo no banco**. Com isso o sistema monta o **panorama do que seria mais fácil de vender**: um **match**, em que **cada município tem seus possíveis pares de ata**, dos mais prováveis para os menos. É o que o consultor e a Gestão usam para decidir por onde começar.

Resumindo o fluxo: **consumo do município → salvo no banco → cruzado com as atas do catálogo → panorama de vendas** (tela `/admin/panorama`, da Gestão).

## A missão

1. **Terminar os 1.250 municípios** que já estão na base, com o consumo salvo para cada um.
2. **Depois, ampliar por ondas, estado por estado, até o Brasil todo** (5.570 municípios, segundo o IBGE), repetindo o mesmo ciclo. Quanto mais municípios com consumo salvo, mais pares o panorama mostra.

## O que o robô tem de salvar, por município e por categoria

Tabela `historico_consumo_categoria` (uma linha por município e categoria):

| Campo | O que é |
|---|---|
| `valorTotalNaJanela` e `janelaMeses` | quanto o município gastou na categoria nos últimos 36 meses |
| `quantidadeContratosNaJanela` | quantos contratos |
| `primeiraContratacao`, `ultimaContratacao`, `valorUltimaContratacao`, `objetoUltimaContratacao` | o histórico e o último contrato |
| `vigenciaFimMaisRecente` | quando o consumo precisa ser renovado (o contrato que vence por último) |
| `fornecedoresDistintos`, `orgaosDistintos` | com quantos fornecedores e órgãos (prefeitura, fundos de saúde e educação, câmara, autarquias) |
| `contratosPorAdesao` | quantos contratos nasceram de adesão a ata (o município já compra por carona) |

Só entram contratos de despesa (contrato de receita fica de fora), e cada contrato conta uma vez só.

## Onde está cada peça

O trabalho usa duas pastas do projeto, que apontam para o mesmo banco local (`central_atas`):

| Pasta | O que tem |
|---|---|
| `cnarp-integracao` (o sistema vivo) | os scripts que mexem no **banco** (`prisma/`) e o **panorama** (`/admin/panorama`, regras em `src/lib/panorama.ts`) |
| `Central-Nacional-de-Atas-de-Registro-de-Pre-os` | a **coleta bruta** em lote (`scripts/coleta/`), com os dados em `dados-coletados/` (fora do git) |

## Onde estávamos em 16/11/2026

| O quê | Situação |
|---|---|
| Municípios na base | **1.250** (todos com CNPJ da prefeitura) |
| Consumo salvo no banco | **882 municípios** com consumo nas categorias conhecidas, **7.524 linhas**; **236 sem arquivo de coleta** ainda (a coleta bruta não chegou neles) e alguns sem nada que se encaixe nas categorias |
| Panorama | 8 atas no catálogo e 3.187 pares com os dados atuais |
| Coleta bruta, SICONFI | **1.250 de 1.250, concluída** |
| Coleta bruta, PNCP (contratos e atas) | 1.089 de 1.250 |
| Coleta bruta, Compras.gov.br | 1.109 de 1.250 |
| Coleta bruta, PNCP dos outros órgãos do município | 1.072 de 1.250 |
| Coleta bruta, diários oficiais | 1.244 de 1.250 |
| Disco | 2,9 GB em `dados-coletados`, 52 GB livres |

A coleta bruta ficou **pausada em 04/11/2026**. Esta instrução a retoma. Os números mudam: confira com `node scripts/coleta/status.mjs`.

## O ciclo de uma onda

Cada onda é um estado (ou um grupo de estados). Faça os passos **nesta ordem** e só passe ao seguinte quando o anterior terminar.

1. **Ampliar a lista de municípios** (pasta `cnarp-integracao`). Primeiro simule, depois grave:
   ```bash
   UF=MG npx tsx --env-file=.env prisma/ampliar-municipios.ts
   UF=MG APLICAR=1 npx tsx --env-file=.env prisma/ampliar-municipios.ts
   ```
   Consulta o IBGE e cadastra só os municípios que faltam (a chave é o código IBGE, repetir não duplica). `UF=todas` percorre todos os estados, menos o DF. Opcionais: `MIN_POP`, `MAX_POP`, `LIMITE`.
2. **CNPJ da prefeitura**, pelo SICONFI (mesma pasta):
   ```bash
   npx tsx --env-file=.env prisma/enriquecer-cnpj-municipios.ts
   ```
   Cobre cerca de 5.496 dos 5.570 municípios. Os sem CNPJ ficam de fora do raio-X: liste-os no relatório.
3. **Coleta bruta** (pasta `Central-Nacional-de-Atas-de-Registro-de-Pre-os`):
   ```powershell
   npx tsx scripts/coleta/exportar-alvos.ts
   powershell -ExecutionPolicy Bypass -File scripts\coleta\rodar-coleta.ps1
   node scripts/coleta/status.mjs
   ```
   Roda fora do Claude, continua se a sessão fechar e retoma de onde parou: basta rodar de novo o segundo comando.
4. **Salvar o consumo no banco** (pasta `cnarp-integracao`). Lê o que a coleta baixou, sem usar a internet, e grava o consumo detalhado de todos os órgãos do município. Simule, depois grave:
   ```bash
   UF=MG npx tsx --env-file=.env prisma/consolidar-consumo-coleta.ts
   UF=MG APLICAR=1 npx tsx --env-file=.env prisma/consolidar-consumo-coleta.ts
   ```
   Sem `UF`, faz todos. Rode de novo sempre que a coleta avançar: é repetível e só atualiza.
5. **Raio-X simples pelo PNCP**, para os municípios que a coleta bruta ainda não cobriu (mesma pasta):
   ```bash
   LIMITE=50 npx tsx --env-file=.env prisma/levantar-raio-x-consumo-lote.ts
   npx tsx --env-file=.env prisma/levantar-raio-x-consumo-lote.ts
   ```
   É resumível: pula município atualizado há menos de 30 dias.
6. **Conferir o panorama:** abra `/admin/panorama` (entrando como Gestão), filtre pelo estado da onda e veja se os pares fazem sentido (ver "Como conferir").
7. **Dossiês profundos por pesquisa** (os agentes): **só para os municípios prioritários e só quando Carlos pedir.** Custam muito do limite de uso do Claude. Os passos 1 a 6 já cobrem todos os municípios sem gastar esse limite.

## Como o match funciona (para quem for conferir)

Para cada par município e ata **da mesma categoria**, a nota vai de 0 a 100 (tabela `PESOS` em `src/lib/panorama.ts`):

- já consome a categoria: 35 pontos de base;
- quanto gasta por ano na categoria: de 4 a 25 pontos;
- recorrência (contratos na janela): até 10 pontos;
- **contrato vencendo nos próximos 180 dias: 20 pontos** (é a hora de oferecer); venceu há pouco: 14; sem contrato há mais de um ano: 6;
- já comprou por adesão a ata: 10 pontos;
- ata de órgão municipal: −5 e aviso (só serve se o registro de preços nasceu de licitação, art. 86, § 3º, II); esfera do gerenciador não confirmada: −30 e aviso.

Níveis: **muito provável** (75 ou mais), **provável** (55 a 74) e **possível**. Empate na nota: vence quem tem o contrato vencendo mais perto. Só entram atas liberadas, com contrato e vigentes. Os pares que já estão em negociação ou aderidos ficam de fora, a não ser que se marque "incluir os já em andamento".

**Atenção ao valor do consumo.** A categoria vem de palavras-chave do objeto do contrato. Em "material de construção", por exemplo, podem entrar obras grandes. Quando o consumo passa de R$ 20 milhões por ano o panorama avisa. Se muitos pares tiverem esse aviso, o classificador (`src/lib/classificador-objeto.ts`) precisa de ajuste antes de a nota ser levada a sério.

## Ordem sugerida das ondas

Carlos pode reordenar.

0. **Fechar os 1.250:** terminar a coleta bruta dos que faltam (principalmente os 177 de Goiás) e rodar o passo 4 de novo.
1. **Completar os estados que já estão na base:** MG, BA, MA, PA, PR, AM, MT, PI, MS, TO (Goiás já está inteiro).
2. **Sudeste e Sul:** SP, RJ, ES, SC, RS.
3. **Nordeste restante:** CE, PE, PB, RN, AL, SE.
4. **Norte restante:** RO, AC, RR, AP.
5. **Distrito Federal:** à parte (Brasília é órgão distrital, não prefeitura).

O primeiro lote excluiu as capitais e os municípios acima de 250 mil habitantes. **Nas ondas novas eles entram**: o objetivo é o Brasil todo.

## Regras que não mudam

- **Não inventar dado.** O que não foi encontrado fica em branco e entra no relatório.
- **Respeitar as fontes.** O PNCP responde 429 quando recebe chamadas demais: o coletor espera cerca de 1 segundo entre chamadas e pausa mais a cada 429. Não aumente a velocidade.
- **Nada de dados coletados no git.** `dados-coletados/` fica fora do repositório (que é público). Lista de prefeitos, contatos, celulares, CPF e nascimento **nunca** vão para o repositório.
- **Só dados públicos.** O ciclo usa PNCP, Compras.gov.br, SICONFI, IBGE e diários oficiais.
- **Resumível e repetível.** Todo passo pode ser repetido sem estragar o que já foi feito.
- **Disco.** Confira o espaço livre antes de cada onda. Estimativa: o Brasil todo pode passar de 15 GB (as cidades grandes têm muito mais contratos que as do primeiro lote).
- **Tempo.** Só a coleta de contratos do PNCP levou cerca de 26 horas para os primeiros 1.073 municípios, e as cidades grandes tendem a demorar mais. Programe por ondas, não de uma vez.

## Como saber que uma onda terminou

- No banco, todos os municípios do estado têm CNPJ e consumo salvo (o painel `/admin/panorama` mostra "Sem consumo salvo"). Os que ficaram sem CNPJ ou sem arquivo de coleta estão listados.
- Em `node scripts/coleta/status.mjs`, as cinco fontes aparecem como concluídas para o estado, ou com a pendência explicada.
- Conferência por amostra: abra 3 municípios do estado em `/admin/entidades` e veja se o histórico de consumo aparece, e olhe os pares do estado no panorama.

## O que informar a Carlos ao fim de cada onda

Estado trabalhado, quantos municípios entraram, quantos têm consumo salvo, quantos ficaram sem CNPJ ou com pendência (com os nomes), quantos pares novos o panorama mostrou, espaço em disco e o tempo gasto. Sem enfeite.

## Limites conhecidos

- O PNCP e o Compras.gov.br aceitam janelas de no máximo 1 ano por consulta.
- Antes de 2023 (Lei 8.666) há pouca coisa no PNCP; esse período depende dos diários oficiais e dos tribunais de contas.
- A coleta de diários oficiais (Querido Diário) cobre apenas parte dos municípios.
- Município sem CNPJ no SICONFI não entra até o CNPJ ser encontrado por outra via.
- O consumo salvo vem só do PNCP. Compras que o município faz fora do PNCP não aparecem.
