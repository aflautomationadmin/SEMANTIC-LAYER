"""
Permissions API — RBAC config, audit logs, and direct Fabric data endpoints.
Multi-portal: admins can register any Fabric view as a download portal with
its own column config and per-user access control.
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
import re
import traceback
import zipfile
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

app  = Flask(__name__)
CORS(app)

# ── Permissions DB (DuckDB) ───────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'permissions.duckdb')

# Single persistent connection + lock so only one thread touches DuckDB at a time.
# DuckDB files cannot be opened by two *processes* simultaneously; using a singleton
# inside this process avoids accidental double-opens from unclosed connections.
import threading as _threading
_db_lock = _threading.Lock()
_db_con: "duckdb.DuckDBPyConnection | None" = None

def get_con() -> "duckdb.DuckDBPyConnection":
    """Return the shared DuckDB connection, opening it if necessary."""
    global _db_con
    if _db_con is None:
        _db_con = duckdb.connect(DB_PATH)
    return _db_con

# ── Fabric Warehouse (SQL Server / ODBC) ──────────────────────────────────
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

_FAB_HOST = os.environ.get('CUBEJS_DB_HOST', '')
_FAB_PORT = int(os.environ.get('CUBEJS_DB_PORT', 1433))
_FAB_DB   = os.environ.get('CUBEJS_DB_NAME', '')
_FAB_USER = os.environ.get('CUBEJS_DB_USER', '')
_FAB_PASS = os.environ.get('CUBEJS_DB_PASS', '')


def _fab_conn():
    """Open a new ODBC connection to Microsoft Fabric."""
    return pyodbc.connect(
        f"Driver={{ODBC Driver 18 for SQL Server}};"
        f"Server={_FAB_HOST},{_FAB_PORT};Database={_FAB_DB};"
        "Authentication=ActiveDirectoryPassword;"
        f"UID={_FAB_USER};PWD={_FAB_PASS};"
        "Encrypt=yes;TrustServerCertificate=no;",
        timeout=120,
    )


def _safe(val: str) -> str:
    """Escape a value for SQL single-quoted string literals."""
    return str(val).replace("'", "''")


def _clean_kpi_text(val) -> str:
    """Uppercase text and remove special characters before Fabric insert."""
    text = '' if val is None else str(val).upper()
    text = text.replace('&', ' AND ')
    text = re.sub(r'[^A-Z0-9 ]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def _target_float(val):
    if val is None:
        return None
    text = str(val).strip()
    if not text:
        return None
    text = text.replace(',', '').replace('%', '')
    try:
        return float(text)
    except ValueError:
        return None


def _clean_kpi_month(val) -> str:
    text = '' if val is None else str(val).strip().upper()
    match = re.match(r'^(\d{4})[_ -]?(\d{2})$', text)
    if not match:
        return _clean_kpi_text(text)
    return f"{match.group(1)}_{match.group(2)}"


def _kpi_insert_sql() -> str:
    return """
        INSERT INTO prd.DIM_UI_KPI_TRACKER_THCK
            (KPT_CAT, KPI, [TARGET], BRAND, [MONTH], LOAD_RUN_DATE)
        VALUES (?, ?, ?, ?, ?, ?)
    """


def _kpi_verify_sql() -> str:
    return """
        SELECT COUNT(*)
        FROM prd.DIM_UI_KPI_TRACKER_THCK
        WHERE LOAD_RUN_DATE = ?
    """


def _kpi_existing_sql() -> str:
    return """
        SELECT KPT_CAT, KPI, [TARGET], BRAND, LOAD_RUN_DATE
        FROM prd.DIM_UI_KPI_TRACKER_THCK
        WHERE [MONTH] = ?
        ORDER BY LOAD_RUN_DATE
    """


def _kpi_value_key(brand, category, kpi) -> str:
    return '|'.join([
        _clean_kpi_text(brand),
        _clean_kpi_text(category),
        _clean_kpi_text(kpi),
    ])


def _kpi_template_key_map() -> dict:
    mapping = {}
    for sheet in FY27_KPI_TRACKER_PVH_TEMPLATE:
        for idx, row in enumerate(sheet.get('rows') or []):
            mapping[_kpi_value_key(sheet.get('brand'), row.get('category'), row.get('kpi'))] = f"{sheet.get('id')}::{idx}"
    return mapping


def _format_kpi_target(val) -> str:
    if val is None:
        return ''
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    return str(val)


def _valid_view_name(view: str) -> bool:
    """Allow only schema.ViewName format to prevent SQL injection."""
    return bool(re.match(r'^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$', view.strip()))


# ── Portal config helpers ─────────────────────────────────────────────────

def _load_portal(portal_id: str) -> dict:
    """Load a portal row from DB. Raises ValueError if not found."""
    with _db_lock:
        row = get_con().execute(
            "SELECT id, name, description, view_name, config FROM portals WHERE id=? AND is_active=TRUE",
            [portal_id]
        ).fetchone()
    if not row:
        raise ValueError(f"Portal not found: {portal_id}")
    return {
        "id":          row[0],
        "name":        row[1],
        "description": row[2],
        "view_name":   row[3],
        "config":      json.loads(row[4]),
    }


def _portal_allowed_cols(config: dict) -> set:
    """Build the SQL-injection whitelist from portal column config."""
    cols = {c['key'].upper() for c in config.get('columns', [])}
    for f in config.get('filters', []):
        cols.add(f['key'].upper())
    for c in _portal_restrict_cols(config):
        cols.add(c)
    return cols


def _portal_visible_cols(config: dict) -> list:
    """Columns selected for the final portal output."""
    return [c for c in config.get('columns', []) if c.get('show')]


def _portal_restrict_cols(config: dict) -> list:
    """Return configured row-restriction columns, preserving legacy restrict_col."""
    cols = config.get('restrict_cols')
    if not cols and config.get('restrict_col'):
        cols = [config.get('restrict_col')]
    return [str(c).strip().upper() for c in (cols or []) if str(c).strip()]


def _normalize_restrictions(config: dict, restrict_values) -> dict:
    """Normalize legacy list restrictions and new {column: values[]} restrictions."""
    restrict_cols = _portal_restrict_cols(config)
    if isinstance(restrict_values, dict):
        return {
            str(k).strip().upper(): [v for v in (vals or []) if str(v).strip()]
            for k, vals in restrict_values.items()
            if str(k).strip().upper() in restrict_cols
        }
    if restrict_cols and isinstance(restrict_values, list):
        vals = [v for v in restrict_values if str(v).strip()]
        return {restrict_cols[0]: vals} if vals else {}
    return {}


def _is_measure_col(col: dict) -> bool:
    """Measures are summarized; dimensions are grouped."""
    agg = (col.get('aggregate') or '').lower()
    return bool(agg in ('sum', 'avg', 'median', 'mode') or col.get('currency') or col.get('is_numeric'))


def _aggregate_for_col(col: dict) -> str:
    agg = (col.get('aggregate') or '').lower()
    if agg in ('sum', 'avg', 'median', 'mode'):
        return agg
    return 'sum' if col.get('currency') or col.get('is_numeric') else 'group'


def _col_expr(key: str, date_col: str) -> str:
    key = key.upper()
    return f'CAST({key} AS DATE)' if date_col and key == date_col.upper() else key


def _portal_query_parts(config: dict):
    """Build grouped SELECT metadata from the visible portal columns."""
    date_col = (config.get('date_col') or '').upper()
    dimensions, dimension_keys, measures, select_parts, headers, output = [], [], [], [], [], []

    for c in _portal_visible_cols(config):
        key = c['key'].upper()
        label = c.get('label') or key
        headers.append(label)
        if _is_measure_col(c):
            agg = _aggregate_for_col(c)
            measures.append({"key": key, "aggregate": agg})
            output.append({"type": "measure", "key": key, "aggregate": agg})
            if agg == 'avg':
                select_parts.append(f'AVG(TRY_CAST({key} AS FLOAT)) AS {key}')
            elif agg in ('median', 'mode'):
                select_parts.append(key)
            else:
                select_parts.append(f'SUM(TRY_CAST({key} AS FLOAT)) AS {key}')
        else:
            expr = _col_expr(key, date_col)
            dimensions.append(expr)
            dimension_keys.append(key)
            output.append({"type": "dimension", "key": key})
            select_parts.append(f'{expr} AS {key}')

    return {
        "select": select_parts,
        "dimensions": dimensions,
        "dimension_keys": dimension_keys,
        "measures": measures,
        "output": output,
        "headers": headers,
    }


def _join_on_dims(left_alias: str, right_alias: str, dim_keys: list) -> str:
    if not dim_keys:
        return "1=1"
    return " AND ".join(f"{left_alias}.{k} = {right_alias}.{k}" for k in dim_keys)


def _portal_select_sql(config: dict, view_name: str, where: str, limit=None, order=True) -> str:
    """Build summarized SELECT SQL for preview/export."""
    parts = _portal_query_parts(config)
    dim_exprs = parts["dimensions"]
    dim_keys = parts["dimension_keys"]
    measures = parts["measures"]
    top = f"TOP {limit} " if limit else ""

    if not parts["select"]:
        raise ValueError("No visible columns configured")

    # Dimension-only portals return distinct dimension rows.
    if dim_exprs and not measures:
        cols_sql = ', '.join(parts["select"])
        order_sql = f" ORDER BY {dim_exprs[0]}" if order else ""
        return f"SELECT DISTINCT {top}{cols_sql} FROM {view_name} WHERE {where}{order_sql}"

    # Simple aggregate path for SUM/AVG only.
    simple_aggs = {'sum': 'SUM', 'avg': 'AVG'}
    if measures and all(m["aggregate"] in simple_aggs for m in measures):
        select_dims = [f"{expr} AS {key}" for expr, key in zip(dim_exprs, dim_keys)]
        select_measures = [
            f"{simple_aggs[m['aggregate']]}(TRY_CAST({m['key']} AS FLOAT)) AS {m['key']}"
            for m in measures
        ]
        cols_sql = ', '.join(select_dims + select_measures)
        group_by = f" GROUP BY {', '.join(dim_exprs)}" if dim_exprs else ""
        order_col = dim_exprs[0] if dim_exprs else "1"
        order_sql = f" ORDER BY {order_col}" if order else ""
        return f"SELECT {top}{cols_sql} FROM {view_name} WHERE {where}{group_by}{order_sql}"

    # Window/CTE path for MEDIAN and MODE.
    base_cols = [f"{expr} AS {key}" for expr, key in zip(dim_exprs, dim_keys)]
    base_cols += [f"TRY_CAST({m['key']} AS FLOAT) AS {m['key']}" for m in measures]
    ctes = [f"base AS (SELECT {', '.join(base_cols)} FROM {view_name} WHERE {where})"]
    if dim_keys:
        ctes.append(f"groups AS (SELECT {', '.join(dim_keys)} FROM base GROUP BY {', '.join(dim_keys)})")
    else:
        ctes.append("groups AS (SELECT 1 AS __ONE)")

    joins = []
    grouped_aggs = [m for m in measures if m["aggregate"] in ('sum', 'avg')]
    if grouped_aggs:
        agg_select = [f"{m['aggregate'].upper()}({m['key']}) AS {m['key']}" for m in grouped_aggs]
        group_by = f" GROUP BY {', '.join(dim_keys)}" if dim_keys else ""
        prefix = f"{', '.join(dim_keys)}, " if dim_keys else ""
        ctes.append(f"agg AS (SELECT {prefix}{', '.join(agg_select)} FROM base{group_by})")
        joins.append(f"LEFT JOIN agg a ON {_join_on_dims('g', 'a', dim_keys)}")
    final_select_by_key = {k: f"g.{k}" for k in dim_keys}
    final_select_by_key.update({m["key"]: f"a.{m['key']}" for m in grouped_aggs})

    for m in measures:
        key = m["key"]
        if m["aggregate"] == "median":
            partition = f"PARTITION BY {', '.join(dim_keys)}" if dim_keys else ""
            prefix = f"{', '.join(dim_keys)}, " if dim_keys else ""
            ctes.append(
                f"med_{key} AS (SELECT DISTINCT {prefix}"
                f"PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY {key}) OVER ({partition}) AS {key} "
                f"FROM base WHERE {key} IS NOT NULL)"
            )
            joins.append(f"LEFT JOIN med_{key} med_{key} ON {_join_on_dims('g', f'med_{key}', dim_keys)}")
            final_select_by_key[key] = f"med_{key}.{key}"
        elif m["aggregate"] == "mode":
            prefix = f"{', '.join(dim_keys)}, " if dim_keys else ""
            group_by = f"{', '.join(dim_keys)}, {key}" if dim_keys else key
            partition = f"PARTITION BY {', '.join(dim_keys)} " if dim_keys else ""
            ctes.append(
                f"mode_count_{key} AS (SELECT {prefix}{key}, COUNT(*) AS cnt "
                f"FROM base WHERE {key} IS NOT NULL GROUP BY {group_by})"
            )
            ctes.append(
                f"mode_{key} AS (SELECT {prefix}{key} FROM (SELECT {prefix}{key}, "
                f"ROW_NUMBER() OVER ({partition}ORDER BY cnt DESC, {key}) AS rn "
                f"FROM mode_count_{key}) q WHERE rn=1)"
            )
            joins.append(f"LEFT JOIN mode_{key} mode_{key} ON {_join_on_dims('g', f'mode_{key}', dim_keys)}")
            final_select_by_key[key] = f"mode_{key}.{key}"

    order_col = f"g.{dim_keys[0]}" if dim_keys else "1"
    order_sql = f" ORDER BY {order_col}" if order else ""
    final_select = [final_select_by_key[c["key"]] for c in parts["output"]]
    return f"WITH {', '.join(ctes)} SELECT {top}{', '.join(final_select)} FROM groups g {' '.join(joins)}{order_sql}"


def _portal_count_sql(config: dict, view_name: str, where: str) -> str:
    parts = _portal_query_parts(config)
    if parts["dimensions"]:
        group_sql = ', '.join(parts["dimensions"])
        return f"SELECT COUNT(*) FROM (SELECT {group_sql} FROM {view_name} WHERE {where} GROUP BY {group_sql}) q"
    if parts["measures"]:
        return "SELECT 1"
    return f"SELECT COUNT(*) FROM {view_name} WHERE {where}"


def _portal_export_headers(config: dict) -> list:
    """Friendly CSV header names from portal column config."""
    return _portal_query_parts(config)["headers"]


def _build_where(from_date, to_date, filters, text_filters,
                 restrict_cols, restrict_values, date_col, allowed_cols):
    """Build SQL WHERE clause dynamically for any portal."""
    date_col = (date_col or '').upper()
    conds = []
    if date_col and from_date and to_date:
        conds.extend([
            f"CAST({date_col} AS DATE) >= '{_safe(from_date)}'",
            f"CAST({date_col} AS DATE) <= '{_safe(to_date)}'",
        ])

    restrict_cols = [c.upper() for c in (restrict_cols or [])]
    restrict_map = restrict_values if isinstance(restrict_values, dict) else {}

    # Row-level restrictions (e.g. BRAND + REGION)
    for col, values in restrict_map.items():
        col = col.upper()
        if col not in restrict_cols or col not in allowed_cols or not values:
            continue
        q = ', '.join(f"N'{_safe(v)}'" for v in values)
        conds.append(f'{col} IN ({q})')

    # Dropdown / multi-select filters (fd_ prefix from frontend)
    for col, values in (filters or {}).items():
        col = col.upper()
        if col not in allowed_cols:
            continue
        if col in restrict_map and restrict_map[col]:
            continue  # already applied above
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

    # Text / contains filters (ft_ prefix from frontend)
    for col, val in (text_filters or {}).items():
        col = col.upper()
        if col not in allowed_cols or not str(val).strip():
            continue
        conds.append(
            f"LOWER(CAST({col} AS NVARCHAR(MAX))) LIKE N'%{_safe(str(val).lower())}%'"
        )

    return ' AND '.join(conds) if conds else '1=1'


# ── POS Sales default portal config (migration seed) ─────────────────────
POS_SALES_DEFAULT_CONFIG = {
    "date_col": "INVOICE_DATE",
    "restrict_col": "BRAND",
    "groups": ["Store", "Invoice", "Product", "Scheme", "Tax", "Other"],
    "filters": [
        {"key": "COMPANY",             "label": "Company",             "type": "dropdown", "group": "Store"},
        {"key": "REGION",              "label": "Region",              "type": "dropdown", "group": "Store"},
        {"key": "STATE",               "label": "State",               "type": "dropdown", "group": "Store"},
        {"key": "AIL_ORDER_STATE",     "label": "AIL Order State",     "type": "dropdown", "group": "Store"},
        {"key": "CHANNEL",             "label": "Channel",             "type": "dropdown", "group": "Store"},
        {"key": "STORE_TYPE",          "label": "Store Type",          "type": "dropdown", "group": "Store"},
        {"key": "OWNERSHIP_TYPE",      "label": "Ownership Type",      "type": "dropdown", "group": "Store"},
        {"key": "SAP_STORECODE",       "label": "SAP Store Code",      "type": "text",     "group": "Store"},
        {"key": "XSTORE_STORECODE",    "label": "Xstore Code",         "type": "text",     "group": "Store"},
        {"key": "NAME",                "label": "Store Name",          "type": "text",     "group": "Store"},
        {"key": "INVOICENO",           "label": "Invoice No",          "type": "text",     "group": "Invoice"},
        {"key": "AIL_ORDER_ID",        "label": "AIL Order ID",        "type": "text",     "group": "Invoice"},
        {"key": "INVOICETYPE",         "label": "Invoice Type",        "type": "dropdown", "group": "Invoice"},
        {"key": "DAY",                 "label": "Day",                 "type": "dropdown", "group": "Invoice"},
        {"key": "EXTERNAL_SYSTEM",     "label": "External System",     "type": "dropdown", "group": "Invoice"},
        {"key": "ISSALESORDERCREATED", "label": "SO Created",          "type": "dropdown", "group": "Invoice"},
        {"key": "BRAND",               "label": "Brand",               "type": "dropdown", "group": "Product"},
        {"key": "SUBBRAND",            "label": "Sub-Brand",           "type": "dropdown", "group": "Product"},
        {"key": "DIVISION",            "label": "Division",            "type": "dropdown", "group": "Product"},
        {"key": "CATEGORY",            "label": "Category",            "type": "dropdown", "group": "Product"},
        {"key": "CLASS",               "label": "Class",               "type": "dropdown", "group": "Product"},
        {"key": "SUBCLASS",            "label": "Sub-Class",           "type": "dropdown", "group": "Product"},
        {"key": "SEASON",              "label": "Season",              "type": "dropdown", "group": "Product"},
        {"key": "COLOR",               "label": "Color",               "type": "dropdown", "group": "Product"},
        {"key": "GENDER",              "label": "Gender",              "type": "dropdown", "group": "Product"},
        {"key": "SLEEVE",              "label": "Sleeve",              "type": "dropdown", "group": "Product"},
        {"key": "MATERIAL_TYPE",       "label": "Material Type",       "type": "dropdown", "group": "Product"},
        {"key": "QUALITY",             "label": "Quality",             "type": "dropdown", "group": "Product"},
        {"key": "FIT_DESC",            "label": "Fit Desc",            "type": "dropdown", "group": "Product"},
        {"key": "BASICCORE",           "label": "Basic/Core",          "type": "dropdown", "group": "Product"},
        {"key": "SUPPLIERSTYLE",       "label": "Supplier Style",      "type": "text",     "group": "Product"},
        {"key": "STYLECODE",           "label": "Style Code",          "type": "text",     "group": "Product"},
        {"key": "ITEM_ID",             "label": "Item ID",             "type": "text",     "group": "Product"},
        {"key": "ITEM_DESCRIPTION",    "label": "Item Description",    "type": "text",     "group": "Product"},
        {"key": "BARCODE",             "label": "Barcode",             "type": "text",     "group": "Product"},
        {"key": "ITEMSIZE",            "label": "Size",                "type": "text",     "group": "Product"},
        {"key": "HSN_CODE",            "label": "HSN Code",            "type": "text",     "group": "Product"},
        {"key": "RPC",                 "label": "RPC",                 "type": "text",     "group": "Product"},
        {"key": "SCHEME_CODE",         "label": "Scheme Code",         "type": "text",     "group": "Scheme"},
        {"key": "SCHEME_DESCRIPTION",  "label": "Scheme Description",  "type": "text",     "group": "Scheme"},
        {"key": "MANUAL_DISC_REASON",  "label": "Manual Disc Reason",  "type": "dropdown", "group": "Scheme"},
        {"key": "GSTNO",               "label": "GST No",              "type": "text",     "group": "Tax"},
        {"key": "QC_PASSED",           "label": "QC Passed",           "type": "dropdown", "group": "Tax"},
        {"key": "ORDERS",              "label": "Orders",              "type": "text",     "group": "Other"},
        {"key": "OMUNIITEMID",         "label": "OmniChannel Item ID", "type": "text",     "group": "Other"},
    ],
    "columns": [
        {"key": "COMPANY",             "label": "Company",             "show": True,  "currency": False},
        {"key": "REGION",              "label": "Region",              "show": True,  "currency": False},
        {"key": "STATE",               "label": "State",               "show": True,  "currency": False},
        {"key": "AIL_ORDER_STATE",     "label": "AIL Order State",     "show": True,  "currency": False},
        {"key": "CHANNEL",             "label": "Channel",             "show": True,  "currency": False},
        {"key": "STORE_TYPE",          "label": "Store Type",          "show": True,  "currency": False},
        {"key": "OWNERSHIP_TYPE",      "label": "Ownership Type",      "show": True,  "currency": False},
        {"key": "SAP_STORECODE",       "label": "SAP Store Code",      "show": True,  "currency": False},
        {"key": "XSTORE_STORECODE",    "label": "Xstore Code",         "show": True,  "currency": False},
        {"key": "NAME",                "label": "Store Name",          "show": True,  "currency": False},
        {"key": "INVOICENO",           "label": "Invoice No",          "show": True,  "currency": False},
        {"key": "AIL_ORDER_ID",        "label": "AIL Order ID",        "show": True,  "currency": False},
        {"key": "INVOICE_DATE",        "label": "Invoice Date",        "show": True,  "currency": False},
        {"key": "DAY",                 "label": "Day",                 "show": True,  "currency": False},
        {"key": "BRAND",               "label": "Brand",               "show": True,  "currency": False},
        {"key": "SUBBRAND",            "label": "Sub-Brand",           "show": True,  "currency": False},
        {"key": "CLASS",               "label": "Class",               "show": True,  "currency": False},
        {"key": "SUBCLASS",            "label": "Sub-Class",           "show": True,  "currency": False},
        {"key": "SUPPLIERSTYLE",       "label": "Supplier Style",      "show": True,  "currency": False},
        {"key": "ITEMSIZE",            "label": "Size",                "show": True,  "currency": False},
        {"key": "QUALITY",             "label": "Quality",             "show": True,  "currency": False},
        {"key": "MATERIAL_TYPE",       "label": "Material Type",       "show": True,  "currency": False},
        {"key": "SEASON",              "label": "Season",              "show": True,  "currency": False},
        {"key": "COLOR",               "label": "Color",               "show": True,  "currency": False},
        {"key": "GENDER",              "label": "Gender",              "show": True,  "currency": False},
        {"key": "BARCODE",             "label": "Barcode",             "show": True,  "currency": False},
        {"key": "SLEEVE",              "label": "Sleeve",              "show": True,  "currency": False},
        {"key": "BASICCORE",           "label": "Basic/Core",          "show": True,  "currency": False},
        {"key": "INVOICETYPE",         "label": "Invoice Type",        "show": True,  "currency": False},
        {"key": "ITEM_ID",             "label": "Item ID",             "show": True,  "currency": False},
        {"key": "STYLECODE",           "label": "Style Code",          "show": True,  "currency": False},
        {"key": "MANUAL_DISC_REASON",  "label": "Manual Disc Reason",  "show": True,  "currency": False},
        {"key": "EXTERNAL_SYSTEM",     "label": "External System",     "show": True,  "currency": False},
        {"key": "ORDERS",              "label": "Orders",              "show": True,  "currency": False},
        {"key": "DIVISION",            "label": "Division",            "show": True,  "currency": False},
        {"key": "CATEGORY",            "label": "Category",            "show": True,  "currency": False},
        {"key": "FIT_DESC",            "label": "Fit Desc",            "show": True,  "currency": False},
        {"key": "ITEM_DESCRIPTION",    "label": "Item Description",    "show": True,  "currency": False},
        {"key": "HSN_CODE",            "label": "HSN Code",            "show": True,  "currency": False},
        {"key": "GSTNO",               "label": "GST No",              "show": True,  "currency": False},
        {"key": "RPC",                 "label": "RPC",                 "show": True,  "currency": False},
        {"key": "QC_PASSED",           "label": "QC Passed",           "show": True,  "currency": False},
        {"key": "SCHEME_CODE",         "label": "Scheme Code",         "show": True,  "currency": False},
        {"key": "SCHEME_DESCRIPTION",  "label": "Scheme Description",  "show": True,  "currency": False},
        {"key": "ISSALESORDERCREATED", "label": "SO Created",          "show": True,  "currency": False},
        {"key": "OMUNIITEMID",         "label": "OmniChannel Item ID", "show": True,  "currency": False},
        {"key": "UNITMRP",             "label": "Unit MRP",            "show": True,  "currency": True},
        {"key": "QUANTITY",            "label": "Quantity",            "show": True,  "currency": False},
        {"key": "TOTAL_MRP",           "label": "Total MRP",           "show": True,  "currency": True},
        {"key": "TOTAL_DISCOUNT",      "label": "Total Discount",      "show": True,  "currency": True},
        {"key": "DISCOUNT_EXCL",       "label": "Discount Excl.",      "show": True,  "currency": True},
        {"key": "GST_REBATE",          "label": "GST Rebate",          "show": True,  "currency": True},
        {"key": "GWP_DISC",            "label": "GWP Disc",            "show": True,  "currency": True},
        {"key": "TAXABLE_AMOUNT",      "label": "Taxable Amount",      "show": True,  "currency": True},
        {"key": "TAXRATE",             "label": "Tax Rate",            "show": True,  "currency": True},
        {"key": "SGST",                "label": "SGST",                "show": True,  "currency": True},
        {"key": "CGST",                "label": "CGST",                "show": True,  "currency": True},
        {"key": "IGST",                "label": "IGST",                "show": True,  "currency": True},
        {"key": "CESS",                "label": "CESS",                "show": True,  "currency": True},
        {"key": "TAXAMT",              "label": "Tax Amount",          "show": True,  "currency": True},
        {"key": "NETAMT",              "label": "Net Amount",          "show": True,  "currency": True},
    ],
}

# ── Permissions config default ────────────────────────────────────────────
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

FY27_KPI_TRACKER_PVH_TEMPLATE = [
    {
        "id": "KPI - 1_TH",
        "brand": "TOMMY HILFIGER",
        "title": "KPI - 1 TH",
        "target_label": "Apr'26 KPI Target",
        "rows": [
            {"category": "Financial", "kpi": "NSV (In Rs. Crs.)", "target": "Linked from source workbook"},
            {"category": "Financial", "kpi": "EBIDTA %", "target": "Linked from source workbook"},
            {"category": "Financial", "kpi": "Gross Margin (GP %)", "target": "Linked from source workbook"},
            {"category": "Financial", "kpi": "Discount %", "target": "Linked from source workbook"},
            {"category": "Financial", "kpi": "CBA %", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "Retail NSV (In Rs. Crs.)", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "LFL Growth %", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "Store Count", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "Store (Sq ft) in Lacs", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "SSPD (Sales per sq ft)", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "CBA (Retail) %", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "Markdown %", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "Conversion Rate %", "target": "Linked from source workbook"},
            {"category": "Retail", "kpi": "UPT (Units per Transaction)", "target": "WIP"},
            {"category": "Retail", "kpi": "ATV (Average Transaction Value)", "target": "WIP"},
            {"category": "Retail", "kpi": "Average MRP", "target": "WIP"},
            {"category": "Retail", "kpi": "ASP (Average Selling Price)", "target": "WIP"},
            {"category": "Digital", "kpi": "Digital NSV (In Rs. Crs.)", "target": "Linked from source workbook"},
            {"category": "Digital", "kpi": "Share of Digital B2C on Total Digital NSV %", "target": "Linked from source workbook"},
            {"category": "Digital", "kpi": "Digital CBA %", "target": "Linked from source workbook"},
            {"category": "Digital", "kpi": "Discount %", "target": "Linked from source workbook"},
            {"category": "Digital", "kpi": "CODB % (Cost of Doing Business)", "target": "Linked from source workbook"},
            {"category": "DTC", "kpi": "Share of DTC(Online + Retail) on Overall NSV %", "target": "Linked from source workbook"},
            {"category": "Dept. Store", "kpi": "NSV (In Rs. Crs.)", "target": "Linked from source workbook"},
            {"category": "Dept. Store", "kpi": "No. of Doors", "target": "Linked from source workbook"},
            {"category": "Dept. Store", "kpi": "Returns %", "target": ""},
            {"category": "MBO", "kpi": "NSV (In Rs. Crs.)", "target": "Linked from source workbook"},
            {"category": "MBO", "kpi": "CN % on MRP", "target": "Linked from source workbook"},
            {"category": "MBO", "kpi": "Returns %", "target": ""},
        ],
    },
    {
        "id": "KPI - 2_TH",
        "brand": "TOMMY HILFIGER",
        "title": "KPI - 2 TH",
        "target_label": "Apr'26 KPI Target",
        "rows": [
            {"category": "Operational Efficiency", "kpi": "Inventory Turns", "target": "Linked from source workbook"},
            {"category": "Operational Efficiency", "kpi": "Stock Aging (MUDA buckets incl. >2 yrs) (In Crs.)", "target": "0"},
            {"category": "Brand / Marketing", "kpi": "Total Ad Spend (% of NSV)", "target": "Linked from source workbook"},
            {"category": "Brand / Marketing", "kpi": "Brand vs Performance Media Mix (Ratio)", "target": ""},
            {"category": "Brand / Marketing", "kpi": "Customer Acquisition (#)", "target": "WIP"},
            {"category": "Brand / Marketing", "kpi": "Repeat Rate %", "target": "WIP"},
            {"category": "Sourcing", "kpi": "Share of CTM %", "target": "NA"},
            {"category": "Sourcing", "kpi": "Share of NOOS %", "target": "NA"},
            {"category": "Sourcing", "kpi": "OTIF %", "target": "NA"},
            {"category": "Sourcing", "kpi": "CTM Lead Time (Days)", "target": "NA"},
            {"category": "Merchandising", "kpi": "SKU Width", "target": "NA"},
            {"category": "Merchandising", "kpi": "Full Price Sell Through (FPST) %", "target": "NA"},
            {"category": "Merchandising", "kpi": "Full Season Sell Through (FSST) %", "target": "NA"},
            {"category": "Key Category Growth", "kpi": "Formal Shirts", "target": ""},
            {"category": "Key Category Growth (MRP Val)", "kpi": "Trousers", "target": ""},
            {"category": "Key Category Growth (MRP Val)", "kpi": "Sports Shirts", "target": ""},
            {"category": "Key Category Growth (MRP Val)", "kpi": "TShirt", "target": ""},
            {"category": "Key Category Growth (MRP Val)", "kpi": "Blazers", "target": ""},
            {"category": "Key Category Growth (MRP Val)", "kpi": "Suits", "target": ""},
            {"category": "Key Category Growth (MRP Val)", "kpi": "WW", "target": ""},
            {"category": "Key Category Growth (MRP Val)", "kpi": "Others", "target": ""},
            {"category": "Key Category Growth (MRP Val)", "kpi": "Total", "target": ""},
        ],
    },
    {
        "id": "KPI - 1_CK",
        "brand": "CALVIN KLEIN",
        "title": "KPI - 1 CK",
        "target_label": "Apr'26 KPI Target",
        "rows": [],
    },
    {
        "id": "KPI - 2_CK",
        "brand": "CALVIN KLEIN",
        "title": "KPI - 2 CK",
        "target_label": "Apr'26 KPI Target",
        "rows": [],
    },
]

FY27_KPI_TRACKER_PVH_TEMPLATE[2]["rows"] = [dict(r) for r in FY27_KPI_TRACKER_PVH_TEMPLATE[0]["rows"]]
FY27_KPI_TRACKER_PVH_TEMPLATE[3]["rows"] = [dict(r) for r in FY27_KPI_TRACKER_PVH_TEMPLATE[1]["rows"]]


# get_con() defined above as a singleton


def init_db():
    con = get_con()

    # ── Permissions table ──────────────────────────────────────────────
    con.execute("""
        CREATE TABLE IF NOT EXISTS app_permissions (
            id      INTEGER PRIMARY KEY,
            config  VARCHAR
        )
    """)
    if con.execute("SELECT COUNT(*) FROM app_permissions").fetchone()[0] == 0:
        con.execute("INSERT INTO app_permissions VALUES (1, ?)", [json.dumps(DEFAULT_CONFIG)])

    # ── Audit logs table ───────────────────────────────────────────────
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

    # ── Portals table ──────────────────────────────────────────────────
    con.execute("""
        CREATE TABLE IF NOT EXISTS portals (
            id          VARCHAR PRIMARY KEY,
            name        VARCHAR,
            description VARCHAR,
            view_name   VARCHAR,
            config      VARCHAR,
            created_at  TIMESTAMP,
            is_active   BOOLEAN DEFAULT TRUE
        )
    """)

    # ── Portal access table ────────────────────────────────────────────
    con.execute("""
        CREATE TABLE IF NOT EXISTS portal_access (
            portal_id        VARCHAR,
            email            VARCHAR,
            restrict_values  VARCHAR,
            PRIMARY KEY (portal_id, email)
        )
    """)

    con.execute("""
        CREATE TABLE IF NOT EXISTS kpi_inputs (
            id          INTEGER,
            ts          TIMESTAMP,
            portal_id   VARCHAR,
            period      VARCHAR,
            sheet_id    VARCHAR,
            brand       VARCHAR,
            category    VARCHAR,
            kpi         VARCHAR,
            target      VARCHAR,
            value       VARCHAR,
            remarks     VARCHAR,
            email       VARCHAR,
            name        VARCHAR
        )
    """)

    # ── Seed POS Sales portal if first boot ───────────────────────────
    if con.execute("SELECT COUNT(*) FROM portals").fetchone()[0] == 0:
        now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        con.execute(
            "INSERT INTO portals VALUES (?,?,?,?,?,?,?)",
            [
                'pos-sales',
                'POS Sales',
                'POS / AIL Sales Explorer — invoice line-item level data from Fabric',
                'ui.V_D365_SALES',
                json.dumps(POS_SALES_DEFAULT_CONFIG),
                now,
                True,
            ]
        )
        # Seed portal_access from existing brand permissions
        try:
            row = con.execute("SELECT config FROM app_permissions WHERE id=1").fetchone()
            if row:
                cfg = json.loads(row[0])
                for brand, users in cfg.get('brands', {}).items():
                    for email in users:
                        restrict = json.dumps([brand])
                        con.execute(
                            "INSERT OR IGNORE INTO portal_access VALUES (?,?,?)",
                            ['pos-sales', email.lower(), restrict]
                        )
        except Exception:
            pass

    if con.execute("SELECT COUNT(*) FROM portals WHERE id='fy27-kpi-tracker-pvh'").fetchone()[0] == 0:
        now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        con.execute(
            "INSERT INTO portals VALUES (?,?,?,?,?,?,?)",
            [
                'fy27-kpi-tracker-pvh',
                'FY27 KPI Tracker PVH',
                'Input portal for PVH FY27 KPI tracker values',
                'input.FY27_KPI_TRACKER_PVH',
                json.dumps({
                    "type": "kpi_input",
                    "template": "FY27_KPI_TRACKER_PVH",
                    "source_file": "FY27 KPI Tracker_PVH.xlsx",
                }),
                now,
                True,
            ]
        )

    # singleton — do not close


# ── Permissions endpoints ─────────────────────────────────────────────────

@app.route('/permissions', methods=['GET'])
def get_permissions():
    try:
        with _db_lock:
            con = get_con()
            row = con.execute("SELECT config FROM app_permissions WHERE id=1").fetchone()
        return jsonify(json.loads(row[0]) if row else DEFAULT_CONFIG)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/check-access', methods=['GET'])
def check_access():
    """
    Single endpoint the frontend calls at login to decide if a user is allowed in.
    Checks all three sources in order:
      1. app_permissions.admins  → allowed, is_admin=True
      2. app_permissions.brands  → allowed, brands=[...] (legacy)
      3. portal_access (any active portal) → allowed, is_admin=False
    Returns { allowed: bool, is_admin: bool, brands: [...] }
    """
    try:
        email = request.args.get('email', '').strip().lower()
        if not email:
            return jsonify({"allowed": False}), 400

        with _db_lock:
            con = get_con()

            # Load legacy app_permissions config
            row = con.execute("SELECT config FROM app_permissions WHERE id=1").fetchone()
            cfg = json.loads(row[0]) if row else DEFAULT_CONFIG

            # 1. Admin check
            if any(a.lower() == email for a in cfg.get('admins', [])):
                return jsonify({"allowed": True, "is_admin": True, "brands": []})

            # 2. Legacy brand check
            brands = [b for b, users in cfg.get('brands', {}).items()
                      if any(u.lower() == email for u in users)]
            if brands:
                return jsonify({"allowed": True, "is_admin": False, "brands": brands})

            # 3. Portal access check
            hit = con.execute("""
                SELECT 1 FROM portal_access pa
                JOIN portals p ON p.id = pa.portal_id
                WHERE p.is_active=TRUE AND LOWER(pa.email)=?
                LIMIT 1
            """, [email]).fetchone()
            if hit:
                return jsonify({"allowed": True, "is_admin": False, "brands": []})

        return jsonify({"allowed": False})
    except Exception as e:
        return jsonify({"error": str(e), "allowed": False}), 500


@app.route('/permissions', methods=['POST'])
def save_permissions():
    try:
        config = request.get_json()
        if not config:
            return jsonify({"error": "No data"}), 400
        with _db_lock:
            con = get_con()
            con.execute("UPDATE app_permissions SET config=? WHERE id=1", [json.dumps(config)])
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
        with _db_lock:
            con = get_con()
            next_id = con.execute("SELECT COALESCE(MAX(id),0)+1 FROM audit_logs").fetchone()[0]
            now     = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
            con.execute("INSERT INTO audit_logs VALUES (?,?,?,?,?,?)", [
                next_id, now,
                body.get('email', ''), body.get('name', ''),
                body.get('action', ''), json.dumps(body.get('details', {})),
            ])
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/logs', methods=['GET'])
def get_logs():
    try:
        limit     = int(request.args.get('limit', 200))
        offset    = int(request.args.get('offset', 0))
        action    = request.args.get('action', '')
        email     = request.args.get('email', '')
        from_date = request.args.get('from_date', '')
        to_date   = request.args.get('to_date', '')

        conditions, params = [], []
        if action:
            conditions.append("action=?"); params.append(action)
        if email:
            conditions.append("LOWER(email) LIKE ?"); params.append(f'%{email.lower()}%')
        if from_date:
            conditions.append("ts>=?"); params.append(from_date + ' 00:00:00')
        if to_date:
            conditions.append("ts<=?"); params.append(to_date + ' 23:59:59')

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        with _db_lock:
            con   = get_con()
            total = con.execute(f"SELECT COUNT(*) FROM audit_logs {where}", params).fetchone()[0]
            rows  = con.execute(
                f"SELECT id,ts,email,name,action,details FROM audit_logs {where} "
                f"ORDER BY ts DESC LIMIT ? OFFSET ?",
                params + [limit, offset]
            ).fetchall()

        logs = [{
            "id": r[0], "ts": str(r[1]), "email": r[2], "name": r[3],
            "action": r[4], "details": json.loads(r[5]) if r[5] else {},
        } for r in rows]
        return jsonify({"logs": logs, "total": total})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/logs', methods=['DELETE'])
def clear_logs():
    try:
        with _db_lock:
            get_con().execute("DELETE FROM audit_logs")
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Portal CRUD endpoints ─────────────────────────────────────────────────

@app.route('/kpi-template', methods=['GET'])
def get_kpi_template():
    """Return the FY27 KPI Tracker PVH input template."""
    try:
        portal_id = request.args.get('portal_id', 'fy27-kpi-tracker-pvh')
        portal = _load_portal(portal_id)
        if (portal.get('config') or {}).get('type') != 'kpi_input':
            return jsonify({"error": "Portal is not a KPI input portal"}), 400
        return jsonify({
            "portal_id": portal_id,
            "source_file": portal['config'].get('source_file'),
            "sheets": FY27_KPI_TRACKER_PVH_TEMPLATE,
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/kpi-inputs', methods=['GET'])
def get_kpi_inputs():
    """Return existing KPI targets for a month, keyed by template row."""
    try:
        portal_id = request.args.get('portal_id', 'fy27-kpi-tracker-pvh')
        period = _clean_kpi_month(request.args.get('period', ''))

        if not period:
            return jsonify({"error": "period is required"}), 400

        portal = _load_portal(portal_id)
        if (portal.get('config') or {}).get('type') != 'kpi_input':
            return jsonify({"error": "Portal is not a KPI input portal"}), 400

        key_map = _kpi_template_key_map()
        values = {}
        rows_loaded = 0

        conn = None
        try:
            conn = _fab_conn()
            cursor = conn.cursor()
            cursor.execute(_kpi_existing_sql(), [period])
            for category, kpi, target, brand, _load_run_date in cursor.fetchall():
                row_key = key_map.get(_kpi_value_key(brand, category, kpi))
                if row_key:
                    values[row_key] = _format_kpi_target(target)
                    rows_loaded += 1
        finally:
            if conn is not None:
                conn.close()

        return jsonify({
            "status": "ok",
            "period": period,
            "values": values,
            "rows_loaded": rows_loaded,
            "table": "prd.DIM_UI_KPI_TRACKER_THCK",
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        print("KPI Fabric load failed:", traceback.format_exc(), flush=True)
        return jsonify({
            "error": str(e),
            "table": "prd.DIM_UI_KPI_TRACKER_THCK",
            "hint": "Could not read existing KPI targets from Fabric for the selected month.",
        }), 500


@app.route('/kpi-inputs', methods=['POST'])
def save_kpi_inputs():
    """Persist KPI input rows entered through an input portal."""
    try:
        body = request.get_json() or {}
        portal_id = body.get('portal_id', 'fy27-kpi-tracker-pvh')
        period = str(body.get('period', '')).strip()
        entries = body.get('entries') or []

        if not period:
            return jsonify({"error": "period is required"}), 400
        if not entries:
            return jsonify({"error": "entries are required"}), 400

        portal = _load_portal(portal_id)
        if (portal.get('config') or {}).get('type') != 'kpi_input':
            return jsonify({"error": "Portal is not a KPI input portal"}), 400

        load_run_date = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        rows = []
        null_targets = 0
        for entry in entries:
            target = _target_float(entry.get('target'))
            if target is None:
                null_targets += 1
            rows.append([
                _clean_kpi_text(entry.get('category', '')),
                _clean_kpi_text(entry.get('kpi', '')),
                target,
                _clean_kpi_text(entry.get('brand', '')),
                _clean_kpi_month(period),
                _clean_kpi_text(load_run_date),
            ])

        if not rows:
            return jsonify({"error": "No KPI rows to save"}), 400

        brands = sorted({row[3] for row in rows if row[3]})
        if not brands:
            return jsonify({"error": "No brands found in KPI rows"}), 400

        conn = None
        try:
            conn = _fab_conn()
            conn.autocommit = True
            cursor = conn.cursor()
            brand_placeholders = ','.join(['?'] * len(brands))
            cursor.execute(
                f"""
                DELETE FROM prd.DIM_UI_KPI_TRACKER_THCK
                WHERE [MONTH] = ?
                  AND BRAND IN ({brand_placeholders})
                """,
                [_clean_kpi_month(period), *brands],
            )
            insert_sql = _kpi_insert_sql()
            try:
                cursor.fast_executemany = True
                cursor.executemany(insert_sql, rows)
            except Exception:
                cursor.fast_executemany = False
                for row in rows:
                    cursor.execute(insert_sql, row)
            cursor.execute(_kpi_verify_sql(), [load_run_date])
            verified = int(cursor.fetchone()[0])
        finally:
            if conn is not None:
                conn.close()

        return jsonify({
            "status": "ok",
            "saved": len(rows),
            "skipped": 0,
            "null_targets": null_targets,
            "verified": verified,
            "table": "prd.DIM_UI_KPI_TRACKER_THCK",
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        print("KPI Fabric insert failed:", traceback.format_exc(), flush=True)
        return jsonify({
            "error": str(e),
            "table": "prd.DIM_UI_KPI_TRACKER_THCK",
            "hint": "Check Fabric schema/table name, INSERT permission, ODBC credentials, and that CUBEJS_DB_NAME points to the warehouse containing the table.",
        }), 500


def _sync_portal_access(con, portal_id, access_list):
    """Replace all portal_access rows for portal_id with the given list."""
    con.execute("DELETE FROM portal_access WHERE portal_id=?", [portal_id])
    for entry in (access_list or []):
        email  = entry.get('email', '').strip().lower()
        values = entry.get('restrict_values', [])
        if email:
            con.execute(
                "INSERT INTO portal_access VALUES (?,?,?)",
                [portal_id, email, json.dumps(values)]
            )


@app.route('/portals/column-values', methods=['GET'])
def portal_column_values():
    """Get distinct values for any column in any Fabric view.
    Used by the portal wizard before a portal_id exists.
    Params: view (e.g. ui.V_MY_VIEW), column (e.g. BRAND)
    """
    try:
        view   = request.args.get('view',   '').strip()
        column = request.args.get('column', '').strip().upper()
        if not view or not column:
            return jsonify({"values": []})
        if not _valid_view_name(view):
            return jsonify({"error": "view must be schema.ViewName format"}), 400
        conn = _fab_conn()
        rows = conn.execute(f"""
            SELECT DISTINCT CAST({column} AS NVARCHAR(500)) AS val
            FROM {view}
            WHERE {column} IS NOT NULL
              AND CAST({column} AS NVARCHAR(500)) != N''
            ORDER BY val
        """).fetchall()
        conn.close()
        return jsonify({"values": [r[0] for r in rows]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals', methods=['GET'])
def list_portals():
    """List all portals (admin use)."""
    try:
        with _db_lock:
            con  = get_con()
            rows = con.execute(
                "SELECT id, name, description, view_name, config, created_at, is_active FROM portals ORDER BY created_at"
            ).fetchall()
            portals = []
            for r in rows:
                cfg = json.loads(r[4])
                user_count = con.execute(
                    "SELECT COUNT(*) FROM portal_access WHERE portal_id=?", [r[0]]
                ).fetchone()[0]
                portals.append({
                    "id": r[0], "name": r[1], "description": r[2],
                    "view_name": r[3], "config": cfg,
                    "created_at": str(r[5]), "is_active": r[6],
                    "user_count": user_count,
                    "restrict_col": cfg.get("restrict_col") or "",
                    "restrict_cols": _portal_restrict_cols(cfg),
                })
        return jsonify({"portals": portals})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals', methods=['POST'])
def create_portal():
    """Create a new portal."""
    try:
        body = request.get_json() or {}
        name = body.get('name', '').strip()
        if not name or not body.get('view_name'):
            return jsonify({"error": "name and view_name are required"}), 400
        if not _valid_view_name(body['view_name']):
            return jsonify({"error": "view_name must be schema.ViewName format"}), 400

        # Auto-generate slug from name if not provided
        pid = body.get('id', '').strip().lower().replace(' ', '-')
        if not pid:
            pid = re.sub(r'[^a-z0-9-]', '', name.lower().replace(' ', '-'))
        if not pid:
            pid = 'portal-' + datetime.utcnow().strftime('%Y%m%d%H%M%S')

        now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        with _db_lock:
            con = get_con()
            # Ensure unique id
            base, suffix = pid, 0
            while con.execute("SELECT 1 FROM portals WHERE id=?", [pid]).fetchone():
                suffix += 1
                pid = f"{base}-{suffix}"
            con.execute("INSERT INTO portals VALUES (?,?,?,?,?,?,?)", [
                pid, name, body.get('description', ''),
                body['view_name'], json.dumps(body.get('config', {})),
                now, True,
            ])
            _sync_portal_access(con, pid, body.get('access', []))
        return jsonify({"status": "ok", "id": pid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals/<portal_id>', methods=['PUT', 'PATCH'])
def update_portal(portal_id):
    """Update portal fields.
    PUT  — full update (name, description, view_name, config).
    PATCH — partial update; currently supports toggling is_active.
    """
    try:
        body = request.get_json() or {}
        with _db_lock:
            con = get_con()
            if request.method == 'PUT':
                con.execute(
                    "UPDATE portals SET name=?, description=?, view_name=?, config=? WHERE id=?",
                    [
                        body.get('name', ''), body.get('description', ''),
                        body.get('view_name', ''), json.dumps(body.get('config', {})),
                        portal_id,
                    ]
                )
                if 'access' in body:
                    _sync_portal_access(con, portal_id, body['access'])
            else:  # PATCH
                if 'is_active' in body:
                    con.execute(
                        "UPDATE portals SET is_active=? WHERE id=?",
                        [bool(body['is_active']), portal_id]
                    )
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals/<portal_id>', methods=['DELETE'])
def delete_portal(portal_id):
    """Delete a portal.
    ?permanent=true  — hard-delete the row + all portal_access rows.
    (default)        — soft-delete: sets is_active=FALSE.
    """
    try:
        permanent = request.args.get('permanent', '').lower() in ('1', 'true', 'yes')
        with _db_lock:
            con = get_con()
            if permanent:
                con.execute("DELETE FROM portal_access WHERE portal_id=?", [portal_id])
                con.execute("DELETE FROM portals WHERE id=?", [portal_id])
            else:
                con.execute("UPDATE portals SET is_active=FALSE WHERE id=?", [portal_id])
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals/<portal_id>/restrict-values', methods=['GET'])
def portal_restrict_values(portal_id):
    """Return distinct values for configured restriction columns."""
    try:
        portal      = _load_portal(portal_id)
        config      = portal['config']
        restrict_cols = _portal_restrict_cols(config)
        requested_col = request.args.get('column', '').strip().upper()
        if requested_col:
            restrict_cols = [c for c in restrict_cols if c == requested_col]
        if not restrict_cols:
            return jsonify({"values": [], "values_by_column": {}, "columns": []})

        view_name = portal['view_name']
        conn = _fab_conn()
        values_by_column = {}
        for restrict_col in restrict_cols:
            rows = conn.execute(f"""
                SELECT DISTINCT CAST({restrict_col} AS NVARCHAR(500)) AS val
                FROM {view_name}
                WHERE {restrict_col} IS NOT NULL
                  AND CAST({restrict_col} AS NVARCHAR(500)) != N''
                ORDER BY val
            """).fetchall()
            values_by_column[restrict_col] = [r[0] for r in rows]
        conn.close()
        first_col = restrict_cols[0] if restrict_cols else ""
        return jsonify({
            "values": values_by_column.get(first_col, []),
            "values_by_column": values_by_column,
            "columns": restrict_cols,
            "column": first_col,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals/<portal_id>/discover', methods=['GET'])
def discover_columns(portal_id):
    """Auto-detect columns from a Fabric view."""
    try:
        view = request.args.get('view', '').strip()
        if not view or not _valid_view_name(view):
            return jsonify({"error": "view must be schema.ViewName format"}), 400

        NUMERIC_TYPES = {-7, -6, -5, 2, 3, 4, 5, 6, 7, 8}  # pyodbc SQL type codes for numeric
        conn   = _fab_conn()
        cursor = conn.cursor()
        cursor.execute(f"SELECT TOP 0 * FROM {view}")
        columns = [{
            "key":      d[0],
            "label":    d[0].replace("_", " ").title(),
            "show":     True,
            "currency": False,
            "is_numeric": d[1] in NUMERIC_TYPES,
            "aggregate": "sum" if d[1] in NUMERIC_TYPES else "group",
            "filter":   "dropdown" if d[1] not in NUMERIC_TYPES else "none",
            "type":     "dropdown" if d[1] not in NUMERIC_TYPES else "none",
            "group":    "Other",
        } for d in cursor.description]
        conn.close()
        return jsonify({"columns": columns})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/my-portals', methods=['GET'])
def my_portals():
    """Return portals accessible to a user (admins get all)."""
    try:
        email = request.args.get('email', '').strip().lower()
        if not email:
            return jsonify({"error": "email required"}), 400

        with _db_lock:
            con = get_con()

            # Check if admin
            row = con.execute("SELECT config FROM app_permissions WHERE id=1").fetchone()
            cfg = json.loads(row[0]) if row else DEFAULT_CONFIG
            is_admin = any(a.lower() == email for a in cfg.get('admins', []))

            if is_admin:
                rows = con.execute(
                    "SELECT id, name, description, view_name, config FROM portals WHERE is_active=TRUE ORDER BY created_at"
                ).fetchall()
                portals = [{
                    "id": r[0], "name": r[1], "description": r[2],
                    "view_name": r[3], "config": json.loads(r[4]),
                    "restrict_values": [],
                    "is_admin": True,
                } for r in rows]
            else:
                rows = con.execute("""
                    SELECT p.id, p.name, p.description, p.view_name, p.config, pa.restrict_values
                    FROM portals p
                    JOIN portal_access pa ON pa.portal_id = p.id
                    WHERE p.is_active=TRUE AND LOWER(pa.email)=?
                    ORDER BY p.created_at
                """, [email]).fetchall()
                portals = [{
                    "id": r[0], "name": r[1], "description": r[2],
                    "view_name": r[3], "config": json.loads(r[4]),
                    "restrict_values": json.loads(r[5]) if r[5] else [],
                    "is_admin": False,
                } for r in rows]

        return jsonify({"portals": portals})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals/<portal_id>/access', methods=['GET'])
def get_portal_access(portal_id):
    """List all users with access to a portal."""
    try:
        with _db_lock:
            rows = get_con().execute(
                "SELECT email, restrict_values FROM portal_access WHERE portal_id=? ORDER BY email",
                [portal_id]
            ).fetchall()
        return jsonify({"access": [
            {"email": r[0], "restrict_values": json.loads(r[1]) if r[1] else []}
            for r in rows
        ]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals/<portal_id>/access', methods=['POST'])
def set_portal_access(portal_id):
    """Add or update a user's access to a portal."""
    try:
        body   = request.get_json() or {}
        email  = body.get('email', '').strip().lower()
        values = body.get('restrict_values', [])
        if not email:
            return jsonify({"error": "email required"}), 400

        with _db_lock:
            con = get_con()
            existing = con.execute(
                "SELECT email FROM portal_access WHERE portal_id=? AND LOWER(email)=?",
                [portal_id, email]
            ).fetchone()
            if existing:
                con.execute(
                    "UPDATE portal_access SET restrict_values=? WHERE portal_id=? AND LOWER(email)=?",
                    [json.dumps(values), portal_id, email]
                )
            else:
                con.execute(
                    "INSERT INTO portal_access VALUES (?,?,?)",
                    [portal_id, email, json.dumps(values)]
                )
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/portals/<portal_id>/access/<path:email>', methods=['DELETE'])
def remove_portal_access(portal_id, email):
    """Remove a user from a portal."""
    try:
        with _db_lock:
            get_con().execute(
                "DELETE FROM portal_access WHERE portal_id=? AND LOWER(email)=?",
                [portal_id, email.lower()]
            )
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Fabric data endpoints (portal-aware) ──────────────────────────────────

