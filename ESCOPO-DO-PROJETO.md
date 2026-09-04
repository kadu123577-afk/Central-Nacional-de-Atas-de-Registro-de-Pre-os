# Escopo do Projeto — Central Nacional de Atas de Registro de Preços

**Documento vivo.** Atualizado a cada tela construída/confirmada — não é uma
foto única, é a referência que a gente consulta antes de discutir de novo
algo que já foi decidido. Toda vez que uma tela mudar de status ou uma
decisão nova for tomada, este arquivo é editado no mesmo commit.

**Última atualização:** 2026-09-04 · **Branch:** `claude/new-session-is28el`

---

## 1. Visão geral do produto

A Central Nacional de Atas conecta **órgãos públicos** a **atas de registro
de preços já existentes** de fornecedores, permitindo adesão ("carona") sem
precisar licitar do zero — amparado no **art. 86 da Lei 14.133/2021**.

**Modelo de negócio:** a Tech 10 Digital é a dona comercial da plataforma e
cobra **5% de taxa de intermediação exclusivamente do fornecedor**, no
momento em que uma adesão chega ao estágio `EMPENHADA`. O órgão público
nunca paga nada — é um contrato civil privado entre Tech 10 e fornecedor,
fora do instrumento de licitação.

**Trava legal automática (art. 86):** por item de ata,
- nenhum órgão aderente pode consumir mais de **50%** da quantidade
  originalmente registrada (§4º);
- a soma de todas as adesões não pode ultrapassar **200%** (o dobro) da
  quantidade registrada (§5º);
- a adesão só é elegível por **esfera federativa** (§§3º e 8º, achado da
  revisão de 2026-09-04, a partir do texto comentado da lei): órgão
  aderente federal só adere a ata gerenciada por federal; estadual/
  distrital adere a federal/estadual/distrital; municipal só adere a ata
  gerenciada por outro município. Ver `src/lib/esferas.ts`
  (`verificarElegibilidadeEsfera`, 11 testes) e §1.2 abaixo pro que
  **não** está coberto ainda (§§6º e 7º).

Essas travas são código, não confiança: `src/lib/saldo.ts`
(`verificarAdesao`) é chamada tanto pela ação real de pedido de adesão
quanto pelo seed de demonstração — se a conta recusaria um pedido de
verdade, o seed também falha, em vez de gravar um estado que o sistema
nunca permitiria. A trava de esfera (`verificarElegibilidadeEsfera`) só
é chamada de fato dentro da ação real (`solicitarAdesao`), já que o seed
cria adesão direto no banco (`criarAdesaoProgredida`, sem passar pela
ação) — mas o **dado** do seed foi corrigido à mão pra respeitar a mesma
regra (cada adesão de demonstração usa um órgão aderente de esfera
compatível com o órgão gerenciador da ata), depois que o usuário apontou
que um dado de demonstração contradizendo a própria regra do sistema não
é aceitável.

### 1.1 Atores do sistema

| Ator | O que faz | Precisa de login? |
|---|---|---|
| **Público (visitante)** | Navega o catálogo, busca item, vê detalhe de ata | Não |
| **Fornecedor** | Cadastra atas, acompanha pedidos de adesão recebidos | Sim |
| **Órgão público (município/estado/federal)** | Busca ata, pede adesão, acompanha estágio do pedido | Sim |
| **Admin (Tech 10)** | Modera atas pendentes, controla faturamento, (futuro: gestão de usuários) | Sim |

### 1.2 Decisões técnicas registradas

Decisões que já foram tomadas e não precisam ser rediscutidas:

- **`isSeed: boolean`** em Admin/Fornecedor/Orgao/Ata/Item/Adesao — permite
  `npm run seed:limpar` remover só dado de demonstração, sem tocar em dado
  real. Login de demonstração: senha única `Demo@2026`.
- **`ataDisponivelParaAdesao(ata)`** (`src/lib/atas.ts`) — única fonte de
  verdade pra "essa ata pode aparecer/ser aderida": `status === APROVADA`
  **e** `dataVigenciaFim >= hoje`. Toda tela que decide "isso está
  disponível" usa essa função — nunca reimplementa a checagem na mão.
