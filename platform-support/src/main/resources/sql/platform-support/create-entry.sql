CREATE TABLE platform_support_entry (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES platform_support_request (id) ON DELETE CASCADE,
  kind VARCHAR(24) NOT NULL,
  side VARCHAR(16) NOT NULL,
  actor UUID,
  text VARCHAR(4000),
  from_state VARCHAR(16),
  to_state VARCHAR(16),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
)
