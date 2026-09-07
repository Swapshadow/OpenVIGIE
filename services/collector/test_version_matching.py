"""Version applicability regressions; examples are synthetic, not claims about CVEs."""
import unittest
from unittest.mock import patch
import collector

MAC = dict(vendor='Apple', product='macOS', version='26.6.1', part='o', cpeVendor='apple', cpeProduct='macos')
FORTI = dict(vendor='Fortinet', product='FortiOS / FortiGate', version='7.6.3', part='o', cpeVendor='fortinet', cpeProduct='fortios')

def entry(query, version='*', **bounds):
    return dict(vulnerable=True, criteria=f"cpe:2.3:o:{query['cpeVendor']}:{query['cpeProduct']}:{version}:*:*:*:*:*:*:*", **bounds)

def cve(*matches):
    return dict(id='CVE-2026-10000', configurations=[dict(nodes=[dict(operator='OR', cpeMatch=list(matches))])])

class MatchingTests(unittest.TestCase):
    def test_macos_modern_version_excludes_historical_ranges(self):
        for upper in ('10.15.7', '12.7', '14.6', '26.6.1'):
            self.assertEqual(collector.cve_confidence(cve(entry(MAC, versionEndExcluding=upper)), MAC), 'excluded')
        self.assertEqual(collector.cve_confidence(cve(entry(MAC, '26.6.1')), MAC), 'confirmed')
        self.assertEqual(collector.cve_confidence(cve(entry(MAC, versionStartIncluding='26.6', versionEndExcluding='26.6.2')), MAC), 'confirmed')

    def test_fortios_all_boundaries(self):
        for bounds, expected in [
            ({'versionStartIncluding':'7.6.3','versionEndExcluding':'7.6.4'}, 'confirmed'),
            ({'versionStartExcluding':'7.6.3'}, 'excluded'),
            ({'versionEndExcluding':'7.6.3'}, 'excluded'),
            ({'versionEndIncluding':'7.6.3'}, 'confirmed'),
            ({'versionStartIncluding':'7.4.0','versionEndIncluding':'7.4.9'}, 'excluded'),
            ({'versionStartIncluding':'7.6.10'}, 'excluded'),
        ]:
            self.assertEqual(collector.cve_confidence(cve(entry(FORTI, **bounds)), FORTI), expected)

    def test_semantic_version_order_and_all_or_blocks(self):
        self.assertEqual(collector.compare_versions('7.6.10', '7.6.3'), 1)
        item = cve(entry(MAC, '26.6.1'), entry(FORTI, versionStartIncluding='7.6.0', versionEndIncluding='7.6.3'))
        item['configurations'].insert(0, {'nodes': [{'cpeMatch': [entry(MAC, '15.0')]}]})
        self.assertEqual(collector.cve_confidence(item, FORTI), 'confirmed')

    def test_ambiguous_data_and_identity(self):
        for item in ({}, cve(entry(MAC)), cve(entry(MAC, versionEndExcluding='26.6.1-beta'))):
            self.assertEqual(collector.cve_confidence(item, MAC), 'excluded')
        self.assertEqual(collector.cve_confidence(cve(entry(FORTI, '7.6.3')), MAC), 'excluded')
        self.assertEqual(collector.cve_confidence(cve({**entry(MAC, '26.6.1'), 'vulnerable': False}), MAC), 'excluded')

    def test_nested_and_unknown_environment_and_negation(self):
        item = cve(entry(FORTI, '7.6.3'))
        item['configurations'][0]['operator'] = 'AND'
        item['configurations'][0]['nodes'].append(dict(operator='OR', cpeMatch=[dict(criteria='cpe:2.3:h:fortinet:fortigate:100:*:*:*:*:*:*:*', vulnerable=False)]))
        self.assertEqual(collector.cve_confidence(item, FORTI), 'confirmed')
        item = cve(entry(FORTI, '7.6.3'))
        item['configurations'][0]['negate'] = True
        self.assertEqual(collector.cve_confidence(item, FORTI), 'excluded')

    def test_cve_1999_0590_wildcard_version_is_never_associated(self):
        legacy = cve(entry(MAC))
        legacy['id'] = 'CVE-1999-0590'
        self.assertEqual(collector.cve_confidence(legacy, MAC), 'excluded')

    def test_missing_reliable_cpe_returns_manual_search_notice_without_nvd(self):
        query = {**MAC, 'cpeVendor': '', 'cpeProduct': ''}
        with patch.object(collector, 'fetch_json') as fetch:
            result = collector.collect(query)
        fetch.assert_not_called()
        self.assertEqual(result['matching']['method'], 'none')
        self.assertIn('Pas de correspondance CPE fiable', result['matching']['message'])
        self.assertEqual(result['vulnerabilities'], [])

    def test_zero_cpe_results_no_keyword_fallback(self):
        with patch.object(collector, 'fetch_json', return_value={'totalResults':0,'vulnerabilities':[]}) as fetch, patch.object(collector,'get_kev',return_value={}):
            result = collector.collect(MAC)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(result['vulnerabilities'], [])
        self.assertIn('isVulnerable=', fetch.call_args.args[0])

    def test_pagination_and_per_cve_filter(self):
        first = cve(entry(FORTI, versionEndExcluding='7.6.3'))
        second = cve(entry(FORTI, '7.6.3'))
        second['id'] = 'CVE-2026-10001'
        with patch.object(collector,'fetch_json',side_effect=[{'totalResults':2,'vulnerabilities':[{'cve':first}]},{'totalResults':2,'vulnerabilities':[{'cve':second}]}]), patch.object(collector,'get_kev',return_value={}):
            result=collector.collect(FORTI)
        self.assertEqual([i['id'] for i in result['vulnerabilities']], ['CVE-2026-10001'])
        self.assertEqual(result['totalResults'], 1)

    def test_vigi_has_no_bulletin_text_fallback(self):
        with patch.object(collector, '_asset_verified_snapshot', return_value=None), \
                patch.object(collector, 'build_bulletin') as bulletin:
            result = collector.correlate_assets([MAC])
        bulletin.assert_not_called()
        self.assertEqual(result['affected'], [])
        self.assertEqual(result['unverifiedCount'], 1)

if __name__ == '__main__': unittest.main()
