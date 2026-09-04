import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Download do anexo de uma ata (edital, ofício, ata digitalizada) —
 * público, sem autenticação: documento de licitação é registro público
 * por natureza, mesma lógica de acesso do catálogo (/catalogo).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentoId: string }> },
) {
  const { documentoId } = await params;

  const documento = await prisma.documentoAta.findUnique({ where: { id: documentoId } });
  if (!documento) {
    return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(documento.conteudo), {
    headers: {
      "Content-Type": documento.tipoMime,
      "Content-Disposition": `inline; filename="${documento.nomeArquivo}"`,
      "Content-Length": String(documento.tamanhoBytes),
    },
  });
}
