import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alternarStatusPontoFocal, logoutAdmin } from "../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FormularioInteracao } from "./formulario";

export const dynamic = "force-dynamic";

const NAV_ADMIN = [
  { rotulo: "Painel", href: "/admin" },
  { rotulo: "Contas a receber", href: "/admin/faturamento" },
  { rotulo: "Usuários", href: "/admin/usuarios" },
  { rotulo: "Pontos focais", href: "/admin/pontos-focais" },
  { rotulo: "Parceiros", href: "/admin/parceiros" },
  { rotulo: "Perfil", href: "/admin/perfil" },
];

export default async function DetalhePontoFocalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const [pontoFocal, atasVigentes] = await Promise.all([
    prisma.pontoFocal.findUnique({
      where: { id },
      include: {
        interacoes: {
          orderBy: { criadoEm: "desc" },
          include: { ata: { select: { numero: true, objeto: true } } },
        },
      },
    }),
    prisma.ata.findMany({
      where: { status: "APROVADA" },
      select: { id: true, numero: true, objeto: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  if (!pontoFocal) {
    notFound();
  }

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
            {pontoFocal.nomeContato}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            {pontoFocal.cargo} · {pontoFocal.esfera}
            {pontoFocal.uf ? ` · ${pontoFocal.uf}` : ""}
            {pontoFocal.municipio ? ` · ${pontoFocal.municipio}` : ""}
          </p>
        </div>
        <Link href="/admin/pontos-focais" className="botao-atas link">
          ← Pontos focais
        </Link>
      </div>

      <Secao
        titulo="Contato"
        acao={
          <div className="flex items-center gap-3">
            <Badge tom={pontoFocal.ativo ? "neutro" : "critico"}>
              {pontoFocal.ativo ? "Ativo" : "Inativo"}
            </Badge>
            <form action={alternarStatusPontoFocal}>
              <input type="hidden" name="pontoFocalId" value={pontoFocal.id} />
              <button
                type="submit"
                className={pontoFocal.ativo ? "botao-atas critico" : "botao-atas secundario"}
              >
                {pontoFocal.ativo ? "Desativar" : "Reativar"}
              </button>
            </form>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-sm">
          <p style={{ color: "var(--cor-texto-2)" }}>Telefone: {pontoFocal.telefone ?? "—"}</p>
          <p style={{ color: "var(--cor-texto-2)" }}>E-mail: {pontoFocal.email ?? "—"}</p>
        </div>
        {pontoFocal.particularidades && (
          <p className="mt-3 text-sm" style={{ color: "var(--cor-texto-2)" }}>
            <strong style={{ color: "var(--cor-texto)" }}>Particularidades:</strong>{" "}
            {pontoFocal.particularidades}
          </p>
        )}
      </Secao>

      <FormularioInteracao pontoFocalId={pontoFocal.id} atas={atasVigentes} />

      <Secao titulo={`Histórico de match (${pontoFocal.interacoes.length})`}>
        {pontoFocal.interacoes.length === 0 ? (
          <div className="mt-3">
            <VazioComAcao
              titulo="Nenhuma interação registrada"
              descricao="Registre acima a primeira oferta feita a este contato."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {pontoFocal.interacoes.map((i) => (
              <li key={i.id} className="painel p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <Badge tom={i.resultado === "Converteu" ? "marca" : i.resultado === "Recusou" ? "critico" : "neutro"}>
                    {i.resultado}
                  </Badge>
                  <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {i.criadoEm.toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {i.ata && (
                  <p className="mt-1 text-sm" style={{ color: "var(--cor-texto)" }}>
                    Ata {i.ata.numero} — {i.ata.objeto}
                  </p>
                )}
                {i.observacao && (
                  <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-2)" }}>
                    {i.observacao}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
