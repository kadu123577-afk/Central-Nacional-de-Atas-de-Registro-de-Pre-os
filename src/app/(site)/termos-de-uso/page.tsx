import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "Termos de uso",
  description:
    "Condições de uso da Central Nacional de Atas de Registro de Preços, plataforma privada operada pela ARCA Capital.",
  alternates: { canonical: "/termos-de-uso" },
};

export default function PaginaTermos() {
  return (
    <>
      <header className="cabeca-pagina">
        <div className="wrap">
          <nav className="migalhas" aria-label="Você está em">
            <ol>
              <li>
                <Link href="/">Início</Link>
              </li>
              <li aria-current="page">Termos de uso</li>
            </ol>
          </nav>
          <h1>Termos de uso</h1>
          <p className="cabeca-pagina__sub">
            Minuta para revisão jurídica. Versão de outubro de 2026.
          </p>
        </div>
      </header>
      <div className="wrap">
        <article className="legal">
          <h2>1. Quem somos</h2>
          <p>
            A Central Nacional de Atas é uma plataforma privada operada pela {SITE.razaoSocial} (
            {SITE.operadora}), CNPJ {SITE.cnpj}. Não é órgão público e não tem vínculo com o Portal
            Nacional de Contratações Públicas (PNCP).
          </p>
          <h2>2. O que a plataforma oferece</h2>
          <p>
            A consulta a atas de registro de preços vigentes publicadas por órgãos gerenciadores, e
            a organização e o encaminhamento de pedidos de adesão, nos termos da Lei 14.133/2021,
            art. 86.
          </p>
          <h2>3. Limites</h2>
          <ul>
            <li>
              A adesão depende do aceite do órgão gerenciador e do fornecedor, e da formalização
              pelo órgão interessado.
            </li>
            <li>
              A justificativa de vantagem e a pesquisa de preços são responsabilidade do órgão que
              adere.
            </li>
            <li>
              As informações do catálogo são conferidas periodicamente, mas a fonte oficial é a
              publicação do órgão gerenciador.
            </li>
          </ul>
          <h2>4. Remuneração</h2>
          <p>
            O uso é gratuito para órgãos públicos. A plataforma é remunerada por taxa de
            intermediação devida pelo fornecedor, prevista em contrato próprio.
          </p>
          <h2>5. Contato</h2>
          <p>
            Dúvidas sobre estes termos: <a href={`mailto:${SITE.email}`}>{SITE.email}</a> ou{" "}
            {SITE.telefone}.
          </p>
        </article>
      </div>
    </>
  );
}
