# Arvind Analytics - Semantic Layer and Download Portal

This project is a React + Flask application for secure portal-based access to Microsoft Fabric Warehouse data. It supports dynamic data portals, row-level user restrictions, summarized previews, large async ZIP exports, audit logs, and a dedicated FY27 KPI input portal.

The deployed application is served at:

```text
https://automationafl.arvindfashions.com/downloadui
```

## Contents

1. Architecture
2. Project Structure
3. Runtime Components
4. Environment Variables
5. Local Development
6. Backend API
7. Portal System
8. Large Export Flow
9. FY27 KPI Tracker Portal
10. Deployment on Ubuntu and Apache2
11. Operational Checks
12. Troubleshooting

## Architecture

```text
Microsoft Fabric Warehouse
        |
        | ODBC Driver 18 / pyodbc
        v
Flask Permissions API
sync/permissions_api.py
        |
        | stores portal config, access, audit logs
        v
data/permissions.duckdb

React / Vite frontend
frontend/src
        |
        | /permissions-api/*
        v
Apache2 reverse proxy
        |
        v
https://automationafl.arvindfashions.com/downloadui
```

The current application queries Fabric directly from the Flask API for portal previews, dropdown values, exports, and KPI insert/read operations. DuckDB is used for local metadata only: portals, access grants, app permissions, and audit logs.

## Project Structure

```text
SEMANTIC-LAYER/
  data/
    permissions.duckdb              # Runtime metadata DB, not committed

  sync/
    permissions_api.py              # Flask API: RBAC, portals, Fabric queries, exports, KPI input
    requirements.txt                # Python dependencies

  frontend/
    src/
      App.jsx                       # Main data portal UI and async export flow
      AdminPage.jsx                 # Portal/admin/access/audit UI
      PortalHome.jsx                # Portal selector
      KpiInputPortal.jsx            # FY27 KPI input portal
      AuthWrapper.jsx               # Microsoft login and access gate
      brandPermissions.js           # Access helper calls
      logger.js                     # Audit log helper
      *.css                         # UI styles
    vite.config.js                  # Vite config, /permissions-api proxy in local dev
    package.json

  docs/
    generate_handover_docx.mjs      # DOCX handover generator
    generate_doc.mjs

  TECHNICAL_HANDOVER.md
  Arvind_Analytics_Technical_Handover.docx
  FY27 KPI Tracker_PVH.xlsx         # Source/reference workbook
  README.md
```

## Runtime Components

| Component | Path | Purpose |
|---|---|---|
| React frontend | `frontend/src` | Login, portal list, filtering, preview table, export, admin UI, KPI input UI |
| Flask API | `sync/permissions_api.py` | Portal metadata, user access, audit logs, direct Fabric queries, async export, KPI insert/read |
| Metadata DB | `data/permissions.duckdb` | App permissions, portals, portal access, audit logs |
| Fabric Warehouse | Microsoft Fabric | Source data for portals and target table for KPI tracker |
| Apache2 | Ubuntu VM | TLS, static frontend hosting, reverse proxy to Flask |

## Environment Variables

Root `.env` is loaded by `sync/permissions_api.py`.

```env
CUBEJS_DB_HOST=<fabric-host>
CUBEJS_DB_PORT=1433
CUBEJS_DB_NAME=<fabric-warehouse-name>
CUBEJS_DB_USER=<fabric-user>
CUBEJS_DB_PASS=<fabric-password>
```

Do not commit `.env`. The repository `.gitignore` excludes it.

For large hosted exports, configure the Flask service temp directory through systemd:

```ini
Environment=TMPDIR=/mnt
```

This makes temporary ZIP files use `/mnt` instead of the default temp location.

Frontend production env:

```env
VITE_AZURE_CLIENT_ID=<azure-app-client-id>
VITE_AZURE_TENANT_ID=<azure-tenant-id>
VITE_REDIRECT_PATH=/downloadui
```

## Local Development

### Backend

```powershell
cd C:\Users\7518549\WORK\SEMANTIC-LAYER
.\.venv\Scripts\activate
pip install -r sync\requirements.txt
python sync\permissions_api.py
```

The API runs on:

```text
http://localhost:5001
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:3000
```

Vite proxies local `/permissions-api/*` requests to `http://localhost:5001`.

### Build

```powershell
cd frontend
npm run build
```

Build output:

```text
frontend/dist
```

## Backend API

Base path in production:

```text
/permissions-api
```

