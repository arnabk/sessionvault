-- Per-org customization / branding. Everything themable lives here as JSONB
-- so new options can be added without schema churn. See docs/guides/branding.md.

CREATE TABLE IF NOT EXISTS org_settings (
  org_id      UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  branding    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- branding shape (all optional, app falls back to defaults):
-- {
--   "productName": "SessionVault",
--   "brandColor": "#4f46e5",
--   "logoUrl": null,
--   "background": "grid",            -- grid | math | plain
--   "accentText": "...",             -- taker welcome subtitle override
--   "theme": "light"                 -- light | dark (future)
-- }
