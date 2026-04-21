"""
Permissions API — RBAC config, audit logs, and direct Fabric data endpoints.
Cube.js / DuckDB removed — all POS queries go to ui.V_D365_SALES on Fabric.
Runs on port 5001, proxied by Apache at /permissions-api/
"""
from flask import Flask, jsonify, request, send_file, make_response
from flask_cors import CORS
import duckdb
import pyodbc
import pandas as pd
import json
import os
import io
import zipfile
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

app  = Flask(__name__)
CORS(app)

# ── Permissions DB (DuckDB — unchanged) ───────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'permissions.duckdb')

# ── Fabric Warehouse (SQL Server / ODBC) ──────────────────────────────────
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

_FAB_HOST = os.environ.get('CUBEJS_DB_HOST', '')
_FAB_PORT = int(os.environ.get('CUBEJS_DB_PORT', 1433))
_FAB_DB   = os.environ.get('CUBEJS_DB_NAME', '')
_FAB_USER = os.environ.get('CUBEJS_DB_USER', '')
_FAB_PASS = os.environ.get('CUBEJS_DB_PASS', '')
_FAB_VIEW = 'ui.V_D365_SALES'


def _fab_conn():
    """Open a new ODBC connection to Microsoft Fabric. ODBC pool handles reuse."""
    return pyodbc.connect(
        f"Driver={{ODBC Driver 18 for SQL Server}};"
        f"Server={_FAB_HOST},{_FAB_PORT};Database={_FAB_DB};"
        "Authentication=ActiveDirectoryPassword;"
        f"UID={_FAB_USER};PWD={_FAB_PASS};"
        "Encrypt=yes;TrustServerCertificate=no;",
        timeout=120,
    )


# Whitelist of columns allowed in filters — prevents SQL injection
_ALLOWED_COLS = {
    'COMPANY','REGION','STATE','AIL_ORDER_STATE','CHANNEL','STORE_TYPE',
    'OWNERSHIP_TYPE','SAP_STORECODE','XSTORE_STORECODE','NAME','INVOICENO',
    'AIL_ORDER_ID','INVOICETYPE','DAY','EXTERNAL_SYSTEM','ISSALESORDERCREATED',
    'BRAND','SUBBRAND','DIVISION','CATEGORY','CLASS','SUBCLASS','SEASON',
    'COLOR','GENDER','SLEEVE','MATERIAL_TYPE','QUALITY','FIT_DESC','BASICCORE',
    'SUPPLIERSTYLE','STYLECODE','ITEM_ID','ITEM_DESCRIPTION','BARCODE','ITEMSIZE',
    'HSN_CODE','RPC','SCHEME_CODE','SCHEME_DESCRIPTION','MANUAL_DISC_REASON',
    'GSTNO','QC_PASSED','ORDERS','OMUNIITEMID',
}

# Columns fetched for the preview table and export
_DATA_COLS = [
    'COMPANY','REGION','STATE','AIL_ORDER_STATE','CHANNEL','STORE_TYPE',
    'OWNERSHIP_TYPE','SAP_STORECODE','XSTORE_STORECODE','NAME','INVOICENO',
    'AIL_ORDER_ID','CAST(INVOICE_DATE AS DATE) AS INVOICE_DATE','DAY',
    'BRAND','SUBBRAND','CLASS','SUBCLASS','SUPPLIERSTYLE','ITEMSIZE','QUALITY',
    'MATERIAL_TYPE','SEASON','COLOR','GENDER','BARCODE','SLEEVE','BASICCORE',
    'INVOICETYPE','ITEM_ID','STYLECODE','MANUAL_DISC_REASON',
    'EXTERNAL_SYSTEM','ORDERS','DIVISION','CATEGORY','FIT_DESC','ITEM_DESCRIPTION',
    'HSN_CODE','GSTNO','RPC','QC_PASSED','SCHEME_CODE','SCHEME_DESCRIPTION',
    'ISSALESORDERCREATED','OMUNIITEMID',
    'UNITMRP','QUANTITY','TOTAL_MRP','TOTAL_DISCOUNT','DISCOUNT_EXCL',
    'GST_REBATE','GWP_DISC','TAXABLE_AMOUNT','TAXRATE',
    'SGST','CGST','IGST','CESS','TAXAMT','NETAMT',
]


def _safe(val: str) -> str:
    """Escape a value for use inside SQL single-quoted string literals."""
    return str(val).replace("'", "''")


