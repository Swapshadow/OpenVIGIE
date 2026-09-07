export type ProductDefinition = {
  id: string;
  name: string;
  family: string;
  part: 'a' | 'o' | 'h';
  cpeVendor?: string;
  cpeProduct?: string;
  advisoryUrl: string;
  versionOptional?: boolean;
};

export type VendorDefinition = {
  id: string;
  name: string;
  short: string;
  products: ProductDefinition[];
};

export const vendorCatalog: VendorDefinition[] = [
  {
    id: 'fortinet',
    name: 'Fortinet',
    short: 'FG',
    products: [
      {
        id: 'fortios', name: 'FortiOS / FortiGate', family: 'Pare-feu', part: 'o',
        cpeVendor: 'fortinet', cpeProduct: 'fortios',

        advisoryUrl: 'https://www.fortiguard.com/psirt',
      },
      {
        id: 'fortimanager', name: 'FortiManager', family: 'Administration', part: 'a',
        cpeVendor: 'fortinet', cpeProduct: 'fortimanager',

        advisoryUrl: 'https://www.fortiguard.com/psirt',
      },
      {
        id: 'fortipam', name: 'FortiPAM', family: 'Gestion des accès privilégiés', part: 'o',
        cpeVendor: 'fortinet', cpeProduct: 'fortipam',

        advisoryUrl: 'https://www.fortiguard.com/psirt',
      },
      {
        id: 'forticlient-ssl-vpn', name: 'FortiVPN / FortiClient', family: 'VPN', part: 'a',
        cpeVendor: 'fortinet', cpeProduct: 'forticlient',

        advisoryUrl: 'https://www.fortiguard.com/psirt',
      },
    ],
  },
  {
    id: 'cisco',
    name: 'Cisco',
    short: 'CX',
    products: [
      {
        id: 'ios-xe', name: 'IOS XE / Catalyst', family: 'Commutation & routage', part: 'o',
        cpeVendor: 'cisco', cpeProduct: 'ios_xe',

        advisoryUrl: 'https://sec.cloudapps.cisco.com/security/center/publicationListing.x',
      },
      {
        id: 'nx-os', name: 'NX-OS / Nexus', family: 'Datacenter', part: 'o',
        cpeVendor: 'cisco', cpeProduct: 'nx-os',

        advisoryUrl: 'https://sec.cloudapps.cisco.com/security/center/publicationListing.x',
      },
    ],
  },
  {
    id: 'aruba',
    name: 'HPE Aruba Networking',
    short: 'AR',
    products: [
      {
        id: 'aos-cx', name: 'AOS-CX / Aruba CX', family: 'Commutation', part: 'o',
        cpeVendor: 'arubanetworks', cpeProduct: 'aoscx',

        advisoryUrl: 'https://support.hpe.com/connect/s/securitybulletinlibrary',
      },
      {
        id: 'arubaos', name: 'ArubaOS / Mobility Controller', family: 'Wi-Fi', part: 'o',
        cpeVendor: 'arubanetworks', cpeProduct: 'arubaos',

        advisoryUrl: 'https://support.hpe.com/connect/s/securitybulletinlibrary',
      },
    ],
  },
  {
    id: 'aruba-instant-on',
    name: 'Aruba Instant On',
    short: 'IO',
    products: [
      { id: '1930-8g', name: 'Instant On 1930 8G 2SFP', family: 'Commutation', part: 'o', cpeVendor: 'hpe', cpeProduct: 'aruba_instant_on_1930_8g_2sfp_firmware', advisoryUrl: 'https://instanton.hpe.com/techdocs/en/content/get-started/Sites/security.htm' },
      { id: '1930-8g-poe', name: 'Instant On 1930 8G PoE 2SFP 124W', family: 'Commutation', part: 'o', cpeVendor: 'hpe', cpeProduct: 'aruba_instant_on_1930_8g_class4_poe_2sfp_124w_firmware', advisoryUrl: 'https://instanton.hpe.com/techdocs/en/content/get-started/Sites/security.htm' },
    ],
  },
  {
    id: 'palo-alto',
    name: 'Palo Alto Networks',
    short: 'PA',
    products: [
      {
        id: 'pan-os', name: 'PAN-OS', family: 'Pare-feu', part: 'o',
        cpeVendor: 'paloaltonetworks', cpeProduct: 'pan-os',

        advisoryUrl: 'https://security.paloaltonetworks.com/',
      },
    ],
  },
  {
    id: 'juniper',
    name: 'Juniper Networks',
    short: 'JN',
    products: [
      {
        id: 'junos', name: 'Junos OS', family: 'Commutation & routage', part: 'o',
        cpeVendor: 'juniper', cpeProduct: 'junos',

        advisoryUrl: 'https://supportportal.juniper.net/s/global-search/%40uri?language=en_US#sort=relevancy&f:ctype=[Security%20Advisories]',
      },
    ],
  },
  {
    id: 'vmware',
    name: 'VMware by Broadcom',
    short: 'VM',
    products: [
      {
        id: 'esxi', name: 'VMware ESXi', family: 'Virtualisation', part: 'o',
        cpeVendor: 'vmware', cpeProduct: 'esxi',

        advisoryUrl: 'https://support.broadcom.com/web/ecx/security-advisory',
      },
      {
        id: 'vcenter', name: 'vCenter Server', family: 'Virtualisation', part: 'a',
        cpeVendor: 'vmware', cpeProduct: 'vcenter_server',

        advisoryUrl: 'https://support.broadcom.com/web/ecx/security-advisory',
      },
    ],
  },
  {
    id: 'sentinelone',
    name: 'SentinelOne',
    short: 'S1',
    products: [
      {
        id: 'singularity-agent', name: 'Singularity Agent', family: 'EDR', part: 'a',

        advisoryUrl: 'https://www.sentinelone.com/vulnerability-database/',
      },
    ],
  },
  {
    id: 'checkpoint', name: 'Check Point', short: 'CP', products: [
      { id: 'gaia', name: 'Gaia OS / Quantum', family: 'Pare-feu', part: 'o', cpeVendor: 'checkpoint', cpeProduct: 'gaia_os', advisoryUrl: 'https://support.checkpoint.com/results/sk/sk180898' },
    ],
  },
  {
    id: 'sophos', name: 'Sophos', short: 'SO', products: [
      { id: 'sfos', name: 'Sophos Firewall OS', family: 'Pare-feu', part: 'o', cpeVendor: 'sophos', cpeProduct: 'sfos', advisoryUrl: 'https://support.sophos.com/support/s/?language=en_US' },
    ],
  },
  {
    id: 'sonicwall', name: 'SonicWall', short: 'SW', products: [
      { id: 'sonicos', name: 'SonicOS', family: 'Pare-feu & VPN', part: 'o', cpeVendor: 'sonicwall', cpeProduct: 'sonicos', advisoryUrl: 'https://psirt.global.sonicwall.com/vuln-list' },
      { id: 'sma', name: 'Secure Mobile Access', family: 'VPN', part: 'a', cpeVendor: 'sonicwall', cpeProduct: 'secure_mobile_access', advisoryUrl: 'https://psirt.global.sonicwall.com/vuln-list' },
    ],
  },
  {
    id: 'f5', name: 'F5 Networks', short: 'F5', products: [
      { id: 'big-ip', name: 'BIG-IP', family: 'ADC / VPN', part: 'a', cpeVendor: 'f5', cpeProduct: 'big-ip', advisoryUrl: 'https://my.f5.com/manage/s/article/K000137207' },
    ],
  },
  {
    id: 'ivanti', name: 'Ivanti', short: 'IV', products: [
      { id: 'connect-secure', name: 'Connect Secure', family: 'VPN', part: 'a', cpeVendor: 'ivanti', cpeProduct: 'connect_secure', advisoryUrl: 'https://www.ivanti.com/blog/topics/security-advisory' },
    ],
  },
  {
    id: 'citrix', name: 'Citrix', short: 'CT', products: [
      { id: 'netscaler', name: 'NetScaler ADC / Gateway', family: 'ADC / VPN', part: 'a', cpeVendor: 'citrix', cpeProduct: 'netscaler_gateway', advisoryUrl: 'https://support.citrix.com/support-home/kbsearch?query=security%20bulletin' },
    ],
  },
  {
    id: 'microsoft', name: 'Microsoft', short: 'MS', products: [
      { id: 'windows-server', name: 'Windows Server', family: 'Système serveur', part: 'o', cpeVendor: 'microsoft', cpeProduct: 'windows_server_2022', advisoryUrl: 'https://msrc.microsoft.com/update-guide/' },
      { id: 'defender-endpoint', name: 'Defender for Endpoint', family: 'EDR', part: 'a', versionOptional: true, advisoryUrl: 'https://msrc.microsoft.com/update-guide/' },
      { id: 'sql-server', name: 'Microsoft SQL Server', family: 'Base de données', part: 'a', cpeVendor: 'microsoft', cpeProduct: 'sql_server', advisoryUrl: 'https://msrc.microsoft.com/update-guide/' },
    ],
  },
  {
    id: 'hpe-simplivity', name: 'HPE SimpliVity', short: 'SV', products: [
      { id: 'omnistack-cisco', name: 'SimpliVity OmniStack for Cisco', family: 'Infrastructure hyperconvergée', part: 'o', cpeVendor: 'hp', cpeProduct: 'simplivity_omnistack_for_cisco_firmware', advisoryUrl: 'https://support.hpe.com/connect/s/securitybulletinlibrary' },
      { id: 'omnistack-dell', name: 'SimpliVity OmniStack for Dell', family: 'Infrastructure hyperconvergée', part: 'o', cpeVendor: 'hp', cpeProduct: 'simplivity_omnistack_for_dell_firmware', advisoryUrl: 'https://support.hpe.com/connect/s/securitybulletinlibrary' },
      { id: 'omnistack-lenovo', name: 'SimpliVity OmniStack for Lenovo', family: 'Infrastructure hyperconvergée', part: 'o', cpeVendor: 'hp', cpeProduct: 'simplivity_omnistack_for_lenovo_firmware', advisoryUrl: 'https://support.hpe.com/connect/s/securitybulletinlibrary' },
    ],
  },
  {
    id: 'crowdstrike', name: 'CrowdStrike', short: 'CS', products: [
      { id: 'falcon-sensor', name: 'Falcon Sensor', family: 'EDR', part: 'a', advisoryUrl: 'https://supportportal.crowdstrike.com/' },
    ],
  },
  {
    id: 'zscaler', name: 'Zscaler', short: 'ZS', products: [
      { id: 'zia', name: 'Zscaler Internet Access', family: 'SSE / Proxy', part: 'a', versionOptional: true, advisoryUrl: 'https://trust.zscaler.com/' },
      { id: 'zpa', name: 'Zscaler Private Access', family: 'ZTNA', part: 'a', versionOptional: true, advisoryUrl: 'https://trust.zscaler.com/' },
    ],
  },
  {
    id: 'ubiquiti', name: 'Ubiquiti', short: 'UI', products: [
      { id: 'unifi', name: 'UniFi Network', family: 'Réseau & Wi-Fi', part: 'a', cpeVendor: 'ui', cpeProduct: 'unifi_network_application', advisoryUrl: 'https://community.ui.com/releases/Security-Advisories' },
    ],
  },
  {
    id: 'dell', name: 'Dell Technologies', short: 'DE', products: [
      { id: 'os10', name: 'SmartFabric OS10', family: 'Commutation', part: 'o', cpeVendor: 'dell', cpeProduct: 'smartfabric_os10', advisoryUrl: 'https://www.dell.com/support/security/en-us' },
    ],
  },
  {
    id: 'extreme', name: 'Extreme Networks', short: 'EX', products: [
      { id: 'exos', name: 'ExtremeXOS', family: 'Commutation', part: 'o', cpeVendor: 'extremenetworks', cpeProduct: 'extremexos', advisoryUrl: 'https://www.extremenetworks.com/support/security-advisories' },
    ],
  },
  {
    id: 'netapp', name: 'NetApp', short: 'NA', products: [
      { id: 'ontap', name: 'ONTAP', family: 'Stockage', part: 'o', cpeVendor: 'netapp', cpeProduct: 'ontap', advisoryUrl: 'https://security.netapp.com/advisory/' },
    ],
  },
  {
    id: 'synology', name: 'Synology', short: 'SY', products: [
      { id: 'dsm', name: 'DiskStation Manager', family: 'NAS', part: 'o', cpeVendor: 'synology', cpeProduct: 'diskstation_manager', advisoryUrl: 'https://www.synology.com/security/advisory' },
    ],
  },
  {
    id: 'qnap', name: 'QNAP', short: 'QN', products: [
      { id: 'qts', name: 'QTS', family: 'NAS', part: 'o', cpeVendor: 'qnap', cpeProduct: 'qts', advisoryUrl: 'https://www.qnap.com/en/security-advisories' },
    ],
  },
  {
    id: 'veeam', name: 'Veeam', short: 'VB', products: [
      { id: 'backup-replication', name: 'Backup & Replication', family: 'Sauvegarde', part: 'a', advisoryUrl: 'https://www.veeam.com/kb4649' },
    ],
  },
  {
    id: 'proxmox', name: 'Proxmox', short: 'PX', products: [
      { id: 'pve', name: 'Proxmox VE', family: 'Virtualisation', part: 'o', cpeVendor: 'proxmox', cpeProduct: 'virtual_environment', advisoryUrl: 'https://pve.proxmox.com/wiki/Roadmap' },
    ],
  },
  {
    id: 'kubernetes', name: 'Kubernetes', short: 'K8', products: [
      { id: 'kubernetes', name: 'Kubernetes', family: 'Orchestration', part: 'a', cpeVendor: 'kubernetes', cpeProduct: 'kubernetes', advisoryUrl: 'https://kubernetes.io/docs/reference/issues-security/official-cve-feed/' },
    ],
  },
  {
    id: 'redhat', name: 'Red Hat', short: 'RH', products: [
      { id: 'rhel', name: 'Red Hat Enterprise Linux', family: 'Système serveur', part: 'o', cpeVendor: 'redhat', cpeProduct: 'enterprise_linux', advisoryUrl: 'https://access.redhat.com/security/security-updates/' },
    ],
  },
  {
    id: 'canonical', name: 'Canonical Ubuntu', short: 'UB', products: [
      { id: 'ubuntu', name: 'Ubuntu Linux (Server / Desktop)', family: 'Système Linux', part: 'o', cpeVendor: 'canonical', cpeProduct: 'ubuntu_linux', advisoryUrl: 'https://ubuntu.com/security/notices' },
    ],
  },
  {
    id: 'debian', name: 'Debian', short: 'DEB', products: [
      { id: 'debian-linux', name: 'Debian GNU/Linux', family: 'Système Linux', part: 'o', cpeVendor: 'debian', cpeProduct: 'debian_linux', advisoryUrl: 'https://www.debian.org/security/' },
    ],
  },
  {
    id: 'fedora', name: 'Fedora Project', short: 'FD', products: [
      { id: 'fedora-linux', name: 'Fedora Linux', family: 'Système Linux', part: 'o', cpeVendor: 'fedoraproject', cpeProduct: 'fedora', advisoryUrl: 'https://bodhi.fedoraproject.org/updates/?type=security' },
    ],
  },
  {
    id: 'sekoia',
    name: 'Sekoia.io',
    short: 'SK',
    products: [
      {
        id: 'xdr', name: 'Sekoia.io XDR', family: 'XDR / SIEM', part: 'a', versionOptional: true,
        advisoryUrl: 'https://www.sekoia.io/en/blog/',
      },
    ],
  },
  // ── Postes de travail, navigateurs, applicatif et sécurité française ──────
  // Versions issues du dictionnaire CPE du NVD : une version absente de cette
  // base ne remonterait aucune CVE et se lirait à tort comme « aucun risque ».
  {
    id: 'apple',
    name: 'Apple',
    short: 'AP',
    products: [
      {
        id: 'macos', name: 'macOS', family: 'Poste de travail', part: 'o',
        cpeVendor: 'apple', cpeProduct: 'macos',

        advisoryUrl: 'https://support.apple.com/en-us/HT201222',
      },
      {
        id: 'ios', name: 'iOS / iPhone', family: 'Mobile', part: 'o',
        cpeVendor: 'apple', cpeProduct: 'iphone_os',

        advisoryUrl: 'https://support.apple.com/en-us/HT201222',
      },
      {
        id: 'ipados', name: 'iPadOS', family: 'Mobile', part: 'o',
        cpeVendor: 'apple', cpeProduct: 'ipados',

        advisoryUrl: 'https://support.apple.com/en-us/HT201222',
      },
      {
        id: 'safari', name: 'Safari', family: 'Navigateur', part: 'a',
        cpeVendor: 'apple', cpeProduct: 'safari',

        advisoryUrl: 'https://support.apple.com/en-us/HT201222',
      },
    ],
  },
  {
    id: 'stormshield',
    name: 'Stormshield',
    short: 'SS',
    products: [
      {
        id: 'sns', name: 'Stormshield Network Security', family: 'Pare-feu', part: 'o',
        cpeVendor: 'stormshield', cpeProduct: 'stormshield_network_security',

        advisoryUrl: 'https://advisories.stormshield.eu/',
      },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    short: 'GO',
    products: [
      {
        id: 'chrome', name: 'Chrome', family: 'Navigateur', part: 'a',
        cpeVendor: 'google', cpeProduct: 'chrome',

        advisoryUrl: 'https://chromereleases.googleblog.com/',
      },
      {
        id: 'android', name: 'Android', family: 'Mobile', part: 'o',
        cpeVendor: 'google', cpeProduct: 'android',

        advisoryUrl: 'https://source.android.com/docs/security/bulletin',
      },
    ],
  },
  {
    id: 'mozilla',
    name: 'Mozilla',
    short: 'MZ',
    products: [
      {
        id: 'firefox', name: 'Firefox', family: 'Navigateur', part: 'a',
        cpeVendor: 'mozilla', cpeProduct: 'firefox',

        advisoryUrl: 'https://www.mozilla.org/en-US/security/advisories/',
      },
      {
        id: 'firefox-esr', name: 'Firefox ESR', family: 'Navigateur', part: 'a',
        cpeVendor: 'mozilla', cpeProduct: 'firefox_esr',

        advisoryUrl: 'https://www.mozilla.org/en-US/security/advisories/',
      },
      {
        id: 'thunderbird', name: 'Thunderbird', family: 'Messagerie', part: 'a',
        cpeVendor: 'mozilla', cpeProduct: 'thunderbird',

        advisoryUrl: 'https://www.mozilla.org/en-US/security/advisories/',
      },
    ],
  },
  {
    id: 'wallix',
    name: 'Wallix',
    short: 'WX',
    products: [
      {
        id: 'bastion', name: 'WALLIX Bastion', family: 'PAM / Accès privilégiés', part: 'a',
        cpeVendor: 'wallix', cpeProduct: 'bastion',

        advisoryUrl: 'https://www.wallix.com/security-advisories/',
      },
    ],
  },
  {
    id: 'spip',
    name: 'SPIP',
    short: 'SP',
    products: [
      {
        id: 'spip', name: 'SPIP', family: 'CMS', part: 'a',
        cpeVendor: 'spip', cpeProduct: 'spip',

        advisoryUrl: 'https://spip.net/fr_article6867.html',
      },
    ],
  },
  {
    id: 'glpi',
    name: 'GLPI Project',
    short: 'GL',
    products: [
      {
        id: 'glpi', name: 'GLPI', family: 'ITSM / Inventaire', part: 'a',
        cpeVendor: 'glpi-project', cpeProduct: 'glpi',

        advisoryUrl: 'https://github.com/glpi-project/glpi/security/advisories',
      },
    ],
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    short: 'NC',
    products: [
      {
        id: 'server', name: 'Nextcloud Server', family: 'Collaboration', part: 'a',
        cpeVendor: 'nextcloud', cpeProduct: 'nextcloud_server',

        advisoryUrl: 'https://nextcloud.com/security/',
      },
    ],
  },
  {
    id: 'zimbra',
    name: 'Zimbra',
    short: 'ZB',
    products: [
      {
        id: 'collaboration', name: 'Zimbra Collaboration', family: 'Messagerie', part: 'a',
        cpeVendor: 'zimbra', cpeProduct: 'collaboration',

        advisoryUrl: 'https://wiki.zimbra.com/wiki/Security_Center',
      },
    ],
  },
  {
    id: 'atlassian',
    name: 'Atlassian',
    short: 'AT',
    products: [
      {
        id: 'confluence', name: 'Confluence Server / DC', family: 'Collaboration', part: 'a',
        cpeVendor: 'atlassian', cpeProduct: 'confluence_server',

        advisoryUrl: 'https://confluence.atlassian.com/security/',
      },
      {
        id: 'jira', name: 'Jira Server / DC', family: 'Gestion de projet', part: 'a',
        cpeVendor: 'atlassian', cpeProduct: 'jira_server',

        advisoryUrl: 'https://confluence.atlassian.com/security/',
      },
    ],
  },
  {
    id: 'elastic',
    name: 'Elastic',
    short: 'EL',
    products: [
      {
        id: 'elasticsearch', name: 'Elasticsearch', family: 'Moteur de recherche', part: 'a',
        cpeVendor: 'elastic', cpeProduct: 'elasticsearch',

        advisoryUrl: 'https://discuss.elastic.co/c/announcements/security-announcements/31',
      },
      {
        id: 'kibana', name: 'Kibana', family: 'Visualisation', part: 'a',
        cpeVendor: 'elastic', cpeProduct: 'kibana',

        advisoryUrl: 'https://discuss.elastic.co/c/announcements/security-announcements/31',
      },
    ],
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    short: 'WP',
    products: [
      {
        id: 'core', name: 'WordPress Core', family: 'CMS', part: 'a',
        cpeVendor: 'wordpress', cpeProduct: 'wordpress',

        advisoryUrl: 'https://wordpress.org/news/category/security/',
      },
    ],
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    short: 'PG',
    products: [
      {
        id: 'postgresql', name: 'PostgreSQL', family: 'Base de données', part: 'a',
        cpeVendor: 'postgresql', cpeProduct: 'postgresql',

        advisoryUrl: 'https://www.postgresql.org/support/security/',
      },
    ],
  },
  {
    id: 'oracle-mysql',
    name: 'Oracle',
    short: 'MY',
    products: [
      {
        id: 'mysql', name: 'MySQL Server', family: 'Base de données', part: 'a',
        cpeVendor: 'oracle', cpeProduct: 'mysql',

        advisoryUrl: 'https://www.oracle.com/security-alerts/',
      },
      {
        id: 'database-server', name: 'Oracle Database', family: 'Base de données', part: 'a',
        cpeVendor: 'oracle', cpeProduct: 'database_server',

        advisoryUrl: 'https://www.oracle.com/security-alerts/',
      },
    ],
  },
  {
    id: 'apache',
    name: 'Apache Software Foundation',
    short: 'AS',
    products: [
      {
        id: 'httpd', name: 'Apache HTTP Server', family: 'Serveur web', part: 'a',
        cpeVendor: 'apache', cpeProduct: 'http_server',

        advisoryUrl: 'https://httpd.apache.org/security_report.html',
      },
      {
        id: 'tomcat', name: 'Apache Tomcat', family: 'Serveur applicatif', part: 'a',
        cpeVendor: 'apache', cpeProduct: 'tomcat',

        advisoryUrl: 'https://tomcat.apache.org/security.html',
      },
    ],
  },
  {
    id: 'nginx',
    name: 'nginx (F5)',
    short: 'NX',
    products: [
      {
        id: 'nginx', name: 'nginx', family: 'Serveur web', part: 'a',
        cpeVendor: 'f5', cpeProduct: 'nginx',

        advisoryUrl: 'https://nginx.org/en/security_advisories.html',
      },
    ],
  },
  {
    id: 'openssl',
    name: 'OpenSSL',
    short: 'SL',
    products: [
      {
        id: 'openssl', name: 'OpenSSL', family: 'Bibliothèque cryptographique', part: 'a',
        cpeVendor: 'openssl', cpeProduct: 'openssl',

        advisoryUrl: 'https://openssl-library.org/news/vulnerabilities/',
      },
    ],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    short: 'GI',
    products: [
      {
        id: 'gitlab', name: 'GitLab CE / EE', family: 'Forge logicielle', part: 'a',
        cpeVendor: 'gitlab', cpeProduct: 'gitlab',

        advisoryUrl: 'https://about.gitlab.com/releases/categories/releases/',
      },
    ],
  },
  {
    id: 'jenkins',
    name: 'Jenkins',
    short: 'JK',
    products: [
      {
        id: 'jenkins', name: 'Jenkins', family: 'Intégration continue', part: 'a',
        cpeVendor: 'jenkins', cpeProduct: 'jenkins',

        advisoryUrl: 'https://www.jenkins.io/security/advisories/',
      },
    ],
  },
  {
    id: 'grafana',
    name: 'Grafana Labs',
    short: 'GF',
    products: [
      {
        id: 'grafana', name: 'Grafana', family: 'Supervision', part: 'a',
        cpeVendor: 'grafana', cpeProduct: 'grafana',

        advisoryUrl: 'https://grafana.com/security/security-advisories/',
      },
    ],
  },
  {
    id: 'opnsense',
    name: 'OPNsense',
    short: 'OP',
    products: [
      {
        id: 'opnsense', name: 'OPNsense', family: 'Pare-feu', part: 'o',
        cpeVendor: 'opnsense', cpeProduct: 'opnsense',

        advisoryUrl: 'https://docs.opnsense.org/security.html',
      },
    ],
  },
  {
    id: 'pfsense',
    name: 'Netgate pfSense',
    short: 'PF',
    products: [
      {
        id: 'pfsense', name: 'pfSense', family: 'Pare-feu', part: 'o',
        cpeVendor: 'pfsense', cpeProduct: 'pfsense',

        advisoryUrl: 'https://docs.netgate.com/pfsense/en/latest/releases/',
      },
    ],
  },
  {
    id: 'mikrotik',
    name: 'MikroTik',
    short: 'MT',
    products: [
      {
        id: 'routeros', name: 'RouterOS', family: 'Routage', part: 'o',
        cpeVendor: 'mikrotik', cpeProduct: 'routeros',

        advisoryUrl: 'https://mikrotik.com/download/changelogs',
      },
    ],
  },
  {
    id: 'openvpn',
    name: 'OpenVPN',
    short: 'OV',
    products: [
      {
        id: 'openvpn', name: 'OpenVPN', family: 'VPN', part: 'a',
        cpeVendor: 'openvpn', cpeProduct: 'openvpn',

        advisoryUrl: 'https://openvpn.net/security-advisories/',
      },
    ],
  },
  {
    id: 'microsoft-endpoint',
    name: 'Microsoft (poste & messagerie)',
    short: 'MW',
    products: [
      {
        id: 'windows-11', name: 'Windows 11', family: 'Poste de travail', part: 'o',
        cpeVendor: 'microsoft', cpeProduct: 'windows_11_24h2',

        advisoryUrl: 'https://msrc.microsoft.com/update-guide',
        versionOptional: true,
      },
      {
        id: 'windows-10', name: 'Windows 10', family: 'Poste de travail', part: 'o',
        cpeVendor: 'microsoft', cpeProduct: 'windows_10_22h2',

        advisoryUrl: 'https://msrc.microsoft.com/update-guide',
        versionOptional: true,
      },
      {
        id: 'exchange', name: 'Exchange Server', family: 'Messagerie', part: 'a',
        cpeVendor: 'microsoft', cpeProduct: 'exchange_server',

        advisoryUrl: 'https://msrc.microsoft.com/update-guide',
        versionOptional: true,
      },
      {
        id: 'sharepoint', name: 'SharePoint Server', family: 'Collaboration', part: 'a',
        cpeVendor: 'microsoft', cpeProduct: 'sharepoint_server',

        advisoryUrl: 'https://msrc.microsoft.com/update-guide',
        versionOptional: true,
      },
    ],
  },
];

export function findVendor(vendorId: string) {
  return vendorCatalog.find((vendor) => vendor.id === vendorId) ?? vendorCatalog[0];
}

export function findProduct(vendorId: string, productId: string) {
  const vendor = findVendor(vendorId);
  return vendor.products.find((product) => product.id === productId) ?? vendor.products[0];
}
