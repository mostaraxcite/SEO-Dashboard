-- Enqueue into the outbox from any tenant context (including client contacts) with
-- ON CONFLICT DO NOTHING, without granting clients SELECT on outbox rows.
CREATE OR REPLACE FUNCTION enqueue_outbox(p_type text, p_payload jsonb, p_dedupe text, p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_tenant() IS NULL THEN RAISE EXCEPTION 'enqueue_outbox: no tenant context'; END IF;
  INSERT INTO outbox_events (tenant_id, type, payload, dedupe_key, actor_id)
  VALUES (app_tenant(), p_type, p_payload, p_dedupe, p_actor)
  ON CONFLICT (dedupe_key) DO NOTHING;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION enqueue_outbox(text, jsonb, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION enqueue_outbox(text, jsonb, text, uuid) TO projecthub_app;
