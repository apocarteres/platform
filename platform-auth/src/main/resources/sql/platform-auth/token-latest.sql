SELECT MAX(created_at) FROM platform_account_token WHERE account_id = :id AND purpose = :purpose
