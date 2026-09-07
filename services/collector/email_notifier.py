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
import uuid
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

    connection.executescript("""
      CREATE TABLE IF NOT EXISTS detection_cycles (
        id TEXT PRIMARY KEY, equipment TEXT NOT NULL, product TEXT NOT NULL,
        initial_scan INTEGER NOT NULL, created_at INTEGER NOT NULL,
        email_sent INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS digest_deliveries (
        cycle_id TEXT NOT NULL, recipient TEXT NOT NULL,
        PRIMARY KEY(cycle_id, recipient));
    """)
    if 'cycle_id' not in columns:
        connection.execute('ALTER TABLE notifications ADD COLUMN cycle_id TEXT')
        connection.execute('ALTER TABLE notifications ADD COLUMN initial_scan INTEGER NOT NULL DEFAULT 0')
        # Legacy pending notifications have no trustworthy cycle boundary.
        # Group their backlog once per equipment rather than replay individual mail.
        for row in connection.execute('SELECT equipment,product,MIN(created_at) AS created_at FROM notifications WHERE email_sent=0 GROUP BY equipment').fetchall():
            cycle = uuid.uuid4().hex
            connection.execute('INSERT INTO detection_cycles(id,equipment,product,initial_scan,created_at) VALUES(?,?,?,?,?)', (cycle,row['equipment'],row['product'],0,row['created_at']))
            connection.execute('UPDATE notifications SET cycle_id=? WHERE equipment=? AND email_sent=0', (cycle,row['equipment']))



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


def record(connection, equipment, query, payload, initial_scan=False):
    previous = {row['cve_id']: dict(row) for row in connection.execute('SELECT * FROM notifications WHERE equipment=?', (equipment,))}
    connection.execute("UPDATE notifications SET confidence='excluded' WHERE equipment=?", (equipment,))
    cycle = uuid.uuid4().hex
    now = int(time.time())
    product = ' '.join(query.get(k, '') for k in ('vendor', 'product', 'version')).strip()
    new_confirmed = 0
    new_count = 0
    for cve in payload.get('vulnerabilities', []):
        if not re.fullmatch(r'CVE-\d{4}-\d{4,7}', cve.get('id', '')):
            continue
        confidence = cve.get('confidence', 'low_confidence')
        if confidence != 'confirmed':
            continue
        old = previous.get(cve['id'])
        promoted = old and old['confidence'] != 'confirmed' and confidence == 'confirmed' and not old['email_sent']
        # Re-adding an equipment starts a new initial scan even when historical
        # notifications for the same cache key remain in the database. Attach
        # every current confirmed CVE to this cycle so its digest cannot say 0.
        is_new = initial_scan or not old or promoted
        if is_new:
            new_count += 1
            new_confirmed += confidence == 'confirmed'
        urls = [r.get('url', '') for r in cve.get('references', []) if 'Vendor Advisory' in r.get('tags', [])]
        url = next((u for u in urls if u.startswith(('https://', 'http://'))), 'https://nvd.nist.gov/vuln/detail/' + cve['id'])
        connection.execute("""INSERT INTO notifications(equipment,cve_id,severity,product,advisory_url,created_at,confidence,cycle_id,initial_scan,email_sent)
            VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(equipment,cve_id) DO UPDATE SET
            confidence=excluded.confidence,severity=excluded.severity,advisory_url=excluded.advisory_url,
            cycle_id=excluded.cycle_id,initial_scan=excluded.initial_scan,
            email_sent=excluded.email_sent""",
            (equipment,cve['id'],cve.get('severity','UNKNOWN'),product,url,now,confidence,
             cycle if is_new else old['cycle_id'], int(initial_scan) if is_new else old['initial_scan'],
             0 if is_new else old['email_sent']))
    if new_count or initial_scan:
        connection.execute('INSERT INTO detection_cycles(id,equipment,product,initial_scan,created_at,email_sent) VALUES(?,?,?,?,?,?)',
                           (cycle,equipment,product,int(initial_scan),now,int(not initial_scan and not new_confirmed)))


