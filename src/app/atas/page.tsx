import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { limitePorOrgao, saldoAgregadoDisponivel } from "@/lib/saldo";
import { Badge } from "@/components/ui/badge";
import { Secao } from "@/components/ui/secao";
import { Numero } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { tomStatusAta } from "@/lib/severidade";

// Depende sempre de dados atuais do banco — nunca pré-renderizar em build.
export const dynamic = "force-dynamic";

export default async function AtasPage() {
  const atas = await prisma.ata.findMany({
    include: {
      fornecedor: true,
      orgaoGerenciador: true,
      itens: { include: { saldo: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          Atas cadastradas
        </h1>
        <Link href="/atas/nova" className="botao-atas">
          Nova ata
        </Link>
      </div>

      {atas.length === 0 ? (
        <VazioComAcao
          titulo="Nenhuma ata cadastrada ainda"
          descricao="Comece pela primeira ata — fornecedor, órgão gerenciador e ao menos um item."
          acao={
            <Link href="/atas/nova" className="botao-atas">
              Cadastrar ata
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {atas.map((ata) => (
            <Secao
              key={ata.id}
              titulo={`Ata ${ata.numero} — ${ata.fornecedor.razaoSocial}`}
              acao={<Badge tom={tomStatusAta(ata.status)}>{ata.status}</Badge>}
            >
              <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                {ata.objeto}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                Órgão gerenciador: {ata.orgaoGerenciador.nome} ({ata.orgaoGerenciador.uf})
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="tabela-atas">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qtd. registrada</th>
                      <th>Limite por órgão (50%)</th>
                      <th>Saldo agregado disponível</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ata.itens.map((item) => (
                      <tr key={item.id}>
                        <td>{item.descricao}</td>
                        <td>
                          <Numero>
                            {item.quantidadeRegistrada} {item.unidade}
                          </Numero>
                        </td>
                        <td>
                          <Numero>{limitePorOrgao(item.quantidadeRegistrada)}</Numero>
                        </td>
                        <td>
                          <Numero>
                            {saldoAgregadoDisponivel(
                              item.quantidadeRegistrada,
                              item.saldo?.quantidadeConsumida ?? 0,
                            )}
                          </Numero>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Secao>
          ))}
        </ul>
      )}
    </main>
  );
}
