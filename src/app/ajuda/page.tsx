export const metadata = {
  title: "Central de Ajuda — Central Nacional de Atas",
};

export default function CentralDeAjudaPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="marca text-2xl text-[var(--cor-texto)]">Central de Ajuda</h1>
      <p className="mt-1 text-sm text-[var(--cor-texto-3)]">
        Perguntas frequentes sobre adesão a atas de registro de preços.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-[var(--cor-texto-2)]">
        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">
            O que é &ldquo;carona&rdquo; numa ata de registro de preços?
          </h2>
          <p className="mt-2">
            É a possibilidade, prevista no art. 86 da Lei nº 14.133/2021, de um órgão público
            aderir a uma ata de registro de preços já vigente de outro órgão, sem precisar
            realizar sua própria licitação do zero — desde que respeitados os limites de
            quantidade e a elegibilidade por esfera federativa da lei.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">
            Quanto um órgão pode aderir de um item?
          </h2>
          <p className="mt-2">
            No máximo 50% da quantidade originalmente registrada para aquele item (art. 86,
            §4º). Além disso, a soma de todas as adesões de todos os órgãos não pode ultrapassar
            200% (o dobro) da quantidade registrada (art. 86, §5º). A plataforma calcula e
            aplica esses limites automaticamente — um pedido que ultrapassaria qualquer um dos
            dois é recusado na hora.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">
            Qualquer órgão pode aderir a qualquer ata?
          </h2>
          <p className="mt-2">
            Não — a lei (art. 86, §§3º e 8º) restringe por esfera federativa de quem gerencia a
            ata: um órgão municipal, estadual ou distrital pode aderir a ata gerenciada por
            órgão federal, estadual ou distrital; um órgão municipal também pode aderir a ata
            gerenciada por outro município; mas um órgão federal só pode aderir a ata gerenciada
            por outro órgão federal.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">
            Como funciona a cobrança da Tech 10?
          </h2>
          <p className="mt-2">
            A Tech 10 cobra uma taxa de intermediação de 5% exclusivamente do fornecedor,
            no momento em que uma adesão chega ao estágio &ldquo;Empenhada&rdquo; — nunca do órgão público,
            que não paga nada pela adesão em si. É um contrato civil privado entre a Tech 10 e
            o fornecedor, separado do instrumento de licitação.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">
            Como um fornecedor cadastra uma ata?
          </h2>
          <p className="mt-2">
            Criando uma conta em <a href="/fornecedor/cadastro" className="underline">/fornecedor/cadastro</a> e
            usando &ldquo;Nova ata&rdquo; no painel — o cadastro pede os dados do órgão gerenciador, da ata e
            de um ou mais itens, e aceita anexar um documento (edital, ofício ou a própria ata
            digitalizada). A ata entra como &ldquo;Pendente&rdquo; até um administrador da Tech 10 aprovar,
            e só aparece no catálogo público depois disso.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-[var(--cor-texto)]">
            Ainda tenho dúvidas — como falo com a Tech 10?
          </h2>
          <p className="mt-2">
            Fale diretamente com a equipe da Tech 10 pelos canais de contato informados no seu
            cadastro. Esta central de ajuda cobre as dúvidas mais comuns, mas não substitui o
            suporte direto para casos específicos da sua conta.
          </p>
        </section>
      </div>
    </main>
  );
}
