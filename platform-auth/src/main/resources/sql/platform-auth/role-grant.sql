INSERT INTO platform_account_role (account_id, role)
SELECT :id, :role
WHERE NOT EXISTS (SELECT 1 FROM platform_account_role WHERE account_id = :id AND role = :role)
