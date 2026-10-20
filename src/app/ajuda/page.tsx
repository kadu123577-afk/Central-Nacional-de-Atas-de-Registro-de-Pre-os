import { redirect } from "next/navigation";

/** A Central de Ajuda foi substituída pelas perguntas frequentes da home do site. */
export default function Ajuda() {
  redirect("/#perguntas");
}