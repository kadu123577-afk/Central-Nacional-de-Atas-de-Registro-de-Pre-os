# Notas de alterações — alinhamento com MOU / SCP / Projeto RNA (2026-10-04)

Base: Projeto RNA, MOU, Sociedade em Conta de Participação (SCP) e minuta
Licitanet Digital. Decisão do usuário: aplicar o que é útil, aproveitar só o
que interessa nos pontos parcialmente corretos. Um commit + push por etapa.

## Aplicado

| Etapa | O que | Origem no documento |
|---|---|---|
| 1 | **Contrato de intermediação por ata** (`ContratoIntermediacao`): percentual 3%–15% pactuado pelo admin com o fornecedor. O vendedor não digita mais a comissão: "Aderiu" herda o percentual do contrato (cópia no momento da adesão) e exige contrato cadastrado. Corrige a versão anterior, em que o vendedor digitava o percentual. | SCP cl. 4; RNA §2 |
| 2 | **Análise de conformidade da ata** (checklist de 5 itens + parecer) e **portão de acesso**: o vendedor só vê/pede atas `APROVADA` **e** com contrato. Faltas no checklist geram **alerta**, não recusa automática (decisão jurídica fica com o gestor). Versão enxuta: sem etapas intermediárias novas de status. | SCP cl. 8; RNA §3–4 |
| 3 | **Ata em negociação**: a ata não some para os outros vendedores; o vendedor *pede* municípios, o admin libera (inclusive dois vendedores na mesma ata em municípios diferentes). Prazo de 10 dias por município; vencido sem avanço, volta a ficar disponível para novo pedido. | pedido do usuário |
| 4 | **Cascata e cobrança**: cada liquidação tem tipo (fornecimento / aditivo / renovação), todas com a mesma comissão; cobrança da comissão com status (pendente → cobrada → recebida) e nota fiscal da comissão. | SCP cl. 4; RNA §2 |

## Parcial — só o que interessa
- **Limites de adesão (50% por órgão / 200% por item):** só **alerta informativo** na análise de conformidade (checklist). Sem trava no valor aderido e sem exigir quantidades por item do vendedor — travar atrapalharia o uso em campo.
- **Sigilo:** vendedor só enxerga o que é dele; comissão/contrato de uma ata só aparece para o vendedor que tem município liberado nela.

## Fora do escopo (decidido não fazer agora)
- Relatório de partilha entre sócios (tributos → reembolso → 40/40/10/10): é contabilidade da SCP; o sistema não substitui a escrituração.
- Recusa automática de ata sem estimativa de quantidades: vira alerta.
- Bloquear a *visualização* da ata sem contrato: bloqueia só pegar/negociar.
- Cláusulas societárias (multas, não concorrência, remuneração fixa, Licitanet): não são requisito de software.

## Detalhes da Etapa 3 (como ficou)
- Não existe mais "pegar a ata" exclusivo: o vendedor **pede municípios** (`PedidoNegociacao`), o admin libera em `/admin/negociacoes`. Aprovar cria o card do Kanban com prazo de 10 dias.
- Dois vendedores na mesma ata só em municípios diferentes: se o município já está com outro vendedor, o pedido é negado automaticamente (com motivo).
- Prazo de 10 dias **renova a cada movimento** no Kanban (decisão: é "prazo sem avanço"); `aderiu`/`recusado` não têm prazo. Expiração é "preguiçosa" (roda ao abrir as telas), sem agendador.
- Sigilo: o vendedor só vê seus próprios municípios na ata; os outros aparecem só como "em negociação", sem dizer quem.
- "Tirar da ata" (admin → Usuários) expira os cards abertos daquele vendedor; `aderiu`/`recusado` ficam.
- Atas antigas já "pegas" sem nenhum município ativo voltam ao pool na primeira expiração.

## Detalhes da Etapa 4 (como ficou)
- `Liquidacao.tipo`: fornecimento original / aditivo / renovação — a comissão é a mesma nos três (cascata).
- Cobrança por liquidação: **A cobrar → Cobrada → Recebida**; cobrada/recebida exigem o nº da NF da comissão (datas automáticas).
- Tela de recebíveis: total aderido, liquidado, **comissão recebida** e **falta receber**; por linha, comissão devida/recebida.
- Limites de 50%/200%: já existem em `src/lib/saldo.ts` (fluxo do órgão); aqui seguem como item informativo do checklist, sem trava no valor aderido.

