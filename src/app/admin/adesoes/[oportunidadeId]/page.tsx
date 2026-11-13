import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { exigirPermissaoDe, permissoesDoAdmin } from "@/lib/permissoes-db";
import { temPermissao } from "@/lib/permissoes";
import { prisma } from "@/lib/prisma";
import { percentualDeFracao } from "@/lib/formato";
import { centavosDoValor, formatarReaisDeCentavos } from "@/lib/registrar-adesao";
import { carregarCartoes } from "@/lib/kanban-db";
import { carregarParaRegistro } from "@/lib/registrar-adesao-db";
import { limiteAgregado, limitePorOrgao } from "@/lib/saldo";
import { logoutAdmin } from "../../actions";
import { NAV_ADMIN } from "../../nav";
import { AppShell } from "@/components/ui/app-shell";
import { Instrucao } from "@/components/kanban/instrucao";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { DesfazerRegistro, FormularioRegistro, type LinhaDoFormulario } from "./formulario-registro";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("pt-BR");
const dataBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

/**
 * Registro da adesão de um município (2026-11-14, atividade 13 do workflow). Mostra o que falta
 * para poder registrar (declaração do jurídico, contrato, prazo), o formulário com a quantidade
 * de cada item e, depois de registrada, as quantidades gravadas.
 */
