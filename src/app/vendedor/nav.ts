import type { ItemNav } from "@/components/ui/app-shell";

export const NAV_VENDEDOR: ItemNav[] = [
  { rotulo: "Atas", href: "/vendedor", ativoEm: ["/vendedor/atas"] },
  { rotulo: "Dashboard", href: "/vendedor/dashboard" },
  { rotulo: "Municípios", href: "/vendedor/municipios" },
  { rotulo: "Perfil", href: "/vendedor/perfil" },
];
