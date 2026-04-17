import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, Header, Footer, LevelFormat, TableOfContents,
  PageBreak
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Helpers ─────────────────────────────────────────────────────────────────

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function h(level, text, options = {}) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true })],
    spacing: { before: 240, after: 120 },
    ...options,
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 24 })],
    spacing: { before: 80, after: 80 },
    ...opts,
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text, size: 24 })],
    spacing: { before: 40, after: 40 },
  });
}

function sub(label, value) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [
      new TextRun({ text: label + ': ', bold: true, size: 24 }),
      new TextRun({ text: value, size: 24 }),
    ],
    spacing: { before: 40, after: 40 },
  });
}

function hr() {
  return new Paragraph({
    children: [],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E4FA3', space: 1 } },
    spacing: { before: 160, after: 160 },
  });
}

function blankLine() {
  return new Paragraph({ children: [new TextRun('')], spacing: { before: 0, after: 0 } });
}

function headerRow(cells, colWidths) {
  return new TableRow({
    tableHeader: true,
    children: cells.map((text, i) =>
      new TableCell({
        borders: BORDERS,
        width: { size: colWidths[i], type: WidthType.DXA },
        shading: { fill: '2E4FA3', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22 })],
        })],
      })
    ),
  });
}

function dataRow(cells, colWidths, shade = false) {
  return new TableRow({
    children: cells.map((text, i) =>
      new TableCell({
        borders: BORDERS,
        width: { size: colWidths[i], type: WidthType.DXA },
        shading: { fill: shade ? 'F2F4FA' : 'FFFFFF', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: String(text ?? ''), size: 22 })],
        })],
      })
    ),
  });
}

function table(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      headerRow(headers, colWidths),
      ...rows.map((r, idx) => dataRow(r, colWidths, idx % 2 === 1)),
    ],
  });
}