@app.route('/data/load', methods=['POST'])
def data_load():
    """
    Preview — returns up to 50 000 rows from a portal's Fabric view.
    Body: { portal_id, from_date, to_date, filters, text_filters,
            restrict_values, limit, count_only }
    """
    try:
        body            = request.get_json() or {}
        portal_id       = body.get('portal_id', 'pos-sales')
        from_date       = body.get('from_date', '')
        to_date         = body.get('to_date', '')
        filters         = body.get('filters', {})
        text_filters    = body.get('text_filters', {})
        restrict_values = body.get('restrict_values', [])
        limit           = min(int(body.get('limit', 50_000)), 100_000)
        count_only      = body.get('count_only', False)

        portal      = _load_portal(portal_id)
        config      = portal['config']
        view_name   = portal['view_name']
        date_col    = config.get('date_col')
        if date_col and (not from_date or not to_date):
            return jsonify({'error': 'from_date and to_date required'}), 400
        restrict_cols = _portal_restrict_cols(config)
        restrict_map = _normalize_restrictions(config, restrict_values)
        allowed_cols = _portal_allowed_cols(config)

        where = _build_where(
            from_date, to_date, filters, text_filters,
            restrict_cols, restrict_map, date_col, allowed_cols
        )
        conn = _fab_conn()

        if count_only:
            row = conn.execute(_portal_count_sql(config, view_name, where)).fetchone()
            conn.close()
            return jsonify({'count': row[0]})

        sql = _portal_select_sql(config, view_name, where, limit=limit)

        df = pd.read_sql(sql, conn)
        conn.close()

        date_col_upper = (date_col or '').upper()
        if date_col_upper and date_col_upper in df.columns:
            df[date_col_upper] = df[date_col_upper].astype(str)
        df = df.fillna('')

        return jsonify({'data': df.to_dict('records')})

    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/data/values', methods=['GET'])
