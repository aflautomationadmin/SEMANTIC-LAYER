# Arvind Analytics Technical Handover

## 1. Executive Summary

Arvind Analytics is a web-based data download and exploration portal for Fabric Warehouse views. It provides Microsoft login, role-based portal access, row-level restrictions, configurable portal metadata, summarized previews, and ZIP/CSV exports.

The current implementation is a React/Vite frontend backed by a Flask API. The Flask API stores portal/access/audit metadata in DuckDB and queries Microsoft Fabric directly through ODBC.

Older README sections mention Cube.js, local `fabric.duckdb`, and sync scripts. Those are not the current tracked implementation path. The active path is:

```text
React/Vite UI -> Flask permissions/data API -> Microsoft Fabric Warehouse
                         |
                         -> DuckDB permissions database
```

## 2. Repository Layout

```text
SEMANTIC-LAYER/
  README.md
  TECHNICAL_HANDOVER.md
  data/
    .gitkeep
    permissions.duckdb
    permissions.duckdb.wal
  docs/
    generate_doc.mjs
    package.json
    Arvind_Analytics_Technical_Document.docx
  frontend/
    index.html
    package.json
    vite.config.js
    public/
    src/
      main.jsx
      App.jsx
      AdminPage.jsx
      AuthWrapper.jsx
      PortalHome.jsx
      authConfig.js
      brandPermissions.js
      logger.js
      *.css
  sync/
    permissions_api.py
    requirements.txt
```

## 3. Runtime Architecture

### Frontend

The frontend is a Vite React 18 app.

Main files:

- `frontend/src/main.jsx`: initializes MSAL and renders the application.
- `frontend/src/authConfig.js`: MSAL client/tenant/redirect configuration.
- `frontend/src/AuthWrapper.jsx`: login gate and initial access check.
- `frontend/src/PortalHome.jsx`: portal selection screen.
- `frontend/src/App.jsx`: selected portal data preview, filters, pagination, sorting, export.
- `frontend/src/AdminPage.jsx`: admin UI for users, admins, portals, portal config, and logs.
- `frontend/src/brandPermissions.js`: frontend wrappers for permission APIs.
- `frontend/src/logger.js`: fire-and-forget audit logging.

### Backend

The backend is a Flask app in `sync/permissions_api.py`.

Responsibilities:

- Initialize and maintain DuckDB metadata tables.
- Read/write application-level admin config.
- Read/write portal definitions.
- Read/write portal user access.
- Query Fabric views for distinct filter values.
- Query Fabric views for summarized preview data.
- Export summarized data as zipped CSV.
- Store and return audit logs.

### Metadata Database

The metadata database is `data/permissions.duckdb`.

Tables:

- `app_permissions`: stores admin and legacy brand config as JSON.
- `audit_logs`: stores UI activity events.
- `portals`: stores portal definitions and JSON portal config.
- `portal_access`: stores user-to-portal access and row restrictions.

## 4. Data Flow

### Login and Access Flow

1. User opens the React app.
2. `main.jsx` initializes MSAL.
3. `AuthWrapper.jsx` checks whether the user is authenticated.
4. If not authenticated, the user is redirected through Microsoft login.
5. After login, `brandPermissions.getBrandAccess(email)` calls:

```text
GET /permissions-api/check-access?email=<email>
```

6. If allowed, the UI calls:

```text
GET /permissions-api/my-portals?email=<email>
```

7. User sees accessible portals.

### Portal Data Preview Flow

1. User selects a portal.
2. Portal config drives date column, filters, visible columns, restricted columns, and summary behavior.
3. User selects date range and filters.
4. `App.jsx` sends:

```text
POST /permissions-api/data/load
```

5. Flask loads portal config, validates allowed columns, builds SQL, queries Fabric, and returns rows.
6. Frontend renders the first page with sorting and pagination.

### Export Flow

1. User clicks Download ZIP.
2. `App.jsx` builds an export URL:

```text
GET /permissions-api/export?...filters...
```

3. Flask queries Fabric using the same portal config and restrictions.
4. Flask streams a ZIP file containing CSV part files.
5. Rows are split at 1,000,000 rows per CSV part.

## 5. Portal Configuration Model

Portal definitions are stored in the `portals.config` JSON column.

Important fields:

