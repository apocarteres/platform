SELECT r.account_id FROM platform_account_role r JOIN platform_account a ON a.id = r.account_id
WHERE r.role = :role AND a.blocked = FALSE ORDER BY a.created_at LIMIT :limit
