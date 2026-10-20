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
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosDeSeguranca }];
  },
};

export default nextConfig;
