import { BarraTopo } from "@/components/ui/barra-topo";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";

export const metadata = {
  title: "Termos de Uso — Central Nacional de Atas",
};

/** Cláusula numerada: número em mono no selo cinza, título em 800 e texto em cinza. */
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
      <div className="mt-2 text-[14.5px] leading-relaxed sm:pl-7" style={{ color: "var(--cor-texto-2)" }}>
        {children}
      </div>
    </section>
  );
}

export default function TermosDeUsoPage() {
  return (
    <>
      <BarraTopo />
      <main className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-6 py-12">
        <CabecalhoPagina titulo="Termos de Uso" descricao="Última atualização: setembro de 2026" />

        <div className="painel">
          <Clausula numero={1} titulo="O que é a plataforma">
            <p>
              A Central Nacional de Atas de Registro de Preços é uma plataforma de intermediação
              que conecta órgãos públicos interessados em aderir a atas de registro de preços
              vigentes com os fornecedores detentores dessas atas, nos termos do art. 86 da Lei nº
              14.133/2021.
            </p>
          </Clausula>

          <Clausula numero={2} titulo="O papel da plataforma">
            <p>
              A plataforma presta assessoramento procedimental e tecnológico para facilitar a
              economicidade e a celeridade administrativa. A plataforma não representa
              juridicamente nenhuma das partes, não emite parecer jurídico em nome de órgão
              público, e não substitui os atos formais de aprovação, aceite e publicação exigidos
              por lei — esses continuam sendo praticados pelos próprios órgãos e fornecedores.
            </p>
          </Clausula>

          <Clausula numero={3} titulo="Cadastro e uso gratuito">
            <p>
              O cadastro e o uso da plataforma são gratuitos para fornecedores e órgãos públicos.
              Não há cobrança de mensalidade, taxa de inscrição ou qualquer valor para consultar o
              catálogo, cadastrar atas ou pedir adesão.
            </p>
          </Clausula>

          <Clausula numero={4} titulo="Cobrança da taxa de intermediação">
            <p>
              Quando uma adesão resulta em contrato efetivamente empenhado, a Tech 10 cobra do
              <strong style={{ color: "var(--cor-texto)" }}> fornecedor</strong> uma taxa de intermediação sobre o valor do contrato. O
              órgão público não é cobrado em nenhuma etapa deste processo.
            </p>
          </Clausula>

          <Clausula numero={5} titulo="Responsabilidade do usuário">
            <p>
              Cada órgão comprador é responsável por verificar a compatibilidade do objeto
              registrado com sua necessidade real e a vantajosidade do preço frente ao mercado,
              conforme exige o art. 86, §2º da Lei 14.133/2021, antes de formalizar qualquer
              adesão.
            </p>
          </Clausula>

          <Clausula numero={6} titulo="Contato">
            <p className="font-semibold" style={{ color: "var(--cor-texto)" }}>
              contato@tech10solucoes.com.br
            </p>
          </Clausula>
        </div>
      </main>
    </>
  );
}
