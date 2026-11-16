CREATE TABLE platform_telegram_link (
  account_id UUID NOT NULL REFERENCES platform_account (id) ON DELETE CASCADE,
  bot VARCHAR(16) NOT NULL,
  telegram_user BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL,
  language VARCHAR(35),
  PRIMARY KEY (account_id, bot),
  UNIQUE (bot, telegram_user),
  UNIQUE (bot, chat_id)
)