## Equipe interna e permissões por atividade (2026-11-13)
- **Por quê:** o workflow principal tem 17 atividades com papéis diferentes (captação, jurídico, aprovação, administração, vendas). Antes só existia "admin" (vê e faz quase tudo) e "vendedor".
- **Como:** `Admin.permissoes` guarda uma lista de chaves (`src/lib/permissoes.ts`: `atas.captar`, `atas.contrato`, `atas.conformidade`, `atas.aprovar`, `atas.publicar`, `municipios.liberar`, `adesao.instruir`, `adesao.declarar`, `adesao.registrar`, `adesao.acompanhar`, `comissao.cobrar`, `base.editar`, `usuarios.gerir`). Cada pessoa recebe o conjunto do seu ramo no mapa do workflow; os perfis prontos (administrador, jurídico, aprovador, captação, cobrança) só preenchem as caixas.
- **Migração `20261113000000_permissoes_equipe_interna`:** adiciona `permissoes`, `ativo` e `cargo`; as contas que já existiam recebem todas as permissões (ninguém perde acesso). Conta nova nasce **sem** permissão.
- **Onde vale:** `exigirAdmin` das ações do admin consulta `PERMISSAO_POR_ACAO` (ação sem regra é recusada); cada página protegida chama `exigirPermissaoDe`; o menu lateral esconde o que a pessoa não pode usar. Sem permissão, a pessoa volta ao painel com aviso e a negativa vai para a auditoria (`permissao.negada`). A lista é lida do banco a cada chamada: revogar vale na hora.
- **Aprovar x conferir:** quem só tem `atas.aprovar` aprova com base no checklist que o jurídico registrou e não altera o checklist; quem só tem `atas.conformidade` salva a análise e não aprova.
- **Declaração de conformidade da adesão:** só o jurídico (`adesao.declarar`) declara ou revoga; o consultor continua marcando os itens da instrução.
- **Tela:** Admin > Usuários > Equipe interna cria contas, edita permissões e ativa/desativa (desativar derruba a sessão na hora). Trava: nunca deixa o sistema sem um gestor de usuários ativo; ninguém desativa a própria conta. O financeiro da SCP continua só por script, com 2FA.
- **`adesao.registrar`:** deixou de ser reservada em 2026-11-14 (ver "Telas do estagiário" abaixo); entra no perfil Captação (estagiário).

## Acesso com senha provisória e página inicial por perfil (2026-11-14)
- **Senha provisória:** a gestão cria a conta (equipe interna ou vendedor) em Admin > Usuários. Se o campo da senha fica em branco, o sistema gera uma (`src/lib/senha-provisoria.ts`) e a mostra uma única vez. A conta nasce com `senhaProvisoria = true`; no primeiro acesso a pessoa cai em `/trocar-senha` e só depois entra no sistema.
- **Como é travado:** `adminIdLogado` e `vendedorIdLogado` devolvem `null` enquanto a conta está com senha provisória; só as variantes `...ParaTrocarSenha` (usadas por `/trocar-senha`) aceitam. Trocar a senha derruba a sessão antiga (`sessaoVersao + 1`) e abre outra.
- **Redefinir senha:** botão "Redefinir senha" na equipe interna e nos vendedores (exige `usuarios.gerir`): gera outra senha provisória, encerra as sessões abertas e exige nova troca. Ninguém redefine a própria senha por ali (Perfil faz isso). Tudo na auditoria, sem gravar a senha.
- **Página inicial por perfil:** `/admin` vira "Minhas tarefas" para quem não é gestor de usuários: a fila mostra só os pontos que as permissões da pessoa resolvem (`ItemFila.permissao`), e as seções de vendedores, moderação de atas e financeiro só aparecem para quem tem a permissão correspondente.
- **Migração `20261114000000_senha_provisoria`:** `senhaProvisoria` em `admins` e `vendedores` (padrão falso: contas existentes não são afetadas).

