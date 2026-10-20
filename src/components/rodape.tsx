import Link from "next/link";
import { Logo } from "@/components/ui/logo";

/**
 * Rodapé verde profundo do site público. O nome da empresa operadora fica
 * de fora de propósito: quem opera a plataforma (e o que vai nos termos e
 * na política de privacidade) ainda está em definição.
 */
export function Rodape() {
  const ano = new Date().getFullYear();
  return (
    <footer className="site-rodape sem-impressao mt-auto">
      <div className="site-rodape-interno">
        <div className="grid gap-8 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <Logo tom="claro" altura={34} />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed">
              Catálogo de atas de registro de preços vigentes, para órgãos públicos consultarem
              vigência e itens e pedirem adesão com mais clareza.
            </p>
          </div>
          <div>
            <p className="site-rodape-titulo">Catálogo</p>
            <Link href="/catalogo">Todas as atas</Link>
            <Link href="/ajuda">Como funciona a adesão</Link>
          </div>
          <div>
            <p className="site-rodape-titulo">Acesso</p>
            <Link href="/fornecedor/login">Entrar como fornecedor</Link>
            <Link href="/admin/login">Acesso da equipe</Link>
          </div>
          <div>
            <p className="site-rodape-titulo">Institucional</p>
            <Link href="/termos-de-uso">Termos de uso</Link>
            <Link href="/politica-privacidade">Privacidade e dados pessoais</Link>
            <Link href="/ajuda">Central de ajuda</Link>
          </div>
        </div>

        <div className="site-rodape-aviso">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 7.2v3.6M8 5.2v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p>
            Plataforma privada. Não somos órgão público nem o Portal Nacional de Contratações
            Públicas (PNCP). As atas exibidas são publicadas pelos órgãos gerenciadores.
          </p>
        </div>

        <div className="site-rodape-base">
          <p>© {ano} Central de Atas de Registro de Preços. Todos os direitos reservados.</p>
          <nav className="flex gap-5">
            <Link href="/termos-de-uso">Termos</Link>
            <Link href="/politica-privacidade">Privacidade</Link>
            <Link href="/admin/login">Acesso da equipe</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
