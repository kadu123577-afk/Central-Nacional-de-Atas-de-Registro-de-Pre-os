import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site/config";

export const metadata: Metadata = {
  title: "Privacidade e dados pessoais",
  description:
    "Como a Central Nacional de Atas, operada pela ARCA Capital, trata dados pessoais de órgãos públicos, fornecedores e visitantes, conforme a LGPD.",
  alternates: { canonical: "/politica-privacidade" },
};

export default function PaginaPrivacidade() {
  return (
    <>
      <header className="cabeca-pagina">
        <div className="wrap">
          <nav className="migalhas" aria-label="Você está em">
            <ol>
              <li>
                <Link href="/">Início</Link>
              </li>
              <li aria-current="page">Privacidade</li>
            </ol>
          </nav>
          <h1>Privacidade e dados pessoais</h1>
          <p className="cabeca-pagina__sub">
            Minuta para revisão jurídica. Versão de outubro de 2026.
          </p>
        </div>
      </header>
      <div className="wrap">
        <article className="legal">
          <p>
            Esta política explica como a {SITE.razaoSocial} ({SITE.operadora}), CNPJ {SITE.cnpj},
            operadora da Central Nacional de Atas, trata dados pessoais, em conformidade com a Lei
            13.709/2018 (LGPD).
          </p>
          <h2>1. Quais dados tratamos</h2>
          <ul>
            <li>
              Dados de acesso de servidores e representantes de fornecedores: nome, e-mail, cargo,
              órgão ou empresa.
            </li>
            <li>Dados de contato informados em pedidos de adesão e mensagens.</li>
            <li>Dados técnicos de navegação essenciais ao funcionamento do site.</li>
          </ul>
          <h2>2. Para que usamos</h2>
          <p>
            Para permitir o acesso à plataforma, encaminhar e acompanhar pedidos de adesão,
            responder a solicitações e cumprir obrigações legais.
          </p>
          <h2>3. Com quem compartilhamos</h2>
          <p>
            Com o órgão gerenciador e o fornecedor envolvidos em cada pedido de adesão, na medida
            necessária para a análise. Não vendemos dados pessoais.
          </p>
          <h2>4. Cookies</h2>
          <p>
            Este site usa apenas armazenamento essencial ao funcionamento. Não usamos cookies de
            publicidade nem de medição de audiência.
          </p>
          <h2>5. Seus direitos</h2>
          <p>
            Você pode pedir acesso, correção, anonimização ou exclusão dos seus dados, além de
            informações sobre o compartilhamento. Escreva para o encarregado de dados em{" "}
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>
          <h2>6. Contato</h2>
          <p>
            ARCA Capital, Av. C-255, nº 400, Edifício Eldorado Business Tower, Setor Nova Suíça,
            Goiânia/GO, CEP 74280-010. Telefone {SITE.telefone}.
          </p>
        </article>
      </div>
    </>
  );
}
