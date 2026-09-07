import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('./app/layout.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./app/app-shell.tsx', import.meta.url), 'utf8');
const inventory = readFileSync(new URL('./app/inventory-workspace.tsx', import.meta.url), 'utf8');

assert.equal((layout.match(/<AppShell\b/g) ?? []).length, 1, 'AppShell doit être monté une seule fois par le layout racine');
assert.equal((shell.match(/<aside className="sidebar/g) ?? []).length, 1, 'la sidebar doit avoir une seule instance');
assert.equal(inventory.includes('className="sidebar'), false, 'la vue parc ne doit jamais posséder la sidebar');
assert.equal(/window\.location|location\.(?:assign|replace)|router\.(?:push|replace)|history\.(?:pushState|replaceState)/.test(inventory), false,
  "l'ajout d'un équipement ne doit déclencher aucune navigation de document");
console.log('PASS ajout équipement : AppShell racine unique, sidebar persistante, aucune navigation locale');