export default async function RegistrarAdesaoPage({ params }: { params: Promise<{ oportunidadeId: string }> }) {
  const adminId = await adminIdLogado();
  if (!adminId) redirect("/admin/login");
  await exigirPermissaoDe(adminId, ["adesao.registrar", "adesao.declarar", "adesao.instruir"]);
  const permissoes = (await permissoesDoAdmin(adminId)) ?? [];
  const podeRegistrar = temPermissao(permissoes, "adesao.registrar");
  const podeInstruir = temPermissao(permissoes, "adesao.instruir");
  // Declarar e desfazer o registro são do jurídico (adesao.declarar).
  const podeDeclarar = temPermissao(permissoes, "adesao.declarar");
  const podeDesfazer = podeDeclarar;

  const { oportunidadeId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(oportunidadeId)) notFound();
  const dados = await carregarParaRegistro(oportunidadeId);
  if (!dados) notFound();
  const { oportunidade: op, itens } = dados;

  // O cartão do Kanban traz a instrução da adesão (os itens e a declaração) no formato que a tela usa.
  // Só para quem instrui ou declara: o estagiário que registra vê a declaração e o formulário, não o painel inteiro.
  const verInstrucao = podeInstruir || podeDeclarar;
  const cartao = verInstrucao ? ((await carregarCartoes({ id: op.id }, { verDesvio: true })).cartoes[0] ?? null) : null;

  const registrada = op.estagio === "aderiu";
  const pendencias: string[] = [];
  if (!registrada) {
    if (op.expirada) pendencias.push("O prazo deste município venceu: a equipe de vendas precisa fazer um novo pedido.");
    if (!op.declaradaEm) pendencias.push("O jurídico ainda não registrou a declaração de conformidade da adesão.");
    if (!op.percentualContrato) pendencias.push("A ata ainda não tem contrato de intermediação cadastrado.");
    if (itens.length === 0) pendencias.push("A ata não tem itens cadastrados. Cadastre os itens antes de registrar a adesão.");
  }

  const registrados = registrada
    ? await prisma.adesaoItem.findMany({
        where: { oportunidadeId: op.id },
        orderBy: { item: { descricao: "asc" } },
        select: {
          quantidade: true,
          registradoPor: true,
          criadoEm: true,
          item: { select: { descricao: true, unidade: true, valorUnitario: true } },
        },
      })
    : [];

  const linhas: LinhaDoFormulario[] = itens.map((i) => {
    const restanteMunicipio = Math.max(0, Math.floor(limitePorOrgao(i.quantidadeRegistrada)) - i.consumidoPeloMunicipio);
    const restanteTotal = Math.max(0, Math.floor(limiteAgregado(i.quantidadeRegistrada)) - i.consumidoNoTotal);
    return {
      itemId: i.itemId,
      descricao: i.descricao,
      unidade: i.unidade,
      valorUnitario: i.valorUnitario,
      quantidadeRegistrada: i.quantidadeRegistrada,
      maximoAgora: Math.min(restanteMunicipio, restanteTotal),
      jaAderidoMunicipio: i.consumidoPeloMunicipio,
      jaAderidoTotal: i.consumidoNoTotal,
    };
  });

  const totalCentavos = registrados.reduce((soma, r) => soma + centavosDoValor(r.item.valorUnitario.toString()) * r.quantidade, 0);

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
        rotulo="Adesão"
        titulo={op.municipio}
        destaque={op.uf ? `· ${op.uf}` : undefined}
        descricao={`Ata ${op.ataNumero} · ${op.ataObjeto}`}
        voltar={{ href: "/admin/adesoes", rotulo: "Adesões" }}
      />

      {cartao && (
        <Secao
          titulo="Instrução e declaração de conformidade"
          descricao={
            registrada
              ? "O que foi reunido e declarado para sustentar esta adesão."
              : "Os itens da instrução são marcados pelo consultor e pelo Dr. Rui, conforme os documentos chegam. A declaração de conformidade é do jurídico e libera o registro da adesão."
          }
          destaque={!registrada && !op.declaradaEm}
        >
          <div className="flex flex-col gap-5">
            <Instrucao
              cartao={cartao}
              somenteLeitura={!podeInstruir || registrada || op.expirada}
              podeDeclarar={podeDeclarar && !op.expirada}
            />
          </div>
        </Secao>
      )}

      {registrada ? (
        <Secao titulo="Adesão registrada" descricao="Quantidades gravadas por item. O saldo da ata já foi atualizado." destaque>
          <div className="flex flex-col gap-4">
            <div className="moldura-tabela">
              <table className="tabela-atas min-w-[640px]">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantidade aderida</th>
                    <th>Valor unitário</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {registrados.map((r) => (
                    <tr key={r.item.descricao}>
                      <td className="align-top">
                        <span className="titulo-linha">{r.item.descricao}</span>
                        <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                          {r.item.unidade}
                        </span>
                      </td>
                      <td className="numero align-top">{num(r.quantidade)}</td>
                      <td className="numero align-top">
                        R$ {Number(r.item.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="numero align-top">
                        {formatarReaisDeCentavos(centavosDoValor(r.item.valorUnitario.toString()) * r.quantidade)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {registrados.length === 0 ? (
              <Aviso tom="atencao">
                Esta adesão foi marcada antes de as quantidades serem registradas por item
                {op.valorAderido ? ` (valor aderido R$ ${Number(op.valorAderido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })})` : ""}.
              </Aviso>
            ) : (
              <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                Valor aderido: <b>{formatarReaisDeCentavos(totalCentavos)}</b>
                {op.percentualContrato ? ` · comissão pactuada no contrato: ${percentualDeFracao(Number(op.percentualContrato))}` : ""}
                {registrados[0] ? ` · registrado em ${dataBr(registrados[0].criadoEm)}` : ""}
              </p>
            )}
            {podeDesfazer && registrados.length > 0 && <DesfazerRegistro oportunidadeId={op.id} />}
          </div>
        </Secao>
      ) : pendencias.length > 0 ? (
        <Aviso tom="atencao" titulo="Ainda não dá para registrar:">
          <ul className="mt-1 list-disc pl-5">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Aviso>
      ) : podeRegistrar ? (
        <Secao
          titulo="Quantidade aderida por item"
          descricao={`Declaração do jurídico em ${op.declaradaEm ? dataBr(op.declaradaEm) : "—"} · comissão pactuada no contrato: ${op.percentualContrato ? percentualDeFracao(Number(op.percentualContrato)) : "—"}.`}
          destaque
        >
          <FormularioRegistro oportunidadeId={op.id} linhas={linhas} />
        </Secao>
      ) : (
        <Aviso tom="info">Você acompanha esta adesão, mas o registro é feito pela captação.</Aviso>
      )}
    </AppShell>
  );
}
