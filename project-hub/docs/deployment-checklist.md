# Secure deployment checklist

Nothing here has been deployed. Before any shared/staging/production environment:

- [ ] Provision two Postgres roles: an owner (migrations, worker) and an app role **without** `BYPASSRLS` and not the table owner. Run `npm run db:migrate` as owner.
- [ ] `APP_SECRET` ≥ 32 random bytes; `NODE_ENV=production` (the app refuses dev secrets); HTTPS only (session cookie is `Secure` in production).
- [ ] Never run `db:seed` against shared environments; dev tools (`/dev/*`) are disabled in production.
- [ ] Private object storage for uploads (S3-compatible driver to be implemented behind `src/server/storage`); real malware scanning in `prepareUploads`.
- [ ] Run the worker as a separate process (`npm run worker`), ≥1 instance; monitor `outbox_events` / `notification_deliveries` for `dead` rows.
- [ ] Email: verified sending domain (SPF/DKIM/DMARC), `EMAIL_PROVIDER=smtp`.
- [ ] SMS: only after provider contract, registered sender ID per tenant, consent wording/legal review, quota and budget set. Do not assume URLs are allowed.
- [ ] AI: approved vendor terms, data processing location and retention; `AI_PROVIDER=anthropic` + key in a secret manager; review tenant caps.
- [ ] Backups: scheduled `scripts/backup.sh`, encrypted off-host; test `scripts/restore.sh` regularly.
- [ ] Legal/privacy: PDPL review, retention policy, data residency; written authorization before using any real Jazeera data, logo or fonts.
- [ ] Rate limits are Postgres-backed; add edge/WAF limits for login and magic links.
