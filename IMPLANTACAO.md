# Implantação da Central de Atas de Registro de Preços

Guia para quem vai **publicar o sistema na internet** (equipe de infraestrutura do grupo Rett e do SERPRO). Serve para qualquer hospedagem com Node.js e PostgreSQL. Para o caminho Vercel + Supabase, veja também [DEPLOY-PRODUCAO.md](DEPLOY-PRODUCAO.md).

> **Confidencialidade.** O código e o acesso ao sistema estão sob o NDA do Projeto RNA. Quem recebe este guia recebeu autorização por escrito da ARCA, e a conta de nuvem onde o sistema roda deve ficar sob controle da ARCA.

## 1. O que o sistema é

Um aplicativo Next.js (16) com PostgreSQL. **Um endereço só**: quem abre o link cai na tela de entrada e, depois de entrar, vai para a área do próprio perfil.

| Endereço | O que é | Quem usa |
|---|---|---|
| `/` | abre a tela de entrada (`/entrar`) | todos |
| `/entrar` | **entrada única**: o sistema descobre o perfil pelo e-mail | todos |
| `/admin` | painel da equipe interna (captação, jurídico, aprovação, administração, cobrança) | equipe |
| `/vendedor` | painel dos consultores de vendas (Kanban dos municípios) | consultores |
| `/orgao` | área do órgão comprador (pedidos de adesão) | órgãos |
| `/fornecedor` | área do fornecedor (atas e pedidos recebidos) | fornecedores |
| `/catalogo` | catálogo público de atas (sem dado comercial) | público |
| `/termos-de-uso`, `/politica-privacidade` | páginas públicas legais | público |
| `/trocar-senha` | troca de senha obrigatória no primeiro acesso | equipe e consultores |
| `/api/saude` | verificação de saúde (200 = ok, 503 = banco fora) | monitoramento |

As antigas páginas de login (`/admin/login`, `/vendedor/login`, `/orgao/login`, `/fornecedor/login`) apenas redirecionam para `/entrar`.

## 2. O que precisa existir

- **Node.js 22 ou mais novo** (testado em 24; a leitura de PDF exige o 22).
- **PostgreSQL 14 ou mais novo**, com um banco vazio e um usuário com permissão de criar tabelas.
- **HTTPS** na frente do sistema (proxy reverso ou balanceador). Em produção os cookies de sessão só trafegam em conexão segura.
- Cerca de 1 GB de memória para a aplicação.

## 3. Variáveis de ambiente

Modelo completo em [`.env.example`](.env.example). **Nunca** envie o `.env` real para o repositório.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | **sim** | conexão com o PostgreSQL: `postgresql://usuario:senha@servidor:5432/banco` |
| `SESSION_SECRET` | **sim** | assina as sessões; aleatória, **32 caracteres ou mais** |
| `CRON_SECRET` | recomendada | autoriza as rotinas automáticas (seção 6); sem ela elas recusam toda chamada |
| `TOTP_ENCRYPTION_KEY` | recomendada | cifra o segredo do 2FA dos administradores; **defina antes do primeiro uso e nunca troque** |
| `NEXT_PUBLIC_SITE_URL` | recomendada | endereço público, com `https://` |
| `PNCP_ACCESS_TOKEN` | opcional | enriquece as atas importadas do PNCP |
| `WHATSAPP_OFICIAL` | opcional | número oficial (só dígitos com DDI) |
| `INDEXAR_SITE` | opcional | `true` liga a indexação no Google; deixe desligado até haver dados reais |
| `RAIZ_ABRE_LOGIN` | opcional | por padrão a raiz abre o login; `nao` devolve a vitrine pública à raiz (lido no build) |
| `AMBIENTE_DEMONSTRACAO` | **não ligar** | mostra dados fictícios; só para demonstração |
| `RENATA_API_ATIVA`, `RENATA_API_TOKEN` | **deixar vazias** | leitura para a Renata; só com autorização escrita da ARCA |

Gere os segredos com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Se faltar o banco ou o `SESSION_SECRET`, o sistema se recusa a subir** e escreve no log exatamente o que falta ("Ambiente de produção incompleto"). Os demais itens geram só aviso no log.

## 4. Passo a passo

```bash
# 1. Instalar (já gera o cliente do banco; não precisa do banco ligado)
npm ci

# 2. Configurar as variáveis de ambiente (seção 3)

# 3. Criar as tabelas (pode repetir sem medo: só aplica o que falta)
npm run db:migrar

# 4. Criar o primeiro administrador (uma vez)
ADMIN_EMAIL="gestor@exemplo.com.br" ADMIN_SENHA="uma senha forte de 12+ caracteres" ADMIN_NOME="Nome" npm run seed:admin

# 5. Criar a equipe do workflow, todas com a mesma senha provisória (veja a seção 5)
EQUIPE_ARQUIVO=/caminho/equipe-inicial.json SENHA_PROVISORIA='<senha inicial combinada>' npm run seed:equipe

# 6. Montar e subir
npm run build
npm run start        # porta 3000; use PORT=8080 para mudar
```

Depois do passo 4, apague `ADMIN_EMAIL` e `ADMIN_SENHA` do ambiente.

