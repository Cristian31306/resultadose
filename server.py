from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os

app = Flask(__name__, static_folder='static')
CORS(app) # Habilitar CORS para evitar bloqueos en el VPS

DB_PATH = 'elecciones.db'

# Función de ayuda para asegurar que TODO sea string (previene errores de bytes)
def force_str(val):
    if val is None: return ""
    if isinstance(val, bytes):
        return val.decode('utf-8', errors='ignore')
    return str(val)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/config')
def get_config():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT CORNOMBRE FROM candidatos_resumen ORDER BY CORNOMBRE")
        corporaciones = sorted(list(set([force_str(row[0]) for row in cursor.fetchall()])))
        
        cursor.execute("SELECT DISTINCT MUNNOMBRE FROM candidatos_resumen ORDER BY MUNNOMBRE")
        municipios = sorted(list(set([force_str(row[0]) for row in cursor.fetchall()])))
        
        return jsonify({
            "corporaciones": corporaciones,
            "municipios": municipios
        })
    finally:
        conn.close()

@app.route('/api/candidates')
def get_candidates():
    q = request.args.get('q', '').upper()
    corp = request.args.get('corp', '').upper()
    mun = request.args.get('mun', '').upper()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        sql = "SELECT DISTINCT CANNOMBRE FROM candidatos_resumen WHERE 1=1"
        params = []
        
        if q:
            sql += " AND CANNOMBRE LIKE ?"
            params.append(f"%{q}%")
        if corp:
            sql += " AND CORNOMBRE = ?"
            params.append(corp)
        if mun:
            sql += " AND MUNNOMBRE = ?"
            params.append(mun)
        
        sql += " ORDER BY CANNOMBRE"
        if q: sql += " LIMIT 50"
        
        cursor.execute(sql, params)
        candidates = sorted(list(set([force_str(row[0]) for row in cursor.fetchall()])))
        return jsonify(candidates)
    finally:
        conn.close()

@app.route('/api/results')
def get_results():
    candidate = request.args.get('candidate', '').upper()
    corp = request.args.get('corp', '').upper()
    mun = request.args.get('mun', '').upper()
    
    if not candidate:
        return jsonify({"error": "Candidato no especificado"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        sql = "SELECT PUESNOMBRE, MESA, VOTOS FROM votos WHERE CANNOMBRE = ?"
        params = [candidate]
        if corp:
            sql += " AND CORNOMBRE = ?"
            params.append(corp)
        if mun:
            sql += " AND MUNNOMBRE = ?"
            params.append(mun)
        
        sql += " ORDER BY PUESNOMBRE, MESA"
        cursor.execute(sql, params)
        
        results = []
        for row in cursor.fetchall():
            results.append({
                "PUESNOMBRE": force_str(row["PUESNOMBRE"]),
                "MESA": force_str(row["MESA"]),
                "VOTOS": row["VOTOS"]
            })
        return jsonify(results)
    finally:
        conn.close()

if __name__ == '__main__':
    # Este bloque solo se usa para desarrollo local
    # En el VPS se usará Gunicorn
    app.run(host='0.0.0.0', port=8001, debug=True)
