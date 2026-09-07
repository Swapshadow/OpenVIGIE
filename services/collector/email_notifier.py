"""Encrypted SMTP configuration, notification outbox and HTTP API.

SMTP exceptions are deliberately never logged or returned to callers.
"""
import base64
import hashlib
import json
import os
import re
import smtplib
import ssl
import sqlite3
import threading
import time
from email.message import EmailMessage
from urllib.parse import urlparse, parse_qs
from cryptography.fernet import Fernet

SEND_LOCK = threading.Lock()
PUBLIC_FIELDS = ('provider', 'host', 'port', 'security', 'username', 'sender', 'enabled')


def cipher():
    secret = os.environ.get('OPENVIGIE_SECRET_KEY', '')
    if len(secret) < 32:
        raise ValueError('OPENVIGIE_SECRET_KEY doit contenir au moins 32 caractères.')
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def initialize(connection):
    connection.executescript('''
      CREATE TABLE IF NOT EXISTS email_config (
        id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL,
        host TEXT NOT NULL, port INTEGER NOT NULL, security TEXT NOT NULL,
        username TEXT NOT NULL, sender TEXT NOT NULL, enabled INTEGER NOT NULL,
        password_encrypted TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS email_recipients (
        id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY, equipment TEXT NOT NULL, cve_id TEXT NOT NULL,
        severity TEXT NOT NULL, product TEXT NOT NULL, advisory_url TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0, email_sent INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, next_attempt INTEGER NOT NULL DEFAULT 0,
        UNIQUE(equipment, cve_id));
      CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(read, id);
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        notification_id INTEGER NOT NULL, recipient TEXT NOT NULL,
        PRIMARY KEY(notification_id, recipient));
    ''')

    columns = {row[1] for row in connection.execute('PRAGMA table_info(notifications)')}
    if 'confidence' not in columns:
        connection.execute("ALTER TABLE notifications ADD COLUMN confidence TEXT NOT NULL DEFAULT 'low_confidence'")
        # Existing records have no applicability evidence. Recheck before emailing.
        tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'monitored_queries' in tables:
            connection.execute('UPDATE monitored_queries SET next_refresh=0')


def config(connection):
    row = connection.execute('SELECT * FROM email_config WHERE id=1').fetchone()
    return dict(row) if row else None


def public_config(connection):
    stored = config(connection)
    result = {k: stored[k] for k in PUBLIC_FIELDS} if stored else None
    if result:
        result['has_password'] = bool(stored['password_encrypted'])
    return {'config': result, 'secret_key_configured': len(os.environ.get('OPENVIGIE_SECRET_KEY', '')) >= 32}


def address(value):
    if not isinstance(value, str) or len(value) > 254 or not re.fullmatch(r'[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+', value):
        raise ValueError('Adresse email invalide.')
    return value


def validated(payload, previous):
    result = {}
    for key in ('provider', 'host', 'security', 'username', 'sender'):
        value = payload.get(key, '')
        if not isinstance(value, str) or len(value) > 254 or any(c in value for c in '\r\n\x00'):
            raise ValueError('Configuration SMTP invalide.')
        result[key] = value.strip()
    if result['provider'] not in ('Gmail', 'Proton', 'Outlook', 'Personnalisé') or result['security'] not in ('starttls', 'ssl'):
        raise ValueError('Fournisseur ou mode TLS invalide.')
    if not re.fullmatch(r'[a-zA-Z0-9_.:-]+', result['host']) or not result['username']:
        raise ValueError('Serveur et identifiant SMTP requis.')
    if type(payload.get('port')) is not int or not 1 <= payload['port'] <= 65535:
        raise ValueError('Port SMTP invalide.')
    if type(payload.get('enabled')) is not bool:
        raise ValueError('Activation invalide.')
    result.update(port=payload['port'], enabled=int(payload['enabled']))
    address(result['sender'])
    password = payload.get('password', '')
    if not isinstance(password, str) or len(password) > 4096:
        raise ValueError('Mot de passe invalide.')
    if not password and previous and any(result[k] != previous[k] for k in ('host', 'port', 'security', 'username')):
        raise ValueError('Saisissez le mot de passe pour ce nouveau serveur SMTP.')
    fernet = cipher()
    result['password_encrypted'] = fernet.encrypt(password.encode()).decode() if password else (previous or {}).get('password_encrypted', '')
    if not result['password_encrypted']:
        raise ValueError('Mot de passe SMTP requis.')
    return result