// ── Document ─────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 24 } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Calibri', color: '1F2D6B' },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Calibri', color: '2E4FA3' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Calibri', color: '3A3A3A' },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [
    // ── Cover Page ───────────────────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        blankLine(), blankLine(), blankLine(), blankLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'ARVIND FASHIONS LTD', bold: true, size: 56, color: '1F2D6B', font: 'Calibri' })],
          spacing: { before: 0, after: 120 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Analytics Division', size: 32, color: '555555', font: 'Calibri' })],
          spacing: { before: 0, after: 600 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '2E4FA3', space: 1 } },
          children: [],
          spacing: { before: 0, after: 600 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'POS Sales Intelligence Platform', bold: true, size: 48, color: '1F2D6B', font: 'Calibri' })],
          spacing: { before: 480, after: 200 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'High-Level Technical Architecture & Design Document', size: 28, color: '444444', font: 'Calibri' })],
          spacing: { before: 0, after: 600 },
        }),
        blankLine(), blankLine(), blankLine(), blankLine(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Version: ', bold: true, size: 24, font: 'Calibri' }), new TextRun({ text: '1.0', size: 24, font: 'Calibri' })],
          spacing: { before: 0, after: 80 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Date: ', bold: true, size: 24, font: 'Calibri' }), new TextRun({ text: 'April 2026', size: 24, font: 'Calibri' })],
          spacing: { before: 0, after: 80 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Classification: ', bold: true, size: 24, font: 'Calibri' }), new TextRun({ text: 'Internal / Confidential', size: 24, font: 'Calibri' })],
          spacing: { before: 0, after: 80 },
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // ── Main Content ─────────────────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Arvind Analytics \u2014 POS Sales Intelligence Platform', size: 18, color: '888888', font: 'Calibri' }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
            spacing: { after: 120 },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Arvind Fashions Ltd \u2014 Internal Confidential    Page ', size: 18, color: '888888', font: 'Calibri' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888', font: 'Calibri' }),
              new TextRun({ text: ' of ', size: 18, color: '888888', font: 'Calibri' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '888888', font: 'Calibri' }),
            ],
            alignment: AlignmentType.RIGHT,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
          })],
        }),
      },
      children: [
        // TOC
        h(HeadingLevel.HEADING_1, 'Table of Contents'),
        new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 1. Executive Summary ─────────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '1. Executive Summary'),
        hr(),
        p('The Arvind Analytics POS Sales Intelligence Platform is an internal business intelligence system built for Arvind Fashions Ltd to enable real-time and historical analysis of Point-of-Sale (POS) and online sales data across all brands and channels. The platform provides self-service analytics with role-based access control (RBAC), allowing brand managers, regional heads, and senior leadership to explore sales performance, apply multi-dimensional filters, and export data without requiring SQL knowledge.'),
        blankLine(),
        h(HeadingLevel.HEADING_2, 'Key Capabilities'),
        bullet('Multi-brand sales analytics covering US Polo, Arrow, Flying Machine, Tommy Hilfiger, Calvin Klein, and others'),
        bullet('Date-range filtered data exploration with 30+ dimensions and measures'),
        bullet('Microsoft Azure AD (Entra ID) single sign-on with brand-level RBAC'),
        bullet('CSV export functionality for offline analysis and reporting'),
        bullet('Admin panel for user and permission management'),
        bullet('Audit logging of all login, data load, and export events'),
        bullet('Automated daily data synchronisation from Microsoft Fabric Warehouse'),
        blankLine(),
        h(HeadingLevel.HEADING_2, 'Business Value'),
        p('Prior to this platform, sales reporting required manual data extraction from SAP and Xstore POS systems, with analysts spending hours preparing Excel reports. The platform reduces reporting time from hours to seconds, provides a consistent single source of truth, and enables business users to independently answer their own analytical questions.'),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 2. System Architecture ────────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '2. System Architecture'),
        hr(),
        h(HeadingLevel.HEADING_2, '2.1 Architecture Overview'),
        p('The platform follows a four-tier architecture: Data Source → Sync Layer → Semantic Layer → Presentation Layer.'),
        blankLine(),
        table(
          ['Tier', 'Component', 'Technology', 'Purpose'],
          [
            ['Data Source', 'Microsoft Fabric Warehouse', 'Azure SQL / Fabric', 'Operational POS & SAP data'],
            ['Sync Layer', 'Python ETL Scripts', 'Python + pyodbc + pandas', 'Nightly delta load into DuckDB'],
            ['Semantic Layer', 'Cube.js Engine', 'Cube.js + DuckDB driver', 'Metrics, aggregations, caching, REST/SQL API'],
            ['Permissions API', 'Flask REST API', 'Python Flask + DuckDB', 'RBAC config and audit log storage'],
            ['Presentation', 'React SPA', 'React + Vite', 'Browser-based analytics UI'],
            ['Web Server', 'Apache2', 'Apache2 + mod_proxy', 'Reverse proxy, static file serving, SSL'],
          ],
          [1500, 2200, 2200, 3460]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '2.2 Data Flow'),
        bullet('Step 1 — ETL: Python sync scripts connect to Microsoft Fabric via ODBC (ActiveDirectory Password auth), fetch current-month POS data, and upsert into DuckDB (fabric.duckdb)'),
        bullet('Step 2 — Semantic: Cube.js reads from DuckDB, applies pre-aggregation caching, and exposes a REST API on port 4000'),
        bullet('Step 3 — RBAC: On login, the React app calls the Flask Permissions API (port 5001) to fetch the user\'s allowed brands'),
        bullet('Step 4 — Query: The React frontend sends filtered queries to Cube.js (/cubejs-api/v1/load). Cube.js enforces date and measure filters, returns JSON'),
        bullet('Step 5 — Render: Results are displayed in a filterable data grid. Users can export to CSV'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '2.3 Network & Hosting'),
        p('The platform runs on a single Azure Ubuntu 22.04 VM. Apache2 acts as the public-facing reverse proxy on port 443 (HTTPS), routing requests to internal services:'),
        blankLine(),
        table(
          ['Path Prefix', 'Routes To', 'Description'],
          [
            ['/downloadui/', 'Static files on disk', 'React app build output'],
            ['/cubejs-api/', 'localhost:4000', 'Cube.js REST API (Docker)'],
            ['/permissions-api/', 'localhost:5001', 'Flask RBAC & Audit API (systemd)'],
          ],
          [2400, 2400, 4560]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '2.4 Infrastructure Components'),
        bullet('Azure Ubuntu VM: Single-node host running all services'),
        bullet('Docker / Docker Compose: Cube.js runs in the official cubejs/cube:latest container with DuckDB driver built-in'),
        bullet('systemd: Manages the Flask Permissions API (permissions-api.service) as a persistent background service'),
        bullet('Apache2 Modules: mod_proxy, mod_proxy_http, mod_rewrite, mod_headers'),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 3. Data Model ────────────────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '3. Data Model & Cube Schema'),
        hr(),
        h(HeadingLevel.HEADING_2, '3.1 DuckDB Storage'),
        p('Two DuckDB files serve distinct purposes and must never be accessed concurrently with conflicting write locks:'),
        blankLine(),
        table(
          ['File', 'Tables', 'Owner', 'Purpose'],
          [
            ['data/fabric.duckdb', 'fact_pos_ail_sales, fact_sap_t_single_ir', 'Cube.js (write lock)', 'Analytics fact tables — POS & SAP data'],
            ['data/permissions.duckdb', 'app_permissions, audit_logs', 'Flask API', 'RBAC configuration & activity logs'],
          ],
          [2800, 3200, 1800, 1560]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '3.2 POS Sales Fact Table (fact_pos_ail_sales)'),
        p('Loaded from [prd].[FACT_FNO_SALES_TC_ONLINE_BASE] in Microsoft Fabric. Refreshed nightly via a DELETE + INSERT strategy keyed on INVOICENO. Contains current month\'s data (or prior month on day-1 of each month).'),
        blankLine(),
        h(HeadingLevel.HEADING_3, 'Key Dimensions'),
        table(
          ['Column', 'Type', 'Description'],
          [
            ['COMPANY', 'VARCHAR', 'Legal entity name'],
            ['REGION / STATE', 'VARCHAR', 'Geographic hierarchy'],
            ['CHANNEL', 'VARCHAR', 'Sales channel (Retail, Online, etc.)'],
            ['BRAND / SUBBRAND', 'VARCHAR', 'Brand hierarchy'],
            ['CLASS / SUBCLASS', 'VARCHAR', 'Merchandise classification'],
            ['SAP_STORECODE', 'VARCHAR', 'SAP store identifier'],
            ['INVOICE_DATE', 'DATE', 'Transaction date'],
            ['INVOICENO', 'VARCHAR', 'Invoice identifier (upsert key)'],
            ['STYLECODE / BARCODE', 'VARCHAR', 'SKU identifiers'],
            ['GENDER / COLOR / ITEMSIZE', 'VARCHAR', 'Product attributes'],
            ['SEASON', 'VARCHAR', 'Merchandising season'],
          ],
          [2200, 1600, 5560]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_3, 'Key Measures'),
        table(
          ['Column', 'Aggregation', 'Description'],
          [
            ['QUANTITY', 'SUM', 'Units sold'],
            ['TOTAL_MRP', 'SUM', 'Maximum retail price value'],
            ['DISCOUNT', 'SUM', 'Total discount amount'],
            ['NETAMT', 'SUM', 'Net invoice amount after all discounts'],
            ['TAXABLE_AMOUNT', 'SUM', 'Pre-tax base amount'],
            ['SGST / CGST / IGST', 'SUM', 'GST components'],
            ['GST_REBATE / GWP_DISC', 'SUM', 'Special discount types'],
          ],
          [2200, 1800, 5360]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '3.3 SAP Billing Fact Table (fact_sap_t_single_ir)'),
        p('Loaded from [prd].[FACT_SAP_T_SINGLE_IR]. Full TRUNCATE + LOAD strategy. Contains wholesale/B2B billing data with fields such as BILLING_DOC, BILL_DATE, SALES_ORG, DIVISION, PLANT, and financial measures including TAXABLE_AMOUNT, TOTAL_AMOUNT, FRANCHISE MARGIN, and GST components.'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '3.4 Cube.js Semantic Model'),
        p('Cube.js YAML schema files (model/cubes/) define the semantic layer on top of DuckDB tables:'),
        blankLine(),
        table(
          ['File', 'Cube Name', 'Joins / Enrichments'],
          [
            ['FactPosAilSales.yml', 'FactPosAilSales', 'None (self-contained fact table)'],
            ['FactSapTSingleIr.yml', 'FactSapTSingleIr', 'None (self-contained billing fact)'],
          ],
          [3000, 3000, 3360]
        ),
        p('Cube.js applies pre-aggregations and result caching. The REST API endpoint (/v1/load) accepts JSON queries with dimensions, measures, filters, and date ranges, returning paginated JSON results.'),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 4. Authentication & Security ──────────────────────────────────────
        h(HeadingLevel.HEADING_1, '4. Authentication & Security'),
        hr(),
        h(HeadingLevel.HEADING_2, '4.1 Microsoft Azure AD (Entra ID) Authentication'),
        p('The platform uses Microsoft Authentication Library (MSAL) for browser-based OAuth 2.0 / OpenID Connect authentication against the Arvind Fashions Azure AD tenant.'),
        blankLine(),
        bullet('Authentication flow: Interactive login redirect (useMsalAuthentication hook with Redirect interaction type)'),
        bullet('Token type: ID token + Access token issued by Azure AD'),
        bullet('Redirect URI: Must exactly match the App Registration configuration in Azure (e.g. https://automationafl.arvindfashions.com/downloadui)'),
        bullet('MSAL config: clientId, authority (tenant ID), and redirectUri configured in authConfig.js via environment variables'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '4.2 Role-Based Access Control (RBAC)'),
        p('After successful Azure AD authentication, the app fetches the user\'s RBAC profile from the Permissions API:'),
        blankLine(),
        sub('Admin users', 'Defined in the admins array (email list). Full access to all brands + Admin panel'),
        sub('Brand users', 'Mapped in the brands object. Each brand maps to a list of authorised email addresses'),
        sub('Access resolution', 'getBrandAccess() checks the authenticated user\'s email against both lists. Returns { brands: [...], isAdmin: bool }'),
        sub('Data filtering', 'Cube.js queries include a BRAND filter restricted to the user\'s allowed brands. Admins see all brands'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '4.3 Permissions Storage'),
        p('RBAC configuration is persisted in permissions.duckdb (app_permissions table) as a JSON blob. The Permissions API (Flask) provides GET and POST endpoints for reading and updating config. There is no server-side session; every page load re-fetches permissions from the API.'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '4.4 Data in Transit'),
        bullet('All public traffic is served over HTTPS via Apache2 with TLS termination'),
        bullet('Internal service communication (Apache \u2192 Cube.js, Apache \u2192 Flask) is over localhost HTTP'),
        bullet('Microsoft Fabric connection uses ODBC with Encrypt=yes and ActiveDirectoryPassword authentication'),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 5. Frontend Application ───────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '5. Frontend Application'),
        hr(),
        h(HeadingLevel.HEADING_2, '5.1 Technology Stack'),
        table(
          ['Library / Tool', 'Version', 'Purpose'],
          [
            ['React', '18.x', 'UI component framework'],
            ['Vite', '5.x', 'Build tool and dev server'],
            ['MSAL React', '2.x', 'Azure AD authentication'],
            ['Cube.js Client', 'latest', 'REST API queries to semantic layer'],
            ['PapaParse', 'latest', 'CSV parsing for file downloads'],
          ],
          [2400, 1600, 5360]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '5.2 Key Components'),
        blankLine(),
        table(
          ['Component / File', 'Responsibility'],
          [
            ['App.jsx', 'Main application: data loading, filter state, download orchestration, Admin routing'],
            ['AuthWrapper.jsx', 'MSAL authentication gate, RBAC resolution, login audit event'],
            ['AdminPage.jsx', 'Admin panel: user management, brand permissions, activity log viewer'],
            ['logger.js', 'Fire-and-forget audit event helper (POST /permissions-api/logs)'],
            ['brandPermissions.js', 'Async RBAC helpers: loadPermissions(), savePermissions(), getBrandAccess()'],
            ['authConfig.js', 'MSAL configuration (clientId, authority, redirectUri)'],
          ],
          [2800, 6560]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '5.3 Data Loading Flow'),
        bullet('User selects date range and applies filters (Brand, Region, Channel, Store Type, etc.)'),
        bullet('App sends two concurrent Cube.js queries: data page query (limit 50,000) + count query'),
        bullet('On success, rows are merged and stored in state. Filter dropdowns are populated dynamically from unique values in the result set'),
        bullet('Blank/null filter values are supported via a sentinel value (__blank__) that maps to Cube.js notSet operator'),
        bullet('Multi-select filter dropdowns support 30+ dimensions simultaneously'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '5.4 CSV Export'),
        bullet('User clicks "Download All" to export the full filtered dataset'),
        bullet('Data is fetched in pages of 50,000 rows until exhausted'),
        bullet('Each page is written as a separate CSV file using PapaParse'),
        bullet('Download is triggered via a temporary anchor element (no server involvement)'),
        bullet('Export event is logged to the audit log with file count, row count, and filter details'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '5.5 Build & Deployment'),
        table(
          ['Setting', 'Value', 'Reason'],
          [
            ['base (Vite)', '/downloadui/', 'App served at subpath — asset paths must be relative to /downloadui/'],
            ['build.target', 'esnext', 'Required for top-level await used by MSAL'],
            ['VITE_REDIRECT_PATH', '/downloadui (prod), empty (dev)', 'Appended to origin for Azure AD redirect URI'],
          ],
          [2400, 3600, 3360]
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 6. Audit Logging ─────────────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '6. Audit Logging'),
        hr(),
        h(HeadingLevel.HEADING_2, '6.1 Logged Events'),
        table(
          ['Event', 'Trigger', 'Details Captured'],
          [
            ['login', 'Successful Azure AD auth + RBAC resolution', 'User email, display name, allowed brands'],
            ['load_data', 'User clicks "Load Data" button', 'From/to date, active filter count, rows returned, duration (ms)'],
            ['csv_export', 'CSV download completes', 'From/to date, active filter count, total rows, number of files'],
          ],
          [1800, 3000, 4560]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '6.2 Implementation'),
        p('Audit events are written fire-and-forget from the React frontend. The logEvent() helper calls POST /permissions-api/logs asynchronously and silently ignores failures so the UI is never blocked.'),
        blankLine(),
        p('Events are stored in the audit_logs table in permissions.duckdb:'),
        blankLine(),
        table(
          ['Column', 'Type', 'Description'],
          [
            ['id', 'INTEGER', 'Auto-increment row identifier'],
            ['ts', 'TIMESTAMP', 'UTC timestamp of the event'],
            ['email', 'VARCHAR', 'User\'s Azure AD email address'],
            ['name', 'VARCHAR', 'User\'s display name'],
            ['action', 'VARCHAR', 'Event type: login | load_data | csv_export'],
            ['details', 'VARCHAR', 'JSON string with event-specific metadata'],
          ],
          [1600, 1600, 6160]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '6.3 Admin Logs Viewer'),
        p('The Admin Panel includes an Activity Log tab (AdminPage.jsx) with the following features:'),
        bullet('Paginated log table showing Timestamp, User, Email, Action, and Details'),
        bullet('Filter by action type (login / load_data / csv_export), user email, and date range'),
        bullet('Colour-coded action badges (green = login, blue = load data, orange = CSV export)'),
        bullet('Export filtered logs as CSV'),
        bullet('Clear all logs button with confirmation dialog'),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 7. Data Sync ──────────────────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '7. Data Synchronisation'),
        hr(),
        h(HeadingLevel.HEADING_2, '7.1 POS Sales Sync (fetch_pos_sales.py)'),
        bullet('Source: [prd].[FACT_FNO_SALES_TC_ONLINE_BASE] in Microsoft Fabric, joined with [Arvind_Analytics_Warehouse].[prd].[DIM_SAP_ITEM_MASTER]'),
        bullet('Strategy: DELETE + INSERT keyed on INVOICENO (preserves historical months, refreshes current month)'),
        bullet('Date window: Computed by SQL Server using GETDATE(). Current month by default; previous month on day-1 of the month'),
        bullet('Target table: fact_pos_ail_sales in data/fabric.duckdb'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '7.2 SAP Billing Sync (fetch_fabric.py)'),
        bullet('Source: [prd].[FACT_SAP_T_SINGLE_IR] in Microsoft Fabric'),
        bullet('Strategy: TRUNCATE + FULL LOAD (drop and recreate table)'),
        bullet('Target table: fact_sap_t_single_ir in data/fabric.duckdb'),
        blankLine(),
        h(HeadingLevel.HEADING_2, '7.3 Sync Constraints'),
        p('DuckDB enforces a single-writer constraint. Because Cube.js holds a write lock on fabric.duckdb while running, the sync scripts must be executed with Cube.js stopped:'),
        blankLine(),
        table(
          ['Step', 'Command', 'Purpose'],
          [
            ['1', 'docker compose down', 'Stop Cube.js — release DuckDB write lock'],
            ['2', 'python sync/fetch_pos_sales.py', 'Run ETL (may take 5\u201310 minutes for full month)'],
            ['3', 'docker compose up -d', 'Restart Cube.js with fresh data'],
          ],
          [800, 3200, 5360]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '7.4 Microsoft Fabric Connection'),
        table(
          ['Parameter', 'Value / Source'],
          [
            ['Driver', 'ODBC Driver 18 for SQL Server'],
            ['Authentication', 'ActiveDirectoryPassword (service account, no MFA)'],
            ['Host', 'CUBEJS_DB_HOST env var'],
            ['Database', 'CUBEJS_DB_NAME env var'],
            ['Credentials', 'CUBEJS_DB_USER + CUBEJS_DB_PASS env vars (from .env file)'],
            ['Encryption', 'Encrypt=yes; TrustServerCertificate=no'],
          ],
          [2800, 6560]
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 8. Deployment & Operations ────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '8. Deployment & Operations'),
        hr(),
        h(HeadingLevel.HEADING_2, '8.1 Deployment Workflow'),
        p('Code is managed in a Git repository. Changes are pushed from development machines and pulled on the VM:'),
        blankLine(),
        table(
          ['Step', 'Action'],
          [
            ['1', 'Developer commits and pushes to GitHub (main branch)'],
            ['2', 'SSH to VM: git pull origin main'],
            ['3', 'Frontend: cd frontend && npm install && npm run build'],
            ['4', 'Static files output to frontend/dist/ (served by Apache at /downloadui/)'],
            ['5', 'Backend changes: sudo systemctl restart permissions-api'],
            ['6', 'Cube.js schema changes: docker compose down && docker compose up -d'],
          ],
          [800, 8560]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '8.2 Service Management'),
        table(
          ['Service', 'Manager', 'Command'],
          [
            ['Cube.js', 'Docker Compose', 'docker compose up -d / down'],
            ['Permissions API', 'systemd', 'sudo systemctl start|stop|restart permissions-api'],
            ['Apache2', 'systemd', 'sudo systemctl reload apache2'],
          ],
          [2200, 2200, 4960]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '8.3 Environment Variables'),
        p('Sensitive configuration is stored in a .env file at the project root (excluded from Git). Key variables:'),
        blankLine(),
        table(
          ['Variable', 'Used By', 'Purpose'],
          [
            ['CUBEJS_DB_HOST', 'Cube.js + ETL scripts', 'Microsoft Fabric server hostname'],
            ['CUBEJS_DB_NAME', 'Cube.js + ETL scripts', 'Fabric database name'],
            ['CUBEJS_DB_USER', 'Cube.js + ETL scripts', 'Service account username'],
            ['CUBEJS_DB_PASS', 'Cube.js + ETL scripts', 'Service account password'],
            ['CUBEJS_API_SECRET', 'Cube.js', 'API authentication secret'],
            ['VITE_CUBE_API_URL', 'React frontend (build time)', 'Cube.js API base URL'],
            ['VITE_REDIRECT_PATH', 'React frontend (build time)', 'MSAL redirect URI suffix'],
          ],
          [2400, 2400, 4560]
        ),
        blankLine(),
        h(HeadingLevel.HEADING_2, '8.4 Monitoring & Logs'),
        table(
          ['Log Source', 'Command / Location'],
          [
            ['Cube.js logs', 'docker compose logs -f cube'],
            ['Permissions API logs', 'journalctl -u permissions-api -f'],
            ['Apache2 access log', '/var/log/apache2/access.log'],
            ['ETL sync output', '~/logs/sync.log (nohup redirect)'],
            ['Audit events', 'Admin Panel \u2192 Activity Log tab'],
          ],
          [3000, 6360]
        ),
        new Paragraph({ children: [new PageBreak()] }),

        // ── 9. Tech Stack Summary ─────────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '9. Technology Stack Summary'),
        hr(),
        table(
          ['Category', 'Technology', 'Version / Notes'],
          [
            ['Analytics Engine', 'Cube.js', 'Latest Docker image (cubejs/cube:latest)'],
            ['Columnar Database', 'DuckDB', 'Embedded, file-based (no server required)'],
            ['Source Database', 'Microsoft Fabric Warehouse', 'Azure cloud — accessed via ODBC'],
            ['ETL Language', 'Python', '3.10+ with pyodbc, pandas, duckdb libraries'],
            ['API Framework', 'Flask', '3.x with flask-cors'],
            ['Frontend Framework', 'React', '18.x with Vite 5.x build tooling'],
            ['Authentication', 'MSAL (Microsoft Auth Library)', 'OAuth2 / OpenID Connect via Azure AD'],
            ['Web Server', 'Apache2', '2.4 with mod_proxy, mod_rewrite'],
            ['Container Runtime', 'Docker / Docker Compose', 'Single-container Cube.js deployment'],
            ['Operating System', 'Ubuntu 22.04 LTS', 'Azure Virtual Machine'],
            ['Process Manager', 'systemd', 'Flask API service management'],
            ['Version Control', 'Git / GitHub', 'Main branch deployment workflow'],
          ],
          [2400, 2600, 4360]
        ),
        blankLine(),

        // ── 10. Known Constraints ─────────────────────────────────────────────
        h(HeadingLevel.HEADING_1, '10. Known Constraints & Considerations'),
        hr(),
        table(
          ['Constraint', 'Detail', 'Mitigation / Recommendation'],
          [
            ['DuckDB single writer', 'Cube.js holds a write lock on fabric.duckdb while running. ETL scripts cannot run concurrently', 'Stop Cube.js before sync. Consider scheduled maintenance window'],
            ['ETL sync scope', 'POS sync covers current month only (or prior month on day-1). Historical data is preserved but not re-synced', 'Run historical backfill manually if needed by modifying date range in SQL'],
            ['Single VM deployment', 'All services run on one VM — no HA or load balancing', 'Adequate for current usage; scale out to App Service + Azure Database if user count grows'],
            ['No server-side auth on Cube.js API', 'Cube.js API is accessible internally without token verification. Apache restricts external access', 'Add CUBEJS_API_SECRET token validation if direct external API access is a risk'],
            ['Permissions stored as JSON blob', 'The entire RBAC config is one JSON blob in DuckDB. Not suitable for large user counts', 'Migrate to row-per-user schema if user count exceeds ~200'],
            ['No automated sync scheduling', 'ETL scripts must be run manually (or via cron). No retry logic on failure', 'Implement cron job with email alerting on failure'],
          ],
          [2200, 3200, 3960]
        ),
        blankLine(), blankLine(),

        // End
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '\u2014 End of Document \u2014', size: 22, color: '888888', italics: true })],
          spacing: { before: 480, after: 0 },
        }),
      ],
    },
  ],
});

const outPath = path.join(__dirname, 'Arvind_Analytics_Technical_Document.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log('Document written to:', outPath);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
