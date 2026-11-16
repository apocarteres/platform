CREATE TABLE platform_telegram_link (
  account_id UUID PRIMARY KEY REFERENCES platform_account (id) ON DELETE CASCADE,
  telegram_user BIGINT NOT NULL UNIQUE,
  chat_id BIGINT NOT NULL UNIQUE,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL
)
