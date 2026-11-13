import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../actions";
import { NAV_ADMIN } from "../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { Badge, type Tom } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { Secao } from "@/components/ui/secao";
import { dataSoDia } from "@/lib/acompanhamento-view";
import { rotuloDaCategoria } from "@/lib/categorias";
import {
  captacaoComContatoVencido,
  estagioCaptacaoValido,
  estagiosPermitidosCaptacao,
  EXPLICACAO_ESTAGIO_CAPTACAO,
  formatarTelefone,
  nomeProprioParaTela,
  ROTULO_ESTAGIO_CAPTACAO,
  ROTULO_ORIGEM_CAPTACAO,
  rotuloCanal,
  rotuloMotivoPerda,
} from "@/lib/captacao";
import {
  cnpjParaTela,
  dataParaCampo,
  diaBrasilia,
  diasRestantesBrasilia,
  textoDiasRestantes,
  tomDiasRestantes,
  urlAtaPncp,
} from "@/lib/radar-atas-view";
import {
  BotaoApagarContato,
  FormularioContato,
  FormularioDados,
  FormularioEmpresa,
  FormularioInteracao,
  FormularioMover,
} from "../formularios";

export const dynamic = "force-dynamic";

const TOM_ESTAGIO: Record<string, Tom> = {
  identificada: "neutro",
  em_contato: "atencao",
  interessada: "marca",
  fechada: "marca",
  perdida: "alerta",
};

const COR_SECUNDARIA = { color: "var(--cor-texto-3)" } as const;

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="eyebrow pt-0.5">{rotulo}</dt>
      <dd className="min-w-0 break-words text-[14px]" style={{ color: "var(--cor-texto)" }}>
        {children}
      </dd>
    </div>
  );
}

/**
 * O cartão de uma ata na Captação (2026-11-14): tudo que o captador precisa para levar a ata até o
 * cadastro. À esquerda, o que se sabe (a ata, a empresa e os contatos dela); à direita, o andamento
 * (estágio, responsável, próximo contato, registro de contatos e o histórico).
 */
