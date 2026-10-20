/**
 * Cartão de seção no padrão do site: branco, cantos de 14px, sombra suave,
 * título em 800. `destaque` põe o filete dourado do "Ata em destaque".
 */
export function Secao({
  titulo,
  descricao,
  acao,
  destaque = false,
  children,
  className = "",
}: {
  titulo: string;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  destaque?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`painel ${destaque ? "painel-destaque" : ""} p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="marca text-[17px]" style={{ color: "var(--cor-texto)", fontWeight: 800, letterSpacing: "-0.025em" }}>
            {titulo}
          </h2>
          {descricao && (
            <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--cor-texto-3)" }}>
              {descricao}
            </p>
          )}
        </div>
        {acao}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
