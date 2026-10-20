import { MolduraPainel } from "@/components/moldura-painel";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <MolduraPainel>{children}</MolduraPainel>;
}