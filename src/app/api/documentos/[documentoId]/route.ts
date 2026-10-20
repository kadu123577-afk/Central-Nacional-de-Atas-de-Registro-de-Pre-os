import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { contentDispositionSeguro } from "@/lib/documentos";

/**
 * Download do anexo de uma ata (edital, ofício, ata digitalizada) —
 * público, sem autenticação: documento de licitação é registro público
 * por natureza, mesma lógica de acesso do catálogo (/catalogo).
 *
 * Endurecimento (2026-10-20): o arquivo é servido como dado inerte — com
 * nosniff, CSP "sandbox" (nada executa mesmo que o tipo seja enganoso) e
 * nome de arquivo escapado no Content-Disposition. O tipo foi validado
 * pelos bytes do arquivo no upload.
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
      "Content-Disposition": contentDispositionSeguro(documento.nomeArquivo),
      "Content-Length": String(documento.tamanhoBytes),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=300",
    },
  });
}