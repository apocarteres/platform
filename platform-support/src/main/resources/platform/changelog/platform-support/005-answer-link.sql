CREATE TABLE platform_support_answer_link (
  digest CHAR(64) PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES platform_support_request (id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
)
