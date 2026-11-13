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
- **Pendente:** `adesao.registrar` está reservada. Hoje só o consultor dono da oportunidade registra a adesão; falta a tela do admin.

## Acesso com senha provisória e página inicial por perfil (2026-11-14)
- **Senha provisória:** a gestão cria a conta (equipe interna ou vendedor) em Admin > Usuários. Se o campo da senha fica em branco, o sistema gera uma (`src/lib/senha-provisoria.ts`) e a mostra uma única vez. A conta nasce com `senhaProvisoria = true`; no primeiro acesso a pessoa cai em `/trocar-senha` e só depois entra no sistema.
- **Como é travado:** `adminIdLogado` e `vendedorIdLogado` devolvem `null` enquanto a conta está com senha provisória; só as variantes `...ParaTrocarSenha` (usadas por `/trocar-senha`) aceitam. Trocar a senha derruba a sessão antiga (`sessaoVersao + 1`) e abre outra.
- **Redefinir senha:** botão "Redefinir senha" na equipe interna e nos vendedores (exige `usuarios.gerir`): gera outra senha provisória, encerra as sessões abertas e exige nova troca. Ninguém redefine a própria senha por ali (Perfil faz isso). Tudo na auditoria, sem gravar a senha.
- **Página inicial por perfil:** `/admin` vira "Minhas tarefas" para quem não é gestor de usuários: a fila mostra só os pontos que as permissões da pessoa resolvem (`ItemFila.permissao`), e as seções de vendedores, moderação de atas e financeiro só aparecem para quem tem a permissão correspondente.
- **Migração `20261114000000_senha_provisoria`:** `senhaProvisoria` em `admins` e `vendedores` (padrão falso: contas existentes não são afetadas).