Core endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/permissions` | Read legacy app permission config |
| `POST` | `/permissions` | Save legacy app permission config |
| `GET` | `/check-access?email=...` | Check whether a user can access the app |
| `GET` | `/my-portals?email=...` | Return active portals visible to a user |
| `GET` | `/portals` | Admin: list portals |
| `POST` | `/portals` | Admin: create portal |
| `PUT` | `/portals/<portal_id>` | Admin: update portal |
| `PATCH` | `/portals/<portal_id>` | Admin: activate/deactivate portal |
| `DELETE` | `/portals/<portal_id>` | Admin: delete/deactivate portal |
| `GET` | `/portals/<portal_id>/access` | Admin: list portal users |
| `POST` | `/portals/<portal_id>/access` | Admin: add/update portal access |
| `DELETE` | `/portals/<portal_id>/access/<email>` | Admin: remove access |
| `GET` | `/portals/<portal_id>/restrict-values` | Values for restriction columns |
| `GET` | `/portals/<portal_id>/discover` | Discover Fabric view columns |
| `GET` | `/portals/column-values` | Discover values for arbitrary view/column |
| `POST` | `/data/load` | Portal preview data and count-only queries |
| `GET` | `/data/values` | Dropdown filter values |
| `POST` | `/logs` | Write audit log |
| `GET` | `/logs` | Read audit logs |
| `DELETE` | `/logs` | Clear audit logs |

## Portal System

Portal metadata is stored in the `portals` table in `data/permissions.duckdb`.

Portal row:

```text
id
name
description
view_name
config
created_at
is_active
```

The `config` JSON controls:

- visible columns
- column labels
- filters
- date column
- restriction columns
- summary behavior
- KPI input portal type

### Row-Level Access

Portal user access is stored in `portal_access`.

```text
portal_id
email
restrict_values
```

`restrict_values` may be:

- legacy array for one restriction column
- object map for multiple restriction columns

Example:

```json
{
  "BRAND": ["TOMMY HILFIGER"],
  "REGION": ["SOUTH"]
}
```

### Summarization

Visible columns can be configured as:

- `group`
- `sum`
- `avg`
- `median`
- `mode`

Dimension columns are grouped. Measure columns are aggregated. The backend builds SQL dynamically in `_portal_select_sql()` and counts grouped output rows with `_portal_count_sql()`.

## Large Export Flow

Large exports use an async job flow. This is required for hosted use behind Apache because a single long `/export` request can time out while Fabric extraction is still running.

### Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/export/start?...&export_id=<id>` | Start async export job |
| `GET` | `/export/status?export_id=<id>` | Poll job status and realtime extracted row count |
| `GET` | `/export/file?export_id=<id>` | Download completed ZIP file |
| `GET` | `/export?...` | Legacy synchronous fallback |

### Status Values

| Status | Meaning |
|---|---|
| `queued` | Job accepted |
| `starting` | Worker started |
| `querying` | Fabric query is being executed |
| `extracting` | Rows are being fetched and written to ZIP |
| `ready` | ZIP is ready for download |
| `failed` | Export failed; check `error` |
| `done` | ZIP was downloaded and cleanup ran |
| `unknown` | Unknown export id |

Example status:

```json
{
  "status": "extracting",
  "rows": 1250000,
  "files": 2,
  "portal_id": "pos-sales"
}
```

### Export Behavior

- Each export gets a unique `export_id`.
- Each export runs in a background thread in the Flask process.
- Each export opens its own Fabric ODBC connection.
- Each export writes a temporary ZIP file on disk.
- CSV parts inside the ZIP are split every `1,000,000` rows.
- ZIP compression uses low compression for speed.
- The frontend polls every `1.5s` and shows extracted rows in the status bar.
- The app does not enforce a hard cap on parallel exports.

### Practical Limits

Even without an app-level cap, parallel exports are still limited by infrastructure:

- Fabric query concurrency
- ODBC connection limits
- VM CPU and memory
- temp disk capacity
- Apache/systemd limits
- Python process/thread capacity

For heavy usage, move exports to a persistent worker queue instead of in-process background threads.

## FY27 KPI Tracker Portal

The app includes a dedicated KPI input portal seeded as:

```text
id: fy27-kpi-tracker-pvh
name: FY27 KPI Tracker PVH
view_name: input.FY27_KPI_TRACKER_PVH
config.type: kpi_input
```

The portal writes to Fabric table:

```sql
prd.DIM_UI_KPI_TRACKER_THCK
```

Expected table columns:

```sql
KPT_CAT        VARCHAR
KPI            VARCHAR
TARGET         FLOAT
ACTUAL         FLOAT
BRAND          VARCHAR
MONTH          VARCHAR
LOAD_RUN_DATE  VARCHAR
```

### KPI UI Behavior

- Brand-specific tabs: Tommy Hilfiger and Calvin Klein.
- Save only updates the currently selected brand.
- Month selector includes previous, current, and next month in `YYYY_MM` format.
- Existing table data for the selected month is preloaded into the form.
- Saving deletes existing rows for the same `MONTH` and selected `BRAND`, then inserts the current form rows.
- Blank `TARGET` and `ACTUAL` values are inserted as SQL `NULL`.
- Text fields are cleaned before insert:
  - uppercased
  - special characters removed
  - whitespace normalized

KPI endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/kpi-template?portal_id=...` | Return KPI template |
| `GET` | `/kpi-inputs?portal_id=...&period=YYYY_MM` | Load existing KPI values |
| `POST` | `/kpi-inputs` | Replace/insert KPI values for selected month and brand |

## Deployment on Ubuntu and Apache2

Production app path:

```text
/home/appuser/semantic-layer
```

Frontend static path:

```text
/home/appuser/semantic-layer/frontend/dist
```

### Apache VirtualHost Snippet

```apache
# Permissions API
ProxyTimeout 900
ProxyPass        /permissions-api/ http://localhost:5001/ timeout=900 connectiontimeout=30 retry=0
ProxyPassReverse /permissions-api/ http://localhost:5001/

