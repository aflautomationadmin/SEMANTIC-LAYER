# Arvind Analytics — POS Sales Intelligence Platform

A full-stack semantic layer application for exploring, filtering, and exporting POS / AIL sales data across brands. Built on Microsoft Fabric Warehouse → DuckDB → Cube.js → React.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Environment Variables](#environment-variables)
5. [Local Development Setup](#local-development-setup)
6. [Data Sync Scripts](#data-sync-scripts)
7. [Cube.js Semantic Layer](#cubejs-semantic-layer)
8. [Frontend](#frontend)
9. [Authentication & RBAC](#authentication--rbac)
10. [Permissions API](#permissions-api)
11. [VM Deployment (Apache2)](#vm-deployment-apache2)
12. [Git Workflow](#git-workflow)
13. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
Microsoft Fabric Warehouse
        │
        │  pyodbc (ODBC Driver 18)
        ▼
  Python Sync Scripts
  (fetch_pos_sales.py)
        │
        │  DELETE + INSERT by INVOICENO
        ▼
   DuckDB  ──────────────────────────────────────────────────────┐
   fabric.duckdb                                                  │
        │                                                         │
        │  Docker (cubejs/cube:latest)                            │
        ▼                                                         │
    Cube.js API  ◄── /cubejs-api/  ◄── Apache Proxy              │
    port 4000                                                     │
                                                                  │
   permissions.duckdb ◄── Flask API ◄── /permissions-api/ ◄──────┘
   (RBAC storage)         port 5001       Apache Proxy
        │
        ▼
   React Frontend (Vite)
   served at /downloadui
   Apache2 on Azure VM
        │
        ▼
   Microsoft MSAL (Azure AD)
   RBAC: Brand-level access control
```

---

## Project Structure

```
SEMANTIC-LAYER/
│
├── data/                          # DuckDB databases (not committed to git)
│   ├── fabric.duckdb              # POS sales data — used by Cube.js
│   └── permissions.duckdb         # RBAC permissions — used by Flask API
│
├── sync/                          # Python data sync scripts
│   ├── fetch_pos_sales.py         # Syncs POS/AIL sales from Fabric → DuckDB
│   ├── fetch_fabric.py            # Syncs SAP billing data (truncate + load)
│   ├── permissions_api.py         # Flask API for RBAC permissions
│   └── requirements.txt
│
├── model/                         # Cube.js data model
│   └── cubes/
│       ├── FactPosAilSales.yml    # 47 dimensions + 15 measures
│       └── FactSapTSingleIr.yml   # SAP billing cube
│
├── frontend/                      # React + Vite application
│   ├── src/
│   │   ├── main.jsx               # Entry point — MSAL init
│   │   ├── App.jsx                # Main dashboard (filters, table, export)
│   │   ├── App.css
│   │   ├── AdminPage.jsx          # Admin RBAC management UI
│   │   ├── AdminPage.css
│   │   ├── AuthWrapper.jsx        # Microsoft login gate
│   │   ├── AuthWrapper.css
│   │   ├── authConfig.js          # MSAL singleton config
│   │   ├── brandPermissions.js    # RBAC helpers (API calls)
│   │   └── assets/
│   │       └── arvind-logo.png
│   ├── public/
│   ├── .env                       # Local dev env vars
│   ├── .env.production            # Production env vars (not committed)
│   ├── vite.config.js
│   └── package.json
│
├── docker-compose.yml             # Cube.js container
├── cube.js                        # Cube.js config
├── .env                           # Root env vars (Fabric credentials etc.)
├── .gitignore
└── README.md
```

---

## Prerequisites

### Local Development (Windows)
- Node.js 20+
- Docker Desktop
- Python 3.10+
- Microsoft ODBC Driver 18 for SQL Server

### VM (Ubuntu 22.04)
- Docker + Docker Compose plugin
- Node.js 20
- Python 3.10+
- Apache2
- Microsoft ODBC Driver 18 for SQL Server
- unixodbc-dev

---

## Environment Variables

### Root `.env` (Cube.js + Python sync)

```env
# Cube.js
CUBEJS_DB_TYPE=duckdb
CUBEJS_DB_DUCKDB_DATABASE_PATH=/cube/conf/data/fabric.duckdb
CUBEJS_API_SECRET=your_secret_here
CUBEJS_DEV_MODE=true

# Microsoft Fabric Warehouse (for sync scripts)
FABRIC_SERVER=your_server.sql.azuresynapse.net
FABRIC_DATABASE=your_database
FABRIC_USERNAME=your_username
FABRIC_PASSWORD=your_password
```

### `frontend/.env` (local dev)

```env
VITE_AZURE_CLIENT_ID=3ce34098-1db7-414e-847f-8ea7b3de5e5d
VITE_AZURE_TENANT_ID=d6454b9f-4ca2-4392-b62f-20e21e54335a
VITE_REDIRECT_PATH=
```

### `frontend/.env.production` (VM only — never committed)

```env
VITE_AZURE_CLIENT_ID=3ce34098-1db7-414e-847f-8ea7b3de5e5d
VITE_AZURE_TENANT_ID=d6454b9f-4ca2-4392-b62f-20e21e54335a
VITE_REDIRECT_PATH=/downloadui
```

---

## Local Development Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_ORG/arvind-semantic-layer.git
cd arvind-semantic-layer
```

### 2. Set up Python environment

```bash
cd sync
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
```

### 3. Start Cube.js

```bash
cd ..
docker compose up -d
```

Cube.js API available at: `http://localhost:4000`

### 4. Run the Permissions API

```bash
cd sync
python permissions_api.py
```

Permissions API available at: `http://localhost:5001`

### 5. Start the React frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend available at: `http://localhost:3000`

---

## Data Sync Scripts

### POS / AIL Sales (`fetch_pos_sales.py`)

Pulls sales data from Microsoft Fabric Warehouse into `data/fabric.duckdb`.

**Strategy:** DELETE + INSERT based on `INVOICENO` — safe to re-run without duplicates.

```bash
cd sync
source venv/bin/activate
python fetch_pos_sales.py
```

### SAP Billing (`fetch_fabric.py`)

Pulls SAP billing data. **Strategy:** Truncate + full reload every run.

```bash
python fetch_fabric.py
```

### Scheduling (Cron)

```bash
crontab -e
```

```cron
# Run POS sales sync every day at 2 AM
0 2 * * * /home/appuser/semantic-layer/env/bin/python /home/appuser/semantic-layer/sync/fetch_pos_sales.py >> /var/log/pos_sync.log 2>&1
```

---

## Cube.js Semantic Layer

- Runs in Docker on port **4000**
- Uses DuckDB driver pointing to `data/fabric.duckdb`
- Schema files in `model/cubes/`

### Key Cubes

| Cube | Table | Dimensions | Measures |
|---|---|---|---|
| `FactPosAilSales` | `fact_pos_ail_sales` | 47 | 15 |
| `FactSapTSingleIr` | `fact_sap_t_single_ir` | — | — |

### Restart after schema changes

```bash
docker compose restart
```

---

## Frontend

Built with **Vite + React 18**.

### Features
- Date range filter (From / To)
- 46 categorical filters grouped into 6 tabs (Store, Invoice, Product, Scheme, Tax, Other)
- Dropdown filters (lazy-loaded from Cube.js) and text search filters
- Full column table (62 columns) with sort on all columns
- Pagination (50 rows/page in UI)
- Row count + summary stats (Qty, Net Amount)
- CSV export with automatic file splitting at **10 lakh rows per file**
- Microsoft MSAL authentication
- Brand-based RBAC (users see only their allowed brands)
- Admin page for managing user access

### Build for production

```bash
cd frontend
npm run build
# Output → frontend/dist/
```

---

## Authentication & RBAC

### Microsoft MSAL (Azure AD)

- SPA PKCE flow via `@azure/msal-browser` v3
- Azure App Registration: `3ce34098-1db7-414e-847f-8ea7b3de5e5d`
- Redirect URIs configured in Azure Portal:
  - `http://localhost:3000` (local dev)
  - `https://automationafl.arvindfashions.com/downloadui` (production)

### Brand RBAC

| Role | Access | How |
|---|---|---|
| **Admin** | All brands, Admin page | Listed in `admins[]` in permissions config |
| **Brand User** | Specific brand(s) only | Listed under `brands.BRAND_NAME[]` |
| **No Access** | Blocked at login | Not in any list |

Brand filter is **locked** for non-admin users — they cannot override their brand restriction.

### Admin Page

Accessible via the **⚙ Admin** button in the header (admins only).

- **Users tab** — view all users, edit access, remove users, add new users (comma-separated emails supported)
- **Brands tab** — view users per brand, quick-add users directly to a brand

---

## Permissions API

A lightweight Flask API that stores RBAC config in `data/permissions.duckdb`.

### Endpoints

| Method | URL | Description |
|---|---|---|
| `GET` | `/permissions-api/permissions` | Get current permissions config |
| `POST` | `/permissions-api/permissions` | Save updated permissions config |

### Running locally

```bash
cd sync
python permissions_api.py
# Runs on http://localhost:5001
```

### Default config (first run)

```json
{
  "admins": ["automation.admin@arvindfashions.com"],
  "brands": {
    "US POLO ASS.": ["saifali.khan@arvindfashions.com"],
    "ARROW": [],
    "FLYING MACHINE": [],
    "ASPOL FOOTWEAR": [],
    "AD BY ARVIND": [],
    "COMMON BRAND": [],
    "TOMMY HILFIGER": [],
    "CALVIN KLEIN": []
  }
}
```

---

## VM Deployment (Apache2)

### Server Details

| Item | Value |
|---|---|
| URL | `https://automationafl.arvindfashions.com/downloadui` |
| OS | Ubuntu 22.04 LTS |
| Web Server | Apache2 |
| App User | `appuser` |
| Project Path | `/home/appuser/semantic-layer/` |

### Apache2 Virtual Host Config

Located at `/etc/apache2/sites-available/aflapi.conf`

Key sections added for this app:

```apache
# Redirect root → app
RedirectMatch ^/$ /downloadui

# Cube.js API proxy
ProxyPass        /cubejs-api/ http://localhost:4000/cubejs-api/
ProxyPassReverse /cubejs-api/ http://localhost:4000/cubejs-api/
ProxyTimeout 300

# Permissions API proxy
ProxyPass        /permissions-api/ http://localhost:5001/
ProxyPassReverse /permissions-api/ http://localhost:5001/

# React frontend
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

### Required Apache Modules

```bash
sudo a2enmod proxy proxy_http rewrite headers
sudo systemctl restart apache2
```

### Systemd Services

**Cube.js** (`/etc/systemd/system/cubejs.service`):

```ini
[Unit]
Description=Cube.js Semantic Layer
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/home/appuser/semantic-layer
ExecStart=docker compose up
ExecStop=docker compose down
Restart=always
User=appuser

[Install]
WantedBy=multi-user.target
```

**Permissions API** (`/etc/systemd/system/permissions-api.service`):

```ini
[Unit]
Description=Arvind Permissions API
After=network.target

[Service]
User=appuser
WorkingDirectory=/home/appuser/semantic-layer/sync
ExecStart=/home/appuser/semantic-layer/env/bin/python permissions_api.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable cubejs permissions-api
sudo systemctl start cubejs permissions-api
```

### First-time VM Setup

```bash
# 1. Install system dependencies
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker appuser && newgrp docker
sudo apt install -y docker-compose-plugin nodejs npm unixodbc-dev

# Install Microsoft ODBC Driver 18
curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt update
sudo ACCEPT_EULA=Y apt install -y msodbcsql18

# 2. Clone project
cd ~
git clone https://github.com/YOUR_ORG/arvind-semantic-layer.git semantic-layer
cd semantic-layer

# 3. Python environment
python3 -m venv env
source env/bin/activate
pip install -r sync/requirements.txt

# 4. Create .env files (not in git)
nano .env                           # root env (Fabric credentials)
nano frontend/.env.production       # frontend env

# 5. Create data folder
mkdir -p data

# 6. Build frontend
cd frontend && npm install && npm run build && cd ..

# 7. Start services
docker compose up -d
sudo systemctl start permissions-api
```

---

## Git Workflow

### Daily development cycle

```bash
# On your machine — after making changes
git add .
git commit -m "describe your change"
git push

# On the VM — to deploy
~/semantic-layer/deploy.sh
```

### `deploy.sh`

```bash
#!/bin/bash
set -e
echo "── Pulling latest code ──"
cd ~/semantic-layer
git pull origin main

echo "── Installing Python deps ──"
source env/bin/activate
pip install -r sync/requirements.txt -q

echo "── Building frontend ──"
cd frontend
npm install --silent
npm run build
cd ..

echo "── Restarting services ──"
docker compose restart
sudo systemctl restart permissions-api

echo "── Done ✓ ──"
```

### Files never committed (in `.gitignore`)

| Path | Reason |
|---|---|
| `data/` | Database files — too large, server-specific |
| `.env` | Contains Fabric credentials |
| `frontend/.env.production` | Contains client IDs |
| `frontend/node_modules/` | Installed on server |
| `frontend/dist/` | Built on server |
| `sync/venv/` or `env/` | Installed on server |

---

## Troubleshooting

### Cube.js not starting
```bash
docker compose logs -f cube
docker compose ps
```

### Permissions API not starting
```bash
journalctl -u permissions-api -n 50 --no-pager
# Run manually to see error:
/home/appuser/semantic-layer/env/bin/python /home/appuser/semantic-layer/sync/permissions_api.py
```

### Frontend build fails (top-level await error)
Ensure `vite.config.js` has:
```js
build: { target: 'esnext' }
```

### Login redirects to wrong URL (AADSTS50011)
1. Check `frontend/.env.production` has `VITE_REDIRECT_PATH=/downloadui`
2. Rebuild frontend: `npm run build`
3. Confirm `https://automationafl.arvindfashions.com/downloadui` is in Azure App Registration → Authentication → Redirect URIs

### Logo not showing
Logo must be imported as a module in JSX files — not as a string path:
```js
import arvindLogo from './assets/arvind-logo.png'
// Use:
<img src={arvindLogo} />
```

### Apache showing default page
```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
# Check dist folder permissions:
sudo chmod o+x /home/appuser
sudo chmod -R o+r /home/appuser/semantic-layer/frontend/dist
```

### pyodbc module not found
```bash
sudo apt install -y unixodbc-dev
source ~/semantic-layer/env/bin/activate
pip install pyodbc
```

### Docker permission denied
```bash
sudo usermod -aG docker appuser
newgrp docker
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Data Warehouse | Microsoft Fabric Warehouse |
| Sync | Python 3.10, pyodbc, pandas, DuckDB |
| Semantic Layer | Cube.js (Docker) |
| Local DB | DuckDB |
| Permissions DB | DuckDB (separate file) |
| Permissions API | Flask 3, flask-cors |
| Frontend | React 18, Vite 5 |
| Auth | Microsoft MSAL (@azure/msal-browser v3) |
| Web Server | Apache2 (Ubuntu 22.04) |
| Cloud | Microsoft Azure (VM + Fabric + Azure AD) |
