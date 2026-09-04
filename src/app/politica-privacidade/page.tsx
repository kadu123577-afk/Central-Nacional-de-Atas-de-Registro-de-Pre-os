export const metadata = {
  title: "Política de Privacidade — Central Nacional de Atas",
};

export default function PoliticaPrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="marca text-2xl text-[var(--cor-texto)]">Política de Privacidade</h1>
      <p className="mt-1 text-sm text-[var(--cor-texto-3)]">Última atualização: setembro de 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-[var(--cor-texto-2)]">
        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">1. Quem trata seus dados</h2>
          <p className="mt-2">
            A Central Nacional de Atas de Registro de Preços é operada pela TECH 10 GOVERNANÇA E
            TECNOLOGIA ESTRATÉGICA LTDA. (&ldquo;Tech 10&rdquo;), controladora dos dados pessoais tratados
            nesta plataforma, nos termos da Lei nº 13.709/2018 (LGPD).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">2. Quais dados coletamos</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Fornecedores:</strong> razão social, CNPJ, e-mail e senha (armazenada como
              hash, nunca em texto puro).
            </li>
            <li>
              <strong>Órgãos compradores:</strong> nome, CNPJ, UF, município, esfera, e-mail e
              senha (hash).
            </li>
            <li>
              <strong>Administradores da Tech 10:</strong> nome, e-mail e senha (hash).
            </li>
            <li>
              <strong>Dados de uso:</strong> registros de auditoria de cada pedido de adesão
              (quem alterou o quê e quando).
            </li>
          </ul>
          <p className="mt-2">
            Não coletamos dados de pessoa física além dos necessários para identificar o
            representante de cada conta (e-mail de contato).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">3. Por que tratamos esses dados</h2>
          <p className="mt-2">
            Com base na <strong>execução de contrato</strong> (art. 7º, V, LGPD) para operar o
            cadastro, o login e o acompanhamento de pedidos de adesão, e no{" "}
            <strong>cumprimento de obrigação legal</strong> (art. 7º, II) para manter a trilha de
            auditoria exigida em contratações públicas.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">4. Com quem compartilhamos</h2>
          <p className="mt-2">
            Os dados de atas, itens e órgãos gerenciadores já são informação pública (publicada
            no Portal Nacional de Contratações Públicas — PNCP). Dados de cadastro (e-mail,
            senha) não são compartilhados com terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">5. Segurança</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Senhas nunca são armazenadas em texto puro — usamos hash bcrypt.</li>
            <li>Sessões de login usam cookies assinados (HMAC-SHA256), não falsificáveis.</li>
            <li>Conexões em produção usam HTTPS.</li>
            <li>
              O motor de cálculo de saldo trava a linha do banco de dados durante cada operação,
              evitando inconsistência mesmo com pedidos simultâneos.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">6. Cookies</h2>
          <p className="mt-2">
            Usamos apenas <strong>cookies estritamente necessários</strong>, que mantêm sua sessão
            de login (fornecedor, órgão ou administrador). Não usamos cookies de rastreamento,
            publicidade ou analytics. Veja o aviso de cookies no rodapé do site.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">7. Seus direitos</h2>
          <p className="mt-2">
            Você pode solicitar acesso, correção, exclusão ou portabilidade dos seus dados a
            qualquer momento, entrando em contato pelo e-mail abaixo.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">8. Contato</h2>
          <p className="mt-2">
            Dúvidas sobre esta política ou sobre seus dados: contato@tech10solucoes.com.br
          </p>
        </section>
      </div>
    </main>
  );
}
