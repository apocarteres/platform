DELETE FROM platform_telegram_invite WHERE digest = :digest AND bot = :bot RETURNING account_id, expires_at
