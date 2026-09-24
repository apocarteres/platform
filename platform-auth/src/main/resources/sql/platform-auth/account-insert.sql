INSERT INTO platform_account (id, email, password_hash, email_verified, blocked, created_at)
VALUES (:id, :email, :passwordHash, :verified, FALSE, :now)
