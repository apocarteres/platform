INSERT INTO platform_telegram_invite (account_id, bot, digest, expires_at) VALUES (:account, :bot, :digest, :expires)
ON CONFLICT (account_id, bot) DO UPDATE SET digest = EXCLUDED.digest, expires_at = EXCLUDED.expires_at
