DELETE FROM platform_account_token WHERE (used_at IS NOT NULL OR expires_at <= :now) AND created_at < :before
