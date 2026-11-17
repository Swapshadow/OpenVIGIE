"""Version applicability regressions; CVE fixtures are minimal NVD extracts or synthetic."""
import unittest
from unittest.mock import patch
import collector

MAC = dict(vendor='Apple', product='macOS', version='26.6.1', part='o', cpeVendor='apple', cpeProduct='macos')
FORTI = dict(vendor='Fortinet', product='FortiOS / FortiGate', version='7.6.3', part='o', cpeVendor='fortinet', cpeProduct='fortios')
VMWARE = dict(vendor='VMware by Broadcom', product='VMware ESXi', version='7.0.3', part='o', cpeVendor='vmware', cpeProduct='esxi')
GLPI = dict(vendor='GLPI Project', product='GLPI', version='11.0.11', part='a', cpeVendor='glpi-project', cpeProduct='glpi')
VEEAM = dict(vendor='Veeam', product='Backup & Replication', version='13.0.2.29', part='a', cpeVendor='veeam', cpeProduct='backup_and_replication')
ZABBIX = dict(vendor='Zabbix', product='Zabbix', version='7.4.12', part='a', cpeVendor='zabbix', cpeProduct='zabbix')
WINDOWS_SERVER = dict(vendor='Microsoft', product='Windows Server', version='2022 21H2', part='o', cpeVendor='microsoft', cpeProduct='windows_server_2022')
UBUNTU = dict(vendor='Canonical Ubuntu', product='Ubuntu Linux', version='24.04.5 LTS', part='o', cpeVendor='canonical', cpeProduct='ubuntu_linux')
DEBIAN = dict(vendor='Debian', product='Debian GNU/Linux', version='12.0', part='o', cpeVendor='debian', cpeProduct='debian_linux')

def entry(query, version='*', **bounds):
    return dict(vulnerable=True, criteria=f"cpe:2.3:o:{query['cpeVendor']}:{query['cpeProduct']}:{version}:*:*:*:*:*:*:*", **bounds)

def cve(*matches):
    return dict(id='CVE-2026-10000', configurations=[dict(nodes=[dict(operator='OR', cpeMatch=list(matches))])])