def smtp_session(settings):
    client = None
    try:
        context = ssl.create_default_context()
        if settings['security'] == 'ssl':
            client = smtplib.SMTP_SSL(settings['host'], settings['port'], timeout=10, context=context)
        else:
            client = smtplib.SMTP(settings['host'], settings['port'], timeout=10)
            client.ehlo()
            client.starttls(context=context)
            client.ehlo()
        client.login(settings['username'], cipher().decrypt(settings['password_encrypted'].encode()).decode())
        return client
    except Exception:
        if client:
            client.close()
        raise RuntimeError('Connexion SMTP impossible. Vérifiez les paramètres, TLS et les identifiants.') from None


def record(connection, equipment, query, payload):
    connection.execute("UPDATE notifications SET confidence='excluded' WHERE equipment=?", (equipment,))
    for cve in payload.get('vulnerabilities', []):
        if not re.fullmatch(r'CVE-\d{4}-\d{4,7}', cve.get('id', '')):
            continue
        urls = [r.get('url', '') for r in cve.get('references', []) if 'Vendor Advisory' in r.get('tags', [])]
        url = next((u for u in urls if u.startswith(('https://', 'http://'))), 'https://nvd.nist.gov/vuln/detail/' + cve['id'])
        connection.execute("INSERT INTO notifications(equipment,cve_id,severity,product,advisory_url,created_at,confidence) VALUES(?,?,?,?,?,?,?) ON CONFLICT(equipment,cve_id) DO UPDATE SET confidence=excluded.confidence,severity=excluded.severity,advisory_url=excluded.advisory_url",
                           (equipment, cve['id'], cve.get('severity', 'UNKNOWN'), ' '.join(query.get(k, '') for k in ('vendor','product','version')).strip(), url, int(time.time()), cve.get('confidence', 'low_confidence')))


def deliver_pending(connect):
    if not SEND_LOCK.acquire(blocking=False):
        return
    try:
        with connect() as connection:
            settings = config(connection)
            recipients = [r['email'] for r in connection.execute('SELECT email FROM email_recipients')]
            if not settings or not settings['enabled'] or not recipients:
                return
            rows = connection.execute('SELECT * FROM notifications WHERE confidence="confirmed" AND email_sent=0 AND next_attempt<=? AND equipment IN (SELECT cache_key FROM monitored_queries) ORDER BY id LIMIT 20', (int(time.time()),)).fetchall()
        for row in rows:
            try:
                with smtp_session(settings) as client:
                    for recipient in recipients:
                        with connect() as connection:
                            if connection.execute('SELECT 1 FROM notification_deliveries WHERE notification_id=? AND recipient=?', (row['id'], recipient)).fetchone():
                                continue
                        message = EmailMessage()
                        message['From'] = settings['sender']
                        message['To'] = recipient
                        message['Subject'] = f"OpenVigie — {row['cve_id']} ({row['severity']})"
                        message.set_content(f"Produit suivi : {row['product']}\nCVE : {row['cve_id']}\nSévérité : {row['severity']}\nAvis : {row['advisory_url']}\n\nCorrespondance à confirmer dans l'avis éditeur avant intervention.")
                        if client.send_message(message):
                            raise RuntimeError('Recipient refused')
                        with connect() as connection:
                            connection.execute('INSERT OR IGNORE INTO notification_deliveries VALUES(?,?)', (row['id'], recipient))
                with connect() as connection:
                    connection.execute('UPDATE notifications SET email_sent=1 WHERE id=?', (row['id'],))
            except Exception:
                with connect() as connection:
                    connection.execute('UPDATE notifications SET next_attempt=? WHERE id=?', (int(time.time()) + 300, row['id']))
    finally:
        SEND_LOCK.release()


def scheduler(connect):
    while True:
        try:
            deliver_pending(connect)
        except Exception:
            pass  # No SMTP secrets or server exception text in logs.
        time.sleep(30)