## Telas do estagiário: itens da ata e registro da adesão (2026-11-14)
- **Itens e saldos (atividade 3), `/admin/atas/[ataId]/itens`** (permissão `atas.captar`): lista os itens, adiciona um por vez e **importa por planilha** (cola do Excel ou CSV; cabeçalho na primeira linha; descrição, unidade, quantidade e valor unitário obrigatórios; marca, categoria e código do catálogo opcionais; até 500 linhas). Duas etapas: **conferir** (nada é gravado, mostra erros por linha) e **gravar** (tudo ou nada, numa transação; cada item nasce com o saldo zerado). Lógica pura em `src/lib/importar-itens.ts`.
- **Registro da adesão com quantidade por item (atividade 13), `/admin/adesoes`** (permissão `adesao.registrar`; o jurídico, com `adesao.declarar`, também acompanha): lista os municípios prontos (declaração do jurídico feita, contrato na ata, dentro do prazo) e os registrados. Em `/admin/adesoes/[oportunidadeId]` a pessoa informa a quantidade de cada item; o sistema confere os limites do art. 86 (**50% do registrado por município, 200% no total**, por item) com o saldo na hora, faz o **saldo da ata andar**, grava as quantidades (`AdesaoItem`, migração `20261114010000_adesao_itens`) e leva a oportunidade para "Aderiu" com o **valor calculado das quantidades** (nunca digitado) e a comissão do contrato. Tudo ou nada, numa transação; se o saldo mudou no meio, nada é registrado e a pessoa é avisada. O que foi digitado volta ao formulário em caso de erro.
- **Desfazer:** só o jurídico (`adesao.declarar`) desfaz um registro: devolve as quantidades ao saldo e volta a oportunidade para "Em negociação". Não desfaz se já houver liquidação em cima da adesão.
- **O consultor não marca mais "Aderiu"** no Kanban (`moverEstagioOportunidade`): a opção aparece desativada e a gaveta explica que a equipe registra. Adesão registrada com quantidades também não sai de "Aderiu" por ali. Adesões antigas, sem quantidades, seguem como estavam.

## Prazos em dias úteis (2026-11-14)
- **Regra (`src/lib/dias-uteis.ts`):** exclui o dia do começo, inclui o do vencimento, e o vencimento nunca cai em fim de semana ou feriado (Lei 14.133/2021, art. 183). O dia é o de Brasília (UTC-3). Feriados nacionais calculados no código: os fixos (inclusive 20/11 desde 2024) e a Sexta-feira Santa. **Carnaval e Corpus Christi não entram sozinhos** (ponto facultativo é decisão de cada órgão).
- **Feriados da equipe:** tabela `feriados` (migração `20261114020000_feriados`) e tela `/admin/feriados` (permissão `usuarios.gerir`): feriado estadual, municipal e ponto facultativo. Vale para prazos novos; os já gravados não são recalculados.
- **Negociação com o município:** o prazo passou de 10 dias **corridos** para 10 dias **úteis** (`calcularPrazo` em `src/lib/negociacao.ts`, usado ao liberar o município, ao mover o card, ao registrar contato e ao desfazer um registro de adesão). Os textos da tela foram ajustados.

