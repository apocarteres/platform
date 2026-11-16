ALTER TABLE platform_telegram_link ADD COLUMN bot VARCHAR(16) NOT NULL DEFAULT 'main';
ALTER TABLE platform_telegram_link ALTER COLUMN bot DROP DEFAULT;
ALTER TABLE platform_telegram_link ADD COLUMN language VARCHAR(35);
ALTER TABLE platform_telegram_link DROP CONSTRAINT platform_telegram_link_pkey;
ALTER TABLE platform_telegram_link DROP CONSTRAINT platform_telegram_link_telegram_user_key;
ALTER TABLE platform_telegram_link DROP CONSTRAINT platform_telegram_link_chat_id_key;
ALTER TABLE platform_telegram_link ADD PRIMARY KEY (account_id, bot);
ALTER TABLE platform_telegram_link ADD UNIQUE (bot, telegram_user);
ALTER TABLE platform_telegram_link ADD UNIQUE (bot, chat_id);
ALTER TABLE platform_telegram_invite ADD COLUMN bot VARCHAR(16) NOT NULL DEFAULT 'main';
ALTER TABLE platform_telegram_invite ALTER COLUMN bot DROP DEFAULT;
ALTER TABLE platform_telegram_invite DROP CONSTRAINT platform_telegram_invite_pkey;
ALTER TABLE platform_telegram_invite ADD PRIMARY KEY (account_id, bot)
