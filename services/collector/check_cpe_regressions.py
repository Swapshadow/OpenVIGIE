"""Live NVD regression check for strict CPE applicability.

Run manually because it requires network access to the NVD API.
"""
import json
import urllib.parse

import collector
from test_version_matching import FORTI, MAC


REQUIRED_FORTIOS = {
    'CVE-2025-59718',
    'CVE-2026-24858',
    'CVE-2025-53844',
    'CVE-2025-25249',
}


def fetch_cve(cve_id):
    url = f"{collector.NVD_API}?{urllib.parse.urlencode({'cveId': cve_id})}"
    rows = collector.fetch_json(url).get('vulnerabilities', [])
    if len(rows) != 1:
        raise AssertionError(f'{cve_id}: réponse NVD inattendue ({len(rows)} résultat)')
    return rows[0]['cve']


def main():
    direct = {cve_id: collector.cve_confidence(fetch_cve(cve_id), FORTI)
              for cve_id in sorted(REQUIRED_FORTIOS)}
    forti = collector.collect(FORTI)
    forti_ids = {item['id'] for item in forti['vulnerabilities']}
    missing = REQUIRED_FORTIOS - forti_ids
    case_a = not missing and all(value == 'confirmed' for value in direct.values())

    legacy = fetch_cve('CVE-1999-0590')
    legacy_confidence = collector.cve_confidence(legacy, MAC)
    mac = collector.collect(MAC)
    mac_ids = {item['id'] for item in mac['vulnerabilities']}
    case_b = legacy_confidence == 'excluded' and 'CVE-1999-0590' not in mac_ids

    print(json.dumps({
        'case_A_fortios_7.6.3': {
            'passed': case_a,
            'retained': len(forti_ids),
            'required_direct_confidence': direct,
            'missing': sorted(missing),
        },
        'case_B_macos_26.6.1': {
            'passed': case_b,
            'retained': len(mac_ids),
            'CVE-1999-0590': legacy_confidence,
            'present_in_results': 'CVE-1999-0590' in mac_ids,
        },
    }, ensure_ascii=False, indent=2))
    if not case_a or not case_b:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
