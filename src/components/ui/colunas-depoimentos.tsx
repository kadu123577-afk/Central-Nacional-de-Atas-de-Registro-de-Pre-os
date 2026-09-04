"use client";

import { Badge } from "@/components/ui/badge";

/**
 * CONTEÚDO DE EXEMPLO — nenhum nome, cargo ou órgão aqui é real. Substitua
 * por depoimentos reais assim que existir um piloto com órgão/fornecedor
 * de verdade. Não inventar nome/cargo que pareça real — vira depoimento
 * falso atribuído a alguém que não existe.
 */
const DEPOIMENTOS_EXEMPLO = [
  {
    texto:
      "Depoimento de exemplo — substituir pelo relato real do primeiro órgão ou fornecedor que usar a plataforma.",
    nome: "(a definir)",
    cargo: "(a definir)",
  },
  {
    texto:
      "Depoimento de exemplo — substituir pelo relato real do primeiro órgão ou fornecedor que usar a plataforma.",
    nome: "(a definir)",
    cargo: "(a definir)",
  },
  {
    texto:
      "Depoimento de exemplo — substituir pelo relato real do primeiro órgão ou fornecedor que usar a plataforma.",
    nome: "(a definir)",
    cargo: "(a definir)",
  },
  {
    texto:
      "Depoimento de exemplo — substituir pelo relato real do primeiro órgão ou fornecedor que usar a plataforma.",
    nome: "(a definir)",
    cargo: "(a definir)",
  },
  {
    texto:
      "Depoimento de exemplo — substituir pelo relato real do primeiro órgão ou fornecedor que usar a plataforma.",
    nome: "(a definir)",
    cargo: "(a definir)",
  },
];

const DURACAO_POR_COLUNA = ["24s", "28s", "32s"];

function Cartao({ texto, nome, cargo }: { texto: string; nome: string; cargo: string }) {
  return (
    <div className="painel p-4">
      <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
        {texto}
      </p>
      <p className="mt-3 text-xs" style={{ color: "var(--cor-texto-3)" }}>
        {nome} — {cargo}
      </p>
    </div>
  );
}

export function ColunasDepoimentos() {
  return (
    <div className="flex flex-col gap-4">
      <Badge tom="atencao">Conteúdo de exemplo — trocar antes de publicar</Badge>

      <style>{`
        @keyframes colunas-depoimentos-rola {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        .colunas-depoimentos-coluna {
          animation: colunas-depoimentos-rola linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .colunas-depoimentos-coluna {
            animation: none;
          }
        }
      `}</style>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {DURACAO_POR_COLUNA.map((duracao, indice) => (
          <div key={indice} style={{ height: 420, overflow: "hidden" }}>
            <div
              className="colunas-depoimentos-coluna flex flex-col gap-4"
              style={{ animationDuration: duracao }}
            >
              {[...DEPOIMENTOS_EXEMPLO, ...DEPOIMENTOS_EXEMPLO].map((depoimento, i) => (
                <Cartao key={i} {...depoimento} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
