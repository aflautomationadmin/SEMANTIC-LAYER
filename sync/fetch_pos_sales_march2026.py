"""
fetch_pos_sales_march2026.py — Backfill load for POS / AIL Sales: March 2026.

Strategy: DELETE invoices for the month then INSERT fresh data.
This preserves all other months already in fact_pos_ail_sales.

Usage (run from the SEMANTIC-LAYER folder):
    python sync/fetch_pos_sales_march2026.py

Writes to:  data/fabric.duckdb  →  table: fact_pos_ail_sales
Requires:   ODBC Driver 18 for SQL Server installed on the Windows host.
            Cube.js must be STOPPED before running (DuckDB single-writer constraint).
"""

import os
import sys
import logging
from pathlib import Path

import pyodbc
import duckdb
import pandas as pd
from dotenv import load_dotenv

# ── Config ─────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DB_HOST     = os.environ["CUBEJS_DB_HOST"]
DB_PORT     = int(os.environ.get("CUBEJS_DB_PORT", 1433))
DB_NAME     = os.environ["CUBEJS_DB_NAME"]
DB_USER     = os.environ["CUBEJS_DB_USER"]
DB_PASS     = os.environ["CUBEJS_DB_PASS"]
DUCKDB_PATH = BASE_DIR / "data" / "fabric.duckdb"

FROM_DATE = "2026-03-01"
TO_DATE   = "2026-03-31"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


def _conn_str() -> str:
    return (
        f"Driver={{ODBC Driver 18 for SQL Server}};"
        f"Server={DB_HOST},{DB_PORT};"
        f"Database={DB_NAME};"
        "Authentication=ActiveDirectoryPassword;"
        f"UID={DB_USER};"
        f"PWD={DB_PASS};"
        "Encrypt=yes;"
        "TrustServerCertificate=no;"
    )


_SQL = f"""
SELECT
    f.COMPANY,
    f.REGION,
    f.STATE,
    f.AIL_ORDER_STATE,
    f.CHANNEL,
    f.STORE_TYPE,
    f.OWNERSHIP_TYPE,
    f.SAP_STORECODE,
    f.XSTORE_STORECODE,
    f.NAME,
    f.INVOICENO,
    f.AIL_ORDER_ID,
    CAST(f.INVOICE_DATE AS DATE)    AS INVOICE_DATE,
    f.DAY,
    f.BRAND,
    f.SUBBRAND,
    f.CLASS,
    f.SUBCLASS,
    f.SUPPLIERSTYLE,
    f.ITEMSIZE,
    f.QUALITY,
    f.MATERIAL_TYPE,
    f.SEASON,
    f.COLOR,
    f.GENDER,
    f.BARCODE,
    f.SLEEVE,
    NULL                            AS BASICCORE,
    f.INVOICETYPE,
    f.ITEM_ID,
    f.STYLECODE,
    f.RTRANS_LINEITM_SEQ,
    f.MANUAL_DISC_REASON,
    f.EXTERNAL_SYSTEM,
    f.ORDERS,
    d.DIVISION,
    d.CATEGORY,
    d.FIT_DESC,
    f.ITEM_DESCRIPTION,
    f.HSN_CODE,
    f.GSTNO,
    f.RPC,
    f.QC_PASSED,
    f.SCHEME_CODE,
    f.SCHEME_DESCRIPTION,
    f.ISSALESORDERCREATED,
    f.OMUNIITEMID,
    -- Measures
    SUM(f.UNITMRP)                                                  AS UNITMRP,
    SUM(f.QUANTITY)                                                 AS QUANTITY,
    SUM(f.TOTAL_MRP)                                                AS TOTAL_MRP,
    SUM(f.DISCOUNT)                                                 AS TOTAL_DISCOUNT,
    SUM(
        ISNULL(f.DISCOUNT, 0)
        - ISNULL(f.GST_REBATE, 0)
        - ISNULL(f.GWP_DISC, 0)
    )                                                               AS DISCOUNT_EXCL,
    SUM(CAST(f.GST_REBATE AS FLOAT))                                AS GST_REBATE,
    SUM(CAST(f.GWP_DISC AS FLOAT))                                  AS GWP_DISC,
    SUM(f.TAXABLE_AMOUNT)                                           AS TAXABLE_AMOUNT,
    SUM(f.TAXRATE)                                                  AS TAXRATE,
    SUM(f.SGST)                                                     AS SGST,
    SUM(f.CGST)                                                     AS CGST,
    SUM(f.IGST)                                                     AS IGST,
    SUM(f.CESS)                                                     AS CESS,
    SUM(f.TAXAMT)                                                   AS TAXAMT,
    SUM(f.NETAMT)                                                   AS NETAMT

FROM [prd].[FACT_FNO_SALES_TC_ONLINE_BASE] f
LEFT JOIN (
    SELECT DISTINCT ARTICLE, DIVISION, CATEGORY, FIT_DESC
    FROM [Arvind_Analytics_Warehouse].[prd].[DIM_SAP_ITEM_MASTER]
) d ON f.SUPPLIERSTYLE = d.ARTICLE

WHERE
    f.INVOICENO IS NOT NULL
    AND CAST(f.INVOICE_DATE AS DATE) >= '{FROM_DATE}'
    AND CAST(f.INVOICE_DATE AS DATE) <= '{TO_DATE}'

GROUP BY
    f.COMPANY, f.REGION, f.STATE, f.AIL_ORDER_STATE, f.CHANNEL,
    f.STORE_TYPE, f.OWNERSHIP_TYPE, f.SAP_STORECODE, f.XSTORE_STORECODE,
    f.NAME, f.INVOICENO, f.AIL_ORDER_ID,
    CAST(f.INVOICE_DATE AS DATE),
    f.DAY, f.BRAND, f.SUBBRAND, f.CLASS, f.SUBCLASS, f.SUPPLIERSTYLE,
    f.ITEMSIZE, f.QUALITY, f.MATERIAL_TYPE, f.SEASON, f.COLOR, f.GENDER,
    f.BARCODE, f.SLEEVE, f.INVOICETYPE, f.ITEM_ID, f.STYLECODE,
    f.RTRANS_LINEITM_SEQ,
    f.MANUAL_DISC_REASON, f.EXTERNAL_SYSTEM, f.ORDERS,
    d.DIVISION, d.CATEGORY, d.FIT_DESC,
    f.ITEM_DESCRIPTION, f.HSN_CODE, f.GSTNO, f.RPC, f.QC_PASSED,
    f.SCHEME_CODE, f.SCHEME_DESCRIPTION, f.ISSALESORDERCREATED, f.OMUNIITEMID
"""


