/**
 * Moldura de "janela de navegador" com leve inclinação 3D, pro card de
 * destaque do grid de categorias — não usar em todo canto, pesa a tela.
 */
export function VitrineInclinada({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[var(--raio)] border"
      style={{
        borderColor: "var(--cor-borda)",
        background: "var(--cor-superficie)",
        transform: "perspective(900px) rotateX(3deg) rotateY(-4deg)",
        boxShadow: "0 24px 48px -24px rgba(0,0,0,0.55)",
      }}
    >
      <div
        className="flex items-center gap-1.5 border-b px-3 py-2"
        style={{ borderColor: "var(--cor-borda)" }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--cor-borda-forte)" }} />
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--cor-borda-forte)" }} />
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--cor-borda-forte)" }} />
        <span className="eyebrow ml-2">catalogo.centraldeatas.com.br</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
