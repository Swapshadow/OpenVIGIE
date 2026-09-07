"""Verify newly catalogued identities against the official NVD CPE dictionary."""
import json
import time
import urllib.parse

import collector


PRODUCTS = {
    ('o', 'hpe', 'aruba_instant_on_1930_8g_2sfp_firmware'): {'1.0.7.0'},
    ('o', 'hpe', 'aruba_instant_on_1930_8g_class4_poe_2sfp_124w_firmware'): {'1.0.7.0'},
    ('o', 'fortinet', 'fortipam'): {'1.9.1', '1.9.0', '1.8.4', '1.8.3', '1.8.2', '1.8.1', '1.8.0', '1.7.3', '1.7.2', '1.7.1', '1.7.0'},
    ('a', 'fortinet', 'forticlient_ssl_vpn'): {'4.0.2012'},
    ('o', 'hp', 'simplivity_omnistack_for_cisco_firmware'): {'3.7.9', '3.5.2', '3.0.8'},
    ('o', 'hp', 'simplivity_omnistack_for_dell_firmware'): {'3.0.8'},
    ('o', 'hp', 'simplivity_omnistack_for_lenovo_firmware'): {'3.7.9', '3.5.2', '3.0.8'},
    ('a', 'microsoft', 'sql_server'): {'2022', '2019', '2017', '2016'},
    ('a', 'oracle', 'database_server'): {'23ai', '21c', '19c'},
}


def cpe_versions(part, vendor, product):
    pattern = f'cpe:2.3:{part}:{vendor}:{product}:*:*:*:*:*:*:*:*'
    url = 'https://services.nvd.nist.gov/rest/json/cpes/2.0?' + urllib.parse.urlencode({
        'cpeMatchString': pattern, 'resultsPerPage': 100,
    })
    payload = collector.fetch_json(url)
    rows = list(payload.get('products', []))
    while len(rows) < payload.get('totalResults', 0):
        page_url = url + '&' + urllib.parse.urlencode({'startIndex': len(rows)})
        page = collector.fetch_json(page_url)
        batch = page.get('products', [])
        if not batch:
            raise AssertionError(f'pagination CPE incomplète pour {vendor}:{product}')
        rows.extend(batch)
    return {row['cpe']['cpeName'].split(':')[5] for row in rows}


def main():
    report = {}
    passed = True
    for identity, required in PRODUCTS.items():
        available = cpe_versions(*identity)
        missing = required - available
        key = ':'.join(identity)
        report[key] = {'passed': not missing, 'verified_versions': sorted(required - missing), 'missing': sorted(missing)}
        passed = passed and not missing
        time.sleep(1)

    aruba = {
        'vendor': 'Aruba Instant On', 'product': 'Instant On 1930 8G 2SFP', 'version': '1.0.6.0',
        'part': 'o', 'cpeVendor': 'hpe', 'cpeProduct': 'aruba_instant_on_1930_8g_2sfp_firmware',
    }
    aruba_payload = collector.collect(aruba)
    structured = [item['id'] for item in aruba_payload['vulnerabilities']]
    report['aruba_structured_cve_correlation'] = {'passed': bool(structured), 'cves': structured}
    passed = passed and bool(structured)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not passed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
