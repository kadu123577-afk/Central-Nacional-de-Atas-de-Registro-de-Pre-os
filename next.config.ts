import type { NextConfig } from "next";

const emProducao = process.env.NODE_ENV === "production";

// CSP estática. 'unsafe-inline' em script/style é necessário porque o Next
// injeta scripts de inicialização inline; uma CSP com nonce exigiria
// renderização dinâmica de todas as páginas (ver docs do Next sobre CSP) e
// fica como endurecimento futuro. Mesmo assim, esta política bloqueia
// clickjacking, plugins, <base> forjado e envio de formulário para outro
// domínio. 'unsafe-eval' só é aceito em desenvolvimento (React usa eval lá).
const politicaCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${emProducao ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(emProducao ? ["upgrade-insecure-requests"] : []),
].join("; ");

const cabecalhosDeSeguranca = [
  { key: "Content-Security-Policy", value: politicaCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(emProducao
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // As ações do servidor aceitam 1 MB por padrão. O cadastro da ata anexa documento de até 10 MB e a
  // importação de itens lê Excel e PDF de até 10 MB, então o corpo precisa de folga para o arquivo
  // mais o resto do formulário (cada ação confere o tamanho do seu arquivo).
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  // Um link só (14/11/2026): o endereço raiz abre a tela de entrada, e depois do login a pessoa
  // vai para a área dela. O catálogo público continua em /catalogo. RAIZ_ABRE_LOGIN=nao devolve a
  // vitrine à raiz. O valor é lido na hora do build.
  async redirects() {
    return process.env.RAIZ_ABRE_LOGIN === "nao" ? [] : [{ source: "/", destination: "/entrar", permanent: false }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: cabecalhosDeSeguranca },
      // Anexos de ata são dado inerte: nada pode executar nem embutir, mesmo
      // que o tipo seja enganoso. Esta regra vem depois da global e a sobrescreve.
      {
        source: "/api/documentos/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }],
      },
    ];
  },
};

export default nextConfig;
