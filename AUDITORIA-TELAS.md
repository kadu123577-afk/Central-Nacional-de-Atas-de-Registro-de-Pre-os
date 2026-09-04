# Auditoria completa de telas — Central Nacional de Atas

Feita rodando o projeto de verdade (`npm run dev`, banco local com `npm run seed`), navegando e testando cada fluxo com Playwright — não só lendo código. Login/cadastro reais foram executados (não simulados), inclusive submissão de formulários até o fim.

**Data:** 2026-09-04 · **Branch:** `claude/new-session-is28el`

## Tabela

| Tela | Existe? | Funciona de ponta a ponta? | Nível visual | Problema encontrado |
|---|---|---|---|---|
| **FORNECEDOR** | | | | |
| `/fornecedor/login` | ✅ Sim | ✅ Sim | ✅ Completo | — |
| Cadastro de fornecedor | ❌ **Não existe** | — | — | Não há rota `/fornecedor/cadastro` nem nenhuma outra de auto-cadastro. Confirmado por busca no código, não só por tentar a URL (404 real). |
| `/atas/nova` (onde a ata + itens são cadastrados) | ✅ Sim | ✅ Sim — testei do zero: preenchi fornecedor, órgão, ata e item, submeti, e a ata apareceu na lista com status PENDENTE | ✅ Completo | Ver observação **A** abaixo — não é uma tela do painel do fornecedor logado. |
| `/fornecedor` (minhas atas) | ✅ Sim | ✅ Sim — login real, mostra as atas do fornecedor com saldo calculado corretamente | ✅ Completo | — |
| Acompanhar pedidos de adesão recebidos | ❌ **Não existe** | — | — | Busquei no código (`src/app/fornecedor/`): zero referência a `Adesao`. O painel do fornecedor só lista atas — não há lista de pedidos de adesão recebidos. O fornecedor só vê um pedido específico se alguém mandar o link direto de `/adesoes/[id]`. |
| **ÓRGÃO (MUNICÍPIO)** | | | | |
| `/orgao/login` | ✅ Sim | ✅ Sim | ✅ Completo | — |
| `/orgao/cadastro` | ✅ Sim | ✅ Sim — criei uma conta nova do zero, logou automaticamente depois de cadastrar | ✅ Completo | — |
| `/orgao` (painel) | ✅ Sim | ✅ Sim — mostra os pedidos reais do órgão logado, com estágio de cada um | ✅ Completo | — |
| `/orgao/pedido/novo` | ✅ Sim | ✅ Sim — testei pedido de adesão completo, do catálogo até a confirmação | ⚠️ **Parcial** | Ver observação **B** abaixo — sem o layout com sidebar que o resto do painel do órgão tem. |
| `/adesoes/[id]` | ✅ Sim | ✅ Sim — esteira de 8 estágios e histórico corretos | ✅ Completo (proposital, ver **C**) | — |
| **ADMINISTRAÇÃO** | | | | |
| `/admin/login` | ✅ Sim | ✅ Sim | ✅ Completo | — |
| `/admin` | ✅ Sim | ✅ Sim — testei aprovar uma ata pendente de verdade, o botão funcionou e ela saiu da fila | ✅ Completo | — |
| `/admin/faturamento` | ✅ Sim | ✅ Sim — testei "marcar como recebido", confirmei direto no banco que gravou (`pago: true`, `pagoEm` preenchido) | ✅ Completo | Ver observação **D** — tela não repinta na hora, só depois de recarregar. |
| **PÚBLICO** | | | | |
| `/` (home) | ✅ Sim | ✅ Sim | ✅ Completo | Ver observação **E** — mostra item com número colado na descrição (dado de teste antigo). |
| `/catalogo` | ✅ Sim | ✅ Sim | ✅ Completo | Mesmo item da observação **E** aparece aqui também. |

## Observações

**A — `/atas/nova` não é "o fornecedor cadastrando uma ata".** É uma rota pública, sem login nenhum, que cria o fornecedor (via upsert por CNPJ), o órgão gerenciador e a ata com um item, tudo no mesmo formulário. Ou seja: hoje não existe um fluxo de "faça login como fornecedor → cadastre uma nova ata na sua conta" — o cadastro de ata é uma tela solta, sem controle de quem pode submeter. Voltando ao pedido original de vocês (prompt 17), essa é provavelmente a peça que mais precisa de decisão: ou vira uma tela dentro do painel do fornecedor autenticado, ou continua como está (cadastro assistido por alguém da Tech 10, um "cadastro manual").

**B — `/orgao/pedido/novo` está sem o chrome do resto do painel.** Usa os componentes certos (`.painel`, `.campo-atas`, `.botao-atas`) e as cores certas, mas a página é um `<main>` solto — sem `AppShell`, sem sidebar, sem link de volta pro catálogo ou pro painel do órgão. Quem chega lá só sai clicando "voltar" do navegador ou completando o pedido. As outras telas do órgão (`/orgao`) usam `AppShell` normalmente.

**C — `/adesoes/[id]` também não usa `AppShell`, mas isso é proposital.** Essa tela tem uma versão de impressão (timbre, resumo compacto, rodapé legal) pensada pra virar PDF/comprovante — uma sidebar de navegação não faria sentido num documento impresso. Diferente da observação B, aqui a ausência do chrome é uma decisão de design, não uma lacuna.

**D — `/admin/faturamento`: o clique em "marcar como recebido" funciona, mas o screenshot tirado logo em seguida ainda mostrava o status antigo.** Fui conferir direto no banco de dados e a gravação aconteceu certinho, com o timestamp exato do teste. Ou seja: não é um bug de gravação — é só a tela não re-renderizando visualmente rápido o suficiente pra um screenshot tirado no mesmo instante do clique (recarregando a página manualmente, o status novo aparece). Vale considerar se o botão deveria ter algum feedback visual mais imediato (ex.: estado de "salvando..."), mas o dado em si está correto.

**E — o item "Máscara cirúrgica descartável 75336346" que aparece na home e no catálogo é o mesmo problema do número colado que vocês pediram pra eu resolver na fonte.** Já corrigi o robô do PNCP pra não gerar mais isso (`limparDescricaoPncp` em `src/lib/pncp.ts`, commit anterior) — mas esse registro específico já estava gravado no banco antes da correção, então continua aparecendo assim até alguém editar ou reimportar esse item. A correção anterior impede que o problema *cresça*; não apaga o que já existe.

## Resumo rápido

- **8 telas** existem e funcionam de ponta a ponta, no nível visual do design system.
- **2 telas não existem**: cadastro de fornecedor, e lista de pedidos recebidos pelo fornecedor.
- **1 tela com lacuna visual real**: `/orgao/pedido/novo` (sem sidebar/navegação).
- **1 achado arquitetural**: `/atas/nova` é uma porta de entrada pública e sem autenticação pro cadastro de ata — provavelmente o ponto mais importante pra decidir prioridade, como vocês mesmos notaram no prompt.
