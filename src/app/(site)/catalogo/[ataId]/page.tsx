import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { obterAta } from "@/lib/catalogo-publico";
import { nomeDoGrupo } from "@/lib/site/categorias";
import { linkContato, SITE } from "@/lib/site/config";
import { numero } from "@/lib/site/formato";
import { nivelDeVisao } from "@/lib/visibilidade";
import { IconeCadeado, IconeCategoria, IconeSeta } from "@/components/site/icones";
import { LivroAtas, SeloVigencia } from "@/components/site/pecas";
import { TabelaItens } from "@/components/site/tabela-itens";

type Parametros = { params: Promise<{ ataId: string }> };

export async function generateMetadata({ params }: Parametros): Promise<Metadata> {
  const { ataId } = await params;
  const nivel = await nivelDeVisao();
  const ata = await obterAta(ataId, nivel);
  if (!ata) return { title: "Ata não encontrada", robots: { index: false, follow: false } };
  return {
    title: `Ata ${ata.codigo} · ${ata.objeto}`,
    // Sem UF, itens nem saldo: o que não aparece na página não vai para o Google.
    description: `Ata ${ata.codigo}: ${ata.objeto} (${nomeDoGrupo(ata.grupoId)}). Entre com o acesso do seu órgão para ver os itens e pedir a adesão pela Central Nacional de Atas.`,
    alternates: { canonical: `/catalogo/${ata.id}` },
  };
}

