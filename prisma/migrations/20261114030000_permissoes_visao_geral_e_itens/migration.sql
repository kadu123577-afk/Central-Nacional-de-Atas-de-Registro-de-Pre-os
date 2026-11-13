-- Duas permissões novas (14/11/2026), sem mudar o formato: Admin.permissoes é uma lista de textos.
--  * "visao.geral": a visão de quem gerencia (ciclos, Pipeline, indicadores, painéis de números).
--    Fica só com a gestão: quem já gerenciava usuários continua enxergando tudo.
--  * "atas.itens": cadastrar itens e saldos, que antes vinha dentro de "atas.captar". Quem já
--    tinha "atas.captar" continua podendo cadastrar itens.
UPDATE "admins"
SET "permissoes" = array_append("permissoes", 'visao.geral')
WHERE 'usuarios.gerir' = ANY("permissoes") AND NOT ('visao.geral' = ANY("permissoes"));

UPDATE "admins"
SET "permissoes" = array_append("permissoes", 'atas.itens')
WHERE 'atas.captar' = ANY("permissoes") AND NOT ('atas.itens' = ANY("permissoes"));
