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
    <form action={definirCategoriaAta} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="ataId" value={ataId} />
      <label className="block min-w-0 flex-1 text-sm sm:max-w-md">
        <span className="sr-only">Categoria desta ata</span>
        <select name="categoria" defaultValue={categoriaAtual ?? ""} className="campo-atas">
          <option value="">Sem categoria</option>
          {CATEGORIAS_ATAS.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="botao-atas secundario">
        Salvar
      </button>
    </form>
  );
}
