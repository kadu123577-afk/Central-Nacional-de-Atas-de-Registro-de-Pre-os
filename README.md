# Central Nacional de Atas de Registro de Preços

Plataforma que conecta atas de registro de preços vigentes a órgãos públicos que
querem aderir a elas, com a trava de adesão do art. 86 da Lei 14.133/2021, catálogo
público, painéis de fornecedor/órgão/admin, rastreador do PNCP e faturamento
automático.

Este guia é pra rodar o projeto **na sua máquina**, com um banco Postgres local.
Cada desenvolvedor roda sua própria cópia — os dados **não** são compartilhados
entre máquinas diferentes até existir um banco compartilhado (Supabase, ver
"Próximos passos" no fim).

## Atalho pra Windows (`instalar.bat` / `iniciar.bat`)

Depois de instalar Node.js, Git e PostgreSQL (passos 1-3 mais abaixo) e clonar o
repositório, dois arquivos já resolvem o resto sozinhos — dá dois cliques neles no
Explorador de Arquivos, ou rode pelo terminal dentro da pasta do projeto:

- **`instalar.bat`** — só precisa rodar uma vez: instala as dependências, cria o
  `.env` já com os valores certos pro Postgres local, gera a chave de sessão
  sozinho, cria as tabelas do banco e prepara o Prisma. No final, ele mostra o
  comando pra criar seu usuário admin.
- **`iniciar.bat`** — roda toda vez que quiser abrir o site. Deixa essa janela
  aberta e acesse `http://localhost:3000`.

Se o `instalar.bat` parar com um erro, tira um print de tudo que apareceu na tela.
O passo a passo manual abaixo existe caso prefira rodar cada comando você mesmo,
ou esteja no Mac/Linux (os `.bat` são só pra Windows).

## Pré-requisitos

- **Node.js 20 ou mais recente** ([nodejs.org](https://nodejs.org))
- **PostgreSQL** rodando localmente — duas opções, escolha uma:
  - **Docker** (mais simples, funciona igual em qualquer sistema operacional):
    [docker.com/get-started](https://www.docker.com/get-started/)
  - **Postgres instalado direto na máquina**: [Postgres.app](https://postgresapp.com/)
    no Mac, `apt install postgresql` no Linux, ou o instalador oficial no Windows
- **Git**

## Passo a passo

### 1. Clonar o repositório

```bash
git clone https://github.com/kadu123577-afk/Central-Nacional-de-Atas-de-Registro-de-Pre-os.git
cd Central-Nacional-de-Atas-de-Registro-de-Pre-os
git checkout claude/new-session-is28el
```

### 2. Instalar as dependências

```bash
npm install
```

### 3. Subir um Postgres local

**Opção A — Docker (recomendado):**

```bash
docker run --name central-atas-db \
  -e POSTGRES_PASSWORD=localdev \
  -e POSTGRES_DB=central_atas \
  -p 5432:5432 \
  -d postgres:16
```

Isso cria o banco `central_atas` já pronto, rodando na porta padrão 5432. Da
próxima vez que for trabalhar, basta `docker start central-atas-db` (não precisa
rodar o `docker run` de novo).

**Opção B — Postgres instalado na máquina:** crie um banco vazio chamado
`central_atas` (`createdb central_atas` ou pelo Postgres.app/pgAdmin).

### 4. Configurar as variáveis de ambiente

```bash
cp .env.example .env
```

Abra o `.env` e ajuste:

- `DATABASE_URL` — se usou a Opção A (Docker) acima, deixe exatamente:
  ```
  DATABASE_URL="postgresql://postgres:localdev@localhost:5432/central_atas?schema=public"
  ```
  Se usou a Opção B, ajuste usuário/senha/porta pro que você configurou.
- `SESSION_SECRET` — gere uma string aleatória com:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  e cole o resultado.

As outras variáveis (`CRON_SECRET`, `PNCP_ACCESS_TOKEN`, `TAXA_INTERMEDIACAO_PERCENTUAL`)
podem ficar em branco por enquanto — só são necessárias em produção ou pra usar o
rastreador do PNCP com chave de API.

### 5. Rodar as migrações do banco

```bash
npx prisma migrate dev
```

Isso cria todas as tabelas no seu banco local. Na primeira vez ele também gera o
Prisma Client automaticamente.

### 6. Criar o usuário administrador

Sem isso não dá pra entrar no painel `/admin`:

```bash
ADMIN_EMAIL="seu-email@tech10.com.br" ADMIN_SENHA="escolha-uma-senha-com-8-caracteres" npm run seed:admin
```

> **Windows (PowerShell):** essa sintaxe de variável antes do comando não funciona
> no PowerShell nativo. Use o Git Bash (instalado junto com o Git para Windows) ou
> rode assim no PowerShell:
> ```powershell
> $env:ADMIN_EMAIL="seu-email@tech10.com.br"; $env:ADMIN_SENHA="escolha-uma-senha-com-8-caracteres"; npm run seed:admin
> ```

### 7. Rodar o site

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Rodando os testes

```bash
npm run test
```

## Cada desenvolvedor no seu próprio banco

Se você e outro dev rodarem cada um na sua máquina, cada um vai ter seu próprio
banco local (passo 3), então uma ata que você cadastrar na sua máquina **não**
aparece na máquina do outro dev — são bancos diferentes. Isso é esperado em
desenvolvimento local. Quando o banco do Supabase existir (produção), todo mundo
passa a apontar pro mesmo lugar.

## Próximos passos (pra virar site de verdade, no ar, com um banco só)

1. Criar conta no [Supabase](https://supabase.com) (Postgres gerenciado) e trocar o
   `DATABASE_URL` de produção pra apontar pra lá.
2. Conectar o repositório à [Vercel](https://vercel.com) pra deploy automático a
   cada push.
3. Registrar o domínio `.com.br` no [Registro.br](https://registro.br) e apontar
   pra Vercel.

Essas contas não são criadas por aqui — precisam ser feitas por vocês diretamente
nesses serviços.
