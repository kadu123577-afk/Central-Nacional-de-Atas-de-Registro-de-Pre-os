import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/ui/app-shell";
import { Secao } from "@/components/ui/secao";
import { VazioComAcao } from "@/components/ui/vazio-com-acao";
import { ROTULO_CATEGORIA_CONSUMO } from "@/lib/classificador-objeto";
import { NAV_VENDEDOR } from "../../nav";

export const dynamic = "force-dynamic";

/** Detalhe de um município pro vendedor — contatos (prefeito,
 * secretários) e o raio-X completo de necessidades, tudo numa tela só,
 * acessível direto da lista de Municípios. */
export default async function MunicipioVendedorPage({ params }: { params: Promise<{ id: string }> }) {
  const vendedorId = await vendedorIdLogado();
  if (!vendedorId) redirect("/vendedor/login");

  const { id } = await params;
  const municipio = await prisma.entidadeAlvo.findUnique({
    where: { id },
    include: {
      contatos: { where: { ativo: true }, orderBy: { createdAt: "asc" } },
      historicoConsumo: { orderBy: { ultimaContratacao: "desc" } },
    },
  });
  if (!municipio) notFound();

  return (
    <AppShell area="Vendedor" itens={NAV_VENDEDOR}>
      <div className="flex items-center justify-between">
        <h1 className="marca text-2xl" style={{ color: "var(--cor-texto)" }}>
          {municipio.nome}
          {municipio.uf ? `/${municipio.uf}` : ""}
        </h1>
        <Link href="/vendedor/municipios" className="botao-atas link">
          ← Municípios
        </Link>
      </div>

      <Secao titulo="Dados gerais">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              CNPJ
            </p>
            <p style={{ color: "var(--cor-texto)" }}>{municipio.cnpj ?? "não encontrado"}</p>
          </div>
          <div>
            <p className="eyebrow" style={{ color: "var(--cor-texto-3)" }}>
              Endereço
            </p>
            <p style={{ color: "var(--cor-texto)" }}>{municipio.endereco ?? "não encontrado"}</p>
          </div>
        </div>
      </Secao>

      <Secao titulo={`Contatos ${municipio.contatos.length > 0 ? `(${municipio.contatos.length})` : ""}`}>
        {municipio.contatos.length === 0 ? (
          <VazioComAcao titulo="Nenhum contato levantado ainda" descricao="" />
        ) : (
          <ul className="flex flex-col gap-3">
            {municipio.contatos.map((c) => (
              <li key={c.id} className="painel p-4">
                <p className="text-sm font-medium" style={{ color: "var(--cor-texto)" }}>
                  {c.cargo}
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--cor-texto-2)" }}>
                  {c.nomeContato}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  Telefone: {c.telefone ?? "não encontrado"} · E-mail: {c.email ?? "não encontrado"}
                </p>
                {c.particularidades && (
                  <p className="mt-1 text-xs" style={{ color: "var(--cor-texto-3)" }}>
                    {c.particularidades}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo={`Necessidades identificadas (raio-X) ${municipio.historicoConsumo.length > 0 ? `(${municipio.historicoConsumo.length})` : ""}`}>
        {municipio.historicoConsumo.length === 0 ? (
          <VazioComAcao
            titulo="Raio-X ainda não identificou necessidades"
            descricao="Pode ser que o raio-X não tenha rodado ainda, ou não tenha achado contratação em nenhuma categoria conhecida."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {municipio.historicoConsumo.map((h) => (
              <li
                key={h.categoria}
                className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0"
                style={{ borderColor: "var(--cor-borda)" }}
              >
                <span style={{ color: "var(--cor-texto)" }}>
                  {ROTULO_CATEGORIA_CONSUMO[h.categoria] ?? h.categoria}
                </span>
                <span className="text-xs" style={{ color: "var(--cor-texto-3)" }}>
                  última contratação: {h.ultimaContratacao.toLocaleDateString("pt-BR")} · {h.quantidadeContratosNaJanela}{" "}
                  nos últimos 3 anos
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </AppShell>
  );
}
