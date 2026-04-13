"""
Permissions API — stores RBAC config in permissions.duckdb
Runs on port 5001, proxied by Apache at /permissions-api/
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import duckdb
import json
import os

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
    con.close()

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

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5001)
