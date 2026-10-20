import Link from "next/link";
import { corDaCategoria, rotuloDaCategoria } from "@/lib/categorias";
import { diasParaVencer } from "@/lib/atas";

export interface LinhaAtaVitrine {
  id: string;
  numero: string;
  objeto: string;
  categoria: string | null;
  orgao: string;
  uf: string;
  itens: number;
  vigenciaFim: Date;
  saldo: number | null;
}

/** A tabela "Atas publicadas recentemente" do site: Nº, objeto, tema, UF, vigência e saldo. */
export function TabelaAtasVitrine({ atas }: { atas: LinhaAtaVitrine[] }) {
  return (
    <div className="painel overflow-x-auto">
      <table className="tabela-atas min-w-[760px]">
        <thead>
          <tr>
            <th className="w-[1%]">Nº</th>
            <th>Objeto da ata</th>
            <th className="w-[170px]">Categoria</th>
            <th className="w-[64px]">UF</th>
            <th className="w-[130px]">Vigência</th>
            <th className="w-[150px]">Saldo para adesão</th>
          </tr>
        </thead>
        <tbody>
          {atas.map((ata) => {
            const dias = diasParaVencer(ata.vigenciaFim);
            return (
              <tr key={ata.id}>
                <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Nº {ata.numero}
                </td>
                <td>
                  <Link href={`/catalogo/${ata.id}`} className="titulo-linha block hover:text-[var(--cor-marca-clara)]">
                    {ata.objeto}
                  </Link>
                  <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {ata.orgao} · {ata.itens} {ata.itens === 1 ? "item" : "itens"}
                  </span>
                </td>
                <td className="text-[12.5px]">
                  {ata.categoria ? (
                    <span className="inline-flex items-start gap-2">
                      <span
                        className="mt-1.5 inline-block size-2 shrink-0 rounded-full"
                        style={{ background: corDaCategoria(ata.categoria) }}
                      />
                      {rotuloDaCategoria(ata.categoria)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span className="selo-uf">{ata.uf}</span>
                </td>
                <td>
                  <span className="numero block text-[13px]" style={{ color: "var(--cor-texto)" }}>
                    até {ata.vigenciaFim.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {dias} {dias === 1 ? "dia" : "dias"}
                  </span>
                </td>
                <td>
                  {ata.saldo === null ? (
                    "—"
                  ) : (
                    <>
                      <span className="numero block text-xs font-bold" style={{ color: "var(--cor-texto)" }}>
                        {ata.saldo}%
                      </span>
                      <div className="barra-saldo mt-1.5">
                        <div style={{ width: `${ata.saldo}%` }} />
                      </div>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