def fetch_all() -> pd.DataFrame:
    log.info(f"Connecting to Fabric: {DB_HOST}:{DB_PORT} / {DB_NAME}")
    conn = pyodbc.connect(_conn_str(), timeout=60)
    log.info(f"Fetching POS sales for {FROM_DATE} to {TO_DATE} …")
    df = pd.read_sql(_SQL, conn)
    conn.close()
    log.info(f"Fetched {len(df):,} rows × {len(df.columns)} columns")
    return df


def delete_and_insert(df: pd.DataFrame) -> None:
    """Delete by date range + by INVOICENO, then insert fresh data.

    Two-pass delete ensures clean data even if an invoice spans month
    boundaries or was partially loaded in a previous run:
      Pass 1 — remove every row whose INVOICE_DATE falls in the target month.
      Pass 2 — remove any remaining rows whose INVOICENO appears in this fetch
               (catches stale copies outside the date window).
    """
    DUCKDB_PATH.parent.mkdir(parents=True, exist_ok=True)
    log.info(f"Opening DuckDB: {DUCKDB_PATH}")
    con = duckdb.connect(str(DUCKDB_PATH))

    # Create table on first run (schema inferred from DataFrame)
    con.execute("""
        CREATE TABLE IF NOT EXISTS fact_pos_ail_sales AS
        SELECT * FROM df WHERE false
    """)

    # Pass 1 — delete by date range
    log.info(f"Pass 1 — deleting rows with INVOICE_DATE {FROM_DATE} to {TO_DATE} …")
    deleted_date = con.execute(f"""
        DELETE FROM fact_pos_ail_sales
        WHERE INVOICE_DATE >= '{FROM_DATE}'
          AND INVOICE_DATE <= '{TO_DATE}'
    """).rowcount
    log.info(f"  Removed {deleted_date:,} rows by date range")

    # Pass 2 — delete by INVOICENO (catches any stragglers outside the date window)
    invoice_nos = df['INVOICENO'].dropna().unique().tolist()
    log.info(f"Pass 2 — deleting {len(invoice_nos):,} invoice numbers (any remaining) …")
    deleted_inv = con.execute("""
        DELETE FROM fact_pos_ail_sales
        WHERE INVOICENO IN (SELECT INVOICENO FROM df)
    """).rowcount
    log.info(f"  Removed {deleted_inv:,} additional rows by INVOICENO")

    # Insert fresh rows
    log.info("Inserting fetched rows …")
    con.execute("INSERT INTO fact_pos_ail_sales SELECT * FROM df")

    total = con.execute(
        "SELECT COUNT(*) FROM fact_pos_ail_sales"
    ).fetchone()[0]
    con.close()
    log.info(f"Load complete — {total:,} total rows in fact_pos_ail_sales")


def main() -> None:
    log.info(f"=== POS Sales backfill: {FROM_DATE} to {TO_DATE} ===")
    df = fetch_all()
    if df.empty:
        log.warning("No rows returned — DuckDB unchanged.")
        sys.exit(0)
    delete_and_insert(df)
    log.info("Done ✓")


if __name__ == "__main__":
    main()
