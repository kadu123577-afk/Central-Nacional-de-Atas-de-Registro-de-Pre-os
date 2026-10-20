import { notFound, redirect } from "next/navigation";
import { adminIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { alternarStatusPontoFocal, logoutAdmin } from "../../../../actions";
import { AppShell } from "@/components/ui/app-shell";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Secao } from "@/components/ui/secao";
import { Badge } from "@/components/ui/badge";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { FormularioInteracao } from "./formulario";
import { NAV_ADMIN } from "@/app/admin/nav";

export const dynamic = "force-dynamic";

export default async function DetalheContatoPage({
  params,
}: {
  params: Promise<{ id: string; contatoId: string }>;
}) {
  const adminId = await adminIdLogado();
  if (!adminId) {
    redirect("/admin/login");
  }

  const { id, contatoId } = await params;
  const [contato, atasVigentes] = await Promise.all([
    prisma.pontoFocal.findUnique({
      where: { id: contatoId },
      include: {
        entidadeAlvo: true,
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

  if (!contato || contato.entidadeAlvoId !== id) {
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
      <CabecalhoPagina
        rotulo="Cadastros"
        titulo={contato.nomeContato}
        descricao={
          <>
            {contato.cargo}
            {contato.area ? ` · ${contato.area}` : ""} · {contato.entidadeAlvo.nome}
          </>
        }
        voltar={{ href: `/admin/entidades/${id}`, rotulo: contato.entidadeAlvo.nome }}
      />

      <Secao
        titulo="Contato"
        destaque
        acao={
          <div className="flex items-center gap-3">
            <Badge tom={contato.ativo ? "neutro" : "critico"}>
              {contato.ativo ? "Ativo" : "Inativo"}
            </Badge>
            <form action={alternarStatusPontoFocal}>
              <input type="hidden" name="pontoFocalId" value={contato.id} />
              <button
                type="submit"
                className={contato.ativo ? "botao-atas critico" : "botao-atas secundario"}
              >
                {contato.ativo ? "Desativar" : "Reativar"}
              </button>
            </form>
          </div>
        }
      >
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Dado rotulo="Telefone">{contato.telefone ?? "—"}</Dado>
          <Dado rotulo="E-mail">{contato.email ?? "—"}</Dado>
          {contato.particularidades && (
            <Dado rotulo="Particularidades" className="sm:col-span-2">
              <span className="leading-relaxed" style={{ color: "var(--cor-texto-2)" }}>
                {contato.particularidades}
              </span>
            </Dado>
          )}
        </dl>
      </Secao>

      <FormularioInteracao pontoFocalId={contato.id} atas={atasVigentes} />

      <Secao titulo={`Histórico de match (${contato.interacoes.length})`}>
        {contato.interacoes.length === 0 ? (
          <VazioComAcao
            titulo="Nenhuma interação registrada"
            descricao="Registre acima a primeira oferta feita a este contato."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela-atas min-w-[620px]">
              <thead>
                <tr>
                  <th className="w-[1%]">Resultado</th>
                  <th>Ata oferecida</th>
                  <th>Observação</th>
                  <th className="w-[1%]">Data</th>
                </tr>
              </thead>
              <tbody>
                {contato.interacoes.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Badge tom={i.resultado === "Converteu" ? "marca" : i.resultado === "Recusou" ? "critico" : "neutro"}>
                        {i.resultado}
                      </Badge>
                    </td>
                    <td>
                      {i.ata ? (
                        <>
                          <span className="titulo-linha block">{i.ata.objeto}</span>
                          <span className="codigo mt-0.5 block text-xs" style={{ color: "var(--cor-texto-3)" }}>
                            Ata {i.ata.numero}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-[13px]">{i.observacao || "—"}</td>
                    <td className="numero whitespace-nowrap text-[13px]" style={{ color: "var(--cor-texto)" }}>
                      {i.criadoEm.toLocaleDateString("pt-BR")}
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

function Dado({
  rotulo,
  className,
  children,
}: {
  rotulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold" style={{ color: "var(--cor-texto-3)" }}>
        {rotulo}
      </dt>
      <dd className="mt-1 text-[14px]" style={{ color: "var(--cor-texto)" }}>
        {children}
      </dd>
    </div>
  );
}
