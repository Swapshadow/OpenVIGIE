"""Live checks for the catalog regressions reported in September 2026."""
import json
import collector

CASES = [
    ({'vendor':'Fortinet','product':'FortiClient','version':'7.4.3','part':'a','cpeVendor':'fortinet','cpeProduct':'forticlient'}, None),
    ({'vendor':'Microsoft','product':'Microsoft SQL Server','version':'2022','part':'a','cpeVendor':'microsoft','cpeProduct':'sql_server'}, None),
    ({'vendor':'Fortinet','product':'FortiPAM','version':'1.9.1','part':'o','cpeVendor':'fortinet','cpeProduct':'fortipam'}, 'CVE-2026-49975'),
]

report = {}
passed = True
for query, required in CASES:
    payload = collector.collect(query)
    ids = [item['id'] for item in payload['vulnerabilities']]
    ok = bool(ids) and (required is None or required in ids)
    passed = passed and ok
    report[f"{query['product']} {query['version']}"] = {'passed': ok, 'count': len(ids), 'required': required, 'ids': ids[:20]}
print(json.dumps(report, ensure_ascii=False, indent=2))
if not passed:
    raise SystemExit(1)
