SELECT id, email, password_hash, email_verified, blocked, created_at, last_login_at
FROM platform_account
WHERE email = :email