def handle(handler, connect):
    parsed = urlparse(handler.path)
    path, method = parsed.path, handler.command
    routes = {
        '/settings/email-config': ('GET','POST'), '/settings/email-config/test': ('POST',),
        '/settings/email-recipients': ('GET','POST','PUT','DELETE'),
        '/notifications': ('GET',), '/notifications/read': ('POST',),
        '/notifications/mark-all-read': ('POST',),
    }
    if path not in routes:
        return False
    try:
        if method not in routes[path]:
            handler.send_json(405, {'error': 'Méthode non autorisée.'})
            return True
        payload = {}
        if method in ('POST','PUT','DELETE'):
            length = int(handler.headers.get('Content-Length', '0'))
            if not 0 <= length <= 16384:
                raise ValueError('Corps de requête invalide.')
            payload = json.loads(handler.rfile.read(length) or b'{}')
            if not isinstance(payload, dict):
                raise ValueError('Objet JSON requis.')
        with connect() as connection:
            if path == '/settings/email-config':
                if method == 'POST':
                    settings = validated(payload, config(connection))
                    fields = (*PUBLIC_FIELDS, 'password_encrypted')
                    connection.execute(f"INSERT OR REPLACE INTO email_config(id,{','.join(fields)}) VALUES(1,{','.join('?' for _ in fields)})", tuple(settings[k] for k in fields))
                result = public_config(connection)
            elif path.endswith('/test'):
                settings = validated(payload, config(connection)) if payload else config(connection)
                if not settings:
                    raise ValueError('Configurez SMTP au préalable.')
                with smtp_session(settings):
                    pass
                result = {'success': True, 'message': 'Connexion TLS et authentification SMTP réussies.'}
            elif path == '/settings/email-recipients':
                if method == 'POST':
                    connection.execute('INSERT INTO email_recipients(email) VALUES(?)', (address(payload.get('email')),))
                elif method in ('DELETE','PUT'):
                    item_id = payload.get('id', parse_qs(parsed.query).get('id', [''])[0])
                    try:
                        item_id = int(item_id)
                    except (TypeError, ValueError):
                        raise ValueError('Identifiant invalide.') from None
                    cursor = connection.execute('DELETE FROM email_recipients WHERE id=?', (item_id,)) if method == 'DELETE' else connection.execute('UPDATE email_recipients SET email=? WHERE id=?', (address(payload.get('email')), item_id))
                    if not cursor.rowcount:
                        handler.send_json(404, {'error': 'Destinataire introuvable.'})
                        return True
                result = {'recipients': [dict(r) for r in connection.execute('SELECT * FROM email_recipients ORDER BY id')]}
            elif path == '/notifications':
                params = parse_qs(parsed.query)
                offset = max(0, int(params.get('offset', ['0'])[0]))
                rows = connection.execute('SELECT * FROM notifications WHERE confidence != "excluded" ORDER BY id DESC LIMIT 50 OFFSET ?', (offset,)).fetchall()
                result = {'notifications': [dict(r) for r in rows], 'unread_count': connection.execute('SELECT COUNT(*) FROM notifications WHERE confidence != "excluded" AND read=0').fetchone()[0], 'has_more': connection.execute('SELECT COUNT(*) FROM notifications WHERE confidence != "excluded"').fetchone()[0] > offset + len(rows)}
            else:
                if path.endswith('/mark-all-read'):
                    connection.execute('UPDATE notifications SET read=1 WHERE read=0')
                else:
                    if type(payload.get('id')) is not int:
                        raise ValueError('Identifiant invalide.')
                    if not connection.execute('UPDATE notifications SET read=1 WHERE id=?', (payload['id'],)).rowcount:
                        handler.send_json(404, {'error': 'Notification introuvable.'})
                        return True
                result = {'success': True}
        handler.send_json(200, result)
    except sqlite3.IntegrityError:
        handler.send_json(409, {'error': 'Ce destinataire existe déjà.'})
    except (ValueError, TypeError):
        handler.send_json(400, {'error': 'Paramètres invalides. Vérifiez les champs et OPENVIGIE_SECRET_KEY (32 caractères minimum).'})
    except Exception:
        handler.send_json(503, {'error': 'Service indisponible. Vérifiez la configuration SMTP, TLS et la clé de chiffrement.'})
    return True
