import { SITE } from "./config";

/** Perguntas frequentes (texto do designer). Usadas na home e no JSON-LD. */
export const FAQ: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "Quem pode aderir a uma ata de registro de preços?",
    resposta:
      "Órgãos e entidades da administração pública que não participaram da licitação original, desde que comprovem a vantagem da adesão, a compatibilidade dos preços com o mercado e obtenham o aceite do órgão gerenciador e do fornecedor (Lei 14.133/2021, art. 86).",
  },
  {
    pergunta: "O órgão público paga para usar a plataforma?",
    resposta:
      "Não. A consulta e o pedido de adesão não têm custo para o órgão. A plataforma é remunerada por uma taxa de intermediação devida pelo fornecedor, prevista em contrato com ele.",
  },
  {
    pergunta: "A plataforma garante a adesão?",
    resposta:
      "Não. A decisão é do órgão gerenciador e do fornecedor, e a formalização é do seu órgão. A plataforma organiza as informações, encaminha o pedido e acompanha as respostas.",
  },
  {
    pergunta: "Quanto o meu órgão pode aderir de cada item?",
    resposta:
      "Cada órgão não participante pode aderir a até 50% da quantidade registrada de cada item, e o total de adesões não pode passar do dobro dessa quantidade. A equipe da Central confere o saldo disponível antes de encaminhar o pedido.",
  },
  {
    pergunta: "De onde vêm as atas do catálogo?",
    resposta:
      "As atas são publicadas pelos órgãos gerenciadores no Portal Nacional de Contratações Públicas (PNCP). A Central reúne, organiza e confere periodicamente vigência e saldo.",
  },
  {
    pergunta: "A Central Nacional de Atas é um órgão público?",
    resposta: `Não. É uma plataforma privada operada pela ARCA Capital (${SITE.razaoSocial}), sem vínculo com o PNCP ou com qualquer órgão de governo.`,
  },
];

/** Dados estruturados da organização e do site, para os buscadores. */
export function jsonLdSite() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#organizacao`,
        name: SITE.razaoSocial,
        alternateName: SITE.operadora,
        taxID: SITE.cnpj,
        url: `${SITE.url}/`,
        logo: `${SITE.url}/site/marca/apple-touch-icon.png`,
        email: SITE.email,
        telephone: "+55-62-3636-2671",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Av. C-255, nº 400, Edifício Eldorado Business Tower",
          addressLocality: "Goiânia",
          addressRegion: "GO",
          postalCode: "74280-010",
          addressCountry: "BR",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#site`,
        name: SITE.nome,
        url: `${SITE.url}/`,
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE.url}/#organizacao` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE.url}/catalogo?q={termo}`,
          "query-input": "required name=termo",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.pergunta,
          acceptedAnswer: { "@type": "Answer", text: f.resposta },
        })),
      },
    ],
  };
}
