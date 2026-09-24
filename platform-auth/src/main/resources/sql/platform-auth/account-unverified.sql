SELECT id FROM platform_account WHERE email_verified = FALSE AND created_at < :before ORDER BY created_at
