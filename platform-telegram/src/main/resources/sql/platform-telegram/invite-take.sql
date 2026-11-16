DELETE FROM platform_telegram_invite WHERE digest = :digest RETURNING account_id, expires_at
