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
