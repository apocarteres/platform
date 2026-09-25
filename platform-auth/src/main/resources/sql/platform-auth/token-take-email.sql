UPDATE platform_account_token SET used_at = :now
WHERE digest = :digest AND purpose = 'EMAIL_CHANGE' AND used_at IS NULL AND expires_at > :now
RETURNING account_id, email
