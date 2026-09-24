CREATE TABLE platform_account_role (
  account_id UUID NOT NULL REFERENCES platform_account (id) ON DELETE CASCADE,
  role VARCHAR(64) NOT NULL,
  PRIMARY KEY (account_id, role)
)