export default async function PaginaAta({ params }: Parametros) {
  const { ataId } = await params;
  const nivel = await nivelDeVisao();
  const ata = await obterAta(ataId, nivel);
  if (!ata) notFound();

  const completo = nivel === "completo";
  const visitante = nivel === "publico";
  const orgaoLogado = nivel === "orgao";
  const grupo = nomeDoGrupo(ata.grupoId);

  const hrefEntrar = `/entrar?perfil=orgao&ata=${encodeURIComponent(ata.id)}`;
  const hrefPedidoAta = orgaoLogado ? "#t-itens" : hrefEntrar;
  const externo = SITE.whatsapp ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const contatoDuvida = linkContato(`Olá! Tenho uma dúvida sobre a Ata ${ata.codigo} (${ata.objeto}).`);

  return (
    <>
      <header className="cabeca-pagina">
        <div className="wrap">
          <nav className="migalhas" aria-label="Você está em">
            <ol>
              <li><Link href="/">Início</Link></li>
              <li><Link href="/catalogo">Catálogo</Link></li>
              <li><Link href={`/catalogo?cat=${ata.grupoId}`}>{grupo}</Link></li>
              <li aria-current="page">Ata {ata.codigo}</li>
            </ol>
          </nav>
          <h1>{ata.objeto}</h1>
          <p className="ata-cabeca__meta">
            <span className="mono">Ata nº {ata.codigo}</span>
            <span>
              <IconeCategoria id={ata.grupoId} />
              {grupo}
            </span>
            {ata.uf ? <span className="mono">{ata.uf}</span> : null}
            {ata.vigencia ? <SeloVigencia vigencia={ata.vigencia} compacto /> : null}
          </p>
        </div>
      </header>

      <div className="wrap detalhe">
        <div className="detalhe__principal">
          {visitante ? (
            <section className="bloco" aria-labelledby="t-itens">
              <div className="bloco__cabeca">
                <div>
                  <h2 id="t-itens">Itens, quantidades e saldo</h2>
                  <p>
                    <IconeCadeado estilo={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 4 }} />
                    Disponíveis para órgãos públicos com acesso. Entre para ver o que há nesta ata, quanto
                    ainda pode ser aderido e fazer o pedido.
                  </p>
                </div>
                <Link className="botao botao--primario botao--pequeno" href={hrefEntrar}>
                  Entrar como órgão
                </Link>
              </div>
            </section>
          ) : (
            <TabelaItens
              ataId={ata.id}
              itens={ata.itens}
              total={ata.nItensTotal ?? ata.itens.length}
              completo={completo}
              orgaoLogado={orgaoLogado}
              codigo={ata.codigo}
            />
          )}

          <section className="bloco" aria-labelledby="t-docs">
            <div className="bloco__cabeca">
              <div>
                <h2 id="t-docs">Documentos da ata</h2>
                {completo && ata.documentos && ata.documentos.length > 0 ? (
                  <ul className="docs">
                    {ata.documentos.map((d) => (
                      <li key={d.id}>
                        <span>{d.nome}</span>
                        <a className="botao botao--secundario botao--pequeno" href={`/api/documentos/${d.id}`}>
                          Baixar
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : completo ? (
                  <p>Nenhum documento anexado a esta ata.</p>
                ) : (
                  <p>
                    <IconeCadeado estilo={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 4 }} />
                    Os documentos são enviados pela equipe da Central durante o pedido de adesão.
                  </p>
                )}
              </div>
              {!completo ? (
                <a
                  className="botao botao--secundario botao--pequeno"
                  href={linkContato(`Olá! Quero os documentos da Ata ${ata.codigo} (${ata.objeto}).`)}
                  {...externo}
                >
                  Falar com a equipe
                </a>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="resumo" aria-label="Resumo da ata">
          <div className="bloco">
            {!visitante ? (
              <>
                <div className="resumo__vigencia">
                  <span className="rotulo-secao">
                    <span className="losango" aria-hidden="true" />
                    Vigência
                  </span>
                  {completo && ata.diasRestantes !== undefined ? (
                    <>
                      <p className="dias tab">
                        {numero(Math.max(ata.diasRestantes, 0))}
                        <small>{ata.diasRestantes === 1 ? "dia restante" : "dias restantes"}</small>
                      </p>
                      <p>
                        De {ata.inicio} a {ata.fim}
                      </p>
                    </>
                  ) : ata.vigencia ? (
                    <p>
                      <SeloVigencia vigencia={ata.vigencia} />
                    </p>
                  ) : null}
                </div>
                <dl>
                  <div><dt>Itens</dt><dd>{ata.nItensTotal}</dd></div>
                  <div><dt>Saldo médio para adesão</dt><dd>{Math.round((ata.saldoMedio ?? 0) * 100)}%</dd></div>
                  {completo ? (
                    <>
                      <div><dt>Órgão gerenciador</dt><dd className="longo">{ata.orgao}</dd></div>
                      <div><dt>Fornecedor</dt><dd className="longo">{ata.fornecedor}</dd></div>
                      {ata.numeroPncp ? (
                        <div><dt>Nº de controle PNCP</dt><dd className="mono">{ata.numeroPncp}</dd></div>
                      ) : null}
                    </>
                  ) : null}
                  <div><dt>Última conferência</dt><dd>{ata.conferidaEm}</dd></div>
                </dl>
              </>
            ) : (
              <p style={{ color: "var(--cor-texto-2)", fontSize: "var(--tam-sm)" }}>
                Esta ata está vigente e disponível para adesão. Os detalhes (itens, quantidades, saldo e
                vigência) aparecem depois que o seu órgão entra.
              </p>
            )}
            {!completo ? (
              <Link
                className="botao botao--primario botao--grande botao--largo"
                style={{ marginTop: 16 }}
                href={hrefPedidoAta}
              >
                {orgaoLogado ? "Escolher itens para pedir adesão" : "Pedir adesão a esta ata"}
              </Link>
            ) : null}
            <a
              className="botao botao--terciario botao--largo"
              style={{ marginTop: 6 }}
              href={contatoDuvida}
              {...externo}
            >
              Tirar dúvida com a equipe
            </a>
          </div>
          <div className="bloco">
            <h2>Como funciona a adesão</h2>
            <ol className="mini-passos">
              <li>
                <span>
                  <b>Seu órgão faz o pedido</b>Escolha os itens e as quantidades. Cada órgão pode aderir a
                  até 50% do registrado por item.
                </span>
              </li>
              <li>
                <span>
                  <b>Gerenciador e fornecedor avaliam</b>A adesão depende do aceite dos dois, como prevê a
                  Lei 14.133/2021.
                </span>
              </li>
              <li>
                <span>
                  <b>Seu órgão formaliza</b>Com a justificativa de vantagem e a pesquisa de preços, o
                  processo segue para contratação.
                </span>
              </li>
            </ol>
          </div>
        </aside>
      </div>

      {ata.relacionadas.length > 0 ? (
        <section className="secao secao--cinza" aria-labelledby="t-rel">
          <div className="wrap">
            <div className="secao__cabeca">
              <h2 id="t-rel">Outras atas de {grupo.toLowerCase()}</h2>
              <Link className="link-seta" href={`/catalogo?cat=${ata.grupoId}`}>
                Ver todas <IconeSeta />
              </Link>
            </div>
            <LivroAtas atas={ata.relacionadas} />
          </div>
        </section>
      ) : null}
    </>
  );
}