def data_values():
    """
    Distinct values for one column — powers dropdown filters.
    Params: portal_id, column, from_date, to_date, restrict_values (repeatable)
    """
    try:
        portal_id       = request.args.get('portal_id', 'pos-sales')
        column          = request.args.get('column', '').strip().upper()
        from_date       = request.args.get('from_date', '')
        to_date         = request.args.get('to_date', '')
        restrict_values = request.args.getlist('restrict_value')
        restrict_values_json = request.args.get('restrict_values', '')
        if restrict_values_json:
            restrict_values = json.loads(restrict_values_json)

        portal      = _load_portal(portal_id)
        config      = portal['config']
        view_name   = portal['view_name']
        date_col    = config.get('date_col')
        restrict_cols = _portal_restrict_cols(config)
        restrict_map = _normalize_restrictions(config, restrict_values)
        allowed_cols = _portal_allowed_cols(config)

        if column not in allowed_cols:
            return jsonify({'error': f'Column not allowed: {column}'}), 400

        where = _build_where(
            from_date, to_date, {}, {},
            restrict_cols, restrict_map, date_col, allowed_cols
        )
        conn = _fab_conn()

        rows = conn.execute(f"""
            SELECT DISTINCT CAST({column} AS NVARCHAR(500)) AS val
            FROM {view_name}
            WHERE {where}
              AND {column} IS NOT NULL
              AND CAST({column} AS NVARCHAR(500)) != N''
            ORDER BY val
        """).fetchall()

        blank_cnt = conn.execute(f"""
            SELECT COUNT(*) FROM {view_name}
            WHERE {where}
              AND ({column} IS NULL OR CAST({column} AS NVARCHAR(500)) = N'')
        """).fetchone()[0]

        conn.close()
        return jsonify({'values': [r[0] for r in rows], 'has_blank': blank_cnt > 0})

    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/export', methods=['GET'])
