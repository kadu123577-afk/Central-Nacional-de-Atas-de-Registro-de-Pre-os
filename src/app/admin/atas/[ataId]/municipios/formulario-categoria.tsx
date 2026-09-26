"use client";

import { definirCategoriaAta } from "../../../actions";
import { CATEGORIAS_ATAS } from "@/lib/categorias";

export function FormularioCategoriaAta({
  ataId,
  categoriaAtual,
}: {
  ataId: string;
  categoriaAtual: string | null;
}) {
  return (
    <form action={definirCategoriaAta} className="flex items-center gap-2">
      <input type="hidden" name="ataId" value={ataId} />
      <select name="categoria" defaultValue={categoriaAtual ?? ""} className="campo-atas">
        <option value="">Sem categoria</option>
        {CATEGORIAS_ATAS.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.rotulo}
          </option>
        ))}
      </select>
      <button type="submit" className="botao-atas secundario">
        Salvar
      </button>
    </form>
  );
}
