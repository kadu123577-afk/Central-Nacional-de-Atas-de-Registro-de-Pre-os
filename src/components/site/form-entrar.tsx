"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { entrar, type EstadoEntrar, type OpcaoPerfilEntrada } from "@/app/(site)/entrar/actions";
import { IconeTriangulo } from "./icones";

interface Props {
  /** Para onde o órgão vai depois de entrar (ex.: o pedido do item escolhido). */
  destinoOrgao: string;
  /** Ata de onde veio o pedido de adesão (dado público: código e objeto). */
  contexto: { codigo: string; titulo: string } | null;
  hrefCadastroOrgao: string;
  hrefCadastroFornecedor: string;
  hrefEsqueci: string;
  emailContato: string;
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESTADO_INICIAL: EstadoEntrar = {};

type Erros = { email?: string; senha?: string; perfil?: string };

/**
 * Formulário único de entrada: e-mail, senha e, se a pessoa tiver, o código do
 * autenticador. O sistema descobre a área; a tela não pergunta o perfil, a não
 * ser quando a mesma senha serve em mais de um (etapa "Escolher perfil", cujos
 * nomes vêm do servidor, só depois de a senha conferir).
 *
 * O envio é disparado aqui, no onSubmit (o `action` do <form> fica só para o
 * envio feito antes de a página carregar, que o React guarda e refaz): assim o
 * React não limpa o formulário depois da resposta, e a segunda etapa (escolha
 * do perfil ou código do autenticador) reenvia o mesmo e-mail e a mesma senha.
 */
export function FormEntrar({
  destinoOrgao,
  contexto,
  hrefCadastroOrgao,
  hrefCadastroFornecedor,
  hrefEsqueci,
  emailContato,
}: Props) {
  const [estado, acao, pendente] = useActionState<EstadoEntrar, FormData>(entrar, ESTADO_INICIAL);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [perfil, setPerfil] = useState("");
  const [opcoes, setOpcoes] = useState<OpcaoPerfilEntrada[] | null>(estado.escolher ?? null);
  const [estadoVisto, setEstadoVisto] = useState(estado);
  const [mostrar, setMostrar] = useState(false);
  const [caps, setCaps] = useState(false);
  const [erros, setErros] = useState<Erros>({});

  const retorno = useRef<HTMLDivElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const grupoPerfil = useRef<HTMLFieldSetElement>(null);

  // Lembra a lista de perfis quando ela chega, para a etapa continuar na tela
  // se o próximo retorno for outro (por exemplo, o pedido do código).
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    if (estado.escolher) setOpcoes(estado.escolher);
  }

  useEffect(() => {
    if (estado.escolher) {
      grupoPerfil.current?.querySelector<HTMLInputElement>("input[type=radio]")?.focus();
    } else if (estado.exigeCodigo) {
      campoCodigo.current?.focus();
    } else if (estado.erro) {
      retorno.current?.focus();
    }
  }, [estado]);

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validar()) return;
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  function validar(): boolean {
    const novos: Erros = {};
    if (!EMAIL_OK.test(email.trim())) novos.email = "Informe um e-mail válido, por exemplo nome@prefeitura.gov.br.";
    if (!senha) novos.senha = "Informe a sua senha.";
    if (opcoes && !perfil) novos.perfil = "Escolha por onde quer entrar.";
    setErros(novos);
    if (novos.email) document.getElementById("email")?.focus();
    else if (novos.senha) document.getElementById("senha")?.focus();
    else if (novos.perfil) grupoPerfil.current?.querySelector<HTMLInputElement>("input[type=radio]")?.focus();
    return Object.keys(novos).length === 0;
  }

  // Mudar e-mail ou senha invalida a lista de perfis: a próxima tentativa
  // descobre de novo em quais a senha serve.
  function aoMudarCredencial() {
    if (opcoes) {
      setOpcoes(null);
      setPerfil("");
    }
  }

  return (
    <div className="cartao-login">
      <h2 id="t-login">Entrar</h2>
      <p id="sub-login">Use o e-mail e a senha do seu cadastro. Você será levado à sua área.</p>
      {contexto ? (
        <p className="contexto-adesao">
          <b>Pedido de adesão</b>
          Ata {contexto.codigo}: {contexto.titulo}. Entre com o acesso do seu órgão para montar o pedido.
        </p>
      ) : null}

      <div>
        <form
          className="form-login"
          id="form-login"
          action={acao}
          noValidate
          aria-labelledby="t-login"
          onSubmit={aoEnviar}
        >
          <input type="hidden" name="destino" value={destinoOrgao} />
          <div className="campo">
            <label htmlFor="email">E-mail</label>
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
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                aoMudarCredencial();
              }}
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
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  aoMudarCredencial();
                }}
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
          <div className="campo">
            <label htmlFor="codigo">Código do autenticador (se tiver)</label>
            <input
              className="entrada"
              id="codigo"
              name="codigo"
              type="text"
              ref={campoCodigo}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
          </div>

          {opcoes ? (
            <fieldset
              ref={grupoPerfil}
              aria-describedby="perfil-ajuda perfil-erro"
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 6 }}
            >
              <legend style={{ padding: 0, marginBottom: 6, fontSize: "var(--tam-sm)", fontWeight: 600 }}>
                Escolher perfil
              </legend>
              <span className="ajuda" id="perfil-ajuda" style={{ color: "var(--cor-texto-3)", fontSize: "var(--tam-xs)" }}>
                Esse e-mail e essa senha servem em mais de um acesso. Escolha por onde quer entrar.
              </span>
              {opcoes.map((opcao) => (
                <div className="opcao" key={opcao.perfil}>
                  <input
                    type="radio"
                    id={`perfil-${opcao.perfil}`}
                    name="perfil"
                    value={opcao.perfil}
                    checked={perfil === opcao.perfil}
                    onChange={() => setPerfil(opcao.perfil)}
                  />
                  <label htmlFor={`perfil-${opcao.perfil}`}>{opcao.rotulo}</label>
                </div>
              ))}
              <span className="ajuda" id="perfil-erro" role="alert" style={{ color: "var(--critico)" }} hidden={!erros.perfil}>
                {erros.perfil}
              </span>
            </fieldset>
          ) : null}

          <div
            className="alerta alerta--critico"
            ref={retorno}
            role="alert"
            tabIndex={-1}
            hidden={!estado.erro}
          >
            <IconeTriangulo />
            <span>{estado.erro}</span>
          </div>
          <button className="botao botao--primario botao--grande botao--largo" type="submit" disabled={pendente}>
            {pendente ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="cadastro">
          Ainda não tem conta? <a href={hrefCadastroOrgao}>Solicitar cadastro do órgão</a> ou{" "}
          <a href={hrefCadastroFornecedor}>Cadastrar minha empresa</a>.
        </p>
        <p className="cruzados">
          Problemas para entrar? Escreva para <a href={`mailto:${emailContato}`}>{emailContato}</a>.
        </p>
      </div>
    </div>
  );
}
