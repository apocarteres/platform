DELETE FROM platform_account WHERE email_verified = FALSE AND created_at < :before
