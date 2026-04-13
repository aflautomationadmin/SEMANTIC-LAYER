"""
fetch_fabric.py — Full load from Microsoft Fabric Warehouse into DuckDB.

Strategy: TRUNCATE + LOAD every run (no date filtering, no upsert).
The table is dropped and recreated from scratch on each execution.

Usage (run from the SEMANTIC-LAYER folder):
    python sync/fetch_fabric.py

Writes to:  data/fabric.duckdb  →  table: fact_sap_t_single_ir
Requires:   ODBC Driver 18 for SQL Server installed on the Windows host.
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── ODBC connection (ActiveDirectoryPassword — no MFA required) ────────────
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

# ── Full-table fetch query (no WHERE clause) ───────────────────────────────
# Dates are cast to DATE to strip DATETIMEOFFSET — DuckDB stores them natively.
_SQL = """
SELECT top 10000
BILLING_DOC,
BILL_TYPE,
BILL_CREATION_DATE,
BILL_DATE,
PO__NO,
SALES_ORG,
DISTR_CHANNEL,
DIVISION,
CANCEL_STATUS,
EXCHANGE_RATE,
FROM_PLACE_OF_SUPPLY_CITY,
POSTING_STATUS,
SHIP_TO_PARTY,
SHIP_DESCRIPTION,
SHIP_TO_PARTY_CITY,
BILL_TO_PARTY,
SOLD_DESCRIPTION,
CUSTOMER,
CUST_FOLIO_CODE,
PAYER_NAME,
NAME_2,
NAME_3,
PAYER_CITY,
CUSTOMER_GSTIN,
PLANT_GSTIN,
REGION,
TAX_CLASS,
MAT_TYPE,
HSN,
PLANT,
ROLLOUT_SEASON,
POS_REFERENCE_NO,
LR_NO,
LR_DATE,
FORWARDING_AGENT,
BRAND_ID,
BRAND_DESCRIPTION,
BILLTYPDESCRIPTION,
SAP_DOC_NO,
REVENUE_GL,
BILL_TO_GSTIN,
DISPATCH_STATUS_TOTAL_GDS_MVT_STAT,
PAYEE,
PROFIT_CENTER,
ACTIVE_SEASON,
CUSTOMER_DISTR_CHANNEL,
BILL_TO_POSTAL_CODE,
SHIP_TO_POSTAL_CODE,
INCREFF_INVOICE_NUMBER,
FROM_PL_OF_SUPP_STATE,
TO_PLACE_OF_SUPPLY_CITY,
PLANT_CITY,
SHIP_STATE,
PLANT_PINCODE,
SHIP_ST_DATE,
SHIP_END_DATE,
CLASS_ATTRIBUTE,
-- Aggregated Fields
SUM(INVOICE_QUANTITY) AS INVOICE_QUANTITY,
SUM(MRP_VALUE) AS MRP_VALUE,
SUM(FIXED_PRICE) AS FIXED_PRICE,
SUM(BASE_MARGIN_YS60) AS BASE_MARGIN_YS60,
SUM(STO_VALUATION) AS STO_VALUATION,
SUM(BASE_MARGIN_Y007) AS BASE_MARGIN_Y007,
SUM(BASE_MARGIN_Y010_YAFL) AS BASE_MARGIN_Y010_YAFL,
SUM(BASE_MARGIN_Y014) AS BASE_MARGIN_Y014,
SUM(TOTAL_SPECIAL_MARGIN) AS TOTAL_SPECIAL_MARGIN,
SUM(SPECIAL_MARGIN_Y003) AS SPECIAL_MARGIN_Y003,
SUM(SPECIAL_MARGIN_Y006) AS SPECIAL_MARGIN_Y006,
SUM(SPECIAL_MARGIN_YGSR) AS SPECIAL_MARGIN_YGSR,
SUM(POS_MRP_VALUE) AS POS_MRP_VALUE,
SUM(COST_PRICE) AS COST_PRICE,
SUM(DISCOUNT1_YTRD) AS DISCOUNT1_YTRD,
SUM(DISCOUNT2_YODD) AS DISCOUNT2_YODD,
SUM(DISCOUNT3_YO15) AS DISCOUNT3_YO15,
SUM(REDUCTION) AS REDUCTION,
SUM(FRANCHISEE_MARGIN) AS FRANCHISEE_MARGIN,
SUM(TAXABLE_AMOUNT) AS TAXABLE_AMOUNT,
SUM(SGST_TAX_AMOUNT) AS SGST_TAX_AMOUNT,
AVG(SGST_TAX_RATE) AS SGST_TAX_RATE,
SUM(CGST_TAX_AMOUNT) AS CGST_TAX_AMOUNT,
AVG(CGST_TAX_RATE) AS CGST_TAX_RATE,
SUM(IGST_TAX_AMOUNT) AS IGST_TAX_AMOUNT,
AVG(IGST_TAX_RATE) AS IGST_TAX_RATE,
SUM(TOTAL_TAX) AS TOTAL_TAX,
SUM(TOTAL_AMOUNT) AS TOTAL_AMOUNT,
AVG(BASE_MARGIN_Y007_RATE) AS BASE_MARGIN_Y007_RATE,
AVG(BASE_MARGIN_Y010_RATE) AS BASE_MARGIN_Y010_RATE,
AVG(BASE_MARGIN_Y014_RATE) AS BASE_MARGIN_Y014_RATE,
AVG(BASE_MARGIN_YS60_RATE) AS BASE_MARGIN_YS60_RATE,
AVG(CGST_RATE) AS CGST_RATE,
AVG(IGST_RATE) AS IGST_RATE,
AVG(SGST_RATE) AS SGST_RATE,
AVG(SPECIAL_MARGIN_Y003_RATE) AS SPECIAL_MARGIN_Y003_RATE,
SUM(FRANCHISEE_REIMBURSEMENT_AMOUNT) AS FRANCHISEE_REIMBURSEMENT_AMOUNT,
SUM(CGST_PAY) AS CGST_PAY,
SUM(SGST_PAY) AS SGST_PAY,
SUM(IGST_PAY) AS IGST_PAY,
SUM(CGST_REC) AS CGST_REC,
SUM(SGST_REC) AS SGST_REC,
SUM(IGST_REC) AS IGST_REC
FROM [prd].[FACT_SAP_T_SINGLE_IR]
WHERE BILL_DATE BETWEEN '2026-03-01' AND '2026-03-31'
GROUP BY
BILLING_DOC,
BILL_TYPE,
BILL_CREATION_DATE,
BILL_DATE,
PO__NO,
SALES_ORG,
DISTR_CHANNEL,
DIVISION,
CANCEL_STATUS,
EXCHANGE_RATE,
FROM_PLACE_OF_SUPPLY_CITY,
POSTING_STATUS,
SHIP_TO_PARTY,
SHIP_DESCRIPTION,
SHIP_TO_PARTY_CITY,
BILL_TO_PARTY,
SOLD_DESCRIPTION,
CUSTOMER,
CUST_FOLIO_CODE,
PAYER_NAME,
NAME_2,
NAME_3,
PAYER_CITY,
CUSTOMER_GSTIN,
PLANT_GSTIN,
REGION,
TAX_CLASS,
MAT_TYPE,
HSN,
PLANT,
ROLLOUT_SEASON,
POS_REFERENCE_NO,
LR_NO,
LR_DATE,
FORWARDING_AGENT,
BRAND_ID,
BRAND_DESCRIPTION,
BILLTYPDESCRIPTION,
SAP_DOC_NO,
REVENUE_GL,
BILL_TO_GSTIN,
DISPATCH_STATUS_TOTAL_GDS_MVT_STAT,
PAYEE,
PROFIT_CENTER,
ACTIVE_SEASON,
CUSTOMER_DISTR_CHANNEL,
BILL_TO_POSTAL_CODE,
SHIP_TO_POSTAL_CODE,
INCREFF_INVOICE_NUMBER,
FROM_PL_OF_SUPP_STATE,
TO_PLACE_OF_SUPPLY_CITY,
PLANT_CITY,
SHIP_STATE,
PLANT_PINCODE,
SHIP_ST_DATE,
SHIP_END_DATE,
CLASS_ATTRIBUTE;
"""


def fetch_all() -> pd.DataFrame:
    """Fetch the entire table from Fabric Warehouse."""
    log.info(f"Connecting to Fabric: {DB_HOST}:{DB_PORT} / {DB_NAME}")
    conn = pyodbc.connect(_conn_str(), timeout=60)
    log.info("Fetching ALL rows from [prd].[FACT_SAP_T_SINGLE_IR] …")
    df = pd.read_sql(_SQL, conn)
    conn.close()
    log.info(f"Fetched {len(df):,} rows × {len(df.columns)} columns")
    return df


def truncate_and_load(df: pd.DataFrame) -> None:
    """Drop the existing table and reload it entirely from the DataFrame."""
    DUCKDB_PATH.parent.mkdir(parents=True, exist_ok=True)
    log.info(f"Opening DuckDB: {DUCKDB_PATH}")
    con = duckdb.connect(str(DUCKDB_PATH))

    log.info("Dropping existing table (if any) …")
    con.execute("DROP TABLE IF EXISTS fact_sap_t_single_ir")

    log.info("Creating table and loading all rows …")
    con.execute("""
        CREATE TABLE fact_sap_t_single_ir AS
        SELECT * FROM df
    """)

    total = con.execute(
        "SELECT COUNT(*) FROM fact_sap_t_single_ir"
    ).fetchone()[0]
    con.close()
    log.info(f"Load complete — {total:,} rows in fact_sap_t_single_ir")


def main() -> None:
    df = fetch_all()
    if df.empty:
        log.warning("No rows returned from Fabric — DuckDB unchanged.")
        sys.exit(0)
    truncate_and_load(df)
    log.info("Done ✓")


if __name__ == "__main__":
    main()
