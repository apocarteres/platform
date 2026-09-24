CREATE TABLE platform_account_token (
  digest CHAR(64) PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES platform_account (id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE
)
