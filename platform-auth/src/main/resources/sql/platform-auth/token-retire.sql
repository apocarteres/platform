UPDATE platform_account_token SET used_at = :now
WHERE account_id = :id AND purpose = :purpose AND used_at IS NULL
