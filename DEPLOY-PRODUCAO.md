# Colocando o sistema no ar (produção)

Arquitetura: **Supabase** (banco Postgres, região São Paulo) + **Vercel** (site) +
**domínio `.com.br`** no Registro.br. Quem cuida de servidor, patches, HTTPS e
backup do banco são eles; vocês cuidam do código e dos acessos.

> Contas, senhas e cobrança são de vocês: nada abaixo deve ser feito por terceiros
> com a senha de vocês. Ative **2FA em todas as contas** (GitHub, Supabase, Vercel,
> Registro.br, e-mail do domínio).

## 1. Banco de dados (Supabase)

1. Crie o projeto em supabase.com, região **South America (São Paulo)**, com uma
   senha de banco longa e aleatória (guarde no gerenciador de senhas).
2. Em **Connect → ORM/Prisma**, copie as duas strings:
   - **Transaction pooler** (porta `6543`) — é a `DATABASE_URL` do **site na Vercel**.
     Termine com `?pgbouncer=true&connection_limit=1`.
   - **Session pooler** (porta `5432`) — só para rodar as migrações (passo 3).
3. **Feche a API pública do Supabase.** Este sistema acessa o banco só pelo
   servidor (Prisma); a API REST pública do Supabase não é usada e, se ficar
   aberta, tabelas sem proteção poderiam ser lidas com a chave pública.
   - Em **Project Settings → API**, desative a **Data API** (ou, no mínimo, rode o
     SQL abaixo no **SQL Editor**):

   ```sql
   -- liga a proteção por linha (RLS) em todas as tabelas, sem nenhuma política:
   -- a chave pública (anon) fica sem acesso; o servidor (dono das tabelas) continua
   -- funcionando normalmente.
   DO $$
   DECLARE t record;
   BEGIN
     FOR t IN SELECT tablename FROM pg_tables
              WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
     LOOP
       EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
     END LOOP;
   END $$;
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
   ```

   Rode de novo depois de qualquer migração que crie tabela nova.
4. Em **Project Settings → Database**, confira que os **backups diários** estão
   ativos (plano Pro: 7 dias; considere o add-on de PITR para faturamento).

## 2. Criar as tabelas e o primeiro admin

No seu computador, na pasta do projeto (`npm install` antes), com a string do
**Session pooler (porta 5432)**:

```powershell
$env:DATABASE_URL = "<string do Session pooler>"
npx prisma migrate deploy

$env:ADMIN_EMAIL = "voce@suaempresa.com.br"
$env:ADMIN_SENHA = "<senha longa e única, 12+ caracteres>"
npx tsx prisma/seed-admin.ts
```

**Nunca** rode `npm run seed` (dados de demonstração) no banco de produção.
Limpe as variáveis ao terminar (`Remove-Item Env:ADMIN_SENHA, Env:DATABASE_URL`).

## 3. Site (Vercel)

1. vercel.com → **Add New → Project** → escolha o repositório e a branch de produção.
2. Em **Environment Variables** (marque *Production*):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | string do **Transaction pooler** (porta 6543, com `?pgbouncer=true&connection_limit=1`) |
   | `SESSION_SECRET` | 64+ caracteres aleatórios — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `CRON_SECRET` | outro valor aleatório (**obrigatório**: sem ele os rastreadores respondem 401) |
   | `TOTP_ENCRYPTION_KEY` | outro valor aleatório (cifra o segredo do 2FA; não troque depois, ou os admins precisam recadastrar o 2FA) |
   | `NEXT_PUBLIC_SITE_URL` | endereço público do site, ex.: `https://atas.arcacapital.com.br` |
   | `WHATSAPP_OFICIAL` | opcional: só dígitos com DDI (ex.: `5562900000000`); vazio = botões de contato abrem o e-mail |
   | `INDEXAR_SITE` | deixe **vazio** até haver atas reais publicadas; `true` liga o Google (robots e sitemap) |
   | `AMBIENTE_DEMONSTRACAO` | **nunca** `true` em produção (mostra dados fictícios no catálogo) |
   | `PNCP_ACCESS_TOKEN` | opcional (sem ele as atas do PNCP entram sem itens) |
   | `TAXA_INTERMEDIACAO_PERCENTUAL` | só se não for 5% (`0.05`) |

   Use valores **diferentes** dos de desenvolvimento e nunca os coloque no GitHub.
3. Clique em **Deploy**. O `vercel.json` já agenda os dois rastreadores diários
   (a Vercel envia o `CRON_SECRET` sozinha).
4. **Settings → Billing → Spend Management**: ative um limite de gasto.

## 4. Domínio `.com.br`

> O designer previu o endereço **atas.arcacapital.com.br** (subdomínio de um domínio da
> ARCA). Se o domínio `arcacapital.com.br` já existe, não precisa registrar nada: basta
> criar o subdomínio `atas` no DNS dele. O site, documentado em `SITE-PUBLICO.md`, é
> a parte pública deste mesmo projeto.

1. Registre em registro.br (≈ R$ 40/ano). Ative **2FA** na conta e o **DNSSEC**.
2. Na Vercel: **Settings → Domains → Add** e digite o domínio (ex.: `www.seusite.com.br`).
3. A Vercel mostra os registros DNS exatos. No Registro.br (**DNS → editar zona**)
   crie o `CNAME` de `www` e o `A` do domínio raiz como indicado.
4. Aguarde a propagação; o HTTPS é emitido sozinho. Defina o `www` (ou o raiz)
   como domínio principal e redirecione o outro.

## 5. Depois de ir ao ar (checklist)

- [ ] Entrar em `/admin/login` e **ativar o 2FA** em `/admin/perfil` (cada admin).
- [ ] Trocar a senha inicial do admin por uma única, longa e guardada no gerenciador.
- [ ] Testar: `https://seudominio/api/rastreador-pncp` sem cabeçalho deve dar **401**.
- [ ] Testar cabeçalhos em securityheaders.com (esperado: nota A ou melhor).
- [ ] Confirmar o aviso de cookies/política de privacidade com o jurídico (LGPD).
- [ ] Combinar quem recebe os alertas de erro e quem restaura backup (teste uma restauração).

## Perdeu o celular do 2FA?

No computador com acesso ao banco:

```powershell
$env:DATABASE_URL = "<Session pooler>"; $env:ADMIN_EMAIL = "voce@suaempresa.com.br"
npm run admin:resetar-2fa
```

O evento fica na trilha de auditoria (`logs_auditoria`).
