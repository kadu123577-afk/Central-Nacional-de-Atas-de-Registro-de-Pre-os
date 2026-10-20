/**
 * Caixa de aviso no padrão do site (a caixa azul "A adesão não é
 * automática"), com variações de severidade. Substitui os <p> de erro
 * montados à mão com borda/fundo crítico.
 */
export type TomAviso = "info" | "sucesso" | "atencao" | "alerta" | "critico";

const ICONE: Record<TomAviso, React.ReactNode> = {
  info: <path d="M8 7.2v3.6M8 5.2v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  sucesso: <path d="m5.2 8.2 1.9 1.9 3.7-3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  atencao: <path d="M8 4.8v3.8M8 10.9v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  alerta: <path d="M8 4.8v3.8M8 10.9v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  critico: <path d="m5.8 5.8 4.4 4.4m0-4.4-4.4 4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
};

export function Aviso({
  tom = "info",
  titulo,
  children,
  className = "",
}: {
  tom?: TomAviso;
  titulo?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`caixa-aviso ${className}`} data-tom={tom} role={tom === "critico" ? "alert" : undefined}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
        {ICONE[tom]}
      </svg>
      <div className="min-w-0">
        {titulo && <b className="font-bold">{titulo}</b>}
        {titulo && children ? " " : null}
        {children}
      </div>
    </div>
  );
}
