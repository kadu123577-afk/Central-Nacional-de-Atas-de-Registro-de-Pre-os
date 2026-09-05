import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alternarStatusParceiro, logoutAdmin } from "../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { corDaCategoria } from "@/lib/categorias";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Fornecedores", href: "/admin/fornecedores" },
  { rotulo: "Municípios/Entidades", href: "/admin/entidades" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
            {parceiro.nome}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {parceiro.contato}
          </p>
        </div>
        <Link href="/admin/parceiros" className="botao-atas link">
          ← Parceiros
        </Link>
      </div>

      <Secao
        titulo="Interesses"
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
        <div className="flex flex-wrap gap-2">
          {parceiro.categoriasInteresse.map((c) => (
            <span
              key={c}
              className="eyebrow rounded-full border px-2.5 py-0.5"
              style={{ borderColor: corDaCategoria(c), color: corDaCategoria(c) }}
            >
              {c}
            </span>
          ))}
          {parceiro.ufsInteresse.map((uf) => (
            <Badge key={uf} tom="neutro">
              {uf}
            </Badge>
          ))}
          {semInteresseDefinido && (
            <p className="text-sm" style={{ color: "var(--cor-texto-3)" }}>
              Nenhuma categoria ou UF de interesse definida ainda — edite o cadastro pra
              começar a ver atas compatíveis aqui.
            </p>
          )}
        </div>
      </Secao>

      <Secao titulo={`Atas compatíveis (${atasCompativeis.length})`}>
        {atasCompativeis.length === 0 ? (
          <div className="mt-3">
            <VazioComAcao
              titulo="Nenhuma ata compatível no momento"
              descricao={
                semInteresseDefinido
                  ? "Defina categorias ou UFs de interesse pra este parceiro."
                  : "Nenhuma ata aprovada bate com os interesses cadastrados ainda."
              }
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {atasCompativeis.map((ata) => (
              <li key={ata.id} className="painel p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                    Ata {ata.numero}
                  </p>
                  {ata.categoria && (
                    <span
                      className="eyebrow rounded-full border px-2.5 py-0.5"
                      style={{ borderColor: corDaCategoria(ata.categoria), color: corDaCategoria(ata.categoria) }}
                    >
                      {ata.categoria}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  {ata.objeto} · {ata.orgaoGerenciador.nome} ({ata.orgaoGerenciador.uf})
                </p>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
