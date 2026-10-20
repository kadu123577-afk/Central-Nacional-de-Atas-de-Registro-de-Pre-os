import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { resumoHome } from "@/lib/catalogo-publico";
import { GRUPOS, nomeDoGrupo } from "@/lib/site/categorias";
import { FAQ, jsonLdSite } from "@/lib/site/conteudo";
import { SITE } from "@/lib/site/config";
import { numero } from "@/lib/site/formato";
import { UFS } from "@/lib/site/ufs";
import { FormDemanda } from "@/components/site/form-demanda";
import { IconeBusca, IconeCategoria, IconeInfo, IconeMais, IconeSeta } from "@/components/site/icones";
import { LivroAtas } from "@/components/site/pecas";

export const metadata: Metadata = {
  title: { absolute: `${SITE.nome} | Atas vigentes para adesão` },
  alternates: { canonical: "/" },
};

type Parametros = { searchParams: Promise<{ q?: string; uf?: string }> };

export default async function PaginaInicial({ searchParams }: Parametros) {
  const { q = "", uf = "" } = await searchParams;
  const h = await resumoHome();

  const categorias = GRUPOS.filter((g) => (h.porGrupo[g.id] ?? 0) > 0).sort(
    (a, b) => h.porGrupo[b.id] - h.porGrupo[a.id] || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const maior = categorias.length ? h.porGrupo[categorias[0].id] : 1;

  // Só números que não identificam nenhuma ata (nada por UF, item ou saldo).
  const kpis = [
    { rotulo: "Atas vigentes", valor: h.totalAtas },
    { rotulo: "Categorias com ata", valor: h.totalCategorias },
  ].filter((k) => k.valor > 0);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSite()).replace(/</g, "\\u003c") }}
      />

      <section className="inicio" aria-labelledby="t-hero">
        <div className="wrap inicio__grade">
          <div className="inicio__texto">
            <p className="sobretitulo">
              <span className="ponto" aria-hidden="true" />
              Catálogo nacional de atas de registro de preços
            </p>
            <h1 id="t-hero">
              Encontre atas vigentes com <span className="realce">saldo para o seu órgão aderir</span>.
            </h1>
            <p className="inicio__lead">
              Atas publicadas por outros órgãos, organizadas por objeto e categoria. Entre com o acesso do
              seu órgão para ver os itens e quanto ainda pode ser aderido, e faça o pedido em um só
              lugar.
            </p>

            <form className="busca-principal busca-principal--sem-uf" action="/catalogo" role="search">
              <div className="busca-principal__campo busca-principal__campo--q">
                <label htmlFor="hero-q">O que o seu órgão precisa comprar?</label>
                <input id="hero-q" type="search" name="q" placeholder="Ex.: medicamentos, iluminação pública" autoComplete="off" />
              </div>
              <button className="botao botao--primario botao--grande" type="submit">
                <IconeBusca />
                Buscar atas
              </button>
            </form>

            {categorias.length > 0 ? (
              <div className="procurados">
                <span>Mais procurados</span>
                <nav aria-label="Categorias mais procuradas">
                  {categorias.slice(0, 5).map((c) => (
                    <Link key={c.id} href={`/catalogo?cat=${c.id}`}>
                      <IconeCategoria id={c.id} />
                      {c.nome} <span className="tab">{h.porGrupo[c.id]}</span>
                    </Link>
                  ))}
                </nav>
              </div>
            ) : null}
          </div>

          {h.destaque ? (
            <aside className="inicio__ata" aria-label="Ata em destaque no catálogo">
              <div className="destaque">
                <div className="destaque__topo">
                  <span className="destaque__rotulo">Ata em destaque</span>
                  <span className="mono">Nº {h.destaque.codigo}</span>
                </div>
                <h2 className="destaque__titulo">
                  <Link href={`/catalogo/${h.destaque.id}`}>{h.destaque.objeto}</Link>
                </h2>
                <p className="destaque__meta">{nomeDoGrupo(h.destaque.grupoId)}</p>
                <p className="destaque__meta">
                  Itens, quantidades e saldo ficam disponíveis para órgãos com acesso.
                </p>
                <Link className="botao botao--primario botao--largo" href={`/catalogo/${h.destaque.id}`}>
                  Ver a ata
                </Link>
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      {kpis.length > 0 ? (
        <section className="kpis" aria-label="A plataforma hoje">
          <div className="wrap">
            <dl className="kpis__lista kpis__lista--curta">
              {kpis.map((k) => (
                <div key={k.rotulo}>
                  <dt>{k.rotulo}</dt>
                  <dd>{numero(k.valor)}</dd>
                </div>
              ))}
            </dl>
            <p className="kpis__nota">Atualizado em {h.atualizadoEm}. Só contamos atas dentro da vigência.</p>
          </div>
        </section>
      ) : null}

      <section className="secao" aria-labelledby="t-destaques">
        <div className="wrap">
          <div className="secao__cabeca">
            <div>
              <h2 id="t-destaques">Atas publicadas recentemente</h2>
              <p>
                As últimas atas que entraram no catálogo. Clique em uma para ver o objeto e pedir a
                adesão.
              </p>
            </div>
            <Link className="link-seta" href="/catalogo">
              <span>Ver todas as {numero(h.totalAtas)} atas</span>
              <IconeSeta />
            </Link>
          </div>
          {h.recentes.length > 0 ? (
            <LivroAtas atas={h.recentes} />
          ) : (
            <div className="vazio" role="status">
              <h2>O catálogo ainda está sendo montado</h2>
              <p>Assim que as primeiras atas forem aprovadas, elas aparecem aqui.</p>
            </div>
          )}
        </div>
      </section>

      {categorias.length > 0 ? (
        <section className="secao secao--cinza" aria-labelledby="t-categorias">
          <div className="wrap">
            <div className="secao__cabeca">
              <div>
                <h2 id="t-categorias">Atas vigentes por categoria</h2>
                <p>
                  Cada barra mostra quantas atas vigentes existem no tipo de compra. Clique para abrir a
                  lista filtrada.
                </p>
              </div>
            </div>
            <nav className="categorias" aria-labelledby="t-categorias">
              {categorias.map((c) => (
                <Link className="categoria" href={`/catalogo?cat=${c.id}`} key={c.id}>
                  <span className="categoria__nome">
                    <span className="categoria__ico">
                      <IconeCategoria id={c.id} />
                    </span>
                    {c.nome}
                  </span>
                  <span className="categoria__trilho" aria-hidden="true">
                    <i style={{ "--p": `${Math.round((h.porGrupo[c.id] / maior) * 100)}%` } as CSSProperties} />
                  </span>
                  <span className="categoria__qtd tab">
                    {h.porGrupo[c.id]}
                    <small>{h.porGrupo[c.id] === 1 ? " ata" : " atas"}</small>
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        </section>
      ) : null}


      <section className="secao secao--cinza" id="como-funciona" aria-labelledby="t-como">
        <div className="wrap">
          <div className="secao__cabeca secao__cabeca--centro">
            <div>
              <h2 id="t-como">Como funciona a adesão</h2>
              <p>
                A adesão a uma ata de registro de preços (o &quot;carona&quot;) é um caminho previsto em lei. A
                plataforma organiza a informação e o pedido; as decisões continuam com os órgãos e o
                fornecedor.
              </p>
            </div>
          </div>

          <ol className="passos">
            <li>
              <span className="passos__num" aria-hidden="true">1</span>
              <h3>Encontre a ata</h3>
              <p>Busque pelo objeto ou pela categoria. Com o acesso do seu órgão, você vê os itens, a vigência e o saldo.</p>
              <p className="passos__quem">Seu órgão</p>
            </li>
            <li>
              <span className="passos__num" aria-hidden="true">2</span>
              <h3>Peça a adesão</h3>
              <p>Escolha os itens e as quantidades. O pedido sai completo para o gerenciador avaliar.</p>
              <p className="passos__quem">Seu órgão</p>
            </li>
            <li>
              <span className="passos__num" aria-hidden="true">3</span>
              <h3>Receba os aceites</h3>
              <p>O órgão gerenciador e o fornecedor analisam. Você acompanha cada resposta.</p>
              <p className="passos__quem">Gerenciador e fornecedor</p>
            </li>
            <li>
              <span className="passos__num" aria-hidden="true">4</span>
              <h3>Formalize e contrate</h3>
              <p>Com a justificativa de vantagem e a pesquisa de preços, seu órgão conclui o processo.</p>
              <p className="passos__quem">Seu órgão</p>
            </li>
          </ol>

          <p className="aviso-legal">
            <IconeInfo />
            <span>
              <strong>A adesão não é automática.</strong> Ela exige justificativa da vantagem,
              compatibilidade dos preços com o mercado e aceite do órgão gerenciador e do fornecedor
              (Lei 14.133/2021, art. 86). Cada órgão pode aderir a até 50% da quantidade registrada por
              item.
            </span>
          </p>
        </div>
      </section>

      <section className="secao ponte-secao" id="para-quem" aria-labelledby="t-quem">
        <div className="wrap">
          <div className="secao__cabeca secao__cabeca--centro">
            <div>
              <h2 id="t-quem">Uma ata, dois lados</h2>
              <p>
                De um lado, quem precisa comprar. Do outro, quem já tem o preço registrado. A plataforma
                é a ponte entre os dois.
              </p>
            </div>
          </div>

          <div className="ponte">
            <div className="ponte__lado ponte__lado--compra">
              <p className="ponte__quem">Quem compra</p>
              <h3>Órgãos públicos</h3>
              <p>
                Prefeituras, consórcios, autarquias e fundações que querem saber, antes de tudo, se
                existe ata vigente com saldo.
              </p>
              <ul>
                <li>Consulta sem custo e sem cadastro</li>
                <li>Saldo para adesão calculado por item</li>
                <li>Pedido organizado para o gerenciador avaliar</li>
                <li>Acompanhamento das respostas em um só painel</li>
              </ul>
              <Link className="botao botao--primario" href="/entrar?perfil=orgao">
                Entrar como órgão
              </Link>
            </div>

            <div className="ponte__eixo" aria-hidden="true">
              <span className="ponte__selo">
                <Image src="/site/marca/arca-simbolo.svg" width={188} height={197} alt="" unoptimized />
              </span>
              <span className="ponte__legenda">a ata</span>
            </div>

            <div className="ponte__lado ponte__lado--venda">
              <p className="ponte__quem">Quem vende</p>
              <h3>Fornecedores</h3>
              <p>
                Empresas com ata registrada que querem que outros órgãos saibam que ela existe e ainda
                tem saldo.
              </p>
              <ul>
                <li>Sua ata visível para órgãos de todo o país</li>
                <li>Pedidos de adesão chegam completos para análise</li>
                <li>Você decide aceitar ou não cada pedido</li>
                <li>Taxa de intermediação definida em contrato, sem custo para o órgão</li>
              </ul>
              <Link className="botao botao--secundario" href="/entrar?perfil=fornecedor">
                Entrar como fornecedor
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="secao secao--cinza" id="remuneracao" aria-labelledby="t-limites">
        <div className="wrap">
          <div className="secao__cabeca">
            <div>
              <h2 id="t-limites">O que a plataforma faz, e o que não faz</h2>
              <p>
                Compra pública tem regra. Por isso deixamos claro, desde a primeira página, onde termina
                o nosso papel.
              </p>
            </div>
          </div>
          <div className="limites">
            <div className="limites__col limites__col--sim">
              <h3>A plataforma faz</h3>
              <ul>
                <li>Reúne atas publicadas pelos órgãos gerenciadores e organiza por objeto, UF e vigência</li>
                <li>Confere periodicamente a vigência e o saldo de cada item</li>
                <li>Monta e encaminha o pedido de adesão com as informações necessárias</li>
                <li>Acompanha as respostas do gerenciador e do fornecedor</li>
              </ul>
            </div>
            <div className="limites__col limites__col--nao">
              <h3>A plataforma não faz</h3>
              <ul>
                <li>Não decide a adesão: o aceite é do gerenciador e do fornecedor</li>
                <li>Não substitui a justificativa de vantagem nem a pesquisa de preços</li>
                <li>Não é órgão público e não tem vínculo com o PNCP</li>
                <li>Não cobra nada do órgão público pela consulta ou pelo pedido</li>
              </ul>
            </div>
          </div>
          <div className="remuneracao">
            <h3>Como a plataforma é remunerada</h3>
            <p>
              O órgão público não paga pelo uso. A plataforma é remunerada por uma taxa de intermediação
              devida pelo fornecedor, prevista em contrato com ele, e o preço que o seu órgão paga é o
              que consta no registro.
            </p>
          </div>
        </div>
      </section>

      <section className="secao" id="perguntas" aria-labelledby="t-faq">
        <div className="wrap faq">
          <div className="faq__cabeca">
            <h2 id="t-faq">Perguntas frequentes</h2>
            <p>
              Não achou a sua? Escreva para a nossa equipe por e-mail ou ligue para{" "}
              <span className="sem-quebra">{SITE.telefone}</span>.
            </p>
          </div>
          <div className="faq__lista">
            {FAQ.map((f) => (
              <details key={f.pergunta}>
                <summary>
                  {f.pergunta}
                  <IconeMais />
                </summary>
                <p>{f.resposta}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="demanda" id="nao-achei" aria-labelledby="t-demanda">
        <div className="wrap demanda__grade">
          <div className="demanda__texto">
            <p className="demanda__rotulo">Não achou a ata?</p>
            <h2 id="t-demanda">Conte o que o seu órgão precisa e a gente procura por você.</h2>
            <p>
              Preencha o objeto, a quantidade e o estado. A equipe recebe a demanda organizada, verifica
              se existe ata vigente com saldo em outras regiões e responde pelo contato que você
              informar.
            </p>
            <ul className="demanda__passos">
              <li><b>1</b> Você descreve a necessidade</li>
              <li><b>2</b> A equipe busca atas compatíveis</li>
              <li><b>3</b> Você recebe as opções com saldo</li>
            </ul>
          </div>
          <FormDemanda inicial={{ objeto: q.slice(0, 300), uf: UFS.includes(uf) ? uf : "" }} />
        </div>
      </section>
    </>
  );
}
