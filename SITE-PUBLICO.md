# Site público (vitrine) — como funciona e como mexer

Integração do pacote do designer (ARCA Capital) ao sistema, em 2026-10-20.
O site é a parte pública do mesmo projeto Next.js: não há segundo servidor.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Páginas públicas (home, catálogo, ata, entrar, termos, privacidade) | `src/app/(site)/` |
| Página 404 (do site) | `src/app/not-found.tsx` |
| CSS do designer, isolado em `@scope (.site)` | `src/estilos/site.css` |
| Cabeçalho, rodapé, mapa, formulários | `src/components/site/` |
| Regras de saldo, vigência, categorias, textos fixos | `src/lib/site/` |
| **Camada de dados do site (decide o que cada um vê)** | `src/lib/catalogo-publico.ts` + `src/lib/visibilidade.ts` |
| Fila do "Não achei a ata" | `/admin/demandas`, tabela `demandas_sem_ata` |
| Marcas e imagens | `public/site/marca/` |

O CSS do designer só vale dentro de `.site`. Os painéis (admin, vendedor, fornecedor e
órgão) continuam no tema escuro da Tech 10, sem nenhuma mistura de estilo.

## Regra de sigilo (decisão do dono do produto)

O modelo é de intermediação com comissão. Quem consegue **localizar a ata no PNCP**
contrata direto com o fornecedor e a plataforma perde a comissão. E para localizar uma
ata no PNCP basta o objeto somado a **qualquer um** destes: UF, itens, quantidades, saldo
ou vigência. O órgão comprador também pode procurar no PNCP, então a restrição vale para
ele também:

| Quem | Vê |
|---|---|
| **Visitante** | **só categoria, título público e um código público** (no lugar do número da ata). |
| **Órgão logado** | **exatamente o mesmo** que o visitante. A diferença é que ele pode **enviar o pedido de adesão** da ata. |
| **Admin e vendedor** | tudo: **objeto original**, órgão gerenciador, fornecedor, preço, itens, quantidade, saldo, vigência, nº PNCP, documentos. |

Pontos que importam:

- A decisão é tomada **no servidor**. Os campos restritos nem são lidos do banco nem
  enviados ao navegador de quem não é da equipe. Esconder só na tela não protegeria nada.
- **Filtros e ordenações também vazam.** Se o visitante pudesse filtrar por UF, descobriria
  em que estado cada ata está; se pudesse buscar por item, descobriria o que há dentro de
  cada uma. Para quem não é da equipe, o servidor **ignora** `uf`, `vig` e `ord`, e a busca
  olha só objeto e categoria (mesmo que alguém monte o endereço na mão). Testado.
- A **busca** só olha o nome de órgão, fornecedor e número para a equipe.
- O **download de documentos** (`/api/documentos/...`) é só para admin, vendedor e o
  fornecedor dono da ata. Os PDFs trazem fornecedor e preço.
- O painel do órgão mostra o código público da ata, nunca o fornecedor.
- A home não mostra mapa por estado nem números por UF/saldo, só o total de atas e de
  categorias. (O componente `secao-mapa.tsx` e os dados do mapa ficam no projeto, sem uso.)

### Título público (o único nome da ata fora da equipe)

O objeto original de uma ata costuma ser o mesmo texto publicado no PNCP: quem o copiasse e
buscasse lá acharia a ata. Por isso o site **nunca mostra o objeto**. Mostra o **título
público**, genérico de propósito: *Ata de material de limpeza*, *Ata de material hospitalar*,
*Ata de medicamentos*.

- Quem cadastra a ata escreve o título no campo **"Título público"** (cadastro em
  `/admin/atas/nova`). Para atas que já existem, ou que vieram do PNCP e do Compras.gov.br,
  edite em **Atas → (a ata) → Título público** (`/admin/atas/<id>/municipios`).
- Se ficar vazio, o site usa **"Ata de (categoria)"** (ex.: *Ata de limpeza e conservação*) e,
  sem categoria, *Ata de registro de preços*. **Nunca** cai de volta para o objeto original.
- O objeto original nem é lido do banco para visitante e órgão, e a **busca** deles olha só o
  título público e as categorias (se olhasse o objeto, daria para descobrir o texto original
  por tentativa). A equipe continua vendo e buscando pelo objeto.
- Escreva títulos **genéricos**: um título detalhado ("Ata de dipirona 500 mg do município X")
  desfaz a proteção.

### Como o órgão pede a adesão (sem ver os itens)

1. Na página da ata (`/catalogo/<id>`), o órgão logado vê o formulário **"Pedir adesão a
   esta ata"**: diz, em texto livre, o que precisa (itens e quantidades), prazo, contato e
   justificativa. Nome do órgão e UF vêm **da conta**, não do formulário.
