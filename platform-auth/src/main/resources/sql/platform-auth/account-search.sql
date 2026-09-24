SELECT id, email, password_hash, email_verified, blocked, created_at, last_login_at
FROM platform_account
WHERE email LIKE :pattern ESCAPE '!'
ORDER BY email
LIMIT :limit OFFSET :offset
