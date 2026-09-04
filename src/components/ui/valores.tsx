/** Formatação de dinheiro/percentual — sempre em fonte monoespaçada tabular,
 * nunca um `R$ {valor}` cru interpolado direto na tela. */

/** Aceita number/string ou um Prisma.Decimal (que só expõe toString/toNumber). */
type ValorNumerico = number | string | { toString(): string };

export function Cifra({ valor }: { valor: ValorNumerico }) {
  const numero = Number(String(valor));
  return (
    <span className="numero">
      {numero.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}
    </span>
  );
}

export function Percentual({ valor }: { valor: ValorNumerico }) {
  const numero = Number(String(valor));
  return <span className="numero">{(numero * 100).toFixed(1)}%</span>;
}

export function Numero({ children }: { children: React.ReactNode }) {
  return <span className="numero">{children}</span>;
}
