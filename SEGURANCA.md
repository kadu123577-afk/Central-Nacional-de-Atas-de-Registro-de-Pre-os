# Segurança — o que está protegido e o que ainda falta

Atualizado em 2026-10-20 (branch `seguranca-hardening`).

## Já implementado

| Proteção | Onde |
|---|---|
| Next.js atualizado (vulnerabilidade crítica de cache/SSG corrigida) | `package.json` |
| Cabeçalhos: CSP, HSTS, anti-clickjacking, nosniff, Referrer/Permissions-Policy | `next.config.ts` |
| Limite de tentativas de login (5 falhas/15 min por conta; 30 por IP) e de cadastro por IP | `src/lib/limite-tentativas.ts` |
| Senha nova: mínimo 12 caracteres, recusa senhas óbvias e que contêm o e-mail | `src/lib/senha.ts` |
| 2FA (app autenticador) para admin, com anti-reuso de código e segredo cifrado (AES-256-GCM) | `src/lib/totp.ts`, `/admin/perfil` |
| Sessão revogável: trocar a senha derruba as outras sessões; conta desativada perde o acesso na hora | `src/lib/auth.ts` |
| Cookie `__Host-` em produção, `SameSite=Strict` e sessão curta (admin 8 h, vendedor 24 h) | `src/lib/auth.ts` |
| Trilha de auditoria (login, falhas, troca de senha, 2FA e toda ação do admin, com IP) | `src/lib/auditoria.ts`, tabela `logs_auditoria` |
| Rotas de rastreamento fechadas sem `CRON_SECRET` (antes ficavam abertas) | `src/lib/cron-auth.ts` |
| Download de documentos: tipo validado pelos bytes, nome escapado, `sandbox` + `nosniff` | `src/lib/documentos.ts` |
| Removida server action pública que permitia sobrescrever senha de fornecedor pelo CNPJ | `src/app/atas/actions.ts` (apagado) |
| Resposta de login com tempo igual para e-mail inexistente | `gastarTempoDeHash` |

## Ainda não coberto (riscos conhecidos)

1. **CSP com `unsafe-inline`.** Uma CSP com nonce exige renderização dinâmica de todas
   as páginas; fica como endurecimento futuro.
2. **2FA só para admin e opcional.** Vendedor, fornecedor e órgão não têm 2FA.
   Recomenda-se torná-lo obrigatório para admin e oferecer ao vendedor.
3. **Sem recuperação de senha por e-mail** (o sistema não envia e-mail). Hoje o admin
   redefine por script/banco. Ao integrar e-mail, verificar o e-mail no cadastro.
4. **Cadastro revela se CNPJ/e-mail já existe** (enumeração). Mitigado pelo limite por
   IP; o conserto completo exige verificação de e-mail.
5. **Limite por IP depende de `x-forwarded-for`**, confiável atrás da Vercel/Caddy/Nginx.
   Não exponha o Node direto na internet.
6. **Dependências do Prisma CLI** com 3 avisos `npm audit` (alto) só em tempo de
   instalação, não no site rodando; a correção exige o Prisma 7 (mudança grande).
7. **Documentos de ata são públicos por design** (registro de licitação). Não envie
   anexos com dados pessoais sensíveis.
8. **Sem WAF/proteção de volume além da fornecida pela Vercel**, sem monitoramento de
   erros e sem teste de invasão (pentest) independente — recomendado antes de
   operar com dinheiro real.
9. **LGPD:** revisar base legal, política de privacidade, prazo de retenção de logs e
   um canal do titular com o jurídico.

## Rotina recomendada

- Mensal: `npm audit --omit=dev` e atualizar dependências.
- Revisar `logs_auditoria` por `*.login_falhou` e `*.2fa_resetado_por_script`.
- Testar restauração de backup do banco a cada trimestre.
- Rotacionar `SESSION_SECRET` se houver suspeita de vazamento (derruba todas as
  sessões; **não** rotacione `TOTP_ENCRYPTION_KEY` sem recadastrar o 2FA dos admins).
