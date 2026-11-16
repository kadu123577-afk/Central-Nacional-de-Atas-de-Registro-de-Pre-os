# Robô do raio-X: levantar o consumo dos municípios, até o Brasil todo

**Instrução permanente deixada por Carlos Eduardo em 15/11/2026.** Quem rodar o robô (uma pessoa, uma tarefa agendada ou o Claude) segue este roteiro.

## A missão

1. **Terminar os 1.250 municípios** que já estão na base: levantar o histórico de consumo (o que cada prefeitura contratou, de quem, de quê, por quanto) e o raio-X de consumo por categoria.
2. **Depois, ampliar por ondas, estado por estado, até o Brasil todo** (5.570 municípios, segundo o IBGE), repetindo o mesmo ciclo.

O raio-X é o que diz ao consultor onde há consumo: a tela do consultor estima o valor em aberto de cada município pelo histórico de consumo da categoria da ata. Sem o raio-X do município, a estimativa fica em branco.

## Onde está cada peça

O trabalho usa duas pastas do projeto, que apontam para o mesmo banco local (`central_atas`):

| Pasta | O que tem |
|---|---|
| `cnarp-integracao` (o sistema vivo) | os scripts que mexem no **banco**: ampliar a lista de municípios, achar o CNPJ e calcular o raio-X de consumo (`prisma/`) |
| `Central-Nacional-de-Atas-de-Registro-de-Pre-os` | a **coleta bruta** em lote (`scripts/coleta/`), com os dados em `dados-coletados/` (fora do git) |

## Onde estávamos em 15/11/2026

| O quê | Situação |
|---|---|
| Municípios na base | **1.250** (todos com CNPJ da prefeitura) |
| Raio-X de consumo no banco | **1.073 feitos**; faltam os **177** de Goiás que entraram depois (CNPJ já está, falta rodar) |
| Coleta bruta, SICONFI (despesa por função) | **1.250 de 1.250, concluída** |
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
   O script consulta o IBGE, cadastra só os municípios que faltam (a chave é o código IBGE, então repetir não duplica) e mostra quantos entraram por estado. `UF=todas` percorre todos os estados, menos o DF. Opcionais: `MIN_POP`, `MAX_POP` e `LIMITE` (os mais populosos primeiro).
2. **CNPJ da prefeitura**, pelo SICONFI (mesma pasta):
   ```bash
   npx tsx --env-file=.env prisma/enriquecer-cnpj-municipios.ts
   ```
   O SICONFI cobre cerca de 5.496 dos 5.570 municípios. Os que ficarem sem CNPJ não entram no raio-X até alguém achar o CNPJ; liste-os no relatório.
3. **Raio-X de consumo no banco** (mesma pasta). Teste com uma amostra e depois rode tudo:
   ```bash
   LIMITE=50 npx tsx --env-file=.env prisma/levantar-raio-x-consumo-lote.ts
   npx tsx --env-file=.env prisma/levantar-raio-x-consumo-lote.ts
   ```
   É resumível: pula município atualizado há menos de 30 dias e, se um município falhar, segue para o próximo e registra no resumo.
4. **Coleta bruta** (pasta `Central-Nacional-de-Atas-de-Registro-de-Pre-os`):
   ```powershell
   npx tsx scripts/coleta/exportar-alvos.ts
   powershell -ExecutionPolicy Bypass -File scripts\coleta\rodar-coleta.ps1
   node scripts/coleta/status.mjs
   ```
   Roda fora do Claude, continua se a sessão fechar e retoma de onde parou se o computador desligar: basta rodar de novo o segundo comando.
5. **Dossiês profundos por pesquisa** (os agentes): **só para os municípios prioritários e só quando Carlos pedir.** Custam muito do limite de uso do Claude. A coleta bruta e o raio-X acima já cobrem todos os municípios sem gastar esse limite.

## Ordem sugerida das ondas

Carlos pode reordenar.

0. **Fechar os 1.250:** rodar o raio-X dos 177 de Goiás e terminar a coleta bruta dos que faltam.
1. **Completar os estados que já estão na base:** MG, BA, MA, PA, PR, AM, MT, PI, MS, TO (Goiás já está inteiro).
2. **Sudeste e Sul:** SP, RJ, ES, SC, RS.
3. **Nordeste restante:** CE, PE, PB, RN, AL, SE.
4. **Norte restante:** RO, AC, RR, AP.
5. **Distrito Federal:** à parte (Brasília é órgão distrital, não prefeitura).

O primeiro lote excluiu as capitais e os municípios acima de 250 mil habitantes. **Nas ondas novas eles entram**: o objetivo agora é o Brasil todo.

## Regras que não mudam

- **Não inventar dado.** O que não foi encontrado fica em branco e entra no relatório.
- **Respeitar as fontes.** O PNCP responde 429 quando recebe chamadas demais: o coletor espera cerca de 1 segundo entre chamadas e pausa mais a cada 429. Não aumente a velocidade.
- **Nada de dados coletados no git.** `dados-coletados/` fica fora do repositório (que é público). Lista de prefeitos, contatos, celulares, CPF e nascimento **nunca** vão para o repositório.
- **Só dados públicos.** O ciclo usa PNCP, Compras.gov.br, SICONFI, IBGE e diários oficiais.
- **Resumível e repetível.** Todo passo pode ser repetido sem estragar o que já foi feito.
- **Disco.** Confira o espaço livre antes de cada onda. Estimativa: o Brasil todo pode passar de 15 GB (as cidades grandes têm muito mais contratos que as do primeiro lote).
- **Tempo.** Só a coleta de contratos do PNCP levou cerca de 26 horas para os primeiros 1.073 municípios, e as cidades grandes tendem a demorar mais. Programe por ondas, não de uma vez.

## Como saber que uma onda terminou

- No banco, todos os municípios do estado têm CNPJ e o raio-X rodado (`raioXAtualizadoEm` preenchido). Os sem CNPJ estão listados.
- Em `node scripts/coleta/status.mjs`, as cinco fontes aparecem como concluídas para o estado, ou com a pendência explicada.
- Pelo menos uma conferência por amostra: abra 3 municípios do estado em `/admin/entidades` e veja se o histórico de consumo aparece.

## O que informar a Carlos ao fim de cada onda

Estado trabalhado, quantos municípios entraram, quantos têm raio-X, quantos ficaram sem CNPJ ou com pendência (com os nomes), espaço em disco e o tempo gasto. Sem enfeite.

## Limites conhecidos

- O PNCP e o Compras.gov.br aceitam janelas de no máximo 1 ano por consulta.
- Antes de 2023 (Lei 8.666) há pouca coisa no PNCP; esse período depende dos diários oficiais e dos tribunais de contas.
- A coleta de diários oficiais (Querido Diário) cobre apenas parte dos municípios.
- Município sem CNPJ no SICONFI não entra no raio-X até o CNPJ ser encontrado por outra via.
