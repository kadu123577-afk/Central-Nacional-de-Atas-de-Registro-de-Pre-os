# Plano de ação — Fase 2 (design do Kanban e dossiê do município)

Base: demo aprovado em 2026-10-04 (Kanban com card de decisor + gaveta "Quem falar").
Execução em 2º plano, **uma etapa por vez, nesta ordem** (as etapas mexem nos mesmos
arquivos; paralelizar geraria conflito). Cada etapa termina com: typecheck, lint, testes,
`next build`, conferência no navegador local (dados de teste temporários, removidos no fim),
**commit + push** na branch `claude/new-session-is28el`.

## Regras de execução (valem para todas as etapas)
- Antes de escrever código Next.js: consultar `node_modules/next/dist/docs/` (AGENTS.md avisa que esta versão tem mudanças).
- Não tocar em `package-lock.json`, `achar.sql`, `apagar.sql`.
- Commit com identidade só no comando (`-c user.name/user.email`), sem alterar config do git. Mensagem termina com a linha Co-Authored-By.
- Arquivos do projeto têm CRLF: editar normalizando `\r\n` → `\n` e voltando (evita diff de arquivo inteiro).
- Migrations manuais em `prisma/migrations/<timestamp>_<nome>/migration.sql`, aplicadas com `prisma migrate deploy` + `prisma generate`.
- Reaproveitar o que existe: `Cifra`, `Badge`, `Secao`, `AppShell`, tokens de `globals.css`. Sem biblioteca nova de UI.
- Regra de dados: nunca mostrar na tela um dado sem data/fonte quando o campo existir; "vazio com ação" no lugar de dado inventado.
- Sigilo: vendedor só vê os próprios municípios (já garantido nas consultas).
- Fim de cada etapa: atualizar `NOTAS-ALTERACOES.md` (seção da etapa) e reportar o que foi verificado e o que não foi.

## Etapa 1 — Card novo e cabeçalho de coluna
Entrega: o card do demo com os dados que **já existem**.
- `src/lib/urgencia.ts` (puro + teste): prazo → `hoje | critico (≤3d) | atencao (≤7d) | ok | sem_prazo`, rótulo ("Prazo hoje", "Prazo 4 dias") e cor.
- `src/lib/decisores.ts` (puro + teste): escolhe o **decisor principal** do município por ordem de cargo conforme a categoria da ata (ex.: educação → Sec. Educação; saúde → Sec. Saúde; demais → Sec. Administração/Finanças; fallback Prefeito).
- Card (`cartao-oportunidade.tsx`): borda por urgência, selo de prazo, decisor com botões `tel:`/`mailto:`/WhatsApp (`wa.me`, só para telefone que parece celular), linha **"por que agora"** derivada do que temos (raio-X: "última contratação desta categoria há X meses"; observação do vendedor; prazo), rodapé com frescor do contato (usa `PontoFocal.updatedAt` por ora) e valor.
- Estado "sem decisor com canal": faixa tracejada amarela "Buscar contato".
- Cartão de coluna "Aderiu": valor aderido, liquidado (soma), barra de progresso, comissão a receber.
- Cabeçalho de coluna: contagem + soma de valor (aderido nas colunas finais).
- Aceite: Kanban de uma ata de teste mostra os 3 tipos de card; sem regressão no fluxo de mover estágio/erros (testes da conferência anterior).

## Etapa 2 — Gaveta do município (dossiê v1)
- Componente cliente de gaveta lateral (abre ao clicar no card; Kanban continua visível; fecha com Esc/clique fora). Abas: **Quem falar · Necessidade · Contexto · Histórico**.
- Quem falar: decisores em ordem de abordagem (principal / compra de fato / aprovação), canais clicáveis, "atualizado há X dias". Botão **Registrar contato** (action do vendedor → `InteracaoPontoFocal`).
- Necessidade: raio-X por categoria (já existe) com valor e data da última contratação.
- Contexto: espaço reservado ("sem dados ainda") — preenchido na Etapa 4/coleta.
- Histórico: interações por contato + mudanças de estágio.
- Bloco "Abordagem sugerida": texto-modelo por cargo × categoria da ata (arquivo de templates em `src/lib/abordagem.ts`, com teste); sem IA nesta fase.
- Aceite: abrir/fechar gaveta, registrar contato e vê-lo no histórico; mover para "Aderiu" a partir da gaveta com o mesmo fluxo de validação.

## Etapa 3 — Painel do vendedor e filtros
- Indicadores no topo do Kanban e do dashboard: Aderido, Em negociação (potencial), Prazos vencendo, Sem decisor com contato.
- Chips de filtro (client-side): Todos · Precisam de ação hoje · Com sinal · Sem contato.
- Alternância **Kanban / Lista** (tabela ordenável por prazo/valor).
- Dashboard: funil por valor entre estágios e lista "o que fazer hoje".
- Aceite: números batem com o banco (conferência por consulta), filtros não escondem cards por engano.

