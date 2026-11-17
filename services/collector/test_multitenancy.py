import os
import tempfile
import time
import unittest
from unittest.mock import patch

import collector


class MultitenancyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_db = collector.DB_PATH
        collector.DB_PATH = os.path.join(self.temp.name, 'openvigie.db')
        collector.initialize_database()

    def tearDown(self):
        collector.DB_PATH = self.original_db
        self.temp.cleanup()

    def create_account(self, suffix):
        now = int(time.time())
        organization_id, user_id = f'org-{suffix}', f'user-{suffix}'
        with collector.connect() as connection:
            connection.execute('INSERT INTO organizations VALUES(?,?,?,?)',
                               (organization_id, f'Org {suffix}', f'org-{suffix}', now))
            connection.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?)',
                               (user_id, organization_id, f'{suffix}@example.test', suffix,
                                collector.password_digest('a sufficiently long password'), 'owner', now))
            token = collector.create_session(connection, user_id)
        return organization_id, token

    def add_asset(self, organization_id, asset_id):
        now = int(time.time())
        with collector.connect() as connection:
            connection.execute(
                'INSERT INTO organization_assets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (asset_id, organization_id, 'microsoft', 'windows-server', 'Microsoft', 'Windows Server',
                 asset_id, '2022', 'Réseau interne', 'server', 'o', 'microsoft',
                 'windows_server_2022', now, now),
            )

    def test_passwords_sessions_and_assets_are_organization_scoped(self):
        org_a, token_a = self.create_account('alpha')
        org_b, token_b = self.create_account('beta')
        self.add_asset(org_a, 'asset-alpha')
        self.add_asset(org_b, 'asset-beta')

        with collector.connect() as connection:
            encoded = connection.execute("SELECT password_hash FROM users WHERE id='user-alpha'").fetchone()[0]
        self.assertTrue(collector.password_matches('a sufficiently long password', encoded))
        self.assertEqual(collector.account_for_token(token_a)['organization_id'], org_a)
        self.assertEqual(collector.account_for_token(token_b)['organization_id'], org_b)
        self.assertEqual([row['id'] for row in collector.organization_assets(org_a)], ['asset-alpha'])
        self.assertEqual([row['id'] for row in collector.organization_assets(org_b)], ['asset-beta'])

    def test_weekly_report_never_includes_another_organization_asset(self):
        org_a, _ = self.create_account('alpha')
        org_b, _ = self.create_account('beta')
        self.add_asset(org_a, 'asset-alpha')
        self.add_asset(org_b, 'asset-beta')
        empty = {
            'generatedAt': '2027-01-01T00:00:00Z', 'period': {'label': '7 jours', 'start': '', 'end': ''},
            'stats': {}, 'topCve': [], 'topNews': [], 'trending': [], 'categories': [], 'sources': [],
            'ranking': {'method': 'test', 'warning': ''},
        }
        with patch.object(collector, 'refresh_query', return_value={'vulnerabilities': []}), \
             patch.object(collector, 'build_weekly_report', return_value=empty):
            report = collector.build_organization_weekly_report(org_a)
        self.assertEqual(report['scope']['assetCount'], 1)
        self.assertEqual([asset['id'] for asset in report['scope']['assets']], ['asset-alpha'])
        self.assertTrue(report['scope']['strict'])


if __name__ == '__main__':
    unittest.main()
