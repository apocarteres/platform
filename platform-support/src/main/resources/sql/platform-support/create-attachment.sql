CREATE TABLE platform_support_attachment (
  id UUID PRIMARY KEY,
  seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_id UUID NOT NULL REFERENCES platform_support_request (id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content_type VARCHAR(32) NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  purged_at TIMESTAMP WITH TIME ZONE
)