## Ciclo da ata, atividades 1 a 7 (2026-11-14)
- **Etapa derivada dos dados** (`src/lib/ciclo-ata.ts`), nada novo para preencher: 1 ata cadastrada · 2 fornecedor confirmado (CNPJ deixou de ser o provisório) · 3 ao menos um item · 4 contrato de intermediação · 5 conformidade registrada · 6 ata aprovada · 7 aprovada com categoria. A primeira etapa não cumprida é a atual. Ata rejeitada sai do ciclo.
- **Prazos por etapa** (dias úteis, do documento do workflow): 2, 5, 1, 5, 3, 2 e 1. Contam a partir de quando a etapa anterior ficou pronta, quando o banco guarda a data (contrato, conformidade, aprovação); nas demais, a partir do cadastro da ata. **É aproximado**: serve para cobrar.
- **A ordem é regra, não só aparência (decisão de Carlos, 14/11/2026):** cada etapa só abre depois da anterior. O **contrato (4)** só abre com a empresa fechada (2) e os itens e saldos cadastrados (3); a **conformidade (5)** só abre com o contrato; **aprovar (6)** só com a conformidade registrada (quem tem as duas permissões registra e aprova na mesma ação). Vale no servidor (`salvarContratoIntermediacao` e `analisarAta` recusam com a mensagem do que falta, via `bloqueioDaAcao` em `src/lib/ciclo-ata.ts`) e nas telas (a análise e o contrato mostram o aviso com o link da etapa que falta e desativam os botões). Rejeitar uma ata nunca é bloqueado. **Classificar a ata (categoria e título público) continua livre antes da aprovação**, porque alimenta o cruzamento com municípios; a ata só fica visível com 4, 5 e 6 cumpridas. A tela de análise passou a mostrar os passos na ordem Contrato, Conformidade, Aprovação. Atas que já estavam aprovadas sem contrato (dados de demonstração) aparecem esperando o contrato.
- **Sem contrato não há ata liberada (reforço de 14/11/2026, depois do segundo teste de Carlos):** o quadro do ciclo agora só conta uma etapa como feita se **todas as anteriores** estão feitas (uma ata aprovada antes da regra, sem contrato, mostra 5, 6 e 7 em espera). E a ata só é "liberada" se estiver **aprovada e com contrato**: o catálogo público (`baseAtasVigentes` em `src/lib/catalogo-publico.ts`), o sitemap e o pedido de adesão do órgão (`ataDisponivelParaAdesao` e `src/app/orgao/pedido/actions.ts`) passaram a exigir o contrato, como já faziam o portal do consultor e a leitura da Renata. Dados de demonstração: `prisma/seed.ts` cria contrato e conformidade para as atas aprovadas (e `seed-limpar.ts` os apaga antes das atas).
- **Telas:** `/admin/ciclo` (quadro com as atas por etapa, "Na sua vez" primeiro, prazo em dias úteis, botão que abre a tela certa) e `/admin/atas/[ataId]/ciclo` (as 7 etapas da ata e o histórico). O histórico é um retrato do que o banco registra (cadastro, contrato, conformidade, decisão, adesões e ações auditadas com a ata como alvo): nem toda ação grava a ata como alvo.
- **Painel:** a fila de "Minhas tarefas" ganhou "Atas esperando uma etapa sua no ciclo", "Atas sem itens cadastrados" e "Adesões prontas para registrar".

## Menu pelas etapas do workflow (2026-11-14)
- `src/app/admin/nav.ts`: Início · Captação e aprovação · Venda · Adesão e entrega · Financeiro · Cadastros · Conta. Cada pessoa só vê os itens que as permissões dela permitem, e o cabeçalho de um grupo sem itens some. O financeiro da SCP continua fora do menu.

## Leitura para a Renata (2026-11-14) — DESLIGADA por padrão
- **O que é:** três consultas só de leitura para a Renata (IA no WhatsApp, a cargo do SERPRO): `GET /api/renata/atas` (saldo por item: quanto cabe por município e no total), `/api/renata/vendas` (consultores por estágio e valor aderido; `?consultor=<id>`) e `/api/renata/andamento` (ciclo da ata e prazos). Código em `src/lib/renata-api.ts`, `renata-dados.ts`, `renata-rota.ts`.
- **Desligada:** responde 404 como se a rota não existisse. Só liga com `RENATA_API_ATIVA=sim` **e** `RENATA_API_TOKEN` com 32 caracteres ou mais, chamada com `Authorization: Bearer <token>` (comparação de tamanho fixo). Token errado: 401. Toda consulta e toda recusa vão para a auditoria (`renata.consulta`, `renata.recusada`), sem gravar o token.
- **O que nunca sai:** contatos de pessoas (telefone, e-mail, CPF), número e objeto originais da ata, fornecedor e órgão gerenciador. A ata é identificada pelo id e pelo título público (mesma regra da vitrine pública). Acrescentar um campo é decisão que passa pela ARCA.
- **Antes de ligar:** autorização **por escrito da ARCA** (NDA do Projeto RNA: dados e sistema só vão ao SERPRO com essa autorização). Nada foi ligado nem entregue.