```json
{
  "date_col": "INVOICE_DATE",
  "restrict_col": "BRAND",
  "restrict_cols": ["BRAND", "REGION"],
  "summarize": true,
  "groups": ["Store", "Invoice", "Product", "Other"],
  "filters": [
    {
      "key": "BRAND",
      "label": "Brand",
      "type": "dropdown",
      "group": "Product"
    }
  ],
  "columns": [
    {
      "key": "NETAMT",
      "label": "Net Amount",
      "show": true,
      "currency": true,
      "is_numeric": true,
      "aggregate": "sum",
      "filter": "none",
      "group": "Other"
    }
  ]
}
```

### Column Fields

- `key`: Fabric column name.
- `label`: user-facing label.
- `show`: whether the column appears in preview/export.
- `filter`: `none`, `dropdown`, or `text`.
- `group`: UI group/tab for filter controls.
- `currency`: formats value as currency in the frontend.
- `is_numeric`: discovered from Fabric metadata.
- `aggregate`: summary behavior.

Supported `aggregate` values:

- `group`: dimension, included in `GROUP BY`.
- `sum`: summed measure.
- `avg`: averaged measure.
- `median`: median measure.
- `mode`: most frequent value.

## 6. Row-Level Restrictions

The system supports multiple restricted columns per portal.

Portal config:

```json
{
  "restrict_cols": ["BRAND", "REGION"]
}
```

User access in `portal_access.restrict_values`:

```json
{
  "BRAND": ["ARROW", "US POLO ASS."],
  "REGION": ["SOUTH"]
}
```

Legacy format is still supported:

```json
["ARROW", "US POLO ASS."]
```

When the legacy list format is found, it is applied to the first restricted column for backward compatibility.

Important note: the frontend sends restriction values to the backend. For stronger security, the backend should derive restrictions from authenticated user identity instead of trusting client-supplied values.

## 7. Backend API Reference

Base path in production and Vite proxy:

```text
/permissions-api
```

### Permission APIs

```text
GET  /permissions
POST /permissions
GET  /check-access?email=<email>
```

### Portal APIs

```text
GET    /portals
POST   /portals
PUT    /portals/<portal_id>
PATCH  /portals/<portal_id>
DELETE /portals/<portal_id>
GET    /portals/<portal_id>/discover?view=<schema.view>
GET    /portals/<portal_id>/restrict-values
GET    /portals/column-values?view=<schema.view>&column=<column>
GET    /my-portals?email=<email>
```

### Portal Access APIs

```text
GET    /portals/<portal_id>/access
POST   /portals/<portal_id>/access
DELETE /portals/<portal_id>/access/<email>
```

### Data APIs

```text
POST /data/load
GET  /data/values
GET  /export
```

### Audit Log APIs

```text
POST   /logs
GET    /logs
DELETE /logs
```

## 8. Backend Query Generation

The backend builds SQL dynamically from portal config.

Relevant helpers in `sync/permissions_api.py`:

- `_portal_allowed_cols(config)`: whitelist of allowed columns.
- `_portal_restrict_cols(config)`: normalized restriction columns.
- `_normalize_restrictions(config, restrict_values)`: normalizes old/new restriction shape.
- `_portal_query_parts(config)`: visible output columns and dimension/measure split.
- `_portal_select_sql(config, view_name, where, limit, order)`: builds preview/export query.
- `_portal_count_sql(config, view_name, where)`: builds count query.
- `_build_where(...)`: builds date, row restriction, dropdown, and text filter conditions.

The query strategy is:

- visible `aggregate=group` columns become dimensions.
- visible measure columns use selected aggregation.
- dimensions define grouped output.
- `sum` and `avg` use grouped aggregate SQL.
- `median` and `mode` use CTE/window SQL.

## 9. Authentication

Authentication is handled in the browser using Microsoft MSAL.

Environment variables:

```text
VITE_AZURE_CLIENT_ID
VITE_AZURE_TENANT_ID
VITE_REDIRECT_PATH
```

Redirect URI is computed in `authConfig.js`:

```js
window.location.origin + (import.meta.env.VITE_REDIRECT_PATH || '')
```

Local redirect path is usually empty.
Production redirect path is usually `/downloadui`.

## 10. Authorization

Authorization currently has two layers:

1. App gate access:
   - Admins from `app_permissions`.
   - Users with portal access in `portal_access`.
   - Legacy brand users from `app_permissions.brands`.

2. Portal row restriction:
   - Stored per portal/user in `portal_access.restrict_values`.
   - Applied by backend query generation.

Admins have access to all active portals.

