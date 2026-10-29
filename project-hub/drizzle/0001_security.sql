-- Row-Level Security: defense in depth behind the application's own authorization.
-- The app connects as `projecthub_app` (not owner, NOBYPASSRLS). Each transaction sets
-- app.tenant_id, app.user_id and app.client_org_id (empty for staff) with set_config(..., true).

CREATE OR REPLACE FUNCTION app_tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_client() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.client_org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_staff() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT app_tenant() IS NOT NULL AND app_client() IS NULL $$;
--> statement-breakpoint

-- Users are global; a tenant context may only see users who belong to that tenant.
-- Client contacts see staff plus contacts of their own client organization.
CREATE OR REPLACE FUNCTION app_can_see_user(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = uid AND m.tenant_id = app_tenant()
      AND (
        app_client() IS NULL
        OR m.role <> 'client'
        OR EXISTS (SELECT 1 FROM client_contacts c
                   WHERE c.user_id = uid AND c.tenant_id = app_tenant() AND c.client_org_id = app_client())
      )
  )
$$;
--> statement-breakpoint

-- Allocates the per-tenant request number without granting UPDATE on tenants to clients.
CREATE OR REPLACE FUNCTION next_request_number() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE tenants SET next_request_number = next_request_number + 1
   WHERE id = app_tenant() RETURNING next_request_number - 1 INTO n;
  IF n IS NULL THEN RAISE EXCEPTION 'next_request_number: no tenant context'; END IF;
  RETURN n;
END $$;
--> statement-breakpoint

-- Append-only audit log.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('app.allow_audit_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
--> statement-breakpoint

-- ── Grants ──────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO projecthub_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO projecthub_app;
--> statement-breakpoint
REVOKE ALL ON sessions, auth_tokens, rate_limits, dev_messages FROM projecthub_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON audit_logs, ai_runs, outbox_events FROM projecthub_app;
--> statement-breakpoint
REVOKE INSERT, DELETE ON users, tenants FROM projecthub_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_tenant(), app_user(), app_client(), app_is_staff(), app_can_see_user(uuid), next_request_number() TO projecthub_app;
--> statement-breakpoint

-- ── Enable RLS everywhere the app role can reach ────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','tenants','memberships','client_organizations','client_contacts','teams','projects','project_members',
    'service_categories','requests','tasks','public_messages','internal_comments','deliverables','attachments',
    'approvals','dependencies','activity','audit_logs','outbox_events','notifications','notification_preferences',
    'notification_deliveries','sms_consents','notification_settings','sla_policies','business_calendars',
    'sla_instances','ai_settings','ai_runs','ai_drafts','brand_kits','brand_assets','brand_rules','entitlements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Staff-only tables: invisible in client context.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'teams','projects','project_members','tasks','internal_comments','dependencies','sla_instances',
    'notification_deliveries','notification_settings','sla_policies','business_calendars','brand_assets',
    'brand_rules','entitlements'
  ] LOOP
    EXECUTE format('CREATE POLICY staff_only ON %I USING (tenant_id = app_tenant() AND app_client() IS NULL) WITH CHECK (tenant_id = app_tenant() AND app_client() IS NULL)', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Client-scoped tables: staff see the tenant; clients see their own client org only.
CREATE POLICY scoped ON requests
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR client_org_id = app_client()))
  WITH CHECK (tenant_id = app_tenant() AND (app_client() IS NULL OR client_org_id = app_client()));
--> statement-breakpoint
CREATE POLICY scoped ON public_messages
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR client_org_id = app_client()))
  WITH CHECK (tenant_id = app_tenant() AND (app_client() IS NULL OR (client_org_id = app_client() AND author_kind = 'client')));
--> statement-breakpoint
CREATE POLICY scoped ON deliverables
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR (client_org_id = app_client() AND status <> 'draft')))
  WITH CHECK (tenant_id = app_tenant() AND (app_client() IS NULL OR (client_org_id = app_client() AND status <> 'draft')));
--> statement-breakpoint
CREATE POLICY scoped ON approvals
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR client_org_id = app_client()))
  WITH CHECK (tenant_id = app_tenant() AND (app_client() IS NULL OR client_org_id = app_client()));
--> statement-breakpoint
CREATE POLICY scoped ON attachments
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR (client_org_id = app_client() AND visibility = 'client')))
  WITH CHECK (tenant_id = app_tenant() AND (app_client() IS NULL OR (client_org_id = app_client() AND visibility = 'client')));
--> statement-breakpoint
CREATE POLICY scoped ON activity
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR (client_org_id = app_client() AND visibility = 'public')))
  WITH CHECK (tenant_id = app_tenant() AND (app_client() IS NULL OR (client_org_id = app_client() AND visibility = 'public')));
