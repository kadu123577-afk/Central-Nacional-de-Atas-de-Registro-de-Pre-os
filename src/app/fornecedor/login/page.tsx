import { Suspense } from "react";
import { FormularioLoginFornecedor } from "./formulario";

export default function LoginFornecedorPage() {
  return (
    <Suspense>
      <FormularioLoginFornecedor />
    </Suspense>
  );
}