- **Cor = severidade, só via `Badge`** (`src/components/ui/badge.tsx`) —
  neutro/atenção/alerta/crítico/marca. Exceção deliberada: `SeloCategoria`
  (cor por **tema** de ata, não por gravidade) é uma segunda escala,
  paralela, que nunca se confunde com a de severidade (paleta de tons
  frios — ciano/violeta/magenta — fora da faixa vermelho/laranja/amarelo/
  verde reservada à severidade).
  - Ver `src/lib/severidade.ts` (única fonte de verdade da escala de
    severidade) e `src/lib/categorias.ts` (`corDaCategoria`, única fonte
    de verdade da escala de identidade por tema).
- **`Ata.categoria` (Opção A, decidida em 2026-09-04)** — a ata inteira
  carrega um tema (`String?`, vocabulário fixo em `src/lib/categorias.ts`),
  escolhido no cadastro hoje e por classificação automática no futuro
  (quando a integração com PNCP ganhar essa inteligência). Rejeitada a
  Opção B (derivar o tema dinamicamente dos itens) porque não sustenta o
  volume esperado (PNCP, ~1000+ atas).
  - **Por quê:** numa ata com centenas de itens quase idênticos (ex.: ata
    de material hospitalar com 200+ variações), listar item por item no
    catálogo é ruído. A navegação correta é **tema → atas → itens**:
    clicar num tema mostra as *atas* daquele tema; clicar numa ata mostra
    os *itens* dela; buscar um item específico pula direto pra dentro da
    ata que o contém.
