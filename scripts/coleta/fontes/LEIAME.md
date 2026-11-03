# Coletores estaduais (`scripts/coleta/fontes/<fonte>.mjs`)

Cada arquivo aqui é uma fonte a mais para `coletar.mjs`, igual às nacionais (pncp, compras...):

```powershell
node scripts/coleta/coletar.mjs <fonte> [--limite=N] [--uf=PR] [--ibge=4105805,4110102] [--refazer]
```

- `rodar-coleta.ps1` inicia todas as fontes desta pasta em segundo plano (cada uma no seu processo) e `status.mjs` mostra o andamento.
- Saída, estado e log seguem o padrão das nacionais: `dados-coletados/<fonte>/<UF>/<ibge>.ndjson`, `_estado/<fonte>.json`, `_logs/<fonte>.log`.
- Para testar sem misturar com a coleta real: `COLETA_DIR=dados-coletados/_teste/<fonte>` (copie `alvos.json` para lá antes).

## Contrato do módulo

```js
export default {
  descricao: "TCE-PR: licitações e contratos do SIM-AM (PIT), por município e ano",
  ufs: ["PR"],            // só esses alvos entram na lista (vazio = todos)
  intervalo: 1500,        // ms mínimos entre requisições (seja educado com o servidor)

  // opcional: roda uma vez antes dos municípios (ex.: montar a tabela entidade → IBGE
  // de um diário, baixar um CSV estadual). Guarde caches em ctx.DADOS/_estado/<fonte>.*.json
  async preparar(ctx, lista) {},

  // obrigatório: coleta um município e devolve um resumo curto para o log.
  // Use ctx.coletarChave (JSON paginado) ou ctx.requisitar + ctx.gravarChave (HTML, CSV, ZIP, POST).
  // Cada "chave" (ex.: "licitacoes:2025") é gravada inteira ou não é gravada: se o processo cair,
  // a próxima rodada refaz só ela. Município sem cobertura: return "sem cobertura" (fica concluído).
  async processar(alvo, ctx) { return "licitacoes=12 contratos=30" },

  // obrigatório: normaliza um registro gravado para o contexto dos dossiês
  // (scripts/coleta/contexto-dossie.mjs). Devolva null para ignorar o registro.
  resumir(chave, dado) {
    return { tipo: "licitacao", data: "2026-03-01", numero: "PE 12/2026", objeto: "...", valor: 123.45,
             fornecedor: "...", situacao: "homologada", srp: true, url: "https://..." };
  },
};
```

`tipo` ∈ `licitacao`, `contrato`, `ata`, `adesao`, `dispensa`, `inexigibilidade`, `aditivo`, `homologacao`, `publicacao`, `obra`, `convenio`, `risco`, `preco`.

## Ferramentas em `ctx`

| | |
|---|---|
| `requisitar(url, {intervalo, metodo, corpo, headers, tipo: "texto"\|"json"\|"buffer"})` | HTTP com ritmo, novas tentativas em rede/5xx/429 e User-Agent de navegador. Devolve `{status, texto\|json\|buffer, headers}`, `{falhou}` (tente na próxima rodada) ou `{definitivo, status, corpo}` (4xx). |
| `coletarChave(alvo, chave, intervalo, montarUrl(pagina), extrair(json, pagina) → {itens, totalPaginas})` | JSON paginado por GET (mesmo da fonte pncp). |
| `gravarChave(alvo, chave, itens)` | grava os registros de uma chave e marca como feita. |
| `estadoDe(alvo)` | `{feito: {chave: n}, erros: {chave: msg}}` do município; `feito[chave] !== undefined` = já coletada. Município com `erros` não fica concluído e é refeito na próxima rodada. |
| `log`, `dormir`, `hojeIso`, `janelaAno(ano)`, `aaaammdd`, `lerJson`, `gravarJson`, `opcoes`, `DADOS`, `ANO_ATUAL`, `intervalo` | utilitários |

## Regras

- Só dados públicos, sem login, sem CAPTCHA, sem contornar bloqueio (Cloudflare, 401/403, reCAPTCHA): registre em `estadoDe(alvo).erros` e siga.
- Período: de 2023 em diante (Lei 14.133), salvo indicação da fonte.
- Sem dependências novas no `package.json`: use só Node 20+ (fetch, zlib, Buffer). Para ZIP, há um leitor mínimo em `_util.mjs`.
- Nada de CPF ou dados pessoais de particulares; nomes de fornecedores (PJ) e de agentes públicos no cargo podem.
