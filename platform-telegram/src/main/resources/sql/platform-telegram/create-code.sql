CREATE TABLE platform_telegram_code (
  account_id UUID PRIMARY KEY REFERENCES platform_account (id) ON DELETE CASCADE,
  digest CHAR(64) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
)
