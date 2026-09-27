SELECT id, account_id, name FROM platform_access_key WHERE digest = :digest AND expires_at > :now
