import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado, vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AVISO_MINUTA, dataPorExtenso, dividirMarcadores, montarMinutas, separarSubtitulo } from "@/lib/minutas";
import { carregarComparativoOuNulo } from "@/lib/vantajosidade-db";
import { Aviso } from "@/components/ui/aviso";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { BotaoImprimir } from "./botao-imprimir";

export const dynamic = "force-dynamic";

// Página interna (dados do município e da ata): nunca para buscador, mesmo que a
// indexação do site seja ligada e o robots.txt não liste esta rota.
export const metadata: Metadata = {
  title: "Kit de minutas",
  robots: { index: false, follow: false },
};

/**
 * Sem sessão, vai para o login de quem costuma chegar aqui: a equipe de
 * gestão, quando o link foi aberto de dentro de /admin; o vendedor, nos
 * demais casos. O Referer só escolhe entre dois destinos fixos.
 */
async function loginCorrespondente(): Promise<string> {
  const referencia = (await headers()).get("referer");
  if (referencia) {
    try {
      if (new URL(referencia).pathname.startsWith("/admin")) return "/admin/login";
    } catch {
      // Referer ilegível: cai no padrão.
    }
  }
  return "/vendedor/login";
}

/**
 * Trecho a completar. Na tela: fundo de atenção. No papel (muita impressora
 * não imprime fundo): negrito, sublinhado pontilhado e os colchetes do texto.
 * `box-decoration-clone` mantém o destaque inteiro quando o trecho quebra de linha.
 */
function Marcador({ children }: { children: React.ReactNode }) {
  return (
    <mark
      className="rounded px-1 font-semibold box-decoration-clone print:underline print:decoration-dotted print:underline-offset-2"
      style={{ background: "var(--cor-atencao-fundo)", color: "var(--cor-atencao)" }}
    >
      {children}
    </mark>
  );
}

/** Um parágrafo do modelo: subtítulo em negrito, quebras de linha mantidas e os [PREENCHER: ...] destacados. */
function Paragrafo({ texto }: { texto: string }) {
  const { subtitulo, corpo } = separarSubtitulo(texto);
  return (
    <div className="break-inside-avoid">
      {subtitulo && (
        <h3 className="mb-1 font-bold" style={{ color: "var(--cor-texto)" }}>
          {subtitulo}
        </h3>
      )}
      <p className="whitespace-pre-line break-words">
        {dividirMarcadores(corpo).map((trecho, indice) =>
          trecho.marcador ? <Marcador key={indice}>{trecho.texto}</Marcador> : <span key={indice}>{trecho.texto}</span>,
        )}
      </p>
    </div>
  );
}

/**
 * Kit de minutas da adesão (Projeto RNA, etapa 3): cinco modelos de texto
 * preenchidos com o que a plataforma já sabe da oportunidade (município + ata)
 * e com marcadores [PREENCHER: ...] para o resto. Acesso só do vendedor dono da
 * oportunidade ou do gestor. Imprime tudo, uma minuta por página. Os textos e
 * o preenchimento ficam em src/lib/minutas.ts.
 */
