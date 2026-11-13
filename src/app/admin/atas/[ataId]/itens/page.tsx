import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe } from "@/lib/permissoes-db";
import { prisma } from "@/lib/prisma";
import { logoutAdmin } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { CATEGORIAS_ATAS, rotuloDaCategoria } from "@/lib/categorias";
import { compraDaAtaNoPncp } from "@/lib/itens-pncp";
import { linkPncpDaAta } from "@/lib/link-pncp";
import { diasRestantesBrasilia, textoDiasRestantes, tomDiasRestantes } from "@/lib/radar-atas-view";
import { FormularioAdicionarItem } from "../completar/formulario-item";
import { ImportarItens } from "./importar-itens";

export const dynamic = "force-dynamic";

/**
 * Itens e saldos da ata (2026-11-14), a tela do estagiário (atividade 3 do workflow): ver a ata e o
 * documento que o captador anexou, ver os itens já cadastrados, importar o Excel ou o PDF com os itens
 * (ou o próprio documento da ata) ou adicionar um item à mão. Exige "atas.itens" (ou "atas.captar").
 */
export default async function ItensDaAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, ["atas.itens", "atas.captar"]);

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: {
      orgaoGerenciador: { select: { nome: true, uf: true, municipio: true } },
      fornecedor: { select: { razaoSocial: true } },
      documentos: { select: { id: true, nomeArquivo: true, tipoMime: true, tamanhoBytes: true }, orderBy: { id: "asc" } },
      itens: { orderBy: { descricao: "asc" } },
    },
  });
  if (!ata) notFound();

  const agora = new Date();
  const dias = diasRestantesBrasilia(ata.dataVigenciaFim, agora);
  const linkPncp = linkPncpDaAta(ata);

  const total = ata.itens.reduce((soma, i) => soma + Number(i.valorUnitario) * i.quantidadeRegistrada, 0);

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      larguraMaxima="max-w-5xl"
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Itens e saldos"
        titulo="Itens e saldos da ata"
        destaque={ata.numero}
        descricao={`${ata.itens.length} item(ns) · valor total registrado R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        voltar={{ href: "/admin/atas-itens", rotulo: "Itens das atas" }}
      />

      <Secao titulo="A ata" descricao="O que o captador cadastrou. Os itens vêm do documento anexado ou da planilha da empresa.">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-[14px] sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Empresa</dt>
            <dd>{ata.fornecedor.razaoSocial}</dd>
          </div>
          <div>
            <dt className="eyebrow">Órgão gerenciador</dt>
            <dd>
              {ata.orgaoGerenciador.nome} · {ata.orgaoGerenciador.municipio}/{ata.orgaoGerenciador.uf}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Vigência até</dt>
            <dd className="inline-flex flex-wrap items-center gap-2">
              <span className="numero">{ata.dataVigenciaFim.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>
              <Badge tom={tomDiasRestantes(dias)}>{textoDiasRestantes(dias)}</Badge>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Ata oficial no PNCP</dt>
            <dd>
              {linkPncp ? (
                <a href={linkPncp} target="_blank" rel="noopener noreferrer" className="botao-atas link text-[13.5px]">
                  Abrir no PNCP →<span className="sr-only"> (abre em nova aba)</span>
                </a>
              ) : (
                <span style={{ color: "var(--cor-texto-3)" }}>link não informado</span>
              )}
            </dd>
          </div>
        </dl>
      </Secao>

      <Secao titulo={`Itens cadastrados (${ata.itens.length})`}>
        {ata.itens.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
            Esta ata ainda não tem itens. Adicione um item abaixo ou importe a planilha.
          </p>
        ) : (
          <div className="moldura-tabela">
            <table className="tabela-atas min-w-[720px]">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Unidade</th>
                  <th>Quantidade</th>
                  <th>Valor unitário</th>
                  <th>Categoria</th>
                  <th>Código</th>
                </tr>
              </thead>
              <tbody>
                {ata.itens.map((i) => (
                  <tr key={i.id}>
                    <td className="align-top">
                      <span className="titulo-linha">{i.descricao}</span>
                      {i.marca && (
                        <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {i.marca}
                        </span>
                      )}
                    </td>
                    <td className="align-top">{i.unidade}</td>
                    <td className="numero align-top">{i.quantidadeRegistrada.toLocaleString("pt-BR")}</td>
                    <td className="numero align-top">
                      R$ {Number(i.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="align-top">{rotuloDaCategoria(i.categoria)}</td>
                    <td className="codigo align-top">{i.codigoCatalogo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao titulo="Importar os itens (Excel ou PDF)" descricao="Para ata com muitos itens: o que for lido aparece para você conferir antes de gravar. Se houver um erro, nada é gravado.">
        <ImportarItens
          ataId={ata.id}
          itensNaAta={ata.itens.length}
          podeBuscarNoPncp={compraDaAtaNoPncp({ linkPncp: linkPncp ?? ata.linkPncp, numeroControlePncp: ata.numeroControlePncp }) !== null}
          documentos={ata.documentos.map((d) => ({
            id: d.id,
            nomeArquivo: d.nomeArquivo,
            tamanhoKb: Math.max(1, Math.round(d.tamanhoBytes / 1024)),
            legivel: d.tipoMime === "application/pdf",
          }))}
        />
      </Secao>

      <Secao titulo="Adicionar um item">
        <FormularioAdicionarItem ataId={ata.id} categorias={CATEGORIAS_ATAS} />
      </Secao>
    </AppShell>
  );
}
