-- Aprovar e rejeitar ata deixaram de existir (decisao de 14/11/2026): concluida a conformidade
-- (atividade 5), a ata fica disponivel para a venda. Quem era aprovador passa a analista de
-- adesao (adesao.instruir + adesao.acompanhar); a permissao antiga sai de todas as contas.
UPDATE "admins"
SET "permissoes" = array_append("permissoes", 'adesao.acompanhar')
WHERE 'atas.aprovar' = ANY("permissoes") AND NOT ('adesao.acompanhar' = ANY("permissoes"));

UPDATE "admins"
SET "permissoes" = array_remove("permissoes", 'atas.aprovar')
WHERE 'atas.aprovar' = ANY("permissoes");