O arquivo da equipe (passo 5) tem os e-mails reais e **não fica no repositório**: quem coordena o projeto o entrega junto com a senha inicial. O formato está em [`prisma/equipe-inicial.exemplo.json`](prisma/equipe-inicial.exemplo.json). O passo pode ser repetido sem risco (conta que já existe não é alterada; `REDEFINIR=sim` refaz a senha de todos).

**Proxy reverso.** O sistema limita tentativas de login por IP lendo o cabeçalho `X-Forwarded-For` (o primeiro valor). O proxy deve **sobrescrever** esse cabeçalho com o IP real do cliente (nunca repassar o que o cliente mandou), senão o limite pode ser contornado. Aponte o balanceador para `/api/saude`.

## 5. Primeiro acesso e contas

1. Entre em `/entrar` com a conta do primeiro administrador e, em **Equipe e conta → Perfil**, ative o **2FA** (aplicativo autenticador).
2. Em **Equipe e conta → Usuários**, crie as contas da equipe. Cada pessoa recebe permissões por atividade do workflow (captação, contrato, conformidade, aprovação, publicação, liberação de municípios, instrução, declaração, registro de adesão, acompanhamento, cobrança, base de municípios, gestão de usuários).
3. A conta nasce com uma **senha provisória**; a pessoa é obrigada a trocá-la no primeiro acesso (12 caracteres ou mais). Pela tela, a senha provisória é gerada e mostrada uma única vez; pelo `seed:equipe`, todas recebem a senha inicial combinada. **Enquanto a senha inicial for compartilhada, não abra o sistema ao público antes de todos trocarem a senha** (ou restrinja o acesso por rede até lá). Para quem esquecer a senha: **Redefinir senha** gera outra provisória.
4. **Consultores de vendas:** criados na mesma tela (aba de consultores). Antes de atuar, cada um aceita o compromisso de integridade e a gestão o libera (credenciamento).
5. **Cadastro público de órgão e fornecedor:** quem se cadastra sozinho **não entra na hora**. O CNPJ é conferido (dígitos verificadores), a conta nasce **inativa e "aguardando liberação"**, e a tela de entrada responde "e-mail ou senha inválidos" até a liberação (de propósito, para não revelar quais contas existem). A equipe vê o aviso "Cadastros aguardando liberação" na página inicial da Gestão, confere os dados e clica em **Liberar** em **Equipe e conta → Usuários**.
6. **Cada função só vê o que é dela** (o sistema é "engessado" de propósito): o menu mostra só as telas da função, a página inicial lista só o que está na vez da pessoa, e cada tela confere a permissão de novo no servidor (digitar o endereço de uma tela alheia é recusado). Perfis prontos: **Gestão** (administração, jurídico, gestão e cobrança num perfil só, todas as permissões e a visão geral; é o de Carlos Eduardo e do Jorge), **Aprovador**, **Captador**, **Estagiário** e **Cobrança**. A permissão "Visão geral da operação" (ciclos, pipeline, desempenho, catálogo completo, painéis de números) é só da Gestão. Dá para ajustar as permissões de cada pessoa.

## 6. Rotinas automáticas (agendador)

Duas rotinas diárias buscam atas novas. Em hospedagem sem agendador próprio, programe o cron do servidor para chamar:

```bash
# todo dia às 06:00 UTC e 07:00 UTC
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://SEU-ENDERECO/api/rastreador-pncp
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://SEU-ENDERECO/api/rastreador-compras-gov
```

(Na Vercel isso já vem em `vercel.json`.) Sem `CRON_SECRET` configurado, essas duas rotas recusam todas as chamadas.

## 7. Segurança que já vem configurada

- Sessões em cookie `httpOnly`, `secure` em produção, com versão (trocar a senha derruba as sessões antigas).
- Senhas com bcrypt; limite de tentativas de login por conta e por IP, com bloqueio temporário.
- 2FA opcional por aplicativo autenticador para a equipe.
- Cabeçalhos: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS (em produção).
- Trilha de auditoria de ações sensíveis (quem, o quê e quando, sem gravar senhas).
- Permissões por atividade, conferidas no servidor a cada ação.
- Páginas de erro em português, sem detalhe técnico para o usuário (só um código para a equipe achar no log).

## 8. O que a equipe de infraestrutura precisa providenciar

- **Backup do banco** diário (`pg_dump`) e teste de restauração. O sistema não faz backup sozinho.
- **Monitoramento** em `/api/saude` e alerta se ficar 503.
- **Logs** da aplicação guardados (o código do erro mostrado ao usuário aparece neles).
- **Certificado HTTPS** e renovação.
- Atualizações: receber a nova versão, `npm ci`, `npm run db:migrar`, `npm run build`, reiniciar.

## 9. Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| Não sobe: "Ambiente de produção incompleto" | falta `DATABASE_URL` ou `SESSION_SECRET` (o log diz qual) |
| `npm ci` falha em "prisma generate" | versão antiga do Node; use 22 ou mais novo |
| Todos caem no login depois de reiniciar | `SESSION_SECRET` mudou entre as execuções; mantenha o mesmo |
| Administrador perdeu o celular do 2FA | `ADMIN_EMAIL=... npm run admin:resetar-2fa` |
| Pedem senha e não há nenhuma conta | rode o passo 4 (primeiro administrador) |
