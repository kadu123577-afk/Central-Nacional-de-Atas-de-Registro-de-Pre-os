import { BarraTopo } from "@/components/ui/barra-topo";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";

export const metadata = {
  title: "Política de Privacidade — Central Nacional de Atas",
};

/** Cláusula numerada: número em mono dourado, título em 800 e texto em cinza. */
function Clausula({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-b px-6 py-6 last:border-b-0 sm:px-8" style={{ borderColor: "var(--cor-borda)" }}>
      <h2
        className="marca flex items-baseline gap-3 text-[16.5px] leading-snug"
        style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.02em" }}
      >
        <span className="codigo font-semibold" style={{ color: "var(--cor-ouro-texto)", fontSize: 13 }}>
          {numero}.
        </span>
        {titulo}
      </h2>
      <div className="mt-2 flex flex-col gap-2 text-[14.5px] leading-relaxed sm:pl-7" style={{ color: "var(--cor-texto-2)" }}>
        {children}
      </div>
    </section>
  );
}

/** Lista com marcador verde, no lugar do disco padrão do navegador. */
function Lista({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col gap-2 [&>li]:relative [&>li]:pl-4">{children}</ul>;
}

function Marcador() {
  return (
    <span
      className="absolute left-0 top-[0.62em] size-1.5 rounded-full"
      style={{ background: "var(--cor-marca)" }}
      aria-hidden="true"
    />
  );
}

export default function PoliticaPrivacidadePage() {
  const destaque = { color: "var(--cor-texto)" };

  return (
    <>
      <BarraTopo />
      <main className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-6 py-12">
        <CabecalhoPagina titulo="Política de Privacidade" descricao="Última atualização: setembro de 2026" />

        <div className="painel">
          <Clausula numero={1} titulo="Quem trata seus dados">
            <p>
              A Central Nacional de Atas de Registro de Preços é operada pela TECH 10 GOVERNANÇA E
              TECNOLOGIA ESTRATÉGICA LTDA. (&ldquo;Tech 10&rdquo;), controladora dos dados pessoais tratados
              nesta plataforma, nos termos da Lei nº 13.709/2018 (LGPD).
            </p>
          </Clausula>

          <Clausula numero={2} titulo="Quais dados coletamos">
            <Lista>
              <li>
                <Marcador />
                <strong style={destaque}>Fornecedores:</strong> razão social, CNPJ, e-mail e senha (armazenada como
                hash, nunca em texto puro).
              </li>
              <li>
                <Marcador />
                <strong style={destaque}>Órgãos compradores:</strong> nome, CNPJ, UF, município, esfera, e-mail e
                senha (hash).
              </li>
              <li>
                <Marcador />
                <strong style={destaque}>Administradores da Tech 10:</strong> nome, e-mail e senha (hash).
              </li>
              <li>
                <Marcador />
                <strong style={destaque}>Dados de uso:</strong> registros de auditoria de cada pedido de adesão
                (quem alterou o quê e quando).
              </li>
            </Lista>
            <p>
              Não coletamos dados de pessoa física além dos necessários para identificar o
              representante de cada conta (e-mail de contato).
            </p>
          </Clausula>

          <Clausula numero={3} titulo="Por que tratamos esses dados">
            <p>
              Com base na <strong style={destaque}>execução de contrato</strong> (art. 7º, V, LGPD) para operar o
              cadastro, o login e o acompanhamento de pedidos de adesão, e no{" "}
              <strong style={destaque}>cumprimento de obrigação legal</strong> (art. 7º, II) para manter a trilha de
              auditoria exigida em contratações públicas.
            </p>
          </Clausula>

          <Clausula numero={4} titulo="Com quem compartilhamos">
            <p>
              Os dados de atas, itens e órgãos gerenciadores já são informação pública (publicada
              no Portal Nacional de Contratações Públicas — PNCP). Dados de cadastro (e-mail,
              senha) não são compartilhados com terceiros.
            </p>
          </Clausula>

          <Clausula numero={5} titulo="Segurança">
            <Lista>
              <li>
                <Marcador />
                Senhas nunca são armazenadas em texto puro — usamos hash bcrypt.
              </li>
              <li>
                <Marcador />
                Sessões de login usam cookies assinados (HMAC-SHA256), não falsificáveis.
              </li>
              <li>
                <Marcador />
                Conexões em produção usam HTTPS.
              </li>
              <li>
                <Marcador />
                O motor de cálculo de saldo trava a linha do banco de dados durante cada operação,
                evitando inconsistência mesmo com pedidos simultâneos.
              </li>
            </Lista>
          </Clausula>

          <Clausula numero={6} titulo="Cookies">
            <p>
              Usamos apenas <strong style={destaque}>cookies estritamente necessários</strong>, que mantêm sua sessão
              de login (fornecedor, órgão ou administrador). Não usamos cookies de rastreamento,
              publicidade ou analytics. Veja o aviso de cookies no rodapé do site.
            </p>
          </Clausula>

          <Clausula numero={7} titulo="Seus direitos">
            <p>
              Você pode solicitar acesso, correção, exclusão ou portabilidade dos seus dados a
              qualquer momento, entrando em contato pelo e-mail abaixo.
            </p>
          </Clausula>

          <Clausula numero={8} titulo="Contato">
            <p>
              Dúvidas sobre esta política ou sobre seus dados:{" "}
              <span className="font-semibold" style={destaque}>
                contato@tech10solucoes.com.br
              </span>
            </p>
          </Clausula>
        </div>
      </main>
    </>
  );
}
