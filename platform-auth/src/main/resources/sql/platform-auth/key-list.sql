SELECT id, name, created_at, expires_at, last_used_at FROM platform_access_key WHERE account_id = :account ORDER BY created_at, id
