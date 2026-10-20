import "@/estilos/site.css";
import { contagensVigentes } from "@/lib/catalogo-publico";
import { SITE } from "@/lib/site/config";
import { Cabecalho } from "./cabecalho";
import { CLASSES_FONTES } from "./fontes";
import { RodapeSite } from "./rodape-site";

/**
 * Moldura do site público: fontes e estilos do designer (escopo .site),
 * faixa de demonstração, cabeçalho e rodapé. Usada pelo layout das páginas
 * públicas e pela página 404.
 */
export async function SiteShell({ children }: { children: React.ReactNode }) {
  // Se o banco estiver fora do ar, o site continua abrindo (menu sem contagens).
  const { porGrupo } = await contagensVigentes().catch(() => ({
    porGrupo: {} as Record<string, number>,
  }));

  return (
    <div className={`site ${CLASSES_FONTES}`}>
      <a className="pular" href="#conteudo">
        Ir para o conteúdo
      </a>
      {SITE.demonstracao ? (
        <p className="aviso-demo">
          <strong>Ambiente de demonstração.</strong> As atas, órgãos e fornecedores exibidos são
          fictícios.
        </p>
      ) : null}
      <Cabecalho contagens={porGrupo} />
      <main id="conteudo" tabIndex={-1}>
        {children}
      </main>
      <RodapeSite />
    </div>
  );
}