def _build_where(from_date, to_date, filters, text_filters, allowed_brands):
    """Build the SQL WHERE clause from filter dicts."""
    conds = [
        f"CAST(INVOICE_DATE AS DATE) >= '{_safe(from_date)}'",
        f"CAST(INVOICE_DATE AS DATE) <= '{_safe(to_date)}'",
    ]

    # RBAC brand restriction
    if allowed_brands:
        q = ', '.join(f"N'{_safe(b)}'" for b in allowed_brands)
        conds.append(f'BRAND IN ({q})')

    # Dropdown / multi-select filters
    for col, values in (filters or {}).items():
        col = col.upper()
        if col not in _ALLOWED_COLS:
            continue
        if col == 'BRAND' and allowed_brands:
            continue  # RBAC already applied above
        want_blank = '__blank__' in values
        non_blank  = [v for v in values if v != '__blank__']
        parts = []
        if non_blank:
            q = ', '.join(f"N'{_safe(v)}'" for v in non_blank)
            parts.append(f'{col} IN ({q})')
        if want_blank:
            parts.append(f"({col} IS NULL OR CAST({col} AS NVARCHAR(MAX)) = N'')")
        if parts:
            conds.append('(' + ' OR '.join(parts) + ')')

    # Text / contains filters
    for col, val in (text_filters or {}).items():
        col = col.upper()
        if col not in _ALLOWED_COLS or not str(val).strip():
            continue
        conds.append(
            f"LOWER(CAST({col} AS NVARCHAR(MAX))) LIKE N'%{_safe(str(val).lower())}%'"
        )

    return ' AND '.join(conds)

DEFAULT_CONFIG = {
    "admins": ["automation.admin@arvindfashions.com"],
    "brands": {
        "US POLO ASS.":   ["saifali.khan@arvindfashions.com"],
        "ARROW":          [],
        "FLYING MACHINE": [],
        "ASPOL FOOTWEAR": [],
        "AD BY ARVIND":   [],
        "COMMON BRAND":   [],
        "TOMMY HILFIGER": [],
        "CALVIN KLEIN":   [],
    }
}

def get_con():
    return duckdb.connect(DB_PATH)

