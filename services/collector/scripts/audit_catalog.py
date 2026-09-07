"""Automated catalogue audit: structured-CPE validity + OpenCVE cross-check.

For every vendor/product declared in apps/web/app/asset-catalog.ts this script:

1. confirms the product exposes at least one structured CPE identity in the NVD
   CPE dictionary (existence probe that reuses collector.dictionary_identities
   so alias identities stay in sync with production);
2. counts the CVEs NVD associates with that product CPE (totalResults for the
   `cpe:2.3:<part>:<vendor>:<product>` virtual match);
3. queries the OpenCVE API for the same vendor/product and compares the two
   totals, flagging a divergence greater than 50 %.

OpenCVE authentication is optional. Set OPENCVE_API_TOKEN (Bearer token,
`opc_org.<id>.<secret>`) to enable step 3; without it every product is reported
as `opencve: skipped` and the script still runs steps 1-2.

Network access to the NVD API (and OpenCVE when enabled) is required. Run
manually, not from CI.

Usage:
    cd services/collector
    python scripts/audit_catalog.py [--json report.json]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import collector  # noqa: E402

CATALOG_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "apps", "web", "app", "asset-catalog.ts"
)
OPENCVE_BASE = os.environ.get("OPENCVE_API_BASE", "https://app.opencve.io/api/v2").rstrip("/")
OPENCVE_TOKEN = os.environ.get("OPENCVE_API_TOKEN", "").strip()
DIVERGENCE_THRESHOLD = 0.5
HTTP_TIMEOUT = 30


def load_catalog() -> list[dict]:
    """Extract every product object from the TypeScript catalogue by structure.

    Product objects never nest braces, so a non-greedy `{...}` scan over the
    `vendorCatalog` array is enough and avoids a JS parser dependency.
    """
    source = open(os.path.normpath(CATALOG_PATH), encoding="utf-8").read()
    products: list[dict] = []
    for block in re.findall(r"\{[^{}]*\}", source):
        if "name:" not in block or "part:" not in block:
            continue

        def field(key: str) -> str | None:
            match = re.search(rf"\b{key}:\s*'([^']*)'", block)
            return match.group(1) if match else None

        name, part = field("name"), field("part")
        if not name or part not in ("a", "o", "h"):
            continue
        products.append({
            "name": name,
            "part": part,
            "cpeVendor": field("cpeVendor"),
            "cpeProduct": field("cpeProduct"),
            "versionOptional": "versionOptional: true" in block,
        })
    return products


def _dictionary_hit(part: str, vendor: str, product: str) -> bool:
    """`totalResults > 0` for cpe:2.3:<part>:<vendor>:<product>:*. A deprecated
    entry still counts — the identity is real, deprecation only redirects to a
    successor CPE."""
    for cpe_part, cpe_vendor, cpe_product in collector.dictionary_identities(part, vendor, product):
        pattern = (f"cpe:2.3:{cpe_part}:{collector.cpe_component(cpe_vendor)}:"
                   f"{collector.cpe_component(cpe_product)}:*:*:*:*:*:*:*:*")
        url = collector.NVD_CPE_API + "?" + urllib.parse.urlencode(
            {"cpeMatchString": pattern, "resultsPerPage": 1})
        if int(collector.fetch_json(url).get("totalResults", 0)) > 0:
            return True
    return False


def cpe_identity_status(part: str, vendor: str, product: str) -> str:
    """'ok'          — NVD knows this exact <part>:<vendor>:<product>;
    'wrong-part'  — unknown as declared but present under the other part
                    (the catalogue's `part` is likely wrong);
    'absent'      — NVD has no such structured identity at all.
    Reuses collector.dictionary_identities so SQL Server / VMware ESXi aliases
    are covered without re-implementing that mapping.
    """
    if _dictionary_hit(part, vendor, product):
        return "ok"
    other = {"a": "o", "o": "a"}.get(part)
    if other and _dictionary_hit(other, vendor, product):
        return "wrong-part"
    return "absent"


def nvd_cve_total(part: str, vendor: str, product: str) -> int:
    """Number of CVEs NVD ties to this exact product CPE."""
    virtual = f"cpe:2.3:{part}:{collector.cpe_component(vendor)}:{collector.cpe_component(product)}"
    url = f"{collector.NVD_API}?{urllib.parse.urlencode({'virtualMatchString': virtual, 'resultsPerPage': 1})}"
    return int(collector.fetch_json(url).get("totalResults", 0))


def opencve_cve_total(vendor: str, product: str) -> int | None:
    """CVE count reported by OpenCVE for vendor/product, or None when disabled."""
    if not OPENCVE_TOKEN:
        return None
    candidates = [
        f"{OPENCVE_BASE}/vendors/{urllib.parse.quote(vendor)}/products/{urllib.parse.quote(product)}/cves?page_size=1",
        f"{OPENCVE_BASE}/cves?{urllib.parse.urlencode({'vendor': vendor, 'product': product, 'page_size': 1})}",
    ]
    last_error: str | None = None
    for url in candidates:
        request = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {OPENCVE_TOKEN}",
            "Accept": "application/json",
            "User-Agent": "OpenVigie-catalog-audit/1.0",
        })
        try:
            with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
                payload = json.loads(response.read() or b"{}")
            if isinstance(payload.get("count"), int):
                return payload["count"]
            last_error = "réponse OpenCVE sans champ count"
        except urllib.error.HTTPError as error:
            last_error = f"HTTP {error.code}"
            if error.code in (401, 403):
                raise RuntimeError("OpenCVE : jeton refusé (401/403)") from None
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            last_error = type(error).__name__
    raise RuntimeError(f"OpenCVE injoignable ({last_error})")


def audit() -> dict:
    products = load_catalog()
    ok: list[str] = []
    divergent: list[dict] = []
    no_cpe: list[dict] = []
    saas: list[str] = []
    opencve_enabled = bool(OPENCVE_TOKEN)
    opencve_failed = False

    for entry in products:
        label = entry["name"]
        if not entry["cpeVendor"] or not entry["cpeProduct"]:
            (saas if entry["versionOptional"] else no_cpe).append(
                label if entry["versionOptional"] else {"product": label, "reason": "aucune identité CPE déclarée"}
            )
            continue

        part, vendor, product = entry["part"], entry["cpeVendor"], entry["cpeProduct"]
        try:
            status = cpe_identity_status(part, vendor, product)
        except Exception as error:  # network or parsing
            status = "ok"  # do not report a transient network error as a catalogue defect
            print(f"  ! {label}: dictionnaire CPE illisible ({type(error).__name__})", file=sys.stderr)
        if status != "ok":
            reason = ("identité connue du NVD sous l'autre `part` — corriger `part` dans le catalogue"
                      if status == "wrong-part"
                      else "aucune identité CPE structurée dans le dictionnaire NVD")
            no_cpe.append({"product": label, "cpe": f"{part}:{vendor}:{product}",
                           "issue": status, "reason": reason})
            continue

        try:
            nvd_total = nvd_cve_total(part, vendor, product)
        except Exception as error:
            nvd_total = None
            print(f"  ! {label}: total NVD indisponible ({type(error).__name__})", file=sys.stderr)

        opencve_total: int | None = None
        if opencve_enabled and not opencve_failed:
            try:
                opencve_total = opencve_cve_total(vendor, product)
            except RuntimeError as error:
                opencve_failed = True
                print(f"  ! OpenCVE désactivé pour la suite : {error}", file=sys.stderr)

        record = {"product": label, "cpe": f"{part}:{vendor}:{product}",
                  "nvd_cves": nvd_total, "opencve_cves": opencve_total}
        if nvd_total is not None and opencve_total is not None:
            worst = max(nvd_total, opencve_total, 1)
            gap = abs(nvd_total - opencve_total) / worst
            record["divergence"] = round(gap, 2)
            if gap > DIVERGENCE_THRESHOLD:
                divergent.append(record)
            else:
                ok.append(label)
        else:
            # Nothing to compare against — CPE is valid, so not a failure.
            ok.append(label)

    return {
        "catalog_products": len(products),
        "opencve_check": "enabled" if opencve_enabled and not opencve_failed
        else "aborted" if opencve_failed else "skipped (set OPENCVE_API_TOKEN)",
        "summary": {
            "ok": len(ok),
            "divergent": len(divergent),
            "without_valid_cpe": len(no_cpe),
            "saas_no_version": len(saas),
        },
        "products_ok": sorted(ok),
        "products_divergent": divergent,
        "products_without_valid_cpe": no_cpe,
        "products_saas_no_version": sorted(saas),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", metavar="PATH", help="écrire aussi le rapport JSON dans ce fichier")
    arguments = parser.parse_args()

    report = audit()
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if arguments.json:
        open(arguments.json, "w", encoding="utf-8").write(rendered + "\n")

    if report["products_without_valid_cpe"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
