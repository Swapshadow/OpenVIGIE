import json
import os
import tempfile
import unittest
from unittest.mock import patch

import collector


class CpeVersionCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_path = collector.DB_PATH
        collector.DB_PATH = os.path.join(self.tmp.name, 'test.db')
        collector.initialize_database()

    def tearDown(self):
        collector.DB_PATH = self.old_path
        self.tmp.cleanup()

    def test_versions_are_fetched_sorted_and_then_read_from_sqlite_cache(self):
        rows = [
            {'cpe': {'cpeName': 'cpe:2.3:a:fortinet:forticlient:7.4.3:*:*:*:*:windows:*:*'}},
            {'cpe': {'cpeName': 'cpe:2.3:a:fortinet:forticlient:7.4.5:*:*:*:*:windows:*:*'}},
        ]
        with patch.object(collector, 'fetch_json', return_value={'products': rows, 'totalResults': 2}) as fetch:
            fresh = collector.catalog_versions('a', 'fortinet', 'forticlient')
            cached = collector.catalog_versions('a', 'fortinet', 'forticlient')
        self.assertEqual(fresh['versions'], ['7.4.5', '7.4.3'])
        self.assertFalse(fresh['cached'])
        self.assertTrue(cached['cached'])
        self.assertEqual(fetch.call_count, 1)

    def test_sql_aliases_surface_release_2025_from_dictionary_identity(self):
        def response(url):
            product = urllib_parse(url).get('cpeMatchString', [''])[0]
            version = '17.0.1000.7' if ':sql_server_2025:' in product else '2022'
            name_product = 'sql_server_2025' if ':sql_server_2025:' in product else 'sql_server'
            return {'totalResults': 1, 'products': [{'cpe': {'cpeName': f'cpe:2.3:a:microsoft:{name_product}:{version}:*:*:*:*:*:x64:*'}}]}
        with patch.object(collector, 'fetch_json', side_effect=response):
            versions = collector.fetch_dictionary_versions('a', 'microsoft', 'sql_server')
        self.assertIn('2025', versions)
        self.assertIn('2022', versions)


def urllib_parse(url):
    from urllib.parse import parse_qs, urlparse
    return parse_qs(urlparse(url).query)


if __name__ == '__main__':
    unittest.main()
