import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alternarStatusParceiro, logoutAdmin } from "../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { Aviso } from "@/components/ui/aviso";
import { SeloCategoria } from "@/components/ui/selo-categoria";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { corDaCategoria, rotuloDaCategoria } from "@/lib/categorias";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

export default async function DetalheParceiroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const parceiro = await prisma.parceiro.findUnique({ where: { id } });
  if (!parceiro) {
    notFound();
  }

  const semInteresseDefinido =
    parceiro.categoriasInteresse.length === 0 && parceiro.ufsInteresse.length === 0;

  // Match por necessidade (mapa do núcleo de atas, 2026-09-05): uma ata
  // aprovada entra na lista se bater com a categoria OU a UF de interesse
  // do parceiro — união, não interseção, porque o parceiro pode querer
  // ver oportunidades por qualquer um dos dois critérios.
  const atasCompativeis = semInteresseDefinido
    ? []
    : await prisma.ata.findMany({
        where: {
          status: "APROVADA",
          OR: [
            ...(parceiro.categoriasInteresse.length > 0
              ? [{ categoria: { in: parceiro.categoriasInteresse } }]
              : []),
            ...(parceiro.ufsInteresse.length > 0
              ? [{ orgaoGerenciador: { uf: { in: parceiro.ufsInteresse } } }]
              : []),
          ],
        },
        include: { orgaoGerenciador: true },
        orderBy: { createdAt: "desc" },
      });

  return (
    <AppShell
      area="Administrativo"
      itens={NAV_ADMIN}
      rodape={
        <form action={logoutAdmin}>
          <button type="submit" className="botao-atas link">
            Sair
          </button>
        </form>
      }
    >
      <CabecalhoPagina
        rotulo="Cadastros"
        titulo={parceiro.nome}
        descricao={parceiro.contato}
        voltar={{ href: "/admin/parceiros", rotulo: "Parceiros" }}
      />

      <Secao
        titulo="Interesses"
        destaque
        acao={
          <div className="flex items-center gap-3">
            <Badge tom={parceiro.ativo ? "neutro" : "critico"}>
              {parceiro.ativo ? "Ativo" : "Inativo"}
            </Badge>
            <form action={alternarStatusParceiro}>
              <input type="hidden" name="parceiroId" value={parceiro.id} />
              <button
                type="submit"
                className={parceiro.ativo ? "botao-atas critico" : "botao-atas secundario"}
              >
                {parceiro.ativo ? "Desativar" : "Reativar"}
              </button>
            </form>
          </div>
        }
      >
        {semInteresseDefinido ? (
          <Aviso tom="atencao">
            Nenhuma categoria ou UF de interesse definida ainda — edite o cadastro pra
            começar a ver atas compatíveis aqui.
          </Aviso>
        ) : (
          <div className="flex flex-col gap-4">
            {parceiro.categoriasInteresse.length > 0 && (
              <div>
                <p className="eyebrow mb-2">Categorias</p>
                <div className="flex flex-wrap gap-1.5">
                  {parceiro.categoriasInteresse.map((c) => (
                    <SeloCategoria key={c} categoria={rotuloDaCategoria(c)} />
                  ))}
                </div>
              </div>
            )}
            {parceiro.ufsInteresse.length > 0 && (
              <div>
                <p className="eyebrow mb-2">UFs</p>
                <div className="flex flex-wrap gap-1.5">
                  {parceiro.ufsInteresse.map((uf) => (
                    <span key={uf} className="selo-uf">
                      {uf}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Secao>

      <Secao titulo={`Atas compatíveis (${atasCompativeis.length})`}>
        {atasCompativeis.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma ata compatível no momento"
            descricao={
              semInteresseDefinido
                ? "Defina categorias ou UFs de interesse pra este parceiro."
                : "Nenhuma ata aprovada bate com os interesses cadastrados ainda."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[640px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Nº</th>
                  <th>Objeto da ata</th>
                  <th className="w-[170px]">Categoria</th>
                  <th className="w-[64px]">UF</th>
                </tr>
              </thead>
              <tbody>
                {atasCompativeis.map((ata) => (
                  <tr key={ata.id}>
                    <td className="codigo whitespace-nowrap text-xs" style={{ color: "var(--cor-texto-3)" }}>
                      Ata {ata.numero}
                    </td>
                    <td>
                      <span className="titulo-linha block">{ata.objeto}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                        {ata.orgaoGerenciador.nome}
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
                      <span className="selo-uf">{ata.orgaoGerenciador.uf}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </AppShell>
  );
}