## Instrução e declaração da adesão pelo painel (14/11/2026)
- **O buraco que foi achado:** a declaração de conformidade (atividade 12) só aceita sessão de administração com `adesao.declarar`, mas o formulário só existia dentro do Kanban do consultor (e o do painel é só leitura). Resultado: ninguém conseguia declarar, e a adesão nunca chegava ao estagiário. O mesmo para o Dr. Rui marcar a instrução (atividade 11, `adesao.instruir`).
- **Como ficou:** o componente `Instrucao` (`src/components/kanban/instrucao.tsx`) separa **quem marca os itens** (consultor e Dr. Rui: `somenteLeitura = false`) de **quem declara** (`podeDeclarar`, só o jurídico, que também revoga). O consultor não vê mais o formulário que o servidor recusava; vê "a declaração é feita pelo jurídico; avise o jurídico". Em `/admin/adesoes/[oportunidadeId]` a instrução e a declaração aparecem acima do registro: o Dr. Rui marca, o jurídico declara e, na mesma página, o formulário de registro do estagiário abre. A tela `/admin/adesoes` tem a fila "Em instrução, esperando a declaração" (progresso de cada município e os prontos para declarar primeiro; `src/lib/fila-instrucao-db.ts`), "Prontas para registrar" e "Registradas", na ordem de quem é a vez. O menu Adesões aparece também para `adesao.instruir`, e a página inicial ganhou as filas "Declarações de conformidade a fazer" e "Instruções de adesão em andamento".
- **Testado no navegador, de ponta a ponta:** instrução 9 de 9 marcada, declaração registrada pelo jurídico, e o estagiário (sem poder marcar nem declarar) registrou a adesão: "Adesão registrada, R$ 32.000,00". O sistema também recusou 1.000 numa Areia de 500 registrados (máximo de 250 por município, art. 86).
- **Calendário:** Carnaval (segunda e terça) e Corpus Christi passaram a entrar sozinhos nos dias sem expediente (decisão de Carlos, 14/11/2026), marcados como ponto facultativo.

## Ciclo da adesão, atividades 8 a 17 (14/11/2026)
- **Etapa derivada dos dados** (`src/lib/ciclo-adesao.ts`), nada novo para preencher: **9** pedido do município esperando a liberação (o pedido, a 8, já foi feito) · **10** negociando (a contatar, ou em negociação sem nenhum item obrigatório marcado) · **11** instruindo (começou a marcar) · **12** instrução completa, espera a declaração do jurídico · **13** declarada, espera o registro do estagiário · **14** adesão registrada, espera o contrato ser confirmado no PNCP · **15** contrato confirmado, espera a liquidação · **16** há liquidação com a comissão por receber · **17** tudo recebido: pós-venda (contínuo, sem prazo). Liquidação lançada vale como prova do contrato e da entrega, mesmo sem o vínculo do PNCP confirmado.
- **Prazos em dias úteis** (do documento do workflow): 9 = 1, 10 = 10 (o próprio prazo do card, renovado a cada movimento), 11 = 15, 12 = 2, 13 = 1, 14 = 10, 15 = 30, 16 = 5 (contados da liquidação mais antiga por receber), 17 = contínuo. Contam a partir do que o banco registra da etapa anterior (pedido, primeira marca da instrução, última marca, declaração, registro, confirmação do contrato, liquidação): **aproximado**, serve para cobrar.
- **Tela:** `/admin/ciclo-adesao` ("Ciclo da adesão", no grupo Venda): faixa com a contagem por etapa, "Na sua vez" primeiro (pela permissão de cada etapa: liberar, instruir, declarar, registrar, acompanhar contratos, cobrar), depois "Com outras pessoas" (vendas, órgão, fornecedor), com prazo em dias úteis e o botão que abre a tela certa. A etapa 10 mostra só os 15 de prazo mais curto (a base tem mais de mil municípios a contatar); o total é o real. As abas "Atas (1 a 7)" e "Adesões (8 a 17)" (`src/components/ui/abas-de-pagina.tsx`) ligam as duas visões do ciclo.
- **Testado no navegador:** a Aimorés andou 10, 11, 12, 13 e 14 só pelo que a equipe foi fazendo (marcar itens, declarar, registrar). Quadro lido por consultas por etapa (`src/lib/ciclo-adesao-db.ts`), nunca a base inteira.
