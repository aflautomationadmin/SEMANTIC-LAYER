"""
Permissions API — stores RBAC config + audit logs in permissions.duckdb
Runs on port 5001, proxied by Apache at /permissions-api/
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import duckdb
import json
import os
from datetime import datetime

app  = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'permissions.duckdb')

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

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5001)
