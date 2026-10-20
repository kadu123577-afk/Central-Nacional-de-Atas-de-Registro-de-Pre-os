import { AvisoCookies } from "@/components/aviso-cookies";
import { Rodape } from "@/components/rodape";

/**
 * Moldura comum das áreas internas do sistema (admin, vendedor, fornecedor,
 * órgão e telas de adesão): rodapé e aviso de cookies no tema escuro da
 * Tech 10. O site público (grupo "(site)") tem moldura própria, da ARCA.
 */
export function MolduraPainel({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Rodape />
      <AvisoCookies />
    </>
  );
}