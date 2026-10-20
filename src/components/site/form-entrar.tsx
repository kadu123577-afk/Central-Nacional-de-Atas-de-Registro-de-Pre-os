"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { loginFornecedor, type EstadoLoginFornecedor } from "@/app/fornecedor/actions";
import { loginOrgao, type EstadoFormularioOrgao } from "@/app/orgao/actions";
import { IconeTriangulo } from "./icones";

type Perfil = "orgao" | "fornecedor";

const TEXTOS: Record<Perfil, { titulo: string; sub: string; email: string; cadastro: string; link: string }> = {
  orgao: {
    titulo: "Entrar como órgão público",
    sub: "Acesso para gestores de compras, pregoeiros e ordenadores de despesa.",
    email: "E-mail institucional",
    cadastro: "Seu órgão ainda não tem acesso? ",
    link: "Solicitar cadastro do órgão",
  },
  fornecedor: {
    titulo: "Entrar como fornecedor",
    sub: "Acesso para empresas com atas registradas e pedidos de adesão em análise.",
    email: "E-mail da empresa",
    cadastro: "Sua empresa tem ata vigente e quer divulgá-la? ",
    link: "Cadastrar minha empresa",
  },
};

interface Props {
  perfilInicial: Perfil;
  /** Para onde o órgão vai depois de entrar (ex.: o pedido do item escolhido). */
  destinoOrgao: string;
  /** Ata de onde veio o pedido de adesão (dado público: código e objeto). */
  contexto: { codigo: string; objeto: string } | null;
  hrefCadastroOrgao: string;
  hrefCadastroFornecedor: string;
  hrefEsqueci: string;
  emailContato: string;
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FormEntrar({
  perfilInicial,
  destinoOrgao,
  contexto,
  hrefCadastroOrgao,
  hrefCadastroFornecedor,
  hrefEsqueci,
  emailContato,
}: Props) {
  const [perfil, setPerfil] = useState<Perfil>(perfilInicial);
  const [mostrar, setMostrar] = useState(false);
  const [caps, setCaps] = useState(false);
  const [erros, setErros] = useState<{ email?: string; senha?: string }>({});
  const retorno = useRef<HTMLDivElement>(null);

  const [estadoOrgao, acaoOrgao, pendenteOrgao] = useActionState<EstadoFormularioOrgao, FormData>(
    loginOrgao,
    {},
  );
  const [estadoFornecedor, acaoFornecedor, pendenteFornecedor] = useActionState<
    EstadoLoginFornecedor,
    FormData
  >(loginFornecedor, {});

  const estado = perfil === "orgao" ? estadoOrgao : estadoFornecedor;
  const pendente = perfil === "orgao" ? pendenteOrgao : pendenteFornecedor;
  const t = TEXTOS[perfil];

  useEffect(() => {
    if (estado.erro) retorno.current?.focus();
  }, [estado]);

  function validar(form: HTMLFormElement): boolean {
    const dados = new FormData(form);
    const email = String(dados.get("email") ?? "").trim();
    const senha = String(dados.get("senha") ?? "");
    const novos: { email?: string; senha?: string } = {};
    if (!EMAIL_OK.test(email)) novos.email = "Informe um e-mail válido, por exemplo nome@prefeitura.gov.br.";
    if (!senha) novos.senha = "Informe a sua senha.";
    setErros(novos);
    if (novos.email) form.querySelector<HTMLInputElement>("#email")?.focus();
    else if (novos.senha) form.querySelector<HTMLInputElement>("#senha")?.focus();
    return Object.keys(novos).length === 0;
  }

  function trocar(novo: Perfil) {
    setPerfil(novo);
    setErros({});
  }

  function aoTeclarAba(e: React.KeyboardEvent, atual: Perfil) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const outro: Perfil = atual === "orgao" ? "fornecedor" : "orgao";
      trocar(outro);
      document.getElementById(`aba-${outro}`)?.focus();
    }
  }

  return (
    <div className="cartao-login">
      <h2 id="t-login">{t.titulo}</h2>
      <p id="sub-login">{t.sub}</p>
      {contexto ? (
        <p className="contexto-adesao">
          <b>Pedido de adesão</b>
          Ata {contexto.codigo}: {contexto.objeto}. Entre com o acesso do seu órgão para montar o pedido.
        </p>
      ) : null}

      <div className="abas" role="tablist" aria-label="Tipo de acesso">
        {(["orgao", "fornecedor"] as const).map((p) => (
          <button
            key={p}
            className="aba"
            role="tab"
            type="button"
            id={`aba-${p}`}
            aria-controls="painel-login"
            aria-selected={perfil === p}
            tabIndex={perfil === p ? 0 : -1}
            onClick={() => trocar(p)}
            onKeyDown={(e) => aoTeclarAba(e, p)}
          >
            {p === "orgao" ? "Órgão público" : "Fornecedor"}
          </button>
        ))}
      </div>

      <div id="painel-login" role="tabpanel" aria-labelledby={`aba-${perfil}`}>
        <form
          className="form-login"
          id="form-login"
          action={perfil === "orgao" ? acaoOrgao : acaoFornecedor}
          noValidate
          onSubmit={(e) => {
            if (!validar(e.currentTarget)) e.preventDefault();
          }}
        >
          {perfil === "orgao" ? <input type="hidden" name="destino" value={destinoOrgao} /> : null}
          <div className="campo">
            <label htmlFor="email">{t.email}</label>
            <input
              className="entrada"
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              aria-describedby="email-erro"
              aria-invalid={erros.email ? true : undefined}
              required
            />
            <span className="ajuda" id="email-erro" role="alert" style={{ color: "var(--critico)" }} hidden={!erros.email}>
              {erros.email}
            </span>
          </div>
          <div className="campo">
            <div className="linha-form">
              <label htmlFor="senha">Senha</label>
              <a href={hrefEsqueci}>Esqueci minha senha</a>
            </div>
            <div className="senha">
              <input
                className="entrada"
                id="senha"
                name="senha"
                type={mostrar ? "text" : "password"}
                autoComplete="current-password"
                aria-describedby="senha-erro caps"
                aria-invalid={erros.senha ? true : undefined}
                required
                onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
                onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
                onBlur={() => setCaps(false)}
              />
              <button
                type="button"
                aria-pressed={mostrar}
                aria-controls="senha"
                onClick={() => setMostrar((v) => !v)}
              >
                {mostrar ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <span className="caps" id="caps" hidden={!caps}>
              <IconeTriangulo />A tecla Caps Lock está ativada.
            </span>
            <span className="ajuda" id="senha-erro" role="alert" style={{ color: "var(--critico)" }} hidden={!erros.senha}>
              {erros.senha}
            </span>
          </div>
          <div className="alerta alerta--critico" ref={retorno} role="alert" tabIndex={-1} hidden={!estado.erro}>
            <IconeTriangulo />
            <span>{estado.erro}</span>
          </div>
          <button className="botao botao--primario botao--grande botao--largo" type="submit" disabled={pendente}>
            {pendente ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="cadastro">
          {t.cadastro}
          <a href={perfil === "orgao" ? hrefCadastroOrgao : hrefCadastroFornecedor}>{t.link}</a>
        </p>
        <p className="cruzados">
          Problemas para entrar? Escreva para <a href={`mailto:${emailContato}`}>{emailContato}</a>.
        </p>
      </div>
    </div>
  );
}
