export function Secao({
  titulo,
  acao,
  children,
  className = "",
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`painel p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="marca text-sm" style={{ color: "var(--cor-texto)" }}>
          {titulo}
        </h2>
        {acao}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
