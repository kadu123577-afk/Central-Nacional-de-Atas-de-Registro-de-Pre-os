"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cadastrarOrgao, type EstadoFormularioOrgao } from "../actions";
import { Logo } from "@/components/ui/logo";
import { Aviso } from "@/components/ui/aviso";
import { ESFERAS_ORGAO } from "@/lib/esferas";

const estadoInicial: EstadoFormularioOrgao = {};

/**
 * Mesmo desenho da tela de login (faixa verde profunda com a marca à
 * esquerda e o cartão branco do formulário à direita), como a seção
 * "Não achou a ata?" do site, que aponta pra cá.
 */
export default function CadastroOrgaoPage() {
  const [estado, formAction, pendente] = useActionState(cadastrarOrgao, estadoInicial);

  return (
    <main
      className="flex min-h-screen items-center"
      style={{ background: "linear-gradient(135deg, var(--cor-profundo-faixa) 0%, var(--cor-profundo) 100%)" }}
    >
      <div className="mx-auto grid w-full max-w-[1040px] gap-10 px-6 py-14 lg:grid-cols-[1fr_460px] lg:items-center">
        <div>
          <Link href="/" aria-label="Central de Atas — início">
            <Logo tom="claro" altura={38} />
          </Link>
          <p className="eyebrow mt-10" style={{ color: "var(--cor-ouro-claro)" }}>
            Órgão comprador
          </p>
          <h1
            className="mt-3 max-w-md font-extrabold"
            style={{ fontSize: 38, lineHeight: 1.06, letterSpacing: "-0.04em", color: "var(--cor-superficie)" }}
          >
            Cadastro do órgão comprador
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--cor-profundo-texto)" }}>
            Crie uma conta para pedir adesão a itens do catálogo.
          </p>
        </div>

        <form action={formAction} className="painel flex flex-col gap-4 p-7" style={{ borderRadius: 18 }}>
          <p className="marca text-lg" style={{ color: "var(--cor-texto)" }}>
            Criar conta
          </p>
          <Campo label="Nome do órgão" name="nome" required />
          <Campo label="CNPJ" name="cnpj" required />
          <div className="grid grid-cols-[96px_1fr] items-start gap-4">
            <Campo label="UF" name="uf" required />
            <Campo label="Município" name="municipio" required />
          </div>
          <label className="block">
            <span className="rotulo-campo">Esfera</span>
            <select name="esfera" required className="campo-atas" defaultValue="">
              <option value="" disabled>
                Selecione...
              </option>
              {ESFERAS_ORGAO.map((e) => (
                <option key={e} value={e}>
                  {e[0].toUpperCase() + e.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <Campo label="E-mail" name="email" type="email" required autoComplete="email" />
          <Campo
            label="Senha"
            nota="(mín. 8 caracteres)"
            name="senha"
            type="password"
            required
            autoComplete="new-password"
          />

          {estado.erro && <Aviso tom="critico">{estado.erro}</Aviso>}

          <button type="submit" disabled={pendente} className="botao-atas mt-1 w-full">
            {pendente ? "Criando..." : "Criar conta"}
          </button>
          <div className="border-t pt-4 text-sm" style={{ borderColor: "var(--cor-borda)", color: "var(--cor-texto-2)" }}>
            Já tem conta?{" "}
            <Link href="/orgao/login" className="botao-atas link">
              Entrar →
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

function Campo({
  label,
  nota,
  name,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  /** Complemento cinza do rótulo ("(mín. 8 caracteres)"). */
  nota?: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="rotulo-campo">
        {label}
        {nota && <small> {nota}</small>}
      </span>
      <input name={name} type={type} required={required} autoComplete={autoComplete} className="campo-atas" />
    </label>
  );
}
