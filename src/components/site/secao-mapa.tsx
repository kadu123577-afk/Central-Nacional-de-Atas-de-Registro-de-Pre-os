"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { plural } from "@/lib/site/formato";
import { UF_NOME } from "@/lib/site/ufs";
import { MAPA_ESTADOS, MAPA_VIEWBOX } from "./mapa-brasil-dados";

function nivelDe(n: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (!n) return 0;
  const p = n / max;
  return p > 0.66 ? 4 : p > 0.4 ? 3 : p > 0.2 ? 2 : 1;
}

interface RotuloUf {
  uf: string;
  x: number;
  y: number;
}

/**
 * Seção "Atas por estado": mapa do Brasil com o número de atas vigentes por
 * UF e o ranking dos cinco estados com mais atas. Passar o mouse (ou o foco)
 * no ranking acende o estado no mapa.
 */
export function SecaoMapa({ porUf }: { porUf: Record<string, number> }) {
  const [ativa, setAtiva] = useState<string | null>(null);
  const [rotulos, setRotulos] = useState<RotuloUf[]>([]);
  const raiz = useRef<SVGSVGElement>(null);

  const max = Math.max(0, ...Object.values(porUf));
  const top = Object.keys(porUf)
    .sort((a, b) => porUf[b] - porUf[a] || a.localeCompare(b))
    .slice(0, 5);

  // Rótulos (sigla e número) no centro de cada estado grande o bastante;
  // medidos no navegador porque dependem da geometria do desenho.
  useEffect(() => {
    const svg = raiz.current;
    if (!svg) return;
    const achados: RotuloUf[] = [];
    svg.querySelectorAll<SVGGraphicsElement>("[data-uf]").forEach((el) => {
      const uf = el.getAttribute("data-uf");
      if (!uf) return;
      try {
        const b = el.getBBox();
        if (b.width < 34 || b.height < 22) return;
        let cy = b.y + b.height / 2;
        if (uf === "GO") cy -= 8; // o DF fica no meio de Goiás
        if (uf === "PA") cy += 14;
        achados.push({ uf, x: b.x + b.width / 2, y: cy });
      } catch {
        // getBBox pode falhar em navegadores sem renderização; sem rótulos.
      }
    });
    setRotulos(achados);
  }, []);

  return (
    <div className="wrap mapa">
      <div className="mapa__texto">
        <h2 id="t-mapa">Atas por estado</h2>
        <p>
          Quanto mais forte o verde, mais atas vigentes os órgãos gerenciadores daquele estado
          publicaram. Clique no estado para ver as atas dele.
        </p>
        <ol className="mapa__ranking" aria-label="Estados com mais atas vigentes">
          {top.map((uf, i) => (
            <li key={uf}>
              <Link
                href={`/catalogo?uf=${uf}`}
                onMouseEnter={() => setAtiva(uf)}
                onMouseLeave={() => setAtiva(null)}
                onFocus={() => setAtiva(uf)}
                onBlur={() => setAtiva(null)}
              >
                <span className="mapa__pos tab">{i + 1}º</span>
                <span className="mapa__uf">
                  {UF_NOME[uf]} <small>{uf}</small>
                </span>
                <span className="mapa__n tab">{plural(porUf[uf], "ata", "atas")}</span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="mapa__legenda" aria-hidden="true">
          <span>Menos</span>
          <i className="amostra estado--0" />
          <i className="amostra estado--1" />
          <i className="amostra estado--2" />
          <i className="amostra estado--3" />
          <i className="amostra estado--4" />
          <span>Mais atas</span>
        </div>
      </div>

      <div className="mapa__desenho">
        <svg
          ref={raiz}
          className="mapa__svg"
          viewBox={MAPA_VIEWBOX}
          role="group"
          aria-label="Mapa do Brasil com o número de atas vigentes por estado"
        >
          {Object.entries(MAPA_ESTADOS).map(([uf, caminho]) => {
            const n = porUf[uf] ?? 0;
            const rotulo = `${UF_NOME[uf]}: ${n ? plural(n, "ata vigente", "atas vigentes") : "nenhuma ata vigente no momento"}`;
            const classe = `estado estado--${nivelDe(n, max)}${ativa === uf ? " ativo" : ""}`;
            return n ? (
              <a
                key={uf}
                className={classe}
                href={`/catalogo?uf=${uf}`}
                data-uf={uf}
                aria-label={rotulo}
              >
                <title>{rotulo}</title>
                <path d={caminho} />
              </a>
            ) : (
              <g key={uf} className={classe} data-uf={uf}>
                <title>{rotulo}</title>
                <path d={caminho} />
              </g>
            );
          })}
          <g className="mapa__rotulos" aria-hidden="true">
            {rotulos.map(({ uf, x, y }) => {
              const n = porUf[uf] ?? 0;
              const claro = nivelDe(n, max) >= 3;
              return (
                <g key={uf}>
                  <text
                    className={`mapa__sigla${claro ? " claro" : n ? "" : " vazio"}`}
                    x={x.toFixed(1)}
                    y={(y + (n ? -2 : 4)).toFixed(1)}
                  >
                    {uf}
                  </text>
                  {n ? (
                    <text className={`mapa__num${claro ? " claro" : ""}`} x={x.toFixed(1)} y={(y + 14).toFixed(1)}>
                      {n}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
        <p className="mapa__credito">
          Mapa:{" "}
          <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener noreferrer">
            svg-maps
          </a>
          , licença{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.pt-br"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY 4.0
          </a>
        </p>
      </div>
    </div>
  );
}
