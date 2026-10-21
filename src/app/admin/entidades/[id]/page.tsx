import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alternarStatusEntidadeAlvo, alternarStatusPontoFocal, logoutAdmin, removerSinalMunicipio } from "../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { Aviso } from "@/components/ui/aviso";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { ROTULO_TIPO_ENTIDADE } from "@/lib/entidades-alvo";
import { ROTULO_CATEGORIA_CONSUMO } from "@/lib/classificador-objeto";
import { rotuloDaCategoria } from "@/lib/categorias";
import { Cifra } from "@/components/ui/valores";
import { FormularioNovoContato } from "./formulario";
import { FormularioSinal } from "./formulario-sinal";
import { ROTULO_TIPO_SINAL, tipoSinalValido } from "@/lib/sinais";
import { FormularioRaioXConsumo } from "./formulario-raio-x";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

export default async function DetalheEntidadeAlvoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const entidade = await prisma.entidadeAlvo.findUnique({
    where: { id },
    include: {
      contatos: {
        orderBy: [{ cargo: "asc" }, { nomeContato: "asc" }],
        include: { _count: { select: { interacoes: true } } },
      },
      historicoConsumo: { orderBy: { ultimaContratacao: "desc" } },
      sinais: { orderBy: { dataSinal: "desc" }, take: 30 },
    },
  });

  if (!entidade) {
    notFound();
  }

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Cadastros"
        titulo={entidade.nome}
        descricao={
          <>
            {ROTULO_TIPO_ENTIDADE[entidade.tipo] ?? entidade.tipo}
            {entidade.esfera ? ` · ${entidade.esfera}` : ""}
            {entidade.uf ? ` · ${entidade.uf}` : ""}
            {entidade.municipio ? ` · ${entidade.municipio}` : ""}
          </>
        }
        voltar={{ href: "/admin/entidades", rotulo: "Municípios/Entidades" }}
      />

      <Secao
        titulo="Dados"
        destaque
        acao={
          <div className="flex items-center gap-3">
            <Badge tom={entidade.ativo ? "neutro" : "critico"}>
              {entidade.ativo ? "Ativa" : "Inativa"}
            </Badge>
            <form action={alternarStatusEntidadeAlvo}>
              <input type="hidden" name="entidadeAlvoId" value={entidade.id} />
              <button
                type="submit"
                className={entidade.ativo ? "botao-atas critico" : "botao-atas secundario"}
              >
                {entidade.ativo ? "Desativar" : "Reativar"}
              </button>
            </form>
          </div>
        }
      >
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Dado rotulo="Endereço">{entidade.endereco ?? "—"}</Dado>
          <Dado rotulo="CNPJ">
            <span className="codigo">{entidade.cnpj ?? "—"}</span>
          </Dado>
        </dl>
      </Secao>

      <Secao
        titulo={`Sinais de compra (${entidade.sinais.length})`}
        descricao="O sinal mais relevante vira a linha “por que agora” do card do vendedor. Sempre com fonte e data."
      >
        {entidade.sinais.length > 0 && (
          <ul className="lista-linhas mb-6">
            {entidade.sinais.map((sn) => (
              <li key={sn.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="titulo-linha text-[14px]">{sn.titulo}</p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {tipoSinalValido(sn.tipo) ? ROTULO_TIPO_SINAL[sn.tipo] : sn.tipo} · {sn.fonte} ·{" "}
                    <span className="numero">{sn.dataSinal.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>
                    {sn.expiraEm ? ` · vale até ${sn.expiraEm.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}
                    {sn.categoria ? ` · ${rotuloDaCategoria(sn.categoria)}` : ""}
                  </p>
                </div>
                <form action={removerSinalMunicipio} className="shrink-0">
                  <input type="hidden" name="sinalId" value={sn.id} />
                  <button type="submit" className="botao-atas critico pequeno">
                    Remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className={entidade.sinais.length > 0 ? "border-t pt-5" : undefined} style={{ borderColor: "var(--cor-borda)" }}>
          <p className="eyebrow mb-4">Novo sinal</p>
          <FormularioSinal entidadeAlvoId={entidade.id} />
        </div>
      </Secao>

      <Secao
        titulo="Raio-X de consumo"
        acao={<FormularioRaioXConsumo entidadeAlvoId={entidade.id} temCnpj={!!entidade.cnpj} />}
      >
        {!entidade.cnpj ? (
          <Aviso tom="atencao">
            Sem CNPJ cadastrado — não dá pra consultar o histórico de contratos no PNCP.
          </Aviso>
        ) : entidade.historicoConsumo.length === 0 ? (
          <VazioComAcao
            titulo={entidade.raioXAtualizadoEm ? "Nenhuma categoria conhecida identificada" : "Ainda não levantado"}
            descricao={
              entidade.raioXAtualizadoEm
                ? `Última verificação em ${entidade.raioXAtualizadoEm.toLocaleString("pt-BR")} — não encontrou contrato nas categorias conhecidas nos últimos 3 anos.`
                : "Clique em 'Atualizar' para buscar o histórico de contratos deste município no PNCP (últimos 3 anos)."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tabela-atas min-w-[560px]">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="w-[150px]">Última contratação</th>
                    <th className="w-[140px] text-right">Valor</th>
                    <th className="w-[160px] text-right">Contratos na janela</th>
                  </tr>
                </thead>
                <tbody>
                  {entidade.historicoConsumo.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <span className="titulo-linha">{ROTULO_CATEGORIA_CONSUMO[h.categoria] ?? h.categoria}</span>
                      </td>
                      <td className="numero text-[13px]" style={{ color: "var(--cor-texto)" }}>
                        {h.ultimaContratacao.toLocaleDateString("pt-BR")}
                      </td>
                      <td className="numero whitespace-nowrap text-right font-semibold" style={{ color: "var(--cor-texto)" }}>
                        <Cifra valor={h.valorUltimaContratacao} />
                      </td>
                      <td className="numero text-right">{h.quantidadeContratosNaJanela}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Aviso tom="info" className="mt-4">
              Classificação por palavra-chave no objeto do contrato — aproximada, confira o
              objeto antes de usar numa abordagem comercial. Atualizado em{" "}
              {entidade.historicoConsumo[0].atualizadoEm.toLocaleString("pt-BR")}.
            </Aviso>
          </>
        )}
      </Secao>

      <FormularioNovoContato entidadeAlvoId={entidade.id} />

      <Secao titulo={`Contatos (${entidade.contatos.length})`}>
        {entidade.contatos.length === 0 ? (
          <VazioComAcao
            titulo="Nenhum contato cadastrado"
            descricao="Cadastre o prefeito, cada secretário ou um intermediário usando o formulário acima."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[680px]">
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>Telefone · e-mail</th>
                  <th className="w-[110px]">Interações</th>
                  <th className="w-[1%]">Situação</th>
                </tr>
              </thead>
              <tbody>
                {entidade.contatos.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        href={`/admin/entidades/${entidade.id}/contatos/${c.id}`}
                        className="titulo-linha block hover:text-[var(--cor-marca-clara)]"
                      >
                        {c.nomeContato}
                      </Link>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {c.cargo}
                        {c.area ? ` (${c.area})` : ""}
                      </span>
                    </td>
                    <td className="text-[13px]">
                      <span className="block">{c.telefone ?? "sem telefone"}</span>
                      <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {c.email ?? "sem e-mail"}
                      </span>
                    </td>
                    <td className="numero whitespace-nowrap text-[13px]">
                      {c._count.interacoes} {c._count.interacoes === 1 ? "interação" : "interações"}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Badge tom={c.ativo ? "neutro" : "critico"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                        <form action={alternarStatusPontoFocal}>
                          <input type="hidden" name="pontoFocalId" value={c.id} />
                          <button
                            type="submit"
                            className={c.ativo ? "botao-atas critico" : "botao-atas secundario"}
                          >
                            {c.ativo ? "Desativar" : "Reativar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </AppShell>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold" style={{ color: "var(--cor-texto-3)" }}>
        {rotulo}
      </dt>
      <dd className="mt-1 text-[14px]" style={{ color: "var(--cor-texto)" }}>
        {children}
      </dd>
    </div>
  );
}
