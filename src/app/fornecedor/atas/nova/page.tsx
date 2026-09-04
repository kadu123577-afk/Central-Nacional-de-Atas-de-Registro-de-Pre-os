import { redirect } from "next/navigation";
import { fornecedorIdLogado } from "@/lib/auth";
import { FormularioNovaAta } from "./formulario";

export default async function NovaAtaFornecedorPage() {
  const fornecedorId = await fornecedorIdLogado();
  if (!fornecedorId) {
    redirect("/fornecedor/login");
  }

  return <FormularioNovaAta />;
}
