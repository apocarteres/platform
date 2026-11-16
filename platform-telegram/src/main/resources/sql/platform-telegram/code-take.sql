DELETE FROM platform_telegram_code WHERE account_id = :account RETURNING digest, expires_at
