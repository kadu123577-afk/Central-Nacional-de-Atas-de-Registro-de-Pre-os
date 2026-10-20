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
ou vigência. Por isso:

| Quem | Vê |
|---|---|
| **Visitante** | **só categoria, objeto e um código público** (no lugar do número da ata). |
| **Órgão logado** | o mesmo, mais UF, vigência em faixa e **todos os itens** (descrição, unidade, saldo %), porque precisa escolher o que pedir. Sem órgão gerenciador, fornecedor, preço, nº PNCP e documentos. |
| **Admin e vendedor** | tudo: órgão gerenciador, fornecedor, preço, quantidade, nº PNCP, datas, documentos. |

Pontos que importam:

- A decisão é tomada **no servidor**. Os campos restritos nem são lidos do banco nem
  enviados ao navegador de quem não tem o nível. Esconder só na tela não protegeria nada.
- **Filtros e ordenações também vazam.** Se o visitante pudesse filtrar por UF, descobriria
  em que estado cada ata está; se pudesse buscar por item, descobriria o que há dentro de
  cada uma. Para o visitante, o servidor **ignora** `uf`, `vig` e `ord` e a busca olha só
  objeto e categoria (mesmo que alguém monte o endereço na mão). Testado.
- A **busca** só olha o nome de órgão, fornecedor e número para a equipe.
- O **download de documentos** (`/api/documentos/...`) é só para admin, vendedor e o
  fornecedor dono da ata. Os PDFs trazem fornecedor e preço.
- No painel do órgão, o nome do fornecedor foi trocado pelo código público da ata.
- A home não mostra mapa por estado nem números por UF/saldo, só o total de atas e de
  categorias. (O componente `secao-mapa.tsx` e os dados do mapa ficam no projeto, sem uso,
  caso se decida mostrá-los a quem tem acesso.)

### Limites conhecidos (leia antes de confiar no sigilo)

1. **O objeto da ata é, em geral, o mesmo texto publicado no PNCP.** Quem copiar a frase do
   objeto e buscar no PNCP pode achar a ata. Remover UF, itens e saldo dificulta, mas não
   impede. A solução mais forte é o visitante ver um **título público** escrito pela
   equipe (campo novo na ata) em vez do objeto original. Decisão pendente.
2. O PNCP é público: o sigilo remove a conveniência, não a informação.
3. O órgão logado vê UF e itens e, na tela do pedido, o limite de 50% e o saldo agregado
   (dá para deduzir a quantidade registrada). Ele também pode procurar a ata no PNCP.
   Se o nível "órgão" também não deve ver isso, é uma decisão de produto: o pedido de
   adesão teria de passar pela equipe.

Para mudar quem vê o quê, o lugar é `src/lib/visibilidade.ts` (níveis) e
`src/lib/catalogo-publico.ts` (campos de cada nível). Nenhuma página do site deve
consultar o Prisma direto.
## Integrações

- **Login:** a tela `/entrar` usa as mesmas ações de login do órgão e do fornecedor
  (limite de tentativas, auditoria). O destino pós-login é validado
  (`src/lib/destino-login.ts`): só caminhos da própria área, nunca endereço externo.
  Vendedor e admin **não** têm link público (`/vendedor/login`, `/admin/login`).
- **Pedir adesão:** visitante → `/entrar?perfil=orgao&ata=..&item=..` → após o login,
  `/orgao/pedido/novo?itemId=..`. Órgão já logado vai direto ao pedido.
- **Não achei a ata:** grava em `demandas_sem_ata` com quatro freios: campo-isca para
  robôs, limite por IP (10 por hora), validação de formato e bloqueio de duplicata. O IP
  fica só como hash. A equipe trata em `/admin/demandas` (nova, em busca, respondida,
  descartada, com nota interna).

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