- **Elegibilidade por esfera federativa (art. 86, §§ 3º e 8º — achado da
  revisão de 2026-09-04)** — confirmado pelo usuário com citação exata
  do texto comentado da lei. Implementado em `src/lib/esferas.ts` e
  aplicado em `solicitarAdesao` (`src/app/orgao/pedido/actions.ts`).
  `Orgao.esfera` deixou de ser texto livre e virou `<select>` fixo
  (federal/estadual/distrital/municipal) nos dois pontos de cadastro
  (`/orgao/cadastro` e no cadastro de ata pelo fornecedor). Esfera
  desconhecida (ex.: `"não informada"`, usada pelo rastreador do PNCP
  quando a API não informa) **recusa** a adesão em vez de assumir que a
  regra foi cumprida.
  - **Não coberto ainda — exige campo novo no schema, não é só
    validação:** §6º (exceção ao teto de 200% pra adesão a ata federal
    de programa de transferência voluntária) e §7º (exceção ao teto de
    200% pra adesão emergencial a ata de medicamentos/material
    médico-hospitalar gerenciada especificamente pelo Ministério da
    Saúde). Nenhum dos dois tem hoje um jeito de ser identificado no
    banco (não existe conceito de "programa de transferência
    voluntária" nem uma flag "é o Ministério da Saúde"). Fica registrado
    aqui pra não ser esquecido, não pra ser assumido como coberto.
  - A condição do §3º de que o SRP tenha sido "formalizado por
    licitação" é assumida sempre verdadeira nesta plataforma — toda ata
    aqui nasce de cadastro (por trás de uma licitação real) ou de
    importação do PNCP (só lista instrumento formal de licitação); não
    existe fluxo de registro de preços fora de licitação no sistema.
- **PNCP:** `src/lib/pncp.ts` mapeia o retorno da API pública
  (`/api/consulta/v1/atas`); `src/lib/rastreador-pncp.ts` importa atas
  novas como `PENDENTE` (entra na fila de moderação do admin antes de
  aparecer no catálogo público); `limparDescricaoPncp` evita o bug de
  número solto colado na descrição do item.
- **Anexo de ata guardado no banco, não em provedor externo (2026-09-04)**
  — `DocumentoAta.conteudo: Bytes`, servido publicamente por
  `/api/documentos/[id]`. Escolhido porque não exige credencial de
  serviço de armazenamento (S3/R2/Vercel Blob) nenhuma e não depende de
  disco local (que não sobrevive a deploy serverless). Limite de 10MB,
  só PDF/JPEG/PNG.
- **"De quem é a vez" é só rótulo, não trava (2026-09-04)** —
  `atorEsperado()` (`src/lib/adesao.ts`) é puramente informativo. O
  sistema continua deixando fornecedor OU órgão avançar qualquer
  estágio de uma adesão; isso é decisão de processo/auditoria que exige
  mais contexto de negócio antes de virar uma trava de permissão de
  verdade.

---

## 2. Tela 1 — Público (catálogo, sem login)

**Status: ✅ Construída e revisada** (implementada, testada ao vivo com
Playwright, e já passou por uma rodada de correções pós-revisão em
2026-09-04 — ver §2.4).

### 2.1 Páginas

| Rota | Função |
|---|---|
| `/` | Home — grade de temas (conta **atas** disponíveis por tema, não itens) |
| `/catalogo` | Modo duplo: navegação por tema (lista atas) **ou** busca por item (pula direto pra dentro da ata) |
| `/catalogo/[ataId]` | Detalhe da ata — metadados, lista de itens, barra de consumo do art. 86, botão "Pedir adesão" |

### 2.2 Requisitos implementados

- Home conta e lista **atas** por tema (`Ata.categoria`), não itens soltos.
- Cada tile de tema tem um selo colorido de identidade (`SeloCategoria`).
- `/catalogo?categoria=X` lista as atas daquele tema (cards com número,
  fornecedor, órgão gerenciador, contagem de itens, botão "Ver itens da
  ata") — nunca uma lista achatada de item.
- `/catalogo?q=termo` busca por item e, se encontrar, mostra "Ver na ata"
  — que leva a `/catalogo/[ataId]?item=[itemId]` com o item destacado (com
  rótulo "Item que você buscou" explicando o destaque).
- Detalhe da ata mostra:
  - breadcrumb (Início / tema / Ata número);
  - badge de vigência ("Vence em N dia(s)" / "Vencida há N dia(s)"),
    colorido por proximidade do vencimento;
  - selo "Importado do PNCP" com número de controle visível, quando
    `origem = PNCP`;
  - por item: barra de consumo **agregada** (limite 200%) sempre visível;
    barra de consumo **do órgão logado** (limite 50%) só quando um órgão
    está autenticado navegando — visitante anônimo vê um convite pra
    login em vez de um segundo gauge vazio;
  - botão "Pedir adesão" por item, linkando pro fluxo autenticado do
    órgão (`/orgao/pedido/novo?itemId=`).
- Filtros de busca: por tema, UF do órgão gerenciador, valor unitário
  máximo (o filtro de valor busca atas que tenham *algum* item dentro do
  teto, já que valor é por item, não por ata).

### 2.3 Fora de escopo desta tela (decisão consciente)

- Não existe página individual por item (`/item/[id]`) — o item vive
  dentro da página da ata, com âncora via `?item=`, exatamente pra não
  recriar o problema de "uma ata de 200 itens vira 200 páginas".
- `/atas` (listagem interna completa, todo status) não é uma tela
  pública — é uma ferramenta de admin (ver §2.4, achado de segurança).

### 2.4 Revisão de telas — correções aplicadas em 2026-09-04

Rodada de 7 prompts de correção, todos verificados ao vivo com Playwright
após implementar (7/7 passou):

1. **Dados de teste vazados removidos.** Havia 16 atas/fornecedores/órgãos
   de teste (criados por verificações Playwright de rodadas anteriores)
   aparecendo no catálogo como se fossem reais. Nenhuma era produção —
   todas tinham CNPJ/nome fabricados. Script de limpeza:
   `prisma/limpar-dados-teste-vazados.ts` (preserva admin real e o
   fornecedor-placeholder do rastreador PNCP).
2. **Barra do art. 86, selo PNCP, badge de vigência e breadcrumb** —
   devolvidos à página de detalhe da ata (ver §2.2).
3. **Falha de segurança corrigida:** `/atas` (cadastro/listagem interna,
   todo status incluso, sem filtro de disponibilidade) não tinha guard de
   autenticação nenhum. Agora exige login de admin. O link público que
   apontava pra lá ("Ver cadastro interno de atas", no rodapé do catálogo
   e no menu "⋯" do cabeçalho) foi removido.
4. **Hierarquia tipográfica:** a classe `.marca` (usada em praticamente
   todo título de página/card) forçava caixa alta em tudo, achatando a
   hierarquia visual. Agora só rótulos pequenos (`.eyebrow`, badges)
   ficam em caixa alta; títulos usam peso semi-bold + tamanho maior, sem
   caixa alta. Criada `.marca-wordmark` (mantém caixa alta) só pra
   logotipo/tagline de marca.
5. **Identidade visual por tema:** `SeloCategoria` + `corDaCategoria()`
   (`src/lib/categorias.ts`) — paleta de 8 cores frias (ciano→magenta),
   conferida por contraste WCAG (mínimo 4.5:1), com fallback
   determinístico pra tema novo que ainda não estiver na lista fixa.
6. **Menu de categorias no cabeçalho** parava de rolar/cortar a última
   categoria em telas largas (o degradê de "role mais" ficava sobre o
   último item mesmo sem overflow de verdade). Trocado por quebra de
   linha — nunca corta nem esconde item.
7. **Item destacado por busca** ganhou o rótulo "Item que você buscou" —
   o destaque tinha propósito real, só faltava explicar visualmente.

---

## 3. Tela 2 — Fornecedor (autenticado)

**Status: ✅ Construída** — fluxo principal e todos os gaps levantados
até agora já aplicados.

### 3.1 Páginas existentes

| Rota | Função | Status |
|---|---|---|
| `/fornecedor/login` | Login | ✅ Completo |
| `/fornecedor/cadastro` | Auto-cadastro de fornecedor | ✅ Completo |
| `/fornecedor` | Painel "minhas atas" (saldo calculado) | ✅ Completo |
| `/fornecedor/atas/nova` | Cadastro de nova ata (N itens) | ✅ Completo |
| `/fornecedor/adesoes` | Pedidos de adesão recebidos | ✅ Completo |

### 3.2 Requisitos confirmados e já aplicados

- Cadastro de ata pede o **tema** (`Ata.categoria`) desde a rodada de
  2026-09-04 (Opção A) — campo obrigatório, validado contra o vocabulário
  fixo de `src/lib/categorias.ts`.
- **Cadastro de ata com múltiplos itens de uma vez** (2026-09-04) — o
  formulário agora tem "+ Adicionar item" (e "Remover" por bloco, exceto
  quando só resta 1), enviando a lista inteira via `FormData.getAll` com
  campos `itemDescricao[]`/`itemCategoria[]`/`itemUnidade[]`/
  `itemQuantidade[]`/`itemValorUnitario[]`. A ação valida que todos os
  arrays têm o mesmo tamanho e cada item é válido, e cria a ata com todos
  os itens num único `prisma.ata.create`. Verificado ao vivo com
  Playwright (3 itens numa mesma ata, todos apareceram na página de
  detalhe).

- **Upload de documento** (edital, ofício, ata digitalizada) (2026-09-04)
  — decisão de arquitetura: guardado como bytes direto no Postgres
  (`DocumentoAta.conteudo: Bytes`), não num provedor externo (S3/R2/Vercel
  Blob) — funciona sem nenhuma credencial nova e continua funcionando em
  qualquer ambiente de deploy sério, ao contrário de disco local (que se
  perde em serverless). Campo opcional no formulário, PDF/JPEG/PNG até
  10MB, validado no servidor. Link de download em `/api/documentos/[id]`
  (público, sem login — documento de licitação é registro público),
  aparece em "Minhas atas" (fornecedor), na página pública da ata e na
  fila de moderação do admin. Verificado ao vivo com Playwright.

### 3.3 Gaps identificados, aguardando confirmação pra construir

- Nenhum gap novo levantado desde a última rodada de discussão.

---

## 4. Tela 3 — Órgão público / Município (autenticado)

**Status: ✅ Construída** — fluxo principal e o único gap levantado até
agora já aplicados.

### 4.1 Páginas existentes

| Rota | Função | Status |
|---|---|---|
| `/orgao/login` | Login | ✅ Completo |
| `/orgao/cadastro` | Auto-cadastro de órgão | ✅ Completo |
| `/orgao` | Painel — pedidos de adesão do órgão, separados por "precisa da sua ação" vs. outros | ✅ Completo |
| `/orgao/pedido/novo` | Novo pedido de adesão (a partir de um item do catálogo) | ✅ Completo (já envolvido em `AppShell`/sidebar, corrigido em rodada anterior) |
| `/adesoes/[id]` | Detalhe do pedido — esteira de 8 estágios, histórico, versão pra impressão | ✅ Completo (proposital: sem sidebar, é documento imprimível) |

### 4.2 Requisitos confirmados e já aplicados

- **Filtro "precisa da sua ação"** (2026-09-04) — decisão: só rótulo
  informativo (opção "a"), **sem** trava de permissão de verdade. Motivo:
  `avancarEstagioAdesao` (`src/app/adesoes/actions.ts`) deixa hoje
  qualquer um dos dois lados (fornecedor ou órgão) avançar qualquer
  estágio — isso é comportamento de negócio/auditoria de um sistema de
  compra pública, não é algo pra mudar sem mais contexto. `atorEsperado()`
  (`src/lib/adesao.ts`) infere "de quem é a vez" a partir do sentido de
  cada estágio (`APRESENTADA_ORGAO` → órgão; `MAPEADA`/
  `CONTATO_FORNECEDOR`/`ACEITE_FORNECEDOR` → fornecedor;
  `OFICIO_EMITIDO`/`AGUARDANDO_GERENCIADOR` → terceiros;
  `EMPENHADA`/`FATURADA` → concluído) e só separa a lista em duas seções
  na tela — não muda quem pode clicar "avançar". Verificado ao vivo com
  Playwright.

### 4.3 Gaps identificados, aguardando confirmação pra construir

- Nenhum gap novo levantado desde a última rodada de discussão.

---

## 5. Tela 4 — Administração (Tech 10, autenticado)

**Status: 🟡 Parcial** — fluxo principal existe e funciona; gaps de
gestão ainda não construídos.

### 5.1 Páginas existentes

| Rota | Função | Status |
|---|---|---|
| `/admin/login` | Login | ✅ Completo |
| `/admin` | Painel — aprovar/rejeitar atas pendentes | ✅ Completo |
| `/admin/faturamento` | Contas a receber (taxa de intermediação) — marcar como recebido | ✅ Completo (feedback visual imediato adicionado em rodada anterior) |
| `/atas` | Cadastro/listagem interna completa de atas (todo status) | ✅ Completo — **agora atrás de login de admin** (corrigido em 2026-09-04, ver §2.4 item 3) |

### 5.2 Requisitos confirmados e já aplicados

- **Sinalização de atas PNCP incompletas** (2026-09-04) — atas com
  `origem = PNCP` e sem fornecedor real identificado (CNPJ placeholder
  `00000000000000`) ou sem nenhum item enriquecido agora aparecem com um
  selo "PNCP incompleta" e vêm primeiro na fila de "Atas aguardando
  moderação" em `/admin`, em vez de se perderem misturadas com o resto.
  **Ainda não construído:** uma tela de edição pra de fato completar essas
  atas (informar o fornecedor certo, adicionar os itens) — hoje o admin só
  vê o alerta, mas precisa aprovar/rejeitar como estão ou completar por
  fora do sistema.

### 5.3 Gaps identificados, aguardando confirmação pra construir

- **Gestão de usuários** — hoje não existe tela pra admin listar/desativar
  contas de fornecedor ou órgão.

---

## 6. Telas transversais — faltam em qualquer perfil

Levantadas na primeira rodada de gap-analysis, nenhuma confirmada como
prioridade ainda:

- **Perfil/configurações** (trocar senha, dados de contato) — não existe
  pra nenhum dos 4 perfis.
- **404 customizado** — hoje é o padrão do Next.js.
- **Notificação por e-mail** — nenhum evento do sistema (ata aprovada,
  pedido de adesão recebido, mudança de estágio) dispara e-mail hoje.
- **Central de ajuda / FAQ** — não existe.

---

## 7. Como este documento é usado

1. Antes de discutir uma tela, primeiro consulta aqui — se já foi
   decidido, não redebate; se mudou de ideia, atualiza aqui também.
2. Cada gap listado em §3.3 / §4.2 / §5.2 / §6 vira uma seção "confirmada"
   assim que a gente decidir construir, com os requisitos detalhados
   entrando no lugar do item de lista solto.
3. Toda vez que uma tela mudar de 🟡 Parcial pra ✅ Construída, esse
   arquivo é editado no mesmo commit que fecha a tela — nunca depois.

## 8. Log de mudanças

- **2026-09-04** — Documento criado. Tela 1 (público) marcada como
  construída e revisada (rodada de 7 prompts de correção, 7/7 verificado
  ao vivo). Telas 2, 3 e 4 documentadas no estado "parcial" com os gaps
  já levantados nas rodadas de discussão anteriores, aguardando
  confirmação um de cada vez, conforme o processo acordado.
- **2026-09-04 (mesmo dia, rodada seguinte)** — Executados os gaps que já
  estavam claros o suficiente pra construir sem nova decisão de negócio:
  cadastro de ata com múltiplos itens (Tela 2, verificado ao vivo com 3
  itens numa mesma ata) e sinalização de atas PNCP incompletas no painel
  admin (Tela 4). Dois gaps ficaram explicitamente parados aguardando
  decisão do usuário, por dependerem de escolha que não é só código:
  upload de documento (Tela 2 — precisa escolher provedor de
  armazenamento) e filtro "precisa da sua ação" (Tela 3 — precisa decidir
  se é só rótulo informativo ou trava de verdade em
  `avancarEstagioAdesao`).
- **2026-09-04 (mesma rodada, a pedido explícito do usuário: "decida")**
  — Decididas e construídas as duas pendências: upload de documento
  guardado como bytes no Postgres (não provedor externo, evita depender
  de credencial que não temos) e "precisa da sua ação" implementado só
  como rótulo informativo (não mexe em quem pode avançar o estágio, já
  que isso é decisão de processo/auditoria que exige mais contexto).
  Telas 2 e 3 passam de 🟡 Parcial pra ✅ Construída. Ambas verificadas ao
  vivo com Playwright.
- **2026-09-04 (mesmo dia, achado trazido pelo usuário)** — Usuário
  confirmou, com citação exata do texto comentado da Lei 14.133/2021
  (art. 86, §§ 3º/4º/5º/6º/7º/8º), que a trava de quantidade (50%/200%)
  já implementada estava certa, mas faltava elegibilidade por esfera
  federativa (§§ 3º e 8º). Implementado `src/lib/esferas.ts`
  (11 testes) e aplicado em `solicitarAdesao`; `Orgao.esfera` virou
  `<select>` fixo em vez de texto livre nos dois cadastros. §§ 6º e 7º
  (exceções ao teto de 200%) ficaram explicitamente não cobertos —
  exigem campo novo no schema que ainda não existe.
- **2026-09-04 (mesmo dia, correção seguinte)** — Usuário apontou que dado
  de demonstração contradizendo a própria regra do sistema não é
  aceitável ("se é indevida deve bloquear, óbvio"). Reescritas as
  adesões do seed pra cada uma usar um órgão aderente de esfera
  compatível com o órgão gerenciador (município só com município,
  estado só com estado, federal só com federal ou recebendo de
  estado/distrito) — banco recriado do zero (`seed:limpar` + `seed`)
  pra confirmar que passa por `verificarAdesao` de ponta a ponta sem
  erro. Também corrigido um bug de FK nos dois scripts de limpeza
  (`seed-limpar.ts`, `limpar-dados-teste-vazados.ts`): faltava apagar
  `DocumentoAta` antes de `Ata`, quebrava a limpeza desde que o anexo de
  documento foi implementado.
