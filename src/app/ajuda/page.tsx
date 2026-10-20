import Link from "next/link";
import { BarraTopo } from "@/components/ui/barra-topo";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";

export const metadata = {
  title: "Central de Ajuda — Central Nacional de Atas",
};

/** Uma pergunta da central: número no círculo verde (como os passos do
 * "Como funciona a adesão" do site), título em 800 e resposta em cinza. */
function Pergunta({ numero, titulo, children }: { numero: number; titulo: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex gap-4 border-b px-6 py-6 last:border-b-0 sm:px-8" style={{ borderColor: "var(--cor-borda)" }}>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-extrabold"
        style={{ background: "var(--cor-marca-fundo)", color: "var(--cor-marca-clara)" }}
        aria-hidden="true"
      >
        {numero}
      </span>
      <div className="min-w-0">
        <h2
          className="marca text-[16.5px] leading-snug"
          style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.02em" }}
        >
          {titulo}
        </h2>
        <div className="mt-2 text-[14.5px] leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
          {children}
        </div>
      </div>
    </section>
  );
}

export default function CentralDeAjudaPage() {
  return (
    <>
      <BarraTopo />
      <main className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-6 py-12">
        <CabecalhoPagina
          titulo="Central de Ajuda"
          descricao="Perguntas frequentes sobre adesão a atas de registro de preços."
        />

        <div className="painel">
          <Pergunta numero={1} titulo={<>O que é &ldquo;carona&rdquo; numa ata de registro de preços?</>}>
            <p>
              É a possibilidade, prevista no art. 86 da Lei nº 14.133/2021, de um órgão público
              aderir a uma ata de registro de preços já vigente de outro órgão, sem precisar
              realizar sua própria licitação do zero — desde que respeitados os limites de
              quantidade e a elegibilidade por esfera federativa da lei.
            </p>
          </Pergunta>

          <Pergunta numero={2} titulo="Quanto um órgão pode aderir de um item?">
            <p>
              No máximo 50% da quantidade originalmente registrada para aquele item (art. 86,
              §4º). Além disso, a soma de todas as adesões de todos os órgãos não pode ultrapassar
              200% (o dobro) da quantidade registrada (art. 86, §5º). A plataforma calcula e
              aplica esses limites automaticamente — um pedido que ultrapassaria qualquer um dos
              dois é recusado na hora.
            </p>
          </Pergunta>

          <Pergunta numero={3} titulo="Qualquer órgão pode aderir a qualquer ata?">
            <p>
              Não — a lei (art. 86, §§3º e 8º) restringe por esfera federativa de quem gerencia a
              ata: um órgão municipal, estadual ou distrital pode aderir a ata gerenciada por
              órgão federal, estadual ou distrital; um órgão municipal também pode aderir a ata
              gerenciada por outro município; mas um órgão federal só pode aderir a ata gerenciada
              por outro órgão federal.
            </p>
          </Pergunta>

          <Pergunta numero={4} titulo="Como funciona a cobrança da Tech 10?">
            <p>
              A Tech 10 cobra uma taxa de intermediação de 5% exclusivamente do fornecedor,
              no momento em que uma adesão chega ao estágio &ldquo;Empenhada&rdquo; — nunca do órgão público,
              que não paga nada pela adesão em si. É um contrato civil privado entre a Tech 10 e
              o fornecedor, separado do instrumento de licitação.
            </p>
          </Pergunta>

          <Pergunta numero={5} titulo="Como um fornecedor cadastra uma ata?">
            <p>
              Criando uma conta em{" "}
              <Link
                href="/fornecedor/cadastro"
                className="font-semibold underline underline-offset-2"
                style={{ color: "var(--cor-marca-clara)" }}
              >
                /fornecedor/cadastro
              </Link>{" "}
              e usando &ldquo;Nova ata&rdquo; no painel — o cadastro pede os dados do órgão gerenciador, da ata e
              de um ou mais itens, e aceita anexar um documento (edital, ofício ou a própria ata
              digitalizada). A ata entra como &ldquo;Pendente&rdquo; até um administrador da Tech 10 aprovar,
              e só aparece no catálogo público depois disso.
            </p>
          </Pergunta>

          <Pergunta numero={6} titulo="Ainda tenho dúvidas — como falo com a Tech 10?">
            <p>
              Fale diretamente com a equipe da Tech 10 pelos canais de contato informados no seu
              cadastro. Esta central de ajuda cobre as dúvidas mais comuns, mas não substitui o
              suporte direto para casos específicos da sua conta.
            </p>
          </Pergunta>
        </div>
      </main>
    </>
  );
}