def digest_message(settings, cycle, rows, recipient):
    message = EmailMessage()
    message['From'] = settings['sender']
    message['To'] = recipient
    message['Subject'] = f"OpenVigie — {len(rows)} CVE détectées pour {cycle['product']}"
    # Stable Message-ID helps downstream mail systems identify retry duplicates.
    message['Message-ID'] = f"<openvigie-{cycle['id']}-{hashlib.sha256(recipient.encode()).hexdigest()[:16]}@openvigie.local>"
    lines = [('Analyse initiale' if cycle['initial_scan'] else 'Nouvelles CVE de ce cycle') + ' : ' + cycle['product'],
             f"{len(rows)} correspondances de version confirmées.", '']
    rank = {'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'UNKNOWN': 0}
    for row in sorted(rows, key=lambda r: (-rank.get(r['severity'].upper(), 0), r['cve_id'])):
        lines.append(f"[{row['severity']}] {row['cve_id']} — {row['advisory_url']}")
    lines += ['', 'Les correspondances ambiguës ne sont pas incluses dans cet email.',
              'Consultez les avis éditeurs avant intervention. Une absence de CVE ne prouve pas une absence de risque.']
    message.set_content('\n'.join(lines))
    return message


def deliver_pending(connect):
    if not SEND_LOCK.acquire(blocking=False):
        return
    try:
        with connect() as connection:
            settings = config(connection)
            recipients = [r['email'] for r in connection.execute('SELECT email FROM email_recipients')]
            if not settings or not settings['enabled'] or not recipients:
                return
            cycles = connection.execute('SELECT * FROM detection_cycles WHERE email_sent=0 AND next_attempt<=? AND equipment IN (SELECT cache_key FROM monitored_queries) ORDER BY created_at,id LIMIT 20', (int(time.time()),)).fetchall()
        for cycle in cycles:
            try:
                with connect() as connection:
                    rows = connection.execute("SELECT * FROM notifications WHERE cycle_id=? AND confidence='confirmed' AND email_sent=0", (cycle['id'],)).fetchall()
                    if not rows and not cycle['initial_scan']:
                        connection.execute('UPDATE detection_cycles SET email_sent=1 WHERE id=?', (cycle['id'],))
                        continue
                with smtp_session(settings) as client:
                    for recipient in recipients:
                        with connect() as connection:
                            if connection.execute('SELECT 1 FROM digest_deliveries WHERE cycle_id=? AND recipient=?', (cycle['id'],recipient)).fetchone():
                                continue
                        if client.send_message(digest_message(settings, cycle, rows, recipient)):
                            raise RuntimeError('Recipient refused')
                        with connect() as connection:
                            connection.execute('INSERT OR IGNORE INTO digest_deliveries VALUES(?,?)', (cycle['id'],recipient))
                with connect() as connection:
                    connection.execute('UPDATE detection_cycles SET email_sent=1 WHERE id=?', (cycle['id'],))
                    connection.execute("UPDATE notifications SET email_sent=1 WHERE cycle_id=? AND confidence='confirmed'", (cycle['id'],))
            except Exception:
                with connect() as connection:
                    connection.execute('UPDATE detection_cycles SET next_attempt=? WHERE id=?', (int(time.time())+300,cycle['id']))
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
                rows = connection.execute('SELECT * FROM notifications WHERE confidence = "confirmed" ORDER BY id DESC LIMIT 50 OFFSET ?', (offset,)).fetchall()
                result = {'notifications': [dict(r) for r in rows], 'unread_count': connection.execute('SELECT COUNT(*) FROM notifications WHERE confidence = "confirmed" AND read=0').fetchone()[0], 'has_more': connection.execute('SELECT COUNT(*) FROM notifications WHERE confidence = "confirmed"').fetchone()[0] > offset + len(rows)}
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