export default async function MinutasPage({ params }: { params: Promise<{ oportunidadeId: string }> }) {
  const { oportunidadeId } = await params;

  const [adminId, vendedorId] = await Promise.all([adminIdLogado(), vendedorIdLogado()]);
  if (!adminId && !vendedorId) redirect(await loginCorrespondente());

  const oportunidade = await prisma.oportunidadeVenda.findUnique({
    where: { id: oportunidadeId },
    select: {
      id: true,
      ataId: true,
      vendedorId: true,
      expiradaEm: true,
      entidadeAlvo: { select: { nome: true, uf: true } },
      ata: {
        select: {
          numero: true,
          objeto: true,
          categoria: true,
          dataVigenciaFim: true,
          fornecedor: { select: { razaoSocial: true } },
          orgaoGerenciador: { select: { nome: true, uf: true } },
        },
      },
      instrucao: {
        select: {
          itens: true,
          declaracaoEm: true,
          declaracaoPorTipo: true,
          declaracaoPorId: true,
          declaracaoVersao: true,
          declaracaoExcecao: true,
        },
      },
    },
  });
  if (!oportunidade) notFound();
  // Vendedor só abre as suas, e só enquanto estão liberadas (a oportunidade
  // expirada some do Kanban e o município volta a ficar livre; as ações de
  // instrução também a recusam). Para os outros a página simplesmente não
  // existe, igual a um id inexistente. O gestor abre qualquer uma.
  if (!adminId && (oportunidade.vendedorId !== vendedorId || oportunidade.expiradaEm)) notFound();

  const { entidadeAlvo, ata, instrucao } = oportunidade;

  // Quem registrou a declaração (só o nome; nenhum contato vai para o papel).
  let registradoPor: string | null = null;
  if (instrucao?.declaracaoEm && instrucao.declaracaoPorId) {
    if (instrucao.declaracaoPorTipo === "admin") {
      registradoPor = (await prisma.admin.findUnique({ where: { id: instrucao.declaracaoPorId }, select: { nome: true } }))?.nome ?? null;
    } else if (instrucao.declaracaoPorTipo === "vendedor") {
      registradoPor = (await prisma.vendedor.findUnique({ where: { id: instrucao.declaracaoPorId }, select: { nome: true } }))?.nome ?? null;
    }
  }

  // Comparativo auxiliar de preços da ata: entra só na justificativa da vantagem, e só se algum item foi comparado.
  const comparativo = await carregarComparativoOuNulo(oportunidade.ataId);

  const hoje = new Date();
  const minutas = montarMinutas({
    hoje,
    orgaoAderente: { nome: entidadeAlvo.nome, uf: entidadeAlvo.uf },
    ata: {
      numero: ata.numero,
      objeto: ata.objeto,
      categoria: ata.categoria,
      vigenciaFim: ata.dataVigenciaFim,
    },
    orgaoGerenciador: { nome: ata.orgaoGerenciador.nome, uf: ata.orgaoGerenciador.uf },
    fornecedor: { razaoSocial: ata.fornecedor.razaoSocial },
    itens: instrucao?.itens,
    comparativo: comparativo ? { resumo: comparativo.resumo, consultadoEm: comparativo.consultadoEm } : null,
    declaracao: instrucao?.declaracaoEm
      ? {
          em: instrucao.declaracaoEm,
          porTipo: instrucao.declaracaoPorTipo,
          porNome: registradoPor,
          excecao: instrucao.declaracaoExcecao,
          versao: instrucao.declaracaoVersao,
        }
      : null,
  });

  const voltar = adminId
    ? { href: "/admin/pipeline", rotulo: "Voltar ao pipeline" }
    : { href: `/vendedor/atas/${oportunidade.ataId}`, rotulo: "Voltar ao Kanban da ata" };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:space-y-0 print:p-0">
      {/* Timbre — só aparece na impressão/PDF, na primeira página */}
      <div className="timbre-impressao mb-6 border-b pb-4" style={{ borderColor: "var(--cor-borda)" }}>
        <p className="marca-wordmark text-lg">Central Nacional de Atas de Registro de Preços</p>
        <p className="text-xs">
          Kit de minutas da adesão — {entidadeAlvo.nome} — ata nº {ata.numero}
        </p>
      </div>

      <div className="sem-impressao space-y-6">
        <CabecalhoPagina
          rotulo="Instrução da adesão"
          titulo="Kit de minutas"
          descricao={
            <>
              {entidadeAlvo.nome} · Ata <span className="codigo">{ata.numero}</span> ({ata.fornecedor.razaoSocial})
            </>
          }
          voltar={voltar}
          acoes={<BotaoImprimir />}
        />
        <Aviso tom="info" titulo="Modelos para adaptação.">
          A plataforma só organiza as informações e os modelos. A instrução do processo e a decisão de aderir são do
          órgão aderente; a anuência cabe ao órgão gerenciador e o aceite, ao fornecedor. O que a plataforma não sabe
          aparece destacado, como em <Marcador>[PREENCHER: ...]</Marcador>, e precisa ser completado antes do uso: copie o
          texto para o editor do órgão ou imprima e preencha à mão. Para imprimir ou salvar em PDF, use o botão acima: o
          kit sai inteiro, com uma minuta por página.
        </Aviso>
        <nav aria-label="Minutas do kit">
          <p className="eyebrow mb-2">Nesta página</p>
          <div className="flex flex-wrap gap-2">
            {minutas.map((minuta) => (
              <a key={minuta.chave} href={`#minuta-${minuta.chave}`} className="chip-site">
                {minuta.titulo}
              </a>
            ))}
          </div>
        </nav>
      </div>

      {/* Bloco comum (não flex): a quebra de página entre as minutas depende disso. */}
      <div>
        {minutas.map((minuta) => {
          const [primeiro, ...corpo] = minuta.paragrafos;
          const aviso = primeiro === AVISO_MINUTA ? primeiro : null;
          const paragrafos = aviso ? corpo : minuta.paragrafos;
          return (
            // A quebra de página fica neste envoltório (filho direto do bloco comum), não no cartão.
            <div
              key={minuta.chave}
              id={`minuta-${minuta.chave}`}
              className="mb-6 scroll-mt-6 print:mb-0 print:break-after-page print:last:break-after-auto"
            >
              <Secao
                titulo={minuta.titulo}
                className="max-sm:p-4 print:break-inside-auto! print:border-0! print:p-0! print:shadow-none!"
              >
                {aviso && (
                  <Aviso tom="atencao" className="mb-5">
                    <strong>{aviso}</strong>
                  </Aviso>
                )}
                <div
                  className="flex flex-col gap-4 text-[14.5px] leading-relaxed print:text-[12pt]"
                  style={{ color: "var(--cor-texto-2)" }}
                >
                  {paragrafos.map((texto, indice) => (
                    <Paragrafo key={indice} texto={texto} />
                  ))}
                </div>
              </Secao>
            </div>
          );
        })}
      </div>

      {/* Rodapé — só aparece na impressão/PDF, depois da última minuta */}
      <p className="rodape-impressao mt-6 border-t pt-3 text-xs" style={{ borderColor: "var(--cor-borda)" }}>
        Modelos gerados pela Central Nacional de Atas de Registro de Preços em {dataPorExtenso(hoje)}. Não substituem
        os atos formais da instrução do processo de adesão nem o assessoramento jurídico do órgão.
      </p>
    </main>
  );
}
