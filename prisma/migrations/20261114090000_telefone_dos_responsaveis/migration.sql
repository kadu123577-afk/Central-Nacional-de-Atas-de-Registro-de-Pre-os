-- Celular dos responsaveis (equipe e consultores), so digitos com o 55: a Renata avisa os prazos pelo WhatsApp.
ALTER TABLE "admins" ADD COLUMN "telefone" TEXT;
ALTER TABLE "vendedores" ADD COLUMN "telefone" TEXT;