def init_db():
    con = get_con()

    # Permissions table
    con.execute("""
        CREATE TABLE IF NOT EXISTS app_permissions (
            id      INTEGER PRIMARY KEY,
            config  VARCHAR
        )
    """)
    count = con.execute("SELECT COUNT(*) FROM app_permissions").fetchone()[0]
    if count == 0:
        con.execute(
            "INSERT INTO app_permissions VALUES (1, ?)",
            [json.dumps(DEFAULT_CONFIG)]
        )

    # Audit logs table
    con.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id      INTEGER,
            ts      TIMESTAMP,
            email   VARCHAR,
            name    VARCHAR,
            action  VARCHAR,
            details VARCHAR
        )
    """)

    con.close()

# ── Permissions endpoints ─────────────────────────────────────────────────

@app.route('/permissions', methods=['GET'])
def get_permissions():
    try:
        con = get_con()
        row = con.execute("SELECT config FROM app_permissions WHERE id = 1").fetchone()
        con.close()
        if row:
            return jsonify(json.loads(row[0]))
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(DEFAULT_CONFIG)

@app.route('/permissions', methods=['POST'])
def save_permissions():
    try:
        config = request.get_json()
        if not config:
            return jsonify({"error": "No data"}), 400
        con = get_con()
        con.execute(
            "UPDATE app_permissions SET config = ? WHERE id = 1",
            [json.dumps(config)]
        )
        con.close()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Audit log endpoints ───────────────────────────────────────────────────

@app.route('/logs', methods=['POST'])
def insert_log():
    try:
        body = request.get_json()
        if not body:
            return jsonify({"error": "No data"}), 400

        con = get_con()
        # Auto-increment id
        row = con.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM audit_logs").fetchone()
        next_id = row[0]
        now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

        con.execute(
            "INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
            [
                next_id,
                now,
                body.get('email', ''),
                body.get('name', ''),
                body.get('action', ''),
                json.dumps(body.get('details', {})),
            ]
        )
        con.close()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/logs', methods=['GET'])
def get_logs():
    try:
        limit      = int(request.args.get('limit', 200))
        offset     = int(request.args.get('offset', 0))
        action     = request.args.get('action', '')       # filter by action type
        email      = request.args.get('email', '')        # filter by user email
        from_date  = request.args.get('from_date', '')    # YYYY-MM-DD
        to_date    = request.args.get('to_date', '')      # YYYY-MM-DD

        conditions = []
        params     = []

        if action:
            conditions.append("action = ?")
            params.append(action)
        if email:
            conditions.append("LOWER(email) LIKE ?")
            params.append(f'%{email.lower()}%')
        if from_date:
            conditions.append("ts >= ?")
            params.append(from_date + ' 00:00:00')
        if to_date:
            conditions.append("ts <= ?")
            params.append(to_date + ' 23:59:59')

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        con = get_con()

        total = con.execute(
            f"SELECT COUNT(*) FROM audit_logs {where}", params
        ).fetchone()[0]

        rows = con.execute(
            f"SELECT id, ts, email, name, action, details FROM audit_logs {where} "
            f"ORDER BY ts DESC LIMIT ? OFFSET ?",
            params + [limit, offset]
        ).fetchall()

        con.close()

        logs = [
            {
                "id":      r[0],
                "ts":      str(r[1]),
                "email":   r[2],
                "name":    r[3],
                "action":  r[4],
                "details": json.loads(r[5]) if r[5] else {},
            }
            for r in rows
        ]

        return jsonify({"logs": logs, "total": total})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/logs', methods=['DELETE'])
def clear_logs():
    try:
        con = get_con()
        con.execute("DELETE FROM audit_logs")
        con.close()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Fabric data endpoints ─────────────────────────────────────────────────

@app.route('/data/load', methods=['POST'])
def data_load():
    """
    Preview — returns up to 50 000 rows from ui.V_D365_SALES on Fabric.
    Body: { from_date, to_date, filters, text_filters, allowed_brands, limit, count_only }
    """
    try:
        body           = request.get_json() or {}
        from_date      = body.get('from_date', '')
        to_date        = body.get('to_date', '')
        filters        = body.get('filters', {})
        text_filters   = body.get('text_filters', {})
        allowed_brands = body.get('allowed_brands', [])
        limit          = min(int(body.get('limit', 50_000)), 100_000)
        count_only     = body.get('count_only', False)

        if not from_date or not to_date:
            return jsonify({'error': 'from_date and to_date required'}), 400

        where = _build_where(from_date, to_date, filters, text_filters, allowed_brands)
        conn  = _fab_conn()

        if count_only:
            row = conn.execute(
                f'SELECT COUNT(*) FROM {_FAB_VIEW} WHERE {where}'
            ).fetchone()
            conn.close()
            return jsonify({'count': row[0]})

        cols = ', '.join(_DATA_COLS)
        sql  = (f'SELECT TOP {limit} {cols} FROM {_FAB_VIEW} '
                f'WHERE {where} ORDER BY INVOICE_DATE DESC')

        df = pd.read_sql(sql, conn)
        conn.close()

        if 'INVOICE_DATE' in df.columns:
            df['INVOICE_DATE'] = df['INVOICE_DATE'].astype(str)
        df = df.fillna('')

        return jsonify({'data': df.to_dict('records')})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/data/values', methods=['GET'])
def data_values():
    """
    Distinct values for one column — powers dropdown filters.
    Params: column, from_date, to_date, brand (repeatable)
    """
    try:
        column         = request.args.get('column', '').strip().upper()
        from_date      = request.args.get('from_date', '')
        to_date        = request.args.get('to_date', '')
        allowed_brands = request.args.getlist('brand')

        if column not in _ALLOWED_COLS:
            return jsonify({'error': f'Column not allowed: {column}'}), 400

        where = _build_where(from_date, to_date, {}, {}, allowed_brands)
        conn  = _fab_conn()

        rows = conn.execute(f"""
            SELECT DISTINCT CAST({column} AS NVARCHAR(500)) AS val
            FROM {_FAB_VIEW}
            WHERE {where}
              AND {column} IS NOT NULL
              AND CAST({column} AS NVARCHAR(500)) != N''
            ORDER BY val
        """).fetchall()

        blank_cnt = conn.execute(f"""
            SELECT COUNT(*) FROM {_FAB_VIEW}
            WHERE {where}
              AND ({column} IS NULL OR CAST({column} AS NVARCHAR(500)) = N'')
        """).fetchone()[0]

        conn.close()
        return jsonify({'values': [r[0] for r in rows], 'has_blank': blank_cnt > 0})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Export endpoint (ZIP direct from Fabric) ──────────────────────────────
_EXPORT_HEADERS = [
    'Company','Region','State','AIL Order State','Channel','Store Type',
    'Ownership Type','SAP Store Code','Xstore Code','Store Name','Invoice No',
    'AIL Order ID','Invoice Date','Day','Brand','Sub-Brand','Class','Sub-Class',
    'Supplier Style','Size','Quality','Material Type','Season','Color',
    'Gender','Barcode','Sleeve','Basic/Core','Invoice Type','Item ID','Style Code',
    'Line Seq','Manual Disc Reason','External System','Orders',
    'Division','Category','Fit Desc','Item Description','HSN Code','GST No',
    'RPC','QC Passed','Scheme Code','Scheme Description','SO Created',
    'OmniChannel Item ID','Unit MRP','Quantity','Total MRP','Total Discount',
    'Discount Excl.','GST Rebate','GWP Disc','Taxable Amount','Tax Rate',
    'SGST','CGST','IGST','CESS','Tax Amount','Net Amount',
]


@app.route('/export', methods=['GET'])
def export_data():
    """
    Full export — streams ZIP from Fabric ui.V_D365_SALES.
    Filter params: from_date, to_date, brand (RBAC), f_COLUMN=value (dropdown/text).
    """
    try:
        from_date      = request.args.get('from_date', '').strip()
        to_date        = request.args.get('to_date', '').strip()
        allowed_brands = request.args.getlist('brand')

        if not from_date or not to_date:
            return jsonify({'error': 'from_date and to_date required'}), 400

        # Rebuild filters from query params.
        # fd_COLUMN = dropdown multi-select (IN filter)
        # ft_COLUMN = text contains (LIKE filter)
        filters, text_filters = {}, {}
        for col in _ALLOWED_COLS:
            values = request.args.getlist(f'fd_{col}')
            if values:
                filters[col] = values
            val = request.args.get(f'ft_{col}', '').strip()
            if val:
                text_filters[col] = val

        where    = _build_where(from_date, to_date, filters, text_filters, allowed_brands)
        # filename uses the selected date range, e.g. pos_sales_2026-03-01_to_2026-03-31
        file_stem = f'pos_sales_{from_date}_to_{to_date}'
        cols_sql  = ', '.join(_DATA_COLS)
        sql       = f'SELECT {cols_sql} FROM {_FAB_VIEW} WHERE {where} ORDER BY INVOICE_DATE DESC'

        conn   = _fab_conn()
        cursor = conn.cursor()
        cursor.execute(sql)

        ROWS_PER_FILE = 1_000_000   # split into a new CSV every 1 million rows
        header_line   = (','.join(f'"{h}"' for h in _EXPORT_HEADERS) + '\n').encode('utf-8')

        # Build ZIP with CSV written in 10K-row chunks (low peak memory)
        zip_buf   = io.BytesIO()
        with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED,
                             compresslevel=6, allowZip64=True) as zf:
            part      = 1
            row_count = 0
            csv_out   = zf.open(f'{file_stem}_part{part}.csv', 'w', force_zip64=True)
            csv_out.write(header_line)

            while True:
                batch = cursor.fetchmany(10_000)
                if not batch:
                    break
                lines = [
                    ','.join(f'"{("" if v is None else str(v)).replace(chr(34), chr(34)*2)}"'
                             for v in row)
                    for row in batch
                ]
                csv_out.write(('\n'.join(lines) + '\n').encode('utf-8'))
                row_count += len(batch)

                # Roll over to a new file every 1 million rows
                if row_count >= ROWS_PER_FILE:
                    csv_out.close()
                    part     += 1
                    row_count = 0
                    csv_out   = zf.open(f'{file_stem}_part{part}.csv', 'w', force_zip64=True)
                    csv_out.write(header_line)

            csv_out.close()

        conn.close()

        # Read bytes so we can set Content-Length (enables real % progress in browser)
        zip_bytes = zip_buf.getvalue()
        response  = make_response(zip_bytes)
        response.headers['Content-Type']        = 'application/zip'
        response.headers['Content-Disposition'] = f'attachment; filename="{file_stem}.zip"'
        response.headers['Content-Length']      = str(len(zip_bytes))
        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5001)
