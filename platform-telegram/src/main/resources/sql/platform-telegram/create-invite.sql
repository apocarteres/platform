CREATE TABLE platform_telegram_invite (
  account_id UUID NOT NULL REFERENCES platform_account (id) ON DELETE CASCADE,
  bot VARCHAR(16) NOT NULL,
  digest CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY (account_id, bot)
)
