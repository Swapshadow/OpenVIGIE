import io
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import redirect_stdout
from http.server import ThreadingHTTPServer
from unittest.mock import patch, MagicMock
import collector
import email_notifier as notifier

class AlertTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'OPENVIGIE_SECRET_KEY': 'test-key-' * 8})
        self.env.start()
        self.db = patch.object(collector, 'DB_PATH', self.temp.name + '/test.db')
        self.db.start()
        collector.initialize_database()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), collector.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.settings = dict(provider='Gmail', host='smtp.example.com', port=465, security='ssl', username='user@example.com', sender='user@example.com', enabled=True, password='SMTP-super-secret')

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.db.stop()
        self.env.stop()
        self.temp.cleanup()

    def request(self, path, method='GET', data=None):
        request = urllib.request.Request(f'http://127.0.0.1:{self.server.server_port}{path}', data=None if data is None else json.dumps(data).encode(), method=method, headers={'Content-Type': 'application/json'})
        try:
            response = urllib.request.urlopen(request)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def seed(self):
        query = {'vendor': 'Example', 'product': 'Firewall', 'version': '1.0'}
        collector.register_query('equipment', query)
        with collector.connect() as connection:
            notifier.record(connection, 'equipment', query, {'vulnerabilities': [{'id': 'CVE-2026-12345', 'severity': 'CRITICAL', 'confidence': 'confirmed'}]})

    def test_encryption_redaction_and_preservation(self):
        status, body = self.request('/settings/email-config', 'POST', self.settings)
        self.assertEqual(status, 200)
        self.assertNotIn('password', body['config'])
        with collector.connect() as connection:
            encrypted = notifier.config(connection)['password_encrypted']
        self.assertNotIn(self.settings['password'], encrypted)
        self.assertEqual(notifier.cipher().decrypt(encrypted.encode()).decode(), self.settings['password'])
        self.assertEqual(self.request('/settings/email-config', 'POST', {**self.settings, 'password': ''})[0], 200)
        self.assertNotIn('password_encrypted', str(self.request('/settings/email-config')))
        self.assertEqual(self.request('/settings/email-config', 'POST', {**self.settings, 'password': '', 'host': 'other.example.com'})[0], 400)
        with collector.connect() as connection:
            self.assertEqual(encrypted, notifier.config(connection)['password_encrypted'])
        with patch.dict(os.environ, {'OPENVIGIE_SECRET_KEY': ''}):
            self.assertEqual(self.request('/settings/email-config', 'POST', self.settings)[0], 400)

    def test_recipient_crud_validation(self):
        self.assertEqual(self.request('/settings/email-recipients', 'POST', {'email': 'a@example.com'})[0], 200)
        self.assertEqual(self.request('/settings/email-recipients', 'POST', {'email': 'A@example.com'})[0], 409)
        self.assertEqual(self.request('/settings/email-recipients', 'PUT', {'id': 1, 'email': 'b@example.com'})[1]['recipients'][0]['email'], 'b@example.com')
        self.assertEqual(self.request('/settings/email-recipients', 'DELETE', {'id': 1})[1]['recipients'], [])
        self.assertEqual(self.request('/settings/email-recipients', 'POST', {'email': 'x@example.com\r\nBcc: bad@example.com'})[0], 400)
        self.assertEqual(self.request('/settings/email-config', 'POST', {**self.settings, 'host': 'bad\r\nhost'})[0], 400)

    def test_notifications_dedup_reads(self):
        self.seed()
        self.seed()
        result = self.request('/notifications')[1]
        self.assertEqual(len(result['notifications']), 1)
        self.assertEqual(result['unread_count'], 1)
        self.assertEqual(self.request('/notifications/read', 'POST', {'id': result['notifications'][0]['id']})[0], 200)
        self.assertEqual(self.request('/notifications')[1]['unread_count'], 0)
        self.assertEqual(self.request('/notifications/read', 'POST', {'id': 999})[0], 404)
        self.assertEqual(self.request('/notifications/mark-all-read', 'POST', {})[0], 200)
        self.assertEqual(self.request('/notifications?offset=50')[1]['notifications'], [])

    def test_refresh_hook(self):
        query = {'vendor': 'Test', 'product': 'Test', 'version': '1'}
        payload = {'vulnerabilities': [{'id': 'CVE-2026-10000', 'severity': 'HIGH'}]}
        with patch.object(collector, 'collect', return_value=payload), patch.object(collector, 'attach_related_articles', side_effect=lambda p, q: p):
            collector.refresh_query('test', query, force=True)
            collector.refresh_query('test', query, force=True)
        self.assertEqual(len(self.request('/notifications')[1]['notifications']), 1)

    def test_partial_delivery_retry(self):
        self.seed()
        self.request('/settings/email-config', 'POST', self.settings)
        for email in ('a@example.com', 'b@example.com'):
            self.request('/settings/email-recipients', 'POST', {'email': email})
        client = MagicMock()
        client.__enter__.return_value = client
        client.send_message.side_effect = [{}, RuntimeError('SMTP-super-secret')]
        with patch.object(notifier, 'smtp_session', return_value=client), redirect_stdout(io.StringIO()) as output:
            notifier.deliver_pending(collector.connect)
        self.assertNotIn('SMTP-super-secret', output.getvalue())
        self.assertEqual(self.request('/notifications')[1]['notifications'][0]['email_sent'], 0)
        with collector.connect() as connection:
            connection.execute('UPDATE detection_cycles SET next_attempt=0')
        client.send_message.reset_mock(side_effect=True)
        client.send_message.return_value = {}
        with patch.object(notifier, 'smtp_session', return_value=client):
            notifier.deliver_pending(collector.connect)
        self.assertEqual(client.send_message.call_count, 1)
        self.assertEqual(client.send_message.call_args.args[0]['To'], 'b@example.com')
        self.assertEqual(self.request('/notifications')[1]['notifications'][0]['email_sent'], 1)

    def test_tls_and_error_redaction(self):
        settings = notifier.validated(self.settings, None)
        with patch.object(notifier.smtplib, 'SMTP_SSL') as smtp:
            notifier.smtp_session(settings)
            self.assertIn('context', smtp.call_args.kwargs)
        settings['security'] = 'starttls'
        with patch.object(notifier.smtplib, 'SMTP') as smtp:
            notifier.smtp_session(settings)
            smtp.return_value.starttls.assert_called_once()
            smtp.return_value.login.assert_called_once()
        with patch.object(notifier, 'smtp_session', side_effect=RuntimeError('SMTP-super-secret')), redirect_stdout(io.StringIO()) as output:
            status, result = self.request('/settings/email-config/test', 'POST', self.settings)
        self.assertEqual(status, 503)
        self.assertNotIn('SMTP-super-secret', str(result) + output.getvalue())

    def test_disabled_removed_equipment(self):
        self.seed()
        self.request('/settings/email-config', 'POST', {**self.settings, 'enabled': False})
        self.request('/settings/email-recipients', 'POST', {'email': 'a@example.com'})
        with patch.object(notifier, 'smtp_session') as smtp:
            notifier.deliver_pending(collector.connect)
            smtp.assert_not_called()
        self.request('/settings/email-config', 'POST', self.settings)
        collector.delete_query('equipment')
        with patch.object(notifier, 'smtp_session') as smtp:
            notifier.deliver_pending(collector.connect)
            smtp.assert_not_called()

    def test_low_confidence_never_emailed(self):
        self.seed()
        with collector.connect() as db:
            db.execute("UPDATE notifications SET confidence='low_confidence'")
        self.request('/settings/email-config','POST',self.settings)
        self.request('/settings/email-recipients','POST',{'email':'a@example.com'})
        with patch('email_notifier.smtp_session') as smtp:
            collector.email_notifier.deliver_pending(collector.connect)
            smtp.assert_not_called()
        self.assertEqual(self.request('/notifications')[1]['notifications'][0]['confidence'], 'low_confidence')

    def test_digest_69_cves_one_message_per_equipment_cycle(self):
        query = {'vendor':'Fortinet', 'product':'FortiOS', 'version':'7.6.3'}
        collector.register_query('forti', query)
        vulnerabilities = [{'id':f'CVE-2026-{10000+i}', 'severity':'CRITICAL' if i == 68 else 'LOW', 'confidence':'confirmed'} for i in range(69)]
        with collector.connect() as db:
            notifier.record(db, 'forti', query, {'vulnerabilities': vulnerabilities}, initial_scan=True)
        self.request('/settings/email-config','POST',self.settings)
        self.request('/settings/email-recipients','POST',{'email':'a@example.com'})
        client = MagicMock()
        client.__enter__.return_value = client
        client.send_message.return_value = {}
        with patch.object(notifier,'smtp_session',return_value=client):
            notifier.deliver_pending(collector.connect)
        self.assertEqual(client.send_message.call_count, 1)
        message = client.send_message.call_args.args[0]
        self.assertIn('69 CVE', message['Subject'])
        text = message.get_content()
        self.assertLess(text.index('CVE-2026-10068'), text.index('CVE-2026-10000'))
        with collector.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM notifications WHERE initial_scan=1 AND email_sent=1').fetchone()[0], 69)
            notifier.record(db, 'forti', query, {'vulnerabilities':vulnerabilities})
        client.send_message.reset_mock()
        with patch.object(notifier,'smtp_session',return_value=client):
            notifier.deliver_pending(collector.connect)
        client.send_message.assert_not_called()
        newer = vulnerabilities + [{'id':'CVE-2026-20000','severity':'HIGH','confidence':'confirmed'}, {'id':'CVE-2026-20001','severity':'HIGH','confidence':'low_confidence'}]
        with collector.connect() as db:
            notifier.record(db, 'forti', query, {'vulnerabilities':newer})
        with patch.object(notifier,'smtp_session',return_value=client):
            notifier.deliver_pending(collector.connect)
        self.assertEqual(client.send_message.call_count, 1)
        message = client.send_message.call_args.args[0]
        self.assertIn('1 CVE', message['Subject'])
        self.assertNotIn('CVE-2026-10000', message.get_content())
        self.assertNotIn('CVE-2026-20001', message.get_content())

    def test_initial_empty_digest_and_two_equipment_cycles(self):
        for equipment in ('one','two'):
            query = {'vendor':'Example','product':equipment,'version':'1'}
            collector.register_query(equipment, query)
            with collector.connect() as db:
                notifier.record(db,equipment,query,{'vulnerabilities':[]},initial_scan=True)
        self.request('/settings/email-config','POST',self.settings)
        self.request('/settings/email-recipients','POST',{'email':'a@example.com'})
        client = MagicMock()
        client.__enter__.return_value = client
        client.send_message.return_value = {}
        with patch.object(notifier,'smtp_session',return_value=client):
            notifier.deliver_pending(collector.connect)
        self.assertEqual(client.send_message.call_count, 2)
        self.assertTrue(all('0 CVE' in call.args[0]['Subject'] for call in client.send_message.call_args_list))

if __name__ == '__main__':
    unittest.main()
