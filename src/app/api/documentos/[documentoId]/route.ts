import { NextResponse } from "next/server";
import { adminIdLogado, fornecedorIdLogado, vendedorIdLogado } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contentDispositionSeguro } from "@/lib/documentos";

/**
 * Download do anexo de uma ata (edital, ofício, ata digitalizada).
 *
 * Acesso restrito (2026-10-20): o documento traz fornecedor, órgão e preços,
 * justamente o que a vitrine pública esconde (a plataforma vive de
 * intermediação, ver src/lib/visibilidade.ts). Só baixam: admin, vendedor e o
 * fornecedor dono da ata. Para qualquer outra pessoa a resposta é a mesma de
 * "não existe" (404), para não confirmar que o arquivo existe.
 *
 * O arquivo é servido como dado inerte — com nosniff, CSP "sandbox" (nada
 * executa mesmo que o tipo seja enganoso) e nome escapado no
 * Content-Disposition. O tipo foi validado pelos bytes do arquivo no upload.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentoId: string }> },
) {
  const { documentoId } = await params;

  const [adminId, vendedorId, fornecedorId] = await Promise.all([
    adminIdLogado(),
    vendedorIdLogado(),
    fornecedorIdLogado(),
  ]);
  if (!adminId && !vendedorId && !fornecedorId) {
    return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
  }

  const documento = await prisma.documentoAta.findUnique({
    where: { id: documentoId },
    include: { ata: { select: { fornecedorId: true } } },
  });

  const autorizado =
    documento && (adminId || vendedorId || (fornecedorId && documento.ata.fornecedorId === fornecedorId));
  if (!documento || !autorizado) {
    return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(documento.conteudo), {
    headers: {
      "Content-Type": documento.tipoMime,
      "Content-Disposition": contentDispositionSeguro(documento.nomeArquivo),
      "Content-Length": String(documento.tamanhoBytes),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // Resposta depende de quem pede: nada de cache compartilhado.
      "Cache-Control": "private, no-store",
    },
  });
}
