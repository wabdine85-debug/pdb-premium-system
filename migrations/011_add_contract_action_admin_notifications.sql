CREATE TABLE IF NOT EXISTS contract_action_admin_notifications (
  action_id UUID PRIMARY KEY REFERENCES contract_action_requests(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'sending', 'batched', 'reporting', 'sent', 'reported')),
  due_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contract_action_admin_notifications_due_idx
  ON contract_action_admin_notifications (state, due_at);
