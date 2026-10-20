import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { fornecedorIdLogado, orgaoIdLogado } from "@/lib/auth";
import { obterAta } from "@/lib/catalogo-publico";
import { linkContato, SITE } from "@/lib/site/config";
import { FormEntrar } from "@/components/site/form-entrar";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesso para órgãos públicos e fornecedores da Central Nacional de Atas de Registro de Preços.",
  alternates: { canonical: "/entrar" },
  // Tela de acesso não deve aparecer no Google, nem quando o site for indexado.
  robots: { index: false, follow: false },
};

type Busca = { perfil?: string; ata?: string; item?: string };

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<Busca> }) {
  const { perfil: p, ata, item } = await searchParams;
  const perfil = p === "fornecedor" ? "fornecedor" : "orgao";

  // Quem já está logado vai direto ao destino em vez de ver o formulário.
  const destinoOrgao = item ? `/orgao/pedido/novo?itemId=${encodeURIComponent(item)}` : "/orgao";
  const [orgaoId, fornecedorId] = await Promise.all([orgaoIdLogado(), fornecedorIdLogado()]);
  if (perfil === "orgao" && orgaoId) redirect(destinoOrgao);
  if (perfil === "fornecedor" && fornecedorId) redirect("/fornecedor");

  // O contexto do pedido mostra só dado público da ata (código e objeto).
  const detalhe = ata ? await obterAta(ata, "publico") : null;
  const contexto = detalhe ? { codigo: detalhe.codigo, objeto: detalhe.objeto } : null;

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
            Com o acesso, o seu órgão monta o pedido por item, envia ao gerenciador e acompanha as
            respostas. O fornecedor vê os pedidos que chegam para as atas dele.
          </p>
        </div>
        <ul className="entrar__lista">
          <li><span className="losango" aria-hidden="true" />Pedido com itens, quantidades e justificativa no mesmo lugar</li>
          <li><span className="losango" aria-hidden="true" />Saldo conferido antes de enviar</li>
          <li><span className="losango" aria-hidden="true" />Histórico de cada resposta, com data</li>
        </ul>
      </section>

      <section className="entrar__form" aria-labelledby="t-login">
        <FormEntrar
          perfilInicial={perfil}
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
