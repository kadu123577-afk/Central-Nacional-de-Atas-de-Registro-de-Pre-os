import Image from "next/image";
import Link from "next/link";
import { SITE, linkContato } from "@/lib/site/config";

export function RodapeSite() {
  const cadastrarOrgao = linkContato("Olá! Quero cadastrar meu órgão na Central Nacional de Atas.");
  const ano = new Date().getFullYear();
  const externo = SITE.whatsapp ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <footer className="rodape escuro">
      <div className="wrap">
        <div className="rodape__topo">
          <div className="rodape__sobre">
            <Image
              className="rodape__logo"
              src="/site/marca/arca-logo-cor.svg"
              width={756}
              height={201}
              alt="ARCA Capital"
              unoptimized
            />
            <p>
              Catálogo nacional de atas de registro de preços vigentes, para órgãos públicos
              consultarem saldo e vigência e pedirem adesão com mais clareza.
            </p>
          </div>
          <div>
            <h2>Catálogo</h2>
            <ul>
              <li><Link href="/catalogo">Todas as atas</Link></li>
              <li><Link href="/catalogo?cat=saude">Saúde</Link></li>
              <li><Link href="/catalogo?cat=alimentos">Alimentação escolar</Link></li>
            </ul>
          </div>
          <div>
            <h2>Para órgãos</h2>
            <ul>
              <li><Link href="/#como-funciona">Como funciona a adesão</Link></li>
              <li><Link href="/entrar?perfil=orgao">Entrar como órgão</Link></li>
              <li><a href={cadastrarOrgao} {...externo}>Cadastrar meu órgão</a></li>
              <li><Link href="/#perguntas">Perguntas frequentes</Link></li>
            </ul>
          </div>
          <div>
            <h2>Para fornecedores</h2>
            <ul>
              <li><Link href="/#para-quem">Divulgar minha ata</Link></li>
              <li><Link href="/entrar?perfil=fornecedor">Entrar como fornecedor</Link></li>
              <li><Link href="/#remuneracao">Como a plataforma é remunerada</Link></li>
            </ul>
          </div>
          <div>
            <h2>Institucional</h2>
            <ul>
              <li><Link href="/termos-de-uso">Termos de uso</Link></li>
              <li><Link href="/politica-privacidade">Privacidade e dados pessoais</Link></li>
              <li><a href={`mailto:${SITE.email}`}>Encarregado de dados</a></li>
              <li>
                <a href={`mailto:${SITE.email}?subject=${encodeURIComponent("Denúncia ou reclamação")}`}>
                  Denúncias e reclamações
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p className="rodape__privada">
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 9v4.5M10 6.4v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>
            Plataforma privada operada pela ARCA Capital ({SITE.razaoSocial}). Não somos órgão
            público nem o Portal Nacional de Contratações Públicas (PNCP). As atas exibidas são
            publicadas pelos órgãos gerenciadores.
          </span>
        </p>

        <div className="rodape__empresa">
          <p>
            <strong>{SITE.razaoSocial}</strong>
            <br />
            CNPJ {SITE.cnpj}
          </p>
          <p>
            {SITE.enderecoLinha1}
            <br />
            {SITE.enderecoLinha2}
          </p>
          <p>
            <a href={SITE.telefoneLink}>{SITE.telefone}</a>
            <br />
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          </p>
        </div>

        <div className="rodape__base">
          <span>© {ano} ARCA Capital. Todos os direitos reservados.</span>
          <nav aria-label="Rodapé">
            <Link href="/termos-de-uso">Termos</Link>
            <Link href="/politica-privacidade">Privacidade</Link>
          </nav>
          <span className="rodape__credito">
            Criado por:{" "}
            <a href={SITE.agencia.url} target="_blank" rel="noopener noreferrer">
              {SITE.agencia.nome}
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
