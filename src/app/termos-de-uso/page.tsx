export const metadata = {
  title: "Termos de Uso — Central Nacional de Atas",
};

export default function TermosDeUsoPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="marca text-2xl text-[var(--cor-texto)]">Termos de Uso</h1>
      <p className="mt-1 text-sm text-[var(--cor-texto-3)]">Última atualização: setembro de 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-[var(--cor-texto-2)]">
        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">1. O que é a plataforma</h2>
          <p className="mt-2">
            A Central Nacional de Atas de Registro de Preços é uma plataforma de intermediação
            que conecta órgãos públicos interessados em aderir a atas de registro de preços
            vigentes com os fornecedores detentores dessas atas, nos termos do art. 86 da Lei nº
            14.133/2021.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">2. O papel da plataforma</h2>
          <p className="mt-2">
            A plataforma presta assessoramento procedimental e tecnológico para facilitar a
            economicidade e a celeridade administrativa. A plataforma não representa
            juridicamente nenhuma das partes, não emite parecer jurídico em nome de órgão
            público, e não substitui os atos formais de aprovação, aceite e publicação exigidos
            por lei — esses continuam sendo praticados pelos próprios órgãos e fornecedores.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">3. Cadastro e uso gratuito</h2>
          <p className="mt-2">
            O cadastro e o uso da plataforma são gratuitos para fornecedores e órgãos públicos.
            Não há cobrança de mensalidade, taxa de inscrição ou qualquer valor para consultar o
            catálogo, cadastrar atas ou pedir adesão.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">4. Cobrança da taxa de intermediação</h2>
          <p className="mt-2">
            Quando uma adesão resulta em contrato efetivamente empenhado, a Tech 10 cobra do
            <strong> fornecedor</strong> uma taxa de intermediação sobre o valor do contrato. O
            órgão público não é cobrado em nenhuma etapa deste processo.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">5. Responsabilidade do usuário</h2>
          <p className="mt-2">
            Cada órgão comprador é responsável por verificar a compatibilidade do objeto
            registrado com sua necessidade real e a vantajosidade do preço frente ao mercado,
            conforme exige o art. 86, §2º da Lei 14.133/2021, antes de formalizar qualquer
            adesão.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">6. Contato</h2>
          <p className="mt-2">contato@tech10solucoes.com.br</p>
        </section>
      </div>
    </main>
  );
}
