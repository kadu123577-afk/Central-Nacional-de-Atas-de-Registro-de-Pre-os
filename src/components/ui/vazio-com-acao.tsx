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
    <div
      className="flex flex-col items-center rounded-[var(--raio-grande)] border border-dashed px-8 py-10 text-center"
      style={{ borderColor: "var(--cor-borda-forte)", background: "var(--cor-superficie)" }}
    >
      <span
        className="grid size-10 place-items-center rounded-full"
        style={{ background: "var(--cor-marca-fundo)", color: "var(--cor-marca-clara)" }}
        aria-hidden="true"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="m12.2 12.2 3.3 3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </span>
      <p className="marca mt-3 text-[15px]" style={{ color: "var(--cor-texto)" }}>
        {titulo}
      </p>
      <p className="mt-1.5 max-w-md text-sm" style={{ color: "var(--cor-texto-2)" }}>
        {descricao}
      </p>
      {acao && <div className="mt-5 flex justify-center">{acao}</div>}
    </div>
  );
}
