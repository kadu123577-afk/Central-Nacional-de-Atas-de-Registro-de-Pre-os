import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { interpretarPlanilhaDeItens } from "./importar-itens";
import {
  celulaParaTexto,
  detectarFormato,
  interpretarLinhaDeItem,
  interpretarLinhasDoPdf,
  itensDoPdfParaTexto,
  lerArquivoDeItens,
  linhasDaPagina,
  matrizParaTexto,
} from "./importar-itens-arquivo";

// ───────────────────────────── fixtures ─────────────────────────────

/** Um .xlsx mínimo (zip com as partes obrigatórias), com textos em sharedStrings e números como número. */
function criarXlsx(linhas: (string | number | null)[][], nomeDaAba = "Itens"): Uint8Array {
  const textos: string[] = [];
  const indiceDe = (t: string) => {
    const i = textos.indexOf(t);
    if (i >= 0) return i;
    textos.push(t);
    return textos.length - 1;
  };
  const coluna = (i: number) => String.fromCharCode(65 + i);
  const xmlLinhas = linhas
    .map((linha, r) => {
      const celulas = linha
        .map((v, c) => {
          const ref = `${coluna(c)}${r + 1}`;
          if (v === null) return "";
          if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
          return `<c r="${ref}" t="s"><v>${indiceDe(v)}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${celulas}</row>`;
    })
    .join("");
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${cab}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `${cab}<workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nomeDaAba}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(`${cab}<worksheet ${ns}><sheetData>${xmlLinhas}</sheetData></worksheet>`),
    "xl/sharedStrings.xml": strToU8(
      `${cab}<sst ${ns} count="${textos.length}" uniqueCount="${textos.length}">${textos.map((t) => `<si><t>${esc(t)}</t></si>`).join("")}</sst>`,
    ),
  });
}

/** Um PDF de uma página com o texto de cada célula na posição dada (fonte Helvetica de 9 pt). */
function criarPdf(celulas: { texto: string; x: number; y: number }[]): Uint8Array {
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const conteudo = celulas.map((c) => `BT /F1 9 Tf ${c.x} ${c.y} Td (${esc(c.texto)}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) pdf += `${String(p).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(pdf);
}

// ───────────────────────────── formato ─────────────────────────────

describe("detectarFormato", () => {
  it("reconhece pelos bytes, não pelo nome", () => {
    expect(detectarFormato("itens.xlsx", criarXlsx([["a"]]))).toBe("xlsx");
    expect(detectarFormato("qualquer.bin", criarPdf([{ texto: "oi", x: 50, y: 700 }]))).toBe("pdf");
    expect(detectarFormato("itens.csv", strToU8("Descrição;Unidade"))).toBe("texto");
    expect(detectarFormato("antigo.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toBe("xls");
    expect(detectarFormato("foto.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe("imagem");
    expect(detectarFormato("foto.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("imagem");
  });

  it("zip que não é Excel e binário qualquer não são aceitos", () => {
    expect(detectarFormato("doc.docx", criarXlsx([["a"]]))).toBe("desconhecido");
    expect(detectarFormato("itens.ods", criarXlsx([["a"]]))).toBe("ods");
    expect(detectarFormato("x.dat", new Uint8Array([1, 2, 0, 3, 4]))).toBe("desconhecido");
  });
});

// ───────────────────────────── Excel ─────────────────────────────

describe("celulaParaTexto", () => {
  it("número vira texto com vírgula decimal, para 1.234 não virar mil duzentos e trinta e quatro", () => {
    expect(celulaParaTexto(100)).toBe("100");
    expect(celulaParaTexto(25.9)).toBe("25,9");
    expect(celulaParaTexto(1.234)).toBe("1,234");
    expect(celulaParaTexto(null)).toBe("");
    expect(celulaParaTexto(undefined)).toBe("");
    expect(celulaParaTexto("  Papel \n A4 ")).toBe("Papel A4");
    expect(celulaParaTexto(new Date(Date.UTC(2026, 10, 5)))).toBe("05/11/2026");
    expect(celulaParaTexto(true)).toBe("sim");
  });
});

describe("matrizParaTexto", () => {
  const CAB = ["Item", "Descrição do item", "Unid.", "Qtd", "Valor unitário (R$)"];

  it("descarta o que vem antes do cabeçalho, as linhas em branco e a de total", () => {
    const r = matrizParaTexto([
      ["ATA DE REGISTRO DE PREÇOS Nº 12/2026", "", "", "", ""],
      ["Órgão: Prefeitura", "", "", "", ""],
      ["", "", "", "", ""],
      CAB,
      ["1", "Papel sulfite A4", "Caixa", "100", "25,9"],
      ["", "", "", "", ""],
      ["2", "Caneta azul", "Unidade", "500", "1,5"],
      ["", "TOTAL", "", "", "x"],
    ]);
    expect(r.achouCabecalho).toBe(true);
    expect(r.texto.split("\n")).toEqual([
      "Item\tDescrição do item\tUnid.\tQtd\tValor unitário (R$)",
      "1\tPapel sulfite A4\tCaixa\t100\t25,9",
      "2\tCaneta azul\tUnidade\t500\t1,5",
    ]);
  });

  it("sem cabeçalho de itens devolve tudo, para o importador explicar o que falta", () => {
    const r = matrizParaTexto([["a", "b"], ["c", "d"]]);
    expect(r.achouCabecalho).toBe(false);
    expect(r.texto).toBe("a\tb\nc\td");
  });

  it("a coluna “Item” (só o número) não toma o lugar da descrição na importação", () => {
    const { texto } = matrizParaTexto([CAB, ["1", "Papel sulfite A4", "Caixa", "100", "25,9"]]);
    const r = interpretarPlanilhaDeItens(texto, "material-escritorio");
    expect(r.erros).toEqual([]);
    expect(r.itens[0]).toMatchObject({ descricao: "Papel sulfite A4", unidade: "Caixa", quantidadeRegistrada: 100, valorUnitario: "25.90" });
  });

  it("aspas dentro de uma célula ficam escapadas e a importação lê o texto de volta", () => {
    const { texto } = matrizParaTexto([CAB, ["1", 'Tubo 3/4" PVC', "Metro", "10", "5,5"]]);
    const r = interpretarPlanilhaDeItens(texto, "material-construcao");
    expect(r.erros).toEqual([]);
    expect(r.itens[0].descricao).toBe('Tubo 3/4" PVC');
  });
});

describe("lerArquivoDeItens: Excel (.xlsx)", () => {
  it("lê um arquivo de verdade e entrega o texto que o importador confere sem erro", async () => {
    const xlsx = criarXlsx([
      ["Ata 12/2026", null, null, null, null],
      ["Item", "Descrição", "Unidade", "Quantidade", "Valor unitário"],
      ["1", "Papel sulfite A4", "Caixa", 100, 25.9],
      ["2", "Caneta esferográfica azul", "Unidade", 500, 1.234],
      ["", "Total", "", "", 99999],
    ]);
    const r = await lerArquivoDeItens("itens.xlsx", xlsx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formato).toBe("xlsx");
    const lido = interpretarPlanilhaDeItens(r.texto, "material-escritorio");
    expect(lido.erros).toEqual([]);
    expect(lido.itens.map((i) => [i.descricao, i.quantidadeRegistrada, i.valorUnitario])).toEqual([
      ["Papel sulfite A4", 100, "25.90"],
      ["Caneta esferográfica azul", 500, "1.23"],
    ]);
  });

  it("arquivo que diz ser Excel mas não é: erro claro, sem derrubar", async () => {
    const lixo = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);
    const r = await lerArquivoDeItens("itens.xlsx", lixo);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.erro).toContain("Excel");
  });
});

// ───────────────────────────── PDF: reconstrução de linhas ─────────────────────────────

describe("linhasDaPagina", () => {
  it("junta pedaços na mesma altura, separa colunas por tabulação e palavras por espaço", () => {
    const linhas = linhasDaPagina([
      { texto: "Papel", x: 100, y: 700, largura: 24 },
      { texto: "sulfite", x: 126, y: 700, largura: 30 }, // 2 pt de vazio: palavra
      { texto: "Caixa", x: 250, y: 700, largura: 25 }, // vazio largo: outra coluna
      { texto: "100", x: 320, y: 699.5, largura: 14 }, // quase a mesma altura
      { texto: "Cabeçalho", x: 100, y: 720, largura: 50 },
    ]);
    expect(linhas).toEqual(["Cabeçalho", "Papel sulfite\tCaixa\t100"]);
  });

  it("ignora pedaços em branco e posições inválidas", () => {
    expect(linhasDaPagina([{ texto: "  ", x: 1, y: 1, largura: 1 }, { texto: "a", x: Number.NaN, y: 1, largura: 1 }])).toEqual([]);
  });
});

describe("interpretarLinhaDeItem", () => {
  it("colunas separadas por tabulação: número do item, descrição, unidade, quantidade, valor e total", () => {
    expect(interpretarLinhaDeItem("1\tPapel sulfite A4 75g\tCaixa\t100\tR$ 25,90\tR$ 2.590,00")).toEqual({
      descricao: "Papel sulfite A4 75g",
      unidade: "Caixa",
      quantidade: 100,
      valorUnitario: 25.9,
      codigo: null,
    });
  });

  it("só espaços, sem o total: quantidade e valor no fim, unidade logo antes", () => {
    expect(interpretarLinhaDeItem("2 Caneta esferográfica azul UN 500 1,50")).toMatchObject({
      descricao: "Caneta esferográfica azul",
      unidade: "UN",
      quantidade: 500,
      valorUnitario: 1.5,
    });
  });

  it("separa o código do catálogo (CATMAT) que vem depois do número do item", () => {
    expect(interpretarLinhaDeItem("3 150012 Detergente neutro 500 ml UND 1.000 2,35 2.350,00")).toMatchObject({
      codigo: "150012",
      descricao: "Detergente neutro 500 ml",
      quantidade: 1000,
      valorUnitario: 2.35,
    });
  });

  it("a conta quantidade × valor = total decide a ordem das colunas quando o valor vem antes da quantidade", () => {
    expect(interpretarLinhaDeItem("4 Cadeira de escritório UN 350,00 20 7.000,00")).toMatchObject({
      quantidade: 20,
      valorUnitario: 350,
    });
  });

  it.each([
    ["só texto", "Prefeitura Municipal de Jataí"],
    ["sem unidade", "5 Papel A4 100 25,90"],
    ["quantidade com casas decimais nos dois números", "6 Cabo flex M 2,5 3,75"],
    ["sem descrição", "7 UN 10 5,00"],
    ["valor zero", "8 Grampo cx CX 10 0,00"],
    ["só um número", "9 Papel UN 100"],
  ])("não é item: %s", (_nome, linha) => {
    expect(interpretarLinhaDeItem(linha)).toBeNull();
  });
});

describe("interpretarLinhasDoPdf", () => {
  const LINHAS = [
    "ATA DE REGISTRO DE PREÇOS Nº 12/2026",
    "Item\tDescrição\tUnidade\tQuantidade\tValor unitário\tValor total",
    "1\tPapel sulfite A4 75g\tCaixa\t100\t25,90\t2.590,00",
    "2\tCaneta esferográfica azul, corpo transparente\tUN\t500\t1,50\t750,00",
    "ponta fina 0,7 mm", // continuação da descrição do item 2
    "Página 1 de 2",
    "3\tDetergente neutro 500 ml\tUND\t1.000\t2,35\t2.350,00",
    "Valor total\t5.690,00",
    "Documento assinado digitalmente por Fulano de Tal em 05/11/2026 às 10:32 e válido para todos os fins legais",
  ];

  it("lê os itens, ignora cabeçalho, página e total, e junta a continuação da descrição", () => {
    const r = interpretarLinhasDoPdf(LINHAS);
    expect(r.itens.map((i) => [i.descricao, i.unidade, i.quantidade, i.valorUnitario])).toEqual([
      ["Papel sulfite A4 75g", "Caixa", 100, 25.9],
      ["Caneta esferográfica azul, corpo transparente ponta fina 0,7 mm", "UN", 500, 1.5],
      ["Detergente neutro 500 ml", "UND", 1000, 2.35],
    ]);
    expect(r.juntadas).toBe(1);
    // O título e o rodapé comprido não são item e ficam para a pessoa ver.
    expect(r.naoLidas).toContain("ATA DE REGISTRO DE PREÇOS Nº 12/2026");
    expect(r.naoLidas.some((l) => l.startsWith("Documento assinado"))).toBe(true);
  });

  it("o texto que sai é uma planilha que o importador confere sem erro", () => {
    const texto = itensDoPdfParaTexto(interpretarLinhasDoPdf(LINHAS).itens);
    const lido = interpretarPlanilhaDeItens(texto, "material-escritorio");
    expect(lido.erros).toEqual([]);
    expect(lido.itens).toHaveLength(3);
    expect(lido.itens[0]).toMatchObject({ valorUnitario: "25.90", quantidadeRegistrada: 100 });
    expect(lido.itens[2]).toMatchObject({ valorUnitario: "2.35", quantidadeRegistrada: 1000 });
  });

  it("no máximo duas linhas de continuação por item; o resto vai para as não lidas", () => {
    const r = interpretarLinhasDoPdf(["1 Papel A4 UN 10 5,00", "linha um", "linha dois", "linha três"]);
    expect(r.itens[0].descricao).toBe("Papel A4 linha um linha dois");
    expect(r.naoLidas).toEqual(["linha três"]);
  });
});

// ───────────────────────────── PDF de verdade ─────────────────────────────

describe("lerArquivoDeItens: PDF", () => {
  const COLUNAS = { item: 50, descricao: 80, unidade: 300, quantidade: 360, valor: 420, total: 490 };

  it("lê um PDF com tabela de itens (posição das colunas) e entrega a planilha", async () => {
    let y = 700;
    const celulas = [
      { texto: "ATA DE REGISTRO DE PRECOS 12/2026", x: 50, y: 740 },
      { texto: "Item", x: COLUNAS.item, y },
      { texto: "Descricao", x: COLUNAS.descricao, y },
      { texto: "Unidade", x: COLUNAS.unidade, y },
      { texto: "Quantidade", x: COLUNAS.quantidade, y },
      { texto: "Valor unitario", x: COLUNAS.valor, y },
      { texto: "Valor total", x: COLUNAS.total, y },
    ];
    for (const [n, desc, un, q, v, t] of [
      ["1", "Papel sulfite A4 75g", "Caixa", "100", "25,90", "2.590,00"],
      ["2", "Caneta esferografica azul", "UN", "500", "1,50", "750,00"],
      ["3", "Detergente neutro 500 ml", "UND", "1.000", "2,35", "2.350,00"],
    ]) {
      y -= 16;
      celulas.push(
        { texto: n, x: COLUNAS.item, y },
        { texto: desc, x: COLUNAS.descricao, y },
        { texto: un, x: COLUNAS.unidade, y },
        { texto: q, x: COLUNAS.quantidade, y },
        { texto: v, x: COLUNAS.valor, y },
        { texto: t, x: COLUNAS.total, y },
      );
    }
    const r = await lerArquivoDeItens("ata.pdf", criarPdf(celulas));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formato).toBe("pdf");
    expect(r.aviso).toContain("Li 3 item(ns)");
    const lido = interpretarPlanilhaDeItens(r.texto, "material-escritorio");
    expect(lido.erros).toEqual([]);
    expect(lido.itens.map((i) => [i.descricao, i.unidade, i.quantidadeRegistrada, i.valorUnitario])).toEqual([
      ["Papel sulfite A4 75g", "Caixa", 100, "25.90"],
      ["Caneta esferografica azul", "UN", 500, "1.50"],
      ["Detergente neutro 500 ml", "UND", 1000, "2.35"],
    ]);
  });

  it("PDF sem itens reconhecíveis: erro claro", async () => {
    const r = await lerArquivoDeItens("texto.pdf", criarPdf([{ texto: "Apenas um oficio sem tabela nenhuma", x: 50, y: 700 }]));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain("Não encontrei itens");
  });

  it("PDF sem texto (escaneado) ou quebrado: erro claro, sem derrubar", async () => {
    const vazio = await lerArquivoDeItens("scan.pdf", criarPdf([]));
    expect(vazio.ok).toBe(false);
    expect(vazio.ok === false && vazio.erro).toContain("imagem escaneada");
    const quebrado = await lerArquivoDeItens("quebrado.pdf", strToU8("%PDF-1.4\nisto nao e um pdf de verdade"));
    expect(quebrado.ok).toBe(false);
  });
});

describe("lerArquivoDeItens: texto e formatos recusados", () => {
  it("CSV vai como texto, sem mudar nada", async () => {
    const r = await lerArquivoDeItens("itens.csv", strToU8("Descrição;Unidade;Quantidade;Valor unitário\nPapel;Caixa;10;5,00"));
    expect(r).toMatchObject({ ok: true, formato: "texto" });
  });

  it("Excel antigo, imagem e binário recebem o recado de como seguir", async () => {
    const xls = await lerArquivoDeItens("a.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]));
    expect(xls.ok === false && xls.erro).toContain(".xlsx");
    const img = await lerArquivoDeItens("a.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]));
    expect(img.ok === false && img.erro).toContain("Imagem");
    const bin = await lerArquivoDeItens("a.dat", new Uint8Array([1, 0, 2, 0]));
    expect(bin.ok === false && bin.erro).toContain("Não reconheci");
  });
});