2. O pedido cai na fila `/admin/demandas` (tipo **Pedido de adesão**), com o vínculo com a
   ata. **Só a equipe** vê ali o fornecedor, o gerenciador e os itens da ata.
3. A equipe confere itens e saldo (limite de 50% por órgão e 200% no total), monta o pedido
   e responde pelo contato. O órgão acompanha o andamento em `/orgao` ("Pedidos enviados à
   equipe": Recebido, Em análise, Respondido, Encerrado).

O fluxo antigo, em que o órgão escolhia o item e o sistema aplicava o limite sozinho
(`/orgao/pedido/novo`), está **desativado** (redireciona ao catálogo): ele mostrava a
descrição do item, o limite e o saldo. A ação de criar o pedido continua em
`src/app/orgao/actions.ts` para a equipe usar no futuro.

**Consequência de negócio:** a adesão deixou de ser autoatendimento. Cada pedido passa pela
equipe, que precisa conferir o saldo manualmente. O que faltava automatizar (criar a adesão
no sistema a partir do pedido, com o limite do art. 86) fica para uma próxima etapa.

### Limites conhecidos (leia antes de confiar no sigilo)

1. **Depende de a equipe escrever títulos genéricos.** O sistema garante que o objeto
   original não sai; não garante que o título escrito não seja específico demais.
2. O PNCP é público: o sigilo remove a conveniência, não a informação. A **categoria**
   continua aparecendo e, com um título como *Ata de medicamentos* numa região pequena, ainda
   pode haver alguma chance de alguém achar a ata por outros meios.
3. Um órgão que **já conhece** a ata (por exemplo, o que a publicou) não ganha nada com o
   sigilo; ele serve contra quem descobriria a ata pela plataforma.

Para mudar quem vê o quê, o lugar é `src/lib/visibilidade.ts` (níveis) e
`src/lib/catalogo-publico.ts` (campos de cada nível). Nenhuma página do site deve
consultar o Prisma direto.

## Integrações

- **Login:** a tela `/entrar` usa as mesmas ações de login do órgão e do fornecedor
  (limite de tentativas, auditoria). O destino pós-login é validado
  (`src/lib/destino-login.ts`): só a área do usuário ou a página da ata, nunca endereço
  externo. Vendedor e admin **não** têm link público (`/vendedor/login`, `/admin/login`).
- **Pedir adesão:** visitante → `/entrar?perfil=orgao&ata=<id>` → volta à página da ata,
  já com o formulário. Órgão já logado vai direto ao formulário.
- **Não achei a ata:** grava em `demandas_sem_ata` (tipo `sem_ata`) com quatro freios:
  campo-isca para robôs, limite por IP (10 por hora), validação de formato e bloqueio de
  duplicata. O IP fica só como hash. A equipe trata em `/admin/demandas` (nova, em busca,
  respondida, descartada, com nota interna).
## Variáveis de ambiente do site

`NEXT_PUBLIC_SITE_URL`, `WHATSAPP_OFICIAL`, `INDEXAR_SITE`, `AMBIENTE_DEMONSTRACAO`
(descritas em `.env.example`). Enquanto `INDEXAR_SITE` não for `true`, o site inteiro sai
com `noindex` e o `robots.txt` bloqueia tudo.

## Pendências de negócio (não são código)

1. **Empresa e marca.** O site público é da **ARCA Capital** (Arca Capital Investimentos
   e Participações Ltda, CNPJ 66.103.397/0001-55); as telas internas e os e-mails ainda
   falam em **Tech 10**. Definir quem é a operadora e quem recebe a comissão antes de
   publicar Termos e Privacidade.
2. **Termos de uso e Privacidade** são minutas do designer, **pendentes de revisão
   jurídica**. Não publicar sem advogado.
3. **Domínio:** o designer previu `atas.arcacapital.com.br` (subdomínio de um domínio da
   ARCA). Se for outro, ajustar `NEXT_PUBLIC_SITE_URL` e o DNS (ver `DEPLOY-PRODUCAO.md`).
4. **WhatsApp oficial** (hoje os botões de contato abrem o e-mail).
5. **Aviso de LGPD do formulário** "Não achei a ata": a base legal e o prazo de retenção
   das demandas precisam de definição com o jurídico (hoje não há expiração automática).

## Limitações atuais

- A busca por texto não ignora acentos ("alimentacao" não acha "alimentação"); só ignora
  maiúsculas. Para resolver, habilitar a extensão `unaccent` no Postgres.
- Ordenar por "maior saldo" carrega os dados de todas as atas do filtro em memória; com
  milhares de atas convém mover o cálculo para o banco.
- O catálogo mostra as atas aprovadas e vigentes; as importadas do PNCP sem categoria
  aparecem em "Outros objetos" até serem classificadas no painel do admin.
