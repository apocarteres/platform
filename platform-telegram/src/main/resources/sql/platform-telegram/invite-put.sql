INSERT INTO platform_telegram_invite (account_id, digest, expires_at) VALUES (:account, :digest, :expires)
ON CONFLICT (account_id) DO UPDATE SET digest = EXCLUDED.digest, expires_at = EXCLUDED.expires_at