## 11. Environment Variables

Root `.env` is loaded by the Flask app.

Expected Fabric/ODBC variables:

```text
CUBEJS_DB_HOST
CUBEJS_DB_PORT
CUBEJS_DB_NAME
CUBEJS_DB_USER
CUBEJS_DB_PASS
```

The names still include `CUBEJS_` for historical reasons, but the current Flask app uses them directly for Fabric ODBC connections.

Frontend `.env`:

```text
VITE_AZURE_CLIENT_ID
VITE_AZURE_TENANT_ID
VITE_REDIRECT_PATH
```

## 12. Local Development

### Backend

```powershell
cd sync
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python permissions_api.py
```

Backend runs on:

```text
http://localhost:5001
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:3000
```

Vite proxies `/permissions-api` to `http://localhost:5001`.

## 13. Production Deployment Model

The intended production deployment is:

```text
Apache HTTPS
  /downloadui       -> frontend/dist
  /permissions-api  -> Flask API on localhost:5001
```

Build frontend:

```powershell
cd frontend
npm run build
```

Serve `frontend/dist` under `/downloadui`.

Run Flask API using a process manager such as systemd on Linux.

## 14. Admin Workflows

### Create Portal

1. Admin opens Access Management.
2. Goes to Portals tab.
3. Clicks New Portal.
4. Enters name, description, Fabric view.
5. Clicks Discover Columns.
6. Selects date column.
7. Selects one or more restrict columns using dropdown multi-select.
8. Step 2: configures visible columns, labels, filter type, summary mode, filter group, and currency flag.
9. Saves portal.

### Add User Access

1. Admin opens Users tab.
2. Selects portal.
3. Adds email.
4. Selects restricted values for each configured restricted column.
5. Saves user access.

Empty restriction selection means all rows for that portal.

## 15. Audit Logging

Frontend logs:

- `login`
- `load_data`
- `csv_export`

Logs are posted to:

```text
POST /permissions-api/logs
```

Admin can view logs in the Activity Log tab.

## 16. Important Current Limitations

1. Backend auth is incomplete.
   - The backend accepts email and restriction payloads from the frontend.
   - A stronger model would validate an Azure AD token server-side and derive user access from backend storage.

2. CORS is open.
   - `CORS(app)` allows broad access.
   - Production should restrict origins.

3. Dynamic SQL is used.
   - Column names are whitelisted from portal config.
   - Values are escaped manually.
   - Continue to avoid accepting arbitrary SQL fragments.

4. Median/mode SQL depends on Fabric SQL support.
   - The implementation uses SQL Server-style window functions and percentile logic.
   - Validate against the target Fabric Warehouse before relying on this in production.

5. README is stale.
   - It still describes Cube.js/local sync architecture.
   - This handover reflects current tracked code.

6. Frontend build could not be verified in the current sandbox.
   - `npm.cmd run build` failed with esbuild `spawn EPERM`.
   - This appears to be environment/sandbox related.

## 17. Operational Checks

### Backend syntax

```powershell
python -m py_compile sync\permissions_api.py
```

### Frontend build

```powershell
cd frontend
npm.cmd run build
```

### Inspect DuckDB tables

```powershell
.\.venv\Scripts\python.exe -c "import duckdb; con=duckdb.connect('data/permissions.duckdb', read_only=True); print(con.execute('SHOW TABLES').fetchall())"
```

Expected tables:

```text
app_permissions
audit_logs
portal_access
portals
```

## 18. Handover Priorities

Recommended next work:

1. Add backend Azure AD token validation.
2. Stop trusting client-supplied email/restrictions.
3. Update README to match current architecture.
4. Add automated tests for query generation.
5. Validate `avg`, `median`, and `mode` SQL against real Fabric views.
6. Add pagination/server-side limits for very large grouped results.
7. Add deployment scripts and production service documentation.

## 19. Ownership Notes

Primary code ownership areas:

- Frontend product workflows: `frontend/src/App.jsx`, `PortalHome.jsx`, `AdminPage.jsx`.
- Auth integration: `frontend/src/AuthWrapper.jsx`, `authConfig.js`.
- API and data logic: `sync/permissions_api.py`.
- Runtime metadata: `data/permissions.duckdb`.
- Generated docs: `docs/generate_doc.mjs`.

For future changes, keep portal config backward compatible because existing portals may still use legacy `restrict_col` and list-shaped `restrict_values`.