--> statement-breakpoint
CREATE POLICY scoped ON brand_kits
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR client_org_id = app_client()))
  WITH CHECK (tenant_id = app_tenant() AND app_client() IS NULL);
--> statement-breakpoint
CREATE POLICY read_scoped ON client_organizations FOR SELECT
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR id = app_client()));
--> statement-breakpoint
CREATE POLICY staff_write ON client_organizations FOR ALL
  USING (tenant_id = app_tenant() AND app_client() IS NULL) WITH CHECK (tenant_id = app_tenant() AND app_client() IS NULL);
--> statement-breakpoint
CREATE POLICY read_scoped ON client_contacts FOR SELECT
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR client_org_id = app_client()));
--> statement-breakpoint
CREATE POLICY staff_write ON client_contacts FOR ALL
  USING (tenant_id = app_tenant() AND app_client() IS NULL) WITH CHECK (tenant_id = app_tenant() AND app_client() IS NULL);
--> statement-breakpoint
CREATE POLICY read_scoped ON memberships FOR SELECT
  USING (tenant_id = app_tenant() AND (app_client() IS NULL OR user_id = app_user()));
--> statement-breakpoint
CREATE POLICY staff_write ON memberships FOR ALL
  USING (tenant_id = app_tenant() AND app_client() IS NULL) WITH CHECK (tenant_id = app_tenant() AND app_client() IS NULL);
--> statement-breakpoint
CREATE POLICY read_own ON tenants FOR SELECT USING (id = app_tenant());
--> statement-breakpoint
CREATE POLICY staff_update ON tenants FOR UPDATE USING (id = app_tenant() AND app_client() IS NULL) WITH CHECK (id = app_tenant());
--> statement-breakpoint
CREATE POLICY read_tenant ON service_categories FOR SELECT USING (tenant_id = app_tenant());
--> statement-breakpoint
CREATE POLICY staff_write ON service_categories FOR ALL
  USING (tenant_id = app_tenant() AND app_client() IS NULL) WITH CHECK (tenant_id = app_tenant() AND app_client() IS NULL);
--> statement-breakpoint
CREATE POLICY read_tenant ON ai_settings FOR SELECT USING (tenant_id = app_tenant());
--> statement-breakpoint
CREATE POLICY staff_write ON ai_settings FOR ALL
  USING (tenant_id = app_tenant() AND app_client() IS NULL) WITH CHECK (tenant_id = app_tenant() AND app_client() IS NULL);
--> statement-breakpoint
CREATE POLICY own ON notifications USING (tenant_id = app_tenant() AND user_id = app_user()) WITH CHECK (tenant_id = app_tenant() AND user_id = app_user());
--> statement-breakpoint
CREATE POLICY own ON notification_preferences USING (tenant_id = app_tenant() AND user_id = app_user()) WITH CHECK (tenant_id = app_tenant() AND user_id = app_user());
--> statement-breakpoint
CREATE POLICY own_or_staff ON sms_consents USING (tenant_id = app_tenant() AND (user_id = app_user() OR app_client() IS NULL)) WITH CHECK (tenant_id = app_tenant() AND user_id = app_user());
--> statement-breakpoint
CREATE POLICY own ON ai_drafts USING (tenant_id = app_tenant() AND actor_id = app_user()) WITH CHECK (tenant_id = app_tenant() AND actor_id = app_user() AND (app_client() IS NULL OR client_org_id = app_client()));
--> statement-breakpoint
CREATE POLICY insert_tenant ON ai_runs FOR INSERT WITH CHECK (tenant_id = app_tenant() AND actor_id = app_user());
--> statement-breakpoint
CREATE POLICY read_own_or_staff ON ai_runs FOR SELECT USING (tenant_id = app_tenant() AND (app_client() IS NULL OR actor_id = app_user()));
--> statement-breakpoint
CREATE POLICY insert_tenant ON outbox_events FOR INSERT WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
CREATE POLICY read_staff ON outbox_events FOR SELECT USING (tenant_id = app_tenant() AND app_client() IS NULL);
--> statement-breakpoint
CREATE POLICY insert_tenant ON audit_logs FOR INSERT WITH CHECK (tenant_id = app_tenant());
--> statement-breakpoint
CREATE POLICY read_staff ON audit_logs FOR SELECT USING (tenant_id = app_tenant() AND app_client() IS NULL);
--> statement-breakpoint
CREATE POLICY visible ON users FOR SELECT USING (id = app_user() OR app_can_see_user(id));
--> statement-breakpoint
CREATE POLICY self_update ON users FOR UPDATE USING (id = app_user()) WITH CHECK (id = app_user());
