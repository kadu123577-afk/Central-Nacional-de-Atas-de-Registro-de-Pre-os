import Link from "next/link";
import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saldoAgregadoDisponivel, limitePorOrgao } from "@/lib/saldo";
import { logoutFornecedor } from "./actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { Numero } from "@/components/ui/valores";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { tomStatusAta } from "@/lib/severidade";

export const dynamic = "force-dynamic";

export default async function PainelFornecedorPage() {
  const fornecedorId = await fornecedorIdLogado();
  if (!fornecedorId) {
    redirect("/fornecedor/login");
  }

  const fornecedor = await prisma.fornecedor.findUnique({
    where: { id: fornecedorId },
    include: {
      atas: {
        include: { itens: { include: { saldo: true } }, documentos: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!fornecedor) {
    redirect("/fornecedor/login");
  }

  return (
    <AppShell
      area="Fornecedor"
      itens={[
        { rotulo: "Minhas atas", href: "/fornecedor" },
        { rotulo: "Nova ata", href: "/fornecedor/atas/nova" },
        { rotulo: "Pedidos recebidos", href: "/fornecedor/adesoes" },
      ]}
      rodape={
        <form action={logoutFornecedor}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            Minhas atas
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {fornecedor.razaoSocial}
          </p>
        </div>
        <Link href="/fornecedor/atas/nova" className="botao-atas">
          Nova ata
        </Link>
      </div>

      {fornecedor.atas.length === 0 ? (
        <VazioComAcao
          titulo="Nenhuma ata ainda"
          descricao="Cadastre sua primeira ata pra ela aparecer aqui."
          acao={
            <Link href="/fornecedor/atas/nova" className="botao-atas">
              Cadastrar ata
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {fornecedor.atas.map((ata) => (
            <Secao
              key={ata.id}
              titulo={`Ata ${ata.numero}`}
              acao={<Badge tom={tomStatusAta(ata.status)}>{ata.status}</Badge>}
            >
              <p className="text-sm" style={{ color: "var(--cor-texto-2)" }}>
                {ata.objeto}
              </p>
              {ata.documentos.map((doc) => (
                <a
                  key={doc.id}
                  href={`/api/documentos/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm underline"
                  style={{ color: "var(--cor-texto-2)" }}
                >
                  📎 {doc.nomeArquivo}
                </a>
              ))}

              <div className="mt-4 overflow-x-auto">
                <table className="tabela-atas">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Registrado</th>
                      <th>Limite por órgão</th>
                      <th>Saldo disponível</th>
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
    </AppShell>
  );
}