export default async function CartaoCaptacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, "atas.captar");

  const { id } = await params;
  if (!/^c[a-z0-9]{15,40}$/.test(id)) notFound();
  const ataCriada = (await searchParams).ataCriada === "1";

  const cartao = await prisma.captacao.findUnique({
    where: { id },
    include: { interacoes: { orderBy: { quando: "desc" }, take: 100 } },
  });
  if (!cartao) notFound();

  const agora = new Date();
  const [contatos, outras, captadores] = await Promise.all([
    cartao.fornecedorCnpj
      ? prisma.contatoEmpresa.findMany({ where: { cnpj: cartao.fornecedorCnpj }, orderBy: { criadoEm: "asc" } })
      : Promise.resolve([]),
    cartao.fornecedorCnpj
      ? prisma.captacao.findMany({
          where: { fornecedorCnpj: cartao.fornecedorCnpj, id: { not: cartao.id } },
          orderBy: { atualizadoEm: "desc" },
          take: 8,
          select: { id: true, nome: true, estagio: true },
        })
      : Promise.resolve([]),
    prisma.admin.findMany({
      where: { ativo: true, permissoes: { has: "atas.captar" } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
  ]);

  const idsDePessoas = [
    ...new Set(
      [cartao.responsavelId, cartao.criadoPorId, ...cartao.interacoes.map((i) => i.autorId), ...contatos.map((c) => c.criadoPorId)].filter(
        (x): x is string => Boolean(x),
      ),
    ),
  ];
  const nomes = new Map(
    (await prisma.admin.findMany({ where: { id: { in: idsDePessoas } }, select: { id: true, nome: true } })).map((a) => [a.id, a.nome]),
  );

  const estagio = estagioCaptacaoValido(cartao.estagio) ? cartao.estagio : "identificada";
  const aberto = estagio === "identificada" || estagio === "em_contato" || estagio === "interessada";
  const vencido = captacaoComContatoVencido(cartao.estagio, cartao.proximoContatoEm, agora);
  const cnpj = cnpjParaTela(cartao.fornecedorCnpj);
  const dias = cartao.vigenciaFim ? diasRestantesBrasilia(cartao.vigenciaFim, agora) : null;
  const linkPncp = urlAtaPncp(cartao.numeroControlePncpAta);
  const destinos = estagiosPermitidosCaptacao(cartao.estagio).map((valor) => ({ valor, rotulo: ROTULO_ESTAGIO_CAPTACAO[valor] }));

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-7xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Captação"
        titulo={cartao.nome}
        descricao={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tom={TOM_ESTAGIO[estagio] ?? "neutro"}>{ROTULO_ESTAGIO_CAPTACAO[estagio]}</Badge>
            <span>{EXPLICACAO_ESTAGIO_CAPTACAO[estagio]}</span>
          </span>
        }
        voltar={{ href: "/admin/captacao", rotulo: "Captação" }}
        acoes={
          aberto ? (
            <Link href={`/admin/atas/nova?captacao=${cartao.id}`} className="botao-atas">
              Fechou: cadastrar a ata
            </Link>
          ) : undefined
        }
      />

      {ataCriada && (
        <Aviso tom="sucesso" titulo="Ata cadastrada.">
          Este cartão fechou. A ata segue o ciclo: itens e saldos (estagiário), contrato de intermediação, conformidade e aprovação.
        </Aviso>
      )}
      {cartao.estagio === "perdida" && cartao.motivoPerda && (
        <Aviso tom="alerta" titulo="Não deu:">
          {rotuloMotivoPerda(cartao.motivoPerda)}. Se a conversa voltar, mova o cartão para “Identificada”.
        </Aviso>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-6">
          <Secao titulo="A ata" destaque>
            <dl className="flex flex-col gap-3">
              <Linha rotulo="Objeto">{cartao.objeto}</Linha>
              {cartao.categoria && (
                <Linha rotulo="Tema">
                  <SeloCategoria categoria={rotuloDaCategoria(cartao.categoria)} />
                </Linha>
              )}
              <Linha rotulo="Órgão">
                {cartao.orgaoNome ? nomeProprioParaTela(cartao.orgaoNome) : <span style={COR_SECUNDARIA}>não informado</span>}
                {cartao.municipioNome && cartao.municipioNome !== cartao.orgaoNome && <> · {nomeProprioParaTela(cartao.municipioNome)}</>}
                {cartao.uf && <span className="selo-uf ml-2">{cartao.uf}</span>}
              </Linha>
              {cartao.numeroAta && <Linha rotulo="Número da ata">{cartao.numeroAta}</Linha>}
              <Linha rotulo="Vigência até">
                {cartao.vigenciaFim && dias !== null ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="numero">{dataSoDia(cartao.vigenciaFim)}</span>
                    <Badge tom={tomDiasRestantes(dias)}>{textoDiasRestantes(dias)}</Badge>
                  </span>
                ) : (
                  <span style={COR_SECUNDARIA}>não informada</span>
                )}
              </Linha>
              <Linha rotulo="Como chegou">
                {ROTULO_ORIGEM_CAPTACAO[cartao.origem] ?? cartao.origem}
                {linkPncp && (
                  <>
                    {" · "}
                    <a href={linkPncp} target="_blank" rel="noopener noreferrer" className="botao-atas link text-[13px]">
                      ver a ata no PNCP →<span className="sr-only"> (abre em nova aba)</span>
                    </a>
                  </>
                )}
              </Linha>
              <Linha rotulo="Cuida">{cartao.responsavelId ? (nomes.get(cartao.responsavelId) ?? "—") : <span style={COR_SECUNDARIA}>ninguém ainda</span>}</Linha>
              <Linha rotulo="Criado">
                {diaBrasilia(cartao.criadoEm)}
                {nomes.get(cartao.criadoPorId) && <> por {nomes.get(cartao.criadoPorId)}</>}
              </Linha>
            </dl>
          </Secao>

          <Secao
            titulo="Empresa"
            descricao={
              cartao.fornecedorCnpj
                ? "Quem detém a ata. Os contatos abaixo valem para todas as atas desta empresa."
                : "O radar não identificou o fornecedor desta ata. Descubra a empresa (no PNCP, nos contratos que citam a ata) e preencha."
            }
          >
            {cartao.fornecedorCnpj ? (
              <div className="flex flex-col gap-4">
                <p className="text-[15px]">
                  <b>{cartao.fornecedorNome}</b>
                  {cnpj && <span className="codigo ml-2" style={COR_SECUNDARIA}>{cnpj}</span>}
                </p>
                {outras.length > 0 && (
                  <div>
                    <p className="eyebrow mb-1.5">Outras atas desta empresa na captação</p>
                    <ul className="lista-linhas text-[13.5px]">
                      {outras.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-2">
                          <Link href={`/admin/captacao/${o.id}`} className="hover:text-[var(--cor-marca-clara)]">
                            {o.nome}
                          </Link>
                          <Badge tom={TOM_ESTAGIO[o.estagio] ?? "neutro"}>{rotuloEstagio(o.estagio)}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-[12.5px] font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
                    Corrigir razão social ou CNPJ
                  </summary>
                  <div className="mt-3">
                    <FormularioEmpresa id={cartao.id} nome={cartao.fornecedorNome ?? ""} cnpj={cnpj ?? ""} />
                  </div>
                </details>
              </div>
            ) : (
              <FormularioEmpresa id={cartao.id} nome={cartao.fornecedorNome ?? ""} cnpj="" />
            )}
          </Secao>

          <Secao
            titulo={`Contatos da empresa${contatos.length ? ` (${contatos.length})` : ""}`}
            descricao="O cartão de contato de quem atende na empresa. Serve à captação, aos vendedores e à cobrança."
          >
            {!cartao.fornecedorCnpj ? (
              <Aviso tom="info">Identifique a empresa acima para guardar o contato dela.</Aviso>
            ) : (
              <div className="flex flex-col gap-4">
                {contatos.length === 0 ? (
                  <p className="text-[13.5px]" style={COR_SECUNDARIA}>
                    Nenhum contato guardado ainda.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {contatos.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-[var(--raio-grande)] border p-4"
                        style={{ borderColor: "var(--cor-borda)", background: "var(--cor-superficie-2)" }}
                      >
                        <p className="text-[15px] font-bold">
                          {c.nome}
                          {c.cargo && (
                            <span className="ml-2 text-[13px] font-normal" style={COR_SECUNDARIA}>
                              {c.cargo}
                            </span>
                          )}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
                          {c.telefone && (
                            <a href={`tel:+55${c.telefone}`} className="numero hover:text-[var(--cor-marca-clara)]">
                              {formatarTelefone(c.telefone)}
                            </a>
                          )}
                          {c.telefone && c.whatsapp && (
                            <a
                              href={`https://wa.me/55${c.telefone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="botao-atas link text-[13px]"
                            >
                              WhatsApp →<span className="sr-only"> (abre em nova aba)</span>
                            </a>
                          )}
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="break-all hover:text-[var(--cor-marca-clara)]">
                              {c.email}
                            </a>
                          )}
                        </p>
                        <p className="mt-1.5 text-xs" style={COR_SECUNDARIA}>
                          Veio de: {c.comoObteve}. Guardado por {nomes.get(c.criadoPorId) ?? "—"} em {diaBrasilia(c.criadoEm)}.
                        </p>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[12.5px] font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
                            Corrigir ou apagar
                          </summary>
                          <div className="mt-3 flex flex-col gap-3">
                            <FormularioContato
                              captacaoId={cartao.id}
                              contato={{
                                id: c.id,
                                nome: c.nome,
                                cargo: c.cargo ?? "",
                                telefone: formatarTelefone(c.telefone),
                                whatsapp: c.whatsapp,
                                email: c.email ?? "",
                                comoObteve: c.comoObteve,
                              }}
                            />
                            <BotaoApagarContato captacaoId={cartao.id} contatoId={c.id} />
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
                <details open={contatos.length === 0}>
                  <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--cor-marca-clara)" }}>
                    + Guardar um contato
                  </summary>
                  <div className="mt-3">
                    <FormularioContato captacaoId={cartao.id} />
                  </div>
                </details>
              </div>
            )}
          </Secao>
        </div>

        <div className="flex flex-col gap-6">
          <Secao titulo="Andamento" destaque>
            <div className="flex flex-col gap-6">
              {aberto && vencido && (
                <Aviso tom="atencao" titulo="Contato vencido.">
                  Era para falar com a empresa em {dataSoDia(cartao.proximoContatoEm!)}.
                </Aviso>
              )}
              <FormularioMover id={cartao.id} destinos={destinos} />
              <div className="border-t pt-5" style={{ borderColor: "var(--cor-borda)" }}>
                <FormularioDados
                  id={cartao.id}
                  nome={cartao.nome}
                  responsavelId={cartao.responsavelId ?? ""}
                  proximoContatoEm={dataParaCampo(cartao.proximoContatoEm)}
                  observacoes={cartao.observacoes ?? ""}
                  captadores={captadores}
                />
              </div>
            </div>
          </Secao>

          <Secao titulo="Registrar um contato" descricao="Falou com a empresa? Anote em poucas palavras. O primeiro contato já leva o cartão para “Em contato”.">
            <FormularioInteracao id={cartao.id} />
          </Secao>

          <Secao titulo={`Histórico${cartao.interacoes.length ? ` (${cartao.interacoes.length})` : ""}`}>
            {cartao.interacoes.length === 0 ? (
              <p className="text-[13.5px]" style={COR_SECUNDARIA}>
                Nenhum contato registrado ainda.
              </p>
            ) : (
              <ol className="flex flex-col gap-4">
                {cartao.interacoes.map((i) => (
                  <li key={i.id} className="border-l-2 pl-4" style={{ borderColor: "var(--cor-borda-forte)" }}>
                    <p className="text-xs" style={COR_SECUNDARIA}>
                      <b className="numero" style={{ color: "var(--cor-texto-2)" }}>
                        {diaBrasilia(i.quando)}
                      </b>{" "}
                      · {rotuloCanal(i.canal)} · {nomes.get(i.autorId) ?? "—"}
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-relaxed">{i.resumo}</p>
                  </li>
                ))}
              </ol>
            )}
          </Secao>
        </div>
      </div>
    </AppShell>
  );
}

function rotuloEstagio(valor: string): string {
  return estagioCaptacaoValido(valor) ? ROTULO_ESTAGIO_CAPTACAO[valor] : valor;
}
