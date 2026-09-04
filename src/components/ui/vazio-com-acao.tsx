/** Todo estado vazio (lista sem itens) usa isso — nunca uma tabela em
 * branco sem explicação do que fazer a seguir. */
export function VazioComAcao({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--raio)] border border-dashed border-[var(--cor-borda-forte)] p-8 text-center">
      <p className="marca text-sm" style={{ color: "var(--cor-texto)" }}>
        {titulo}
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--cor-texto-2)" }}>
        {descricao}
      </p>
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  );
}
