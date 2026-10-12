import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = readFileSync(new URL('./app/asset-catalog.ts', import.meta.url), 'utf8');
const expected = [
  ['Aruba Instant On', 'hpe', 'aruba_instant_on_1930_8g_2sfp_firmware'],
  ['FortiPAM', 'fortinet', 'fortipam'],
  ['FortiVPN / FortiClient', 'fortinet', 'forticlient'],
  ['SimpliVity OmniStack for Cisco', 'hp', 'simplivity_omnistack_for_cisco_firmware'],
  ['Microsoft SQL Server', 'microsoft', 'sql_server'],
  ['Oracle Database', 'oracle', 'database_server'],
  ['Zabbix', 'zabbix', 'zabbix'],
  ['Backup & Replication', 'veeam', 'backup_and_replication'],
];

for (const [name, vendor, product] of expected) {
  assert.ok(catalog.includes(name), `${name} absent du catalogue`);
  assert.ok(catalog.includes(`cpeVendor: '${vendor}', cpeProduct: '${product}'`), `${name}: identité CPE absente`);
}
console.log(`PASS catalogue : ${expected.length} familles possèdent une identité CPE structurée`);