class MatchingTests(unittest.TestCase):
    def test_catalog_product_name_with_ampersand_is_valid(self):
        query = collector.normalize_query({
            'vendor': ['Veeam'], 'product': ['Backup & Replication'],
            'version': ['13.0.2.29'], 'part': ['a'],
            'cpeVendor': ['veeam'], 'cpeProduct': ['backup_and_replication'],
        })
        self.assertEqual(query['product'], 'Backup & Replication')

    def test_requested_release_labels_map_to_nvd_cpe_versions(self):
        self.assertIn(':microsoft:windows_server_2022:10.0.20348.0:', collector.cpe_queries(WINDOWS_SERVER)[0])
        self.assertIn(':canonical:ubuntu_linux:24.04:', collector.cpe_queries(UBUNTU)[0])
        self.assertIn(':zabbix:zabbix:7.4.12:', collector.cpe_queries(ZABBIX)[0])

        windows_match = dict(vulnerable=True, criteria='cpe:2.3:o:microsoft:windows_server_2022:*:*:*:*:*:*:*:*',
                             versionStartIncluding='10.0.20348.0', versionEndExcluding='10.0.20348.230')
        ubuntu_match = dict(vulnerable=True, criteria='cpe:2.3:o:canonical:ubuntu_linux:24.04:*:*:*:lts:*:*:*')
        zabbix_match = dict(vulnerable=True, criteria='cpe:2.3:a:zabbix:zabbix:7.4.12:-:*:*:*:*:*:*')
        self.assertEqual(collector.cve_confidence(cve(windows_match), WINDOWS_SERVER), 'confirmed')
        # Regression: the former broad product query returned ~3891 historical
        # Windows Server rows. A wildcard without explicit build bounds must
        # never be interpreted as applicable to Server 2022.
        broad_windows = dict(vulnerable=True, criteria='cpe:2.3:o:microsoft:windows_server_2022:*:*:*:*:*:*:*:*')
        older_build = dict(vulnerable=True, criteria='cpe:2.3:o:microsoft:windows_server_2022:*:*:*:*:*:*:*:*',
                           versionEndExcluding='10.0.20348.0')
        self.assertEqual(collector.cve_confidence(cve(broad_windows), WINDOWS_SERVER), 'excluded')
        self.assertEqual(collector.cve_confidence(cve(older_build), WINDOWS_SERVER), 'excluded')
        with patch.object(collector, 'fetch_json') as fetch:
            coarse = collector.collect(WINDOWS_SERVER)
        self.assertEqual(coarse['totalResults'], 0)
        self.assertEqual(coarse['matching']['method'], 'none')
        self.assertIn('build exact', coarse['matching']['message'])
        fetch.assert_not_called()
        self.assertEqual(collector.cve_confidence(cve(ubuntu_match), UBUNTU), 'confirmed')
        self.assertEqual(collector.cve_confidence(cve(zabbix_match), ZABBIX), 'confirmed')

    def test_glpi_version_missing_from_dictionary_uses_bounded_product_fallback(self):
        affected = dict(vulnerable=True, criteria='cpe:2.3:a:glpi-project:glpi:*:*:*:*:*:*:*:*',
                        versionStartIncluding='11.0.10', versionEndExcluding='11.0.12')
        wrapper = {'cve': {**cve(affected), 'id': 'CVE-2026-11011'}}
        with patch.object(collector, 'fetch_json', side_effect=[
                {'totalResults': 0, 'vulnerabilities': []},
                {'totalResults': 1, 'vulnerabilities': [wrapper]},
                {'totalResults': 0, 'vulnerabilities': []},
        ]) as fetch, patch.object(collector, 'get_kev', return_value={}):
            result = collector.collect(GLPI)
        self.assertEqual([item['id'] for item in result['vulnerabilities']], ['CVE-2026-11011'])
        self.assertEqual(fetch.call_count, 3)
        self.assertIn('glpi-project%3Aglpi', fetch.call_args_list[1].args[0])
        self.assertNotIn('11.0.11', fetch.call_args_list[1].args[0])

    def test_deferred_glpi_cna_range_is_correlated_from_nvd(self):
        # CVE-2026-53627 is Deferred in NVD: it has structured CNA affected
        # data for GLPI 11.0.0..<11.0.8 but no configurations/cpeMatch.
        deferred = {
            'id': 'CVE-2026-53627', 'vulnStatus': 'Deferred',
            'affected': [{'source': 'security-advisories@github.com', 'affectedData': [{
                'vendor': 'glpi-project', 'product': 'glpi',
                'versions': [{'version': '>= 11.0.0, < 11.0.8', 'status': 'affected'}],
            }]}],
        }
        glpi_1107 = {**GLPI, 'version': '11.0.7'}
        self.assertEqual(collector.nvd_affected_confidence(deferred, glpi_1107), 'confirmed')
        self.assertEqual(collector.nvd_affected_confidence(deferred, {**GLPI, 'version': '11.0.8'}), 'excluded')
        self.assertEqual(collector.nvd_affected_confidence(deferred, {**glpi_1107, 'cpeProduct': 'glpi_agent'}), 'excluded')
        self.assertEqual(collector.nvd_affected_confidence({**deferred, 'configurations': [{}]}, glpi_1107), 'excluded')

        wrapper = {'cve': deferred}
        with patch.object(collector, 'fetch_json', side_effect=[
                {'totalResults': 0, 'vulnerabilities': []},
                {'totalResults': 0, 'vulnerabilities': []},
                {'totalResults': 1, 'vulnerabilities': [wrapper]},
        ]) as fetch, patch.object(collector, 'get_kev', return_value={}):
            result = collector.collect(glpi_1107)
        self.assertEqual([item['id'] for item in result['vulnerabilities']], ['CVE-2026-53627'])
        self.assertEqual(result['vulnerabilities'][0]['matchBasis'], 'nvd_affected')
        self.assertTrue(result['matching']['usesNvdAffected'])
        self.assertIn('keywordSearch=GLPI', fetch.call_args.args[0])

    def test_ambiguous_nvd_affected_data_does_not_correlate(self):
        base = {'vendor': 'glpi-project', 'product': 'glpi'}
        for entry in (
            {'version': '*', 'status': 'affected'},
            {'version': '>= 11.0.0, unknown', 'status': 'affected'},
            {'version': '>= 11.0.0, < 11.0.8', 'status': 'unaffected'},
            {'version': '>= 11.0.0, < 11.0.8', 'status': 'affected', 'changes': [{'at': '11.0.7', 'status': 'unaffected'}]},
        ):
            cve_data = {'affected': [{'affectedData': [{**base, 'versions': [entry]}]}]}
            self.assertEqual(collector.nvd_affected_confidence(cve_data, {**GLPI, 'version': '11.0.7'}), 'excluded')

    def test_veeam_build_matches_nvd_structured_range(self):
        # CVE-2026-58069: NVD CNA data covers Veeam Backup and Replication
        # major 13 up to and including 13.0.3.
        affected = {'id': 'CVE-2026-58069', 'vulnStatus': 'Awaiting Analysis', 'affected': [{
            'affectedData': [{'vendor': 'Veeam', 'product': 'Backup and Replication',
                              'versions': [{'version': '13', 'lessThanOrEqual': '13.0.3',
                                            'versionType': 'semver', 'status': 'affected'}]}],
        }]}
        self.assertEqual(collector.nvd_affected_confidence(affected, VEEAM), 'confirmed')
        self.assertEqual(collector.nvd_affected_confidence(affected, {**VEEAM, 'version': '13.1.0.411'}), 'excluded')
        self.assertEqual(collector.nvd_affected_confidence(affected, {**VEEAM, 'cpeProduct': 'one'}), 'excluded')
        with patch.object(collector, 'fetch_json', side_effect=[
                {'totalResults': 0, 'vulnerabilities': []},
                {'totalResults': 0, 'vulnerabilities': []},
                {'totalResults': 1, 'vulnerabilities': [{'cve': affected}]},
        ]) as fetch, patch.object(collector, 'get_kev', return_value={}):
            result = collector.collect(VEEAM)
        self.assertEqual([item['id'] for item in result['vulnerabilities']], ['CVE-2026-58069'])
        self.assertEqual(result['vulnerabilities'][0]['matchBasis'], 'nvd_affected')
        self.assertIn('keywordSearch=Veeam', fetch.call_args.args[0])

    def test_debian_inventory_lookup_is_nvd_only(self):
        affected = entry(DEBIAN, '12.0')
        wrapper = {'cve': {**cve(affected), 'id': 'CVE-2026-12000'}}
        with patch.object(collector, 'fetch_json', return_value={
                'totalResults': 1, 'vulnerabilities': [wrapper],
        }), patch.object(collector, 'get_kev') as kev:
            result = collector.collect(DEBIAN)
        kev.assert_not_called()
        self.assertEqual([source['name'] for source in result['sources']], ['NVD / NIST'])
        self.assertIsNone(result['vulnerabilities'][0]['kev'])

        with patch.object(collector, 'related_articles') as articles:
            enriched = collector.attach_related_articles(result, DEBIAN)
        articles.assert_not_called()
        self.assertEqual(enriched['relatedArticles'], [])

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

    def test_vmware_esxi_alias_part_and_update_normalization(self):
        matches = [
            dict(vulnerable=True, criteria='cpe:2.3:a:vmware:esx:7.0:update_3r:*:*:*:*:*:*'),
            dict(vulnerable=True, criteria='cpe:2.3:o:vmware:esxi:8.0:update_3:*:*:*:*:*:*'),
        ]
        self.assertEqual(collector.vmware_release('7.0.3'), ('7.0', 'update_3'))
        self.assertEqual(collector.vmware_release('8.0 U3'), ('8.0', 'update_3'))
        self.assertEqual(collector.cve_confidence(cve(*matches), VMWARE), 'confirmed')
        queries = collector.cpe_queries(VMWARE)
        self.assertTrue(any(':o:vmware:esxi:7.0:update_3:' in item for item in queries))
        self.assertTrue(any(':a:vmware:esx:7.0:update_3:' in item for item in queries))

    def test_oracle_23c_uses_the_verified_23ai_cpe_name(self):
        oracle = dict(vendor='Oracle', product='Oracle Database', version='23c', part='a', cpeVendor='oracle', cpeProduct='database_server')
        self.assertIn(':oracle:database_server:23ai:', collector.cpe_queries(oracle)[0])
        match = dict(vulnerable=True, criteria='cpe:2.3:a:oracle:database_server:23ai:*:*:*:*:*:*:*')
        self.assertEqual(collector.cve_confidence(cve(match), oracle), 'confirmed')

    def test_structured_platform_qualifiers_do_not_hide_exact_product_version(self):
        client = dict(vendor='Fortinet', product='FortiClient', version='7.4.3', part='a', cpeVendor='fortinet', cpeProduct='forticlient')
        match = dict(vulnerable=True, criteria='cpe:2.3:a:fortinet:forticlient:7.4.3:*:*:*:*:windows:*:*')
        self.assertEqual(collector.cve_confidence(cve(match), client), 'confirmed')

    def test_sql_release_family_and_primary_advisory_range(self):
        sql = dict(vendor='Microsoft', product='SQL Server', version='2022', part='a', cpeVendor='microsoft', cpeProduct='sql_server')
        match = dict(vulnerable=True, criteria='cpe:2.3:a:microsoft:sql_server_2022:16.0.1000.6:*:*:*:*:*:x64:*')
        self.assertEqual(collector.cve_confidence(cve(match), sql), 'confirmed')
        pam = dict(vendor='Fortinet', product='FortiPAM', version='1.9.1', part='o', cpeVendor='fortinet', cpeProduct='fortipam')
        self.assertEqual(collector.primary_advisory_confidence('CVE-2026-49975', pam), 'confirmed')

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
        self.assertIn('virtualMatchString=', fetch.call_args.args[0])
        self.assertNotIn('keywordSearch=', fetch.call_args.args[0])

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