## Etapa 4 — Base de dados para a "tomografia" (sem coletores ainda)
- Schema (migration): em `PontoFocal` → `papel` (principal/compra/aprovacao), `fonte`, `fonteUrl`, `confianca` (1–3), `verificadoEm`, `contatoErradoEm`; novo `SinalMunicipio` (entidade, tipo, título, detalhe, fonte, fonteUrl, dataSinal, valorEstimado, categoria, expiraEm).
- Card/gaveta passam a usar `verificadoEm`/`confianca` reais e os sinais como "por que agora".
- Ação **"contato errado"** (vendedor marca; admin vê fila de revisão) e **"falei com sucesso"** (atualiza verificadoEm).
- Importadores em lote no estilo dos existentes (`prisma/importar-sinais.ts`, extensão do importador de contatos para os campos novos) — é por onde os coletores futuros vão alimentar.
- Admin: tela simples de revisão de contatos marcados como errados.
- Aceite: importar um CSV de teste de sinais/contatos e ver nas telas; marcar erro e ver na fila.

## Fora desta fase (próxima: coleta)
Coletores (PCA/PNCP, licitações abertas, diários oficiais, sites das prefeituras), extração por IA e revisão por amostra; piloto em Goiás. Fica para depois que o design estiver validado em uso.

## Decisões em aberto (assumidas até você dizer o contrário)
- Desktop-first; em celular, gaveta em tela cheia e colunas com rolagem horizontal.
- Gestor (admin) usa as mesmas telas só pelo painel de recebíveis/negociações por enquanto.
- Sem IA na "abordagem sugerida" nesta fase (modelos de texto fixos).

## Riscos
- Dado de contato escasso (hoje 52 telefones e 39 e-mails em 584 contatos): muitos cards cairão em "Buscar contato" até a coleta rodar.
- Edição de arquivos com CRLF e Next.js com mudanças: mitigados nas regras de execução.
- Etapa 4 altera o schema: aplicar migration no banco local e conferir `prisma migrate status` ao fim.

## Execução da Etapa 4 (2026-10-05) — como ficou
- `PontoFocal`: `fonte`, `fonteUrl`, `confianca` (1–3), `verificadoEm`, `contatoErradoEm/PorId/Motivo`. Backfill (`prisma/backfill-contatos-fonte.ts`, idempotente, usa SQL direto pra não mexer em `updatedAt`) preencheu fonte/confiança de 162 dos 584 contatos a partir do texto livre; o texto original foi mantido.
- Novo `SinalMunicipio` (tipo, título, fonte, categoria, valor, data, validade). O sinal mais relevante vira a linha "por que agora" do card e o chip "Com sinal de compra" passou a contar sinais de verdade.
- Vendedor: "Confirmar contato" e "Contato errado" na gaveta; registrar conversa de verdade (em conversa/converteu/recusou) confirma o contato. Contato errado deixa de ser sugerido como decisor.
- Admin: `/admin/contatos-revisao` (manter / corrigir / desativar), cadastro de sinais na ficha do município, importador `prisma/importar-sinais.ts` (dry-run, idempotente) e `enriquecer-contatos-prefeituras.ts` agora grava fonte/confiança estruturadas. Menu do admin unificado em `src/app/admin/nav.ts`.

## Execução do lado do Adm e dos Municípios (2026-10-05) — como ficou
- **Menu do admin** agrupado (Operação / Financeiro / Cadastros / Conta) com item ativo também nas páginas filhas (`AppShell` ganhou `grupo` e `ativoEm`).
- **Painel**: "Fila de ação" (atas a analisar, pedidos de negociação, atas aprovadas sem contrato, contatos errados, comissões a cobrar, prazos vencendo), indicadores do canal de vendedores, funil, por vendedor e atas aguardando moderação com chips de conformidade e contrato. O canal de autoatendimento dos órgãos desceu para o fim.
- **Pipeline do gestor** (`/admin/pipeline`, novo): Kanban de todos os vendedores com filtros por vendedor/ata/UF, indicadores e resumo por vendedor valendo para o filtro inteiro, teto de 300 cards (mais urgentes primeiro), dossiê somente leitura. Componentes do Kanban movidos para `src/components/kanban/` e carregamento em lote em `src/lib/kanban-db.ts`.
- **Negociações**: indicadores, contexto por pedido (já contratou a categoria? tem decisor com contato? já está com outro vendedor?) e lista só dos estágios em aberto; o conflito de município usa consulta própria (não depende do teto da lista).
- **Recebíveis**: 5 indicadores da cascata, filtros (a cobrar / aguardando 1ª nota / quitadas), barra de liquidação e selos de cobrança por adesão.
- **Análise da ata**: painel de prontidão (conformidade, contrato, aprovação, visível ao vendedor). **Usuários**: resumo de pipeline por vendedor.
- **Vendedor › Municípios**: base de contatos com indicadores de cobertura, filtros (com contato / sem contato / com sinal / em negociação por mim), cobertura por cargo (prefeito, adm., saúde, educação) e dossiê do município com fonte/confiança/verificação dos contatos, sinais e raio-X.
- Pequenos acabamentos: iniciais do avatar ignoram aspas/parênteses (`iniciais()` em `src/lib/formato.ts`).
