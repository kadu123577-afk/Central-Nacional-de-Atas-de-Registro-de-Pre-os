import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { fornecedorIdLogado, orgaoIdLogado } from "@/lib/auth";
import { obterAta } from "@/lib/catalogo-publico";
import { destinoOrgaoDaBusca } from "@/lib/destino-login";
import { linkContato, SITE } from "@/lib/site/config";
import { FormEntrar } from "@/components/site/form-entrar";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesso para órgãos públicos e fornecedores da Central Nacional de Atas de Registro de Preços.",
  alternates: { canonical: "/entrar" },
  // Tela de acesso não deve aparecer no Google, nem quando o site for indexado.
  robots: { index: false, follow: false },
};

type Busca = { perfil?: string; ata?: string; destino?: string };

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const { perfil } = busca;
  const destinoOrgao = destinoOrgaoDaBusca(busca);
  const idAta = destinoOrgao.startsWith("/catalogo/") ? destinoOrgao.slice("/catalogo/".length) : null;

  // Quem chegou por um link com intenção (pedir adesão numa ata, ?perfil=...) e
  // já está logado vai direto ao destino em vez de ver o formulário. Em /entrar
  // puro (menu do site, ou vindo das páginas de login antigas) o formulário
  // sempre aparece: dá para trocar de perfil sem sair do outro antes.
  const temIntencao = Boolean(perfil || busca.ata || busca.destino);
  if (temIntencao) {
    const [orgaoId, fornecedorId] = await Promise.all([orgaoIdLogado(), fornecedorIdLogado()]);
    if (perfil !== "fornecedor" && orgaoId) redirect(destinoOrgao);
    if (perfil === "fornecedor" && fornecedorId) redirect("/fornecedor");
  }

  // O contexto do pedido mostra só dado público da ata (código e objeto).
  const detalhe = idAta ? await obterAta(idAta, "publico") : null;
  const contexto = detalhe ? { codigo: detalhe.codigo, titulo: detalhe.titulo } : null;

  return (
    <div className="entrar">
      <section className="entrar__painel escuro" aria-labelledby="t-painel">
        <Image className="hero__losangos" src="/site/marca/arco.svg" width={800} height={800} alt="" unoptimized />
        <div>
          <span className="rotulo-secao">
            <span className="losango" aria-hidden="true" />
            Área de acesso
          </span>
          <h1 id="t-painel">Pedidos de adesão organizados, do início ao aceite.</h1>
          <p>
            Com o acesso, o seu órgão pede a adesão a uma ata e a equipe da Central cuida do resto:
            confere itens e saldo, monta o pedido, envia ao gerenciador e acompanha as respostas. O
            fornecedor vê os pedidos que chegam para as atas dele.
          </p>
        </div>
        <ul className="entrar__lista">
          <li><span className="losango" aria-hidden="true" />Pedido com a sua necessidade e a justificativa no mesmo lugar</li>
          <li><span className="losango" aria-hidden="true" />Itens e saldo conferidos pela equipe antes de enviar</li>
          <li><span className="losango" aria-hidden="true" />Histórico de cada resposta, com data</li>
        </ul>
      </section>

      <section className="entrar__form" aria-labelledby="t-login">
        <FormEntrar
          destinoOrgao={destinoOrgao}
          contexto={contexto}
          hrefCadastroOrgao={linkContato("Olá! Quero cadastrar meu órgão na Central Nacional de Atas.")}
          hrefCadastroFornecedor={linkContato(
            "Olá! Sou fornecedor e quero cadastrar minha ata na Central Nacional de Atas.",
          )}
          hrefEsqueci={linkContato(
            "Olá! Preciso redefinir a senha do meu acesso à Central Nacional de Atas.",
            "Redefinição de senha",
          )}
          emailContato={SITE.email}
        />
      </section>
    </div>
  );
}
