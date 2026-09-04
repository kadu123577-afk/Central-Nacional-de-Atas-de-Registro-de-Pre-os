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
  originalmente registrada;
- a soma de todas as adesões não pode ultrapassar **200%** (o dobro) da
  quantidade registrada.

Essa trava é código, não confiança: `src/lib/saldo.ts` (`verificarAdesao`)
é chamada tanto pela ação real de pedido de adesão quanto pelo seed de
demonstração — se a conta recusaria um pedido de verdade, o seed também
falha, em vez de gravar um estado que o sistema nunca permitiria.

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
- **PNCP:** `src/lib/pncp.ts` mapeia o retorno da API pública
  (`/api/consulta/v1/atas`); `src/lib/rastreador-pncp.ts` importa atas
  novas como `PENDENTE` (entra na fila de moderação do admin antes de
  aparecer no catálogo público); `limparDescricaoPncp` evita o bug de
  número solto colado na descrição do item.

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

**Status: 🟡 Parcial** — fluxo principal existe e funciona; gaps abaixo
ainda não confirmados/construídos.

### 3.1 Páginas existentes

| Rota | Função | Status |
|---|---|---|
| `/fornecedor/login` | Login | ✅ Completo |
| `/fornecedor/cadastro` | Auto-cadastro de fornecedor | ✅ Completo |
| `/fornecedor` | Painel "minhas atas" (saldo calculado) | ✅ Completo |
| `/fornecedor/atas/nova` | Cadastro de nova ata | 🟡 Funciona, mas só 1 item por ata (ver gap) |
| `/fornecedor/adesoes` | Pedidos de adesão recebidos | ✅ Completo |

### 3.2 Requisitos confirmados e já aplicados

- Cadastro de ata pede o **tema** (`Ata.categoria`) desde a rodada de
  2026-09-04 (Opção A) — campo obrigatório, validado contra o vocabulário
  fixo de `src/lib/categorias.ts`.

### 3.3 Gaps identificados, aguardando confirmação pra construir

- **Cadastro de ata com múltiplos itens de uma vez.** Achado da revisão
  de telas (Prompt 1, 2026-09-04): o formulário hoje só tem **uma** seção
  de item fixa — sem "adicionar outro item". Toda ata cadastrada por esse
  formulário sai com exatamente 1 item, mesmo o schema suportando N
  (`Ata.itens: Item[]` já é um-para-muitos de verdade — a prova é o seed,
  que cria atas com 2+ itens direto no banco). **Este é o gap mais
  importante da Tela 2** — sem ele, toda ata real cadastrada por
  fornecedor continuará chegando com 1 item só, o que não representa o
  caso real (atas de 200-541 itens, como a de medicamentos mencionada).
- **Upload de documento** (edital, ofício, ata digitalizada) — hoje o
  cadastro é só formulário de texto, sem anexo.
- Nenhum gap adicional foi levantado ainda pro restante do painel do
  fornecedor — a lista acima reflete o estado da última rodada de
  discussão.

---

## 4. Tela 3 — Órgão público / Município (autenticado)

**Status: 🟡 Parcial** — fluxo principal existe e funciona; gap de UX
identificado.

### 4.1 Páginas existentes

| Rota | Função | Status |
|---|---|---|
| `/orgao/login` | Login | ✅ Completo |
| `/orgao/cadastro` | Auto-cadastro de órgão | ✅ Completo |
| `/orgao` | Painel — pedidos de adesão do órgão, por estágio | ✅ Completo |
| `/orgao/pedido/novo` | Novo pedido de adesão (a partir de um item do catálogo) | ✅ Completo (já envolvido em `AppShell`/sidebar, corrigido em rodada anterior) |
| `/adesoes/[id]` | Detalhe do pedido — esteira de 8 estágios, histórico, versão pra impressão | ✅ Completo (proposital: sem sidebar, é documento imprimível) |

### 4.2 Gaps identificados, aguardando confirmação pra construir

- **Filtro "precisa da sua ação"** no painel do órgão — hoje a lista de
  pedidos não distingue "está com você aguardando ação" de "está com o
  fornecedor/Tech10 aguardando eles". Levantado na primeira rodada de
  gap-analysis, ainda não confirmado como prioridade.
- Nenhum outro gap novo levantado desde a última rodada de discussão.

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

### 5.2 Gaps identificados, aguardando confirmação pra construir

- **Gestão de usuários** — hoje não existe tela pra admin listar/desativar
  contas de fornecedor ou órgão.
- **Fila de atas importadas do PNCP incompletas** — atas importadas sem
  fornecedor identificado (fornecedor "a confirmar") ou sem itens
  enriquecidos ficam pendentes, mas não há uma tela dedicada pra revisar
  e completar esses casos — hoje elas se misturam com a fila normal de
  moderação em `/admin`.

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
