SELECT count(*) FROM platform_access_key WHERE account_id = :account AND expires_at > :now