# POS Download UI
Alias /downloadui /home/appuser/semantic-layer/frontend/dist

<Directory /home/appuser/semantic-layer/frontend/dist>
    Options FollowSymLinks
    AllowOverride None
    Require all granted

    RewriteEngine On
    RewriteBase /downloadui
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ /downloadui/index.html [L]
</Directory>
```

Reload Apache:

```bash
sudo apachectl configtest
sudo systemctl reload apache2
```

### Permissions API systemd Service

```ini
[Unit]
Description=Arvind Permissions API
After=network.target

[Service]
User=appuser
WorkingDirectory=/home/appuser/semantic-layer/sync
Environment=TMPDIR=/mnt
ExecStart=/home/appuser/semantic-layer/env/bin/python permissions_api.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Apply changes:

```bash
sudo systemctl daemon-reload
sudo systemctl restart permissions-api
```

### Deploy Steps

```bash
cd /home/appuser/semantic-layer
git pull

source env/bin/activate
pip install -r sync/requirements.txt

cd frontend
npm install
npm run build
cd ..

sudo systemctl restart permissions-api
sudo systemctl reload apache2
```

## Operational Checks

Service status:

```bash
sudo systemctl status permissions-api
sudo journalctl -u permissions-api -n 100 --no-pager
sudo journalctl -u permissions-api -f
```

Port check:

```bash
sudo ss -ltnp | grep ':5001'
```

Disk and memory:

```bash
df -h
free -h
```

Local API checks:

```bash
curl -i "http://localhost:5001/export/status?export_id=test"
curl -i "http://localhost:5001/my-portals?email=user@example.com"
```

Expected unknown export response:

```json
{"status":"unknown","rows":0,"files":0}
```

Apache logs:

```bash
sudo tail -n 100 /var/log/apache2/aflapi_error.log
sudo tail -n 100 /var/log/apache2/aflapi_access.log
```

## Troubleshooting

### Hosted export fails but local download works

Check that async endpoints are deployed:

```bash
curl -i "http://localhost:5001/export/status?export_id=test"
```

If this fails, restart the API:

```bash
sudo systemctl restart permissions-api
sudo journalctl -u permissions-api -n 100 --no-pager
```

If localhost works but browser requests fail, check Apache:

```bash
sudo apachectl configtest
sudo systemctl reload apache2
sudo tail -n 100 /var/log/apache2/aflapi_error.log
```

### Export status polls forever

Check status manually:

```bash
curl "http://localhost:5001/export/status?export_id=<id>"
```

If status is `failed`, read the `error` field and service logs:

```bash
sudo journalctl -u permissions-api -n 200 --no-pager
```

If status is `querying` for a long time, Fabric is likely still executing the SQL or blocked by warehouse concurrency.

If status is `extracting` and `rows` stops changing, inspect ODBC/Fabric errors in service logs.

### Browser shows `ERR_CONNECTION_REFUSED`

The Flask service is not reachable through Apache or is not listening on port `5001`.

```bash
sudo ss -ltnp | grep ':5001'
sudo systemctl status permissions-api
curl -i "http://localhost:5001/export/status?export_id=test"
```

### 502 from Apache

Likely causes:

- backend process stopped
- proxy timeout
- long synchronous request
- API not reachable on port `5001`

Use async export endpoints and make sure Apache has:

```apache
ProxyTimeout 900
ProxyPass /permissions-api/ http://localhost:5001/ timeout=900 connectiontimeout=30 retry=0
```

### Large export disk usage

Exports write ZIP files to the OS temp directory. Configure:

```ini
Environment=TMPDIR=/mnt
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart permissions-api
```

### KPI values do not appear after save

Check:

```bash
sudo journalctl -u permissions-api -n 100 --no-pager
```

Common causes:

- Fabric table missing `ACTUAL`
- wrong Fabric database in `.env`
- ODBC connection failure
- missing INSERT permission on `prd.DIM_UI_KPI_TRACKER_THCK`

### Build fails on server

```bash
cd /home/appuser/semantic-layer/frontend
npm install
npm run build
```

Confirm `vite.config.js` has:

```js
base: '/downloadui/'
```

### Files not to commit

The following are runtime/server-specific and should remain uncommitted:

```text
.env
data/
frontend/node_modules/
frontend/dist/
sync/venv/
env/
*.log
```

## Notes for Future Hardening

- Move export jobs to a durable worker queue.
- Store export job metadata in DuckDB or SQLite instead of process memory.
- Add scheduled cleanup for abandoned temp ZIP files.
- Add authentication/authorization checks directly inside export endpoints.
- Add Fabric query timeout and clearer user-facing failure messages.
- Add automated backend endpoint tests for portal SQL generation and KPI save/load.
