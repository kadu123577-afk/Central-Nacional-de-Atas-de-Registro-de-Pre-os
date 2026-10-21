import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAdmin, rejeitarAta } from "../../../actions";
import { NAV_ADMIN } from "../../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { ITENS_CONFORMIDADE, alertasAutomaticos, type RespostasConformidade } from "@/lib/conformidade";
import { percentualDeFracao } from "@/lib/formato";
import { FormularioAnalise } from "./formulario";

export const dynamic = "force-dynamic";

const ROTULO_STATUS = { PENDENTE: "Pendente", APROVADA: "Aprovada", REJEITADA: "Rejeitada" } as const;

/**
 * Análise interna da ata (2026-10-04) — o gestor confere o checklist de
 * conformidade (SCP cl. 8), confirma o contrato de intermediação e só
 * então aprova. A ata só chega ao vendedor se estiver aprovada E com
 * contrato cadastrado.
 */
export default async function AnaliseAtaPage({ params }: { params: Promise<{ ataId: string }> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");

  const { ataId } = await params;
  const ata = await prisma.ata.findUnique({
    where: { id: ataId },
    include: {
      fornecedor: true,
      orgaoGerenciador: true,
      contrato: true,
      conformidade: true,
      documentos: { select: { id: true, nomeArquivo: true } },
      _count: { select: { itens: true } },
    },
  });
  if (!ata) notFound();

  const alertas = alertasAutomaticos({
    dataVigenciaFim: ata.dataVigenciaFim,
    itensCount: ata._count.itens,
    categoria: ata.categoria,
    documentosCount: ata.documentos.length,
  });
  if (!ata.contrato) {
    alertas.push("Sem contrato de intermediação — o vendedor não verá esta ata até o contrato ser cadastrado.");
  }

  const c = ata.conformidade;
  const respostasAtuais: RespostasConformidade = {
    fornecedorRegular: c?.fornecedorRegular ?? false,
    editalPermiteAdesao: c?.editalPermiteAdesao ?? false,
    limitesRespeitados: c?.limitesRespeitados ?? false,
    pesquisaPrecos: c?.pesquisaPrecos ?? false,
    anuenciaGerenciador: c?.anuenciaGerenciador ?? false,
    estimativaQuantidades: c?.estimativaQuantidades ?? false,
  };

  const totalItens = ITENS_CONFORMIDADE.length;
  const confirmados = ITENS_CONFORMIDADE.filter((i) => respostasAtuais[i.campo]).length;
  const pctConformidade = Math.round((confirmados / totalItens) * 100);
  // O vendedor só enxerga a ata aprovada E com contrato (portão do pool).
  const visivelAoVendedor = ata.status === "APROVADA" && Boolean(ata.contrato);

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
        rotulo="Operação"
        titulo="Análise da ata"
        destaque={ata.numero}
        descricao={
          <>
            <span className="block">
              {ata.fornecedor.razaoSocial} · {ata.orgaoGerenciador.nome}{" "}
              <span className="selo-uf align-middle">{ata.orgaoGerenciador.uf}</span>
            </span>
            <span className="mt-1 block">{ata.objeto}</span>
          </>
        }
        voltar={{ href: "/admin", rotulo: "Painel" }}
        acoes={<Badge tom={ata.status === "APROVADA" ? "marca" : "neutro"}>{ROTULO_STATUS[ata.status]}</Badge>}
      />

      <section className="painel p-6">
        <ol className="passos">
          <Etapa
            marcador={1}
            titulo="Conformidade"
            concluida={confirmados === totalItens}
            valor={`${confirmados}/${totalItens}`}
            corValor={
              confirmados === totalItens ? "var(--cor-marca-clara)" : confirmados > 0 ? "var(--cor-atencao)" : undefined
            }
            nota={confirmados === totalItens ? "checklist completo" : `${totalItens - confirmados} item(ns) a confirmar`}
          >
            <div className="barra-saldo mx-auto mt-3 max-w-[140px]">
              <div style={{ width: `${pctConformidade}%` }} />
            </div>
          </Etapa>
          <Etapa
            marcador={2}
            titulo="Contrato"
            concluida={Boolean(ata.contrato)}
            valor={ata.contrato ? percentualDeFracao(Number(ata.contrato.percentualComissao)) : "Pendente"}
            corValor={ata.contrato ? "var(--cor-marca-clara)" : "var(--cor-alerta)"}
            nota={ata.contrato ? "comissão pactuada com o fornecedor" : "sem contrato o vendedor não vê a ata"}
          />
          <Etapa
            marcador={3}
            titulo="Aprovação"
            concluida={ata.status === "APROVADA"}
            valor={ROTULO_STATUS[ata.status]}
            corValor={
              ata.status === "APROVADA"
                ? "var(--cor-marca-clara)"
                : ata.status === "REJEITADA"
                  ? "var(--cor-critico)"
                  : undefined
            }
            nota={ata.status === "APROVADA" ? "liberada no catálogo público" : "só aparece no catálogo depois de aprovada"}
          />
          <Etapa
            marcador={<IconeOlho />}
            titulo="Visível ao vendedor"
            concluida={visivelAoVendedor}
            valor={visivelAoVendedor ? "Sim" : "Não"}
            corValor={visivelAoVendedor ? "var(--cor-marca-clara)" : "var(--cor-atencao)"}
            nota={visivelAoVendedor ? "no pool de atas disponíveis" : "precisa estar aprovada e com contrato"}
          />
        </ol>
      </section>

      {alertas.length > 0 && (
        <Aviso tom="atencao" titulo="Alertas">
          <ul className="mt-1 list-disc pl-5">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      <Secao
        titulo="Contrato de intermediação"
        acao={
          <Link href={`/admin/atas/${ata.id}/contrato`} className="botao-atas secundario">
            {ata.contrato ? "Editar contrato" : "Cadastrar contrato"}
          </Link>
        }
      >
        <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
          {ata.contrato ? (
            <>
              Comissão pactuada:{" "}
              <strong className="numero text-[15px]" style={{ color: "var(--cor-texto)" }}>
                {String(Number((Number(ata.contrato.percentualComissao) * 100).toFixed(2))).replace(".", ",")}%
              </strong>
            </>
          ) : (
            "Nenhum contrato cadastrado."
          )}
        </p>
      </Secao>

      <Secao titulo="Checklist de conformidade" destaque>
        {ata.documentos.length > 0 && (
          <p
            className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            style={{ color: "var(--cor-texto-3)" }}
          >
            <span>Documentos:</span>
            {ata.documentos.map((d) => (
              <a
                key={d.id}
                href={`/api/documentos/${d.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
                style={{ color: "var(--cor-marca-clara)" }}
              >
                {d.nomeArquivo}
              </a>
            ))}
          </p>
        )}
        <FormularioAnalise ataId={ata.id} respostasAtuais={respostasAtuais} parecerAtual={c?.parecer ?? ""} />
        {ata.status !== "REJEITADA" && (
          <form action={rejeitarAta} className="mt-6 border-t pt-5" style={{ borderColor: "var(--cor-borda)" }}>
            <input type="hidden" name="ataId" value={ata.id} />
            <button type="submit" className="botao-atas critico">
              Rejeitar ata
            </button>
          </form>
        )}
      </Secao>
    </AppShell>
  );
}

/** Uma etapa da análise no passo-a-passo do site (círculo verde quando concluída). */
function Etapa({
  marcador,
  titulo,
  concluida,
  valor,
  corValor,
  nota,
  children,
}: {
  marcador: React.ReactNode;
  titulo: string;
  concluida: boolean;
  valor: React.ReactNode;
  corValor?: string;
  nota: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="passo" data-ativo={concluida}>
      <span className="passo-numero">{marcador}</span>
      <p className="marca text-[15px]" style={{ color: "var(--cor-texto)" }}>
        {titulo}
      </p>
      <p
        className="numero mt-2 text-[22px] font-extrabold leading-tight"
        style={{ color: corValor ?? "var(--cor-texto)", letterSpacing: "-0.03em" }}
      >
        {valor}
      </p>
      <p className="mx-auto mt-1 max-w-[200px] text-[12.5px] leading-relaxed" style={{ color: "var(--cor-texto-3)" }}>
        {nota}
      </p>
      {children}
    </li>
  );
}

function IconeOlho() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M1.8 9S4.4 3.8 9 3.8 16.2 9 16.2 9 13.6 14.2 9 14.2 1.8 9 1.8 9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