def export_data():
    """
    Full export — streams ZIP from Fabric view.
    Params: portal_id, from_date, to_date, restrict_value (RBAC),
            fd_COLUMN (dropdown), ft_COLUMN (text contains)
    """
    try:
        portal_id       = request.args.get('portal_id', 'pos-sales')
        from_date       = request.args.get('from_date', '').strip()
        to_date         = request.args.get('to_date', '').strip()
        restrict_values = request.args.getlist('restrict_value')
        restrict_values_json = request.args.get('restrict_values', '')
        if restrict_values_json:
            restrict_values = json.loads(restrict_values_json)

        portal       = _load_portal(portal_id)
        config       = portal['config']
        view_name    = portal['view_name']
        date_col     = config.get('date_col')
        if date_col and (not from_date or not to_date):
            return jsonify({'error': 'from_date and to_date required'}), 400
        restrict_cols = _portal_restrict_cols(config)
        restrict_map = _normalize_restrictions(config, restrict_values)
        allowed_cols = _portal_allowed_cols(config)

        # Parse fd_ (dropdown IN) and ft_ (text LIKE) filter params
        filters, text_filters = {}, {}
        for col in allowed_cols:
            values = request.args.getlist(f'fd_{col}')
            if values:
                filters[col] = values
            val = request.args.get(f'ft_{col}', '').strip()
            if val:
                text_filters[col] = val

        where     = _build_where(
            from_date, to_date, filters, text_filters,
            restrict_cols, restrict_map, date_col, allowed_cols
        )
        file_stem = f'{portal_id}_{from_date}_to_{to_date}'
        headers   = _portal_export_headers(config)
        sql       = _portal_select_sql(config, view_name, where)

        conn   = _fab_conn()
        cursor = conn.cursor()
        cursor.execute(sql)

        ROWS_PER_FILE = 1_000_000
        header_line   = (','.join(f'"{h}"' for h in headers) + '\n').encode('utf-8')

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED,
                             compresslevel=6, allowZip64=True) as zf:
            part, row_count = 1, 0
            csv_out = zf.open(f'{file_stem}_part{part}.csv', 'w', force_zip64=True)
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
                if row_count >= ROWS_PER_FILE:
                    csv_out.close()
                    part += 1; row_count = 0
                    csv_out = zf.open(f'{file_stem}_part{part}.csv', 'w', force_zip64=True)
                    csv_out.write(header_line)

            csv_out.close()

        conn.close()
        zip_bytes = zip_buf.getvalue()
        response  = make_response(zip_bytes)
        response.headers['Content-Type']        = 'application/zip'
        response.headers['Content-Disposition'] = f'attachment; filename="{file_stem}.zip"'
        response.headers['Content-Length']      = str(len(zip_bytes))
        return response

    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5001)
