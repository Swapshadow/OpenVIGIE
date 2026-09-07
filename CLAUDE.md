# OpenVigie - Contexte du projet et directive Mistral

Ce fichier fournit à Claude le contexte nécessaire pour intervenir sur OpenVigie.
Il doit être lu avant toute modification du projet, en particulier avant une
opération liée à Ollama ou au modèle local.

## Présentation du projet

OpenVigie est une application open source de veille cybersécurité centrée sur le
parc informatique de l'utilisateur.

Le projet cherche à transformer des sources publiques et attribuées en
informations directement exploitables :

- actualités cyber récentes ;
- vulnérabilités liées aux produits et versions du parc ;
- exploitation active signalée par CISA KEV ;
- alertes et avis CERT-FR, CERT-EU, CISA et PSIRT éditeurs ;
- campagnes de menace, groupes APT et indicateurs de compromission ;
- risques liés à la chaîne d'approvisionnement logicielle ;
- bulletin, matrice de risques et alertes expliquées.

OpenVigie est un outil d'aide à la veille. Il ne doit pas être présenté comme un
scanner de vulnérabilités, une preuve autonome ou un système autorisé à modifier
automatiquement une infrastructure de production.

## Architecture fonctionnelle

Le flux général attendu est le suivant :

```text
Sources RSS/Atom et API attribuées
        ↓
Collecteur et normalisation
        ↓
Règles factuelles CVE / versions / parc / CISA KEV
        ↓
Analyse locale par Mistral
        ↓
Bulletin / matrice du parc / alertes
```

Les principaux composants sont :

- `apps/web` : application Web et routes API côté interface ;
- `services/collector` : collecte RSS/Atom, NVD, CISA KEV, stockage SQLite et
  orchestration de l'analyse locale ;
- `compose.yaml` : orchestration portable de l'application, du collecteur et
  d'Ollama ;
- volume `openvigie_data` : base et données normalisées d'OpenVigie ;
- volume `openvigie_ollama` : fichiers du modèle téléchargé par Ollama.

Le bulletin constitue actuellement la vue automatique des dernières nouvelles
cyber. L'IA locale doit progressivement contribuer à sa déduplication, son
classement, ses résumés et sa mise à jour éditoriale assistée.

## Rôle de Mistral

Le modèle de référence est :

```text
mistral:7b-instruct
```

Mistral 7B Instruct : ~4.1 GB, meilleur français, recommandé.

Mistral doit analyser uniquement les éléments fournis par le collecteur. Le
modèle ne navigue pas lui-même sur le Web et ne devient jamais une source.

Fonctions attendues :

1. regrouper les articles décrivant le même événement ;
2. classer les éléments en menace, vulnérabilité, détection, conformité ou autre ;
3. produire un résumé concis en français ;
4. extraire CVE, éditeur, produit, version, APT, malware et IOC explicitement cités ;
5. estimer la pertinence pour les équipements déclarés dans le parc ;
6. proposer une priorité et l'expliquer ;
7. conserver les noms et URL de toutes les sources utilisées ;
8. signaler les informations absentes, contradictoires ou incertaines.

## Règle de priorité fondamentale

Les règles factuelles priment toujours sur le score de l'IA.

Claude ne doit jamais modifier l'architecture de manière à permettre au modèle :

- de diminuer une priorité imposée par CISA KEV ;
- d'ignorer une correspondance confirmée entre une CVE et une version du parc ;
- de remplacer une plage de versions publiée par un éditeur ;
- d'inventer une CVE, une source, une URL, une date, une version ou un IOC ;
- de masquer l'incertitude ou la provenance d'une information.

Hiérarchie indicative :

```text
Avis primaire de l'éditeur
    + NVD / identifiant CVE
    + CISA KEV / exploitation connue
    + correspondance produit-version du parc
    > classement et score proposés par Mistral
```

## Directive de configuration Docker

Mistral doit fonctionner uniquement dans Docker pour OpenVigie.

Contraintes obligatoires :

- ne pas installer Ollama ou Mistral nativement avec Homebrew, apt, winget ou un
  autre gestionnaire du système hôte ;
- ne pas écrire le modèle dans un dossier personnel de l'utilisateur ;
- conserver les fichiers du modèle dans le volume Docker
  `openvigie_ollama:/root/.ollama` ;
- utiliser le réseau interne Docker et l'adresse
  `http://ollama:11434` depuis le collecteur ;
- exposer l'API Ollama sur l'hôte uniquement via
  `127.0.0.1:${OLLAMA_PORT:-11434}:11434` ;
- préserver la compatibilité Windows, Linux et macOS ;
- ne pas ajouter de dépendance à une API d'IA distante ;
- ne jamais supprimer les volumes OpenVigie pendant une mise à jour normale.

Configuration de référence :

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    environment:
      OLLAMA_CONTEXT_LENGTH: ${OLLAMA_CONTEXT_LENGTH:-2048}
      OLLAMA_NUM_PARALLEL: ${OLLAMA_NUM_PARALLEL:-1}
    ports:
      - "127.0.0.1:${OLLAMA_PORT:-11434}:11434"
    volumes:
      - openvigie_ollama:/root/.ollama
    restart: unless-stopped

  ollama-model:
    image: ollama/ollama:latest
    environment:
      OLLAMA_HOST: http://ollama:11434
    entrypoint: ["ollama", "pull"]
    command: ["${OLLAMA_MODEL:-mistral:7b-instruct}"]
```

Variables attendues dans `.env` :

```dotenv
# Mistral 7B Instruct : ~4.1 GB, meilleur français, recommandé.
OLLAMA_MODEL=mistral:7b-instruct
OLLAMA_PORT=11434
OLLAMA_CONTEXT_LENGTH=2048
OLLAMA_NUM_PARALLEL=1
```

Le contexte de 2048 tokens et une seule inférence parallèle réduisent la pression
mémoire sur les ordinateurs personnels. Mistral 7B Instruct nécessite néanmoins
environ 6 Go de mémoire attribuée à Docker pour charger le modèle dans de bonnes
conditions. Sur un Mac disposant de 8 Go de RAM, éviter les applications lourdes
pendant l'inférence.

## Démarrage normal

Depuis la racine du projet :

```bash
docker compose up -d --build
```

Au premier démarrage, le service `ollama-model` télécharge
`mistral:7b-instruct`. Le conteneur doit ensuite se terminer avec le code `0`.
Les démarrages suivants réutilisent le modèle présent dans le volume.

Ne pas considérer un conteneur d'initialisation arrêté avec le code `0` comme une
erreur. Il indique que le téléchargement s'est terminé correctement.

## Vérifications obligatoires

Avant d'annoncer que Mistral est opérationnel, Claude doit vérifier toutes les
étapes suivantes.

### 1. Configuration Compose

```bash
docker compose config --quiet
```

### 2. État des conteneurs

```bash
docker compose ps -a
```

Résultat attendu :

- `ollama` est démarré et sain ;
- `collector` est démarré et sain ;
- `web` est démarré ;
- `ollama-model` est terminé avec le code `0` après le téléchargement.

### 3. Présence du modèle

```bash
docker compose exec -T ollama ollama list
```

La liste doit contenir exactement le tag configuré :

```text
mistral:7b-instruct
```

### 4. Véritable inférence locale

```bash
docker compose exec -T ollama \
  ollama run mistral:7b-instruct "Réponds uniquement par : OpenVigie opérationnel"
```

La seule présence du modèle dans `ollama list` ne suffit pas. Une réponse réelle
doit être obtenue sans erreur mémoire et sans appel à un service distant.

### 5. API OpenVigie

```bash
curl --max-time 300 \
  "http://127.0.0.1:3000/api/ai/news-brief?cadence=daily&limit=3"
```

Vérifier un code HTTP `200`, le nom du modèle, une synthèse française non vide et
la présence des sources attribuées.

### 6. Flux structuré de tri

Le tri doit produire des résultats distincts pour :

- le bulletin dédupliqué ;
- la matrice liée au parc ;
- les alertes prioritaires ;
- les entités extraites ;
- la justification de la priorité ;
- l'origine de la priorité, `rules` ou `ai`.

## Gestion des erreurs

En cas d'échec :

- consulter `docker compose logs --tail=100 ollama` ;
- contrôler la mémoire Docker avec `docker stats --no-stream` ;
- contrôler l'espace disque de l'hôte et de Docker ;
- conserver les données et les volumes ;
- ne supprimer qu'un cache de construction ou un téléchargement partiel dont la
  corruption est confirmée ;
- ne jamais lancer `docker compose down -v` pour résoudre un problème courant ;
- ne jamais effacer globalement les images, conteneurs ou volumes qui ne sont pas
  exclusivement liés à OpenVigie ;
- documenter précisément le blocage si une action utilisateur est nécessaire.

## Consignes de modification pour Claude

Avant toute modification :

1. lire `git status --short` et préserver les changements existants ;
2. inspecter `compose.yaml`, `.env.example`, `services/collector/collector.py` et
   les routes API concernées ;
3. rester dans le périmètre demandé ;
4. ne pas écraser les documents ou livrables existants ;
5. vérifier la syntaxe Python, la configuration Compose et le build Web ;
6. tester proportionnellement au risque de la modification ;
7. expliquer les fichiers changés et les contrôles réellement effectués.

Si une migration vers un autre modèle est demandée ultérieurement, elle doit être
explicite, documentée et appliquée de façon cohérente dans `compose.yaml`,
`.env.example`, le collecteur, les tests et la documentation. Ne pas remplacer
silencieusement `mistral:7b-instruct`.


## Règle de non-régression : corrélation CPE exclusivement (politique 3)

Une CVE ne peut être associée à un équipement que si au moins un élément NVD
`configurations/cpeMatch` remplit simultanément toutes ces conditions :

1. CPE 2.3 structuré et `vulnerable=true` ;
2. `part`, `vendor` et `product` identiques à ceux de l’équipement ;
3. version CPE exactement identique à la version installée, ou version installée
   explicitement couverte par `versionStartIncluding`, `versionStartExcluding`,
   `versionEndIncluding` et/ou `versionEndExcluding`.

Un CPE avec version `*` sans borne ne couvre aucune version déterminée pour
OpenVigie. Les versions absentes, `-`, non comparables, les CPE incomplets et les
configurations ambiguës sont exclus, jamais affichés comme « à vérifier » dans le
parc. Il est interdit d’utiliser le titre, la description, le résumé, le vendeur,
le produit ou un `keywordSearch` pour associer une CVE à un équipement.

Les recherches textuelles restent autorisées dans les outils explicitement dédiés
à la recherche d’articles ou à la veille manuelle, mais elles ne doivent alimenter
ni la liste CVE du parc, ni sa matrice, ni Vigi, ni les notifications ou emails.
Les articles liés à un équipement ne le sont que par intersection avec un identifiant
CVE déjà confirmé par la règle CPE ci-dessus.

## Règle de non-régression : shell et navigation persistants

La topbar et la sidebar de navigation sont montées exactement une fois par le
layout racine dans `apps/web/app/layout.tsx`, via `AppShell`. Une vue locale
(bulletin, fuites, parc ou paramètres) ne doit jamais recréer, remplacer ou
démonter ce shell. Les actions internes, notamment l’ajout ou la suppression
d’un équipement, ne modifient que l’état de leur vue. Toute navigation interne
passe par l’état du shell persistant et ne recharge pas le document.

Sans `cpeVendor`, `cpeProduct` et version fiables, afficher exactement :
« Pas de correspondance CPE fiable — recherche manuelle recommandée » et une liste
CVE vide. Un changement de politique doit purger les instantanés et désactiver les
anciennes notifications avant recalcul. Une absence de résultat reste dépendante de
la couverture NVD et ne constitue pas une preuve d’absence de vulnérabilité.

## Règle de non-régression : catalogue de versions dynamique

Le catalogue de versions ne doit plus jamais être une liste statique codée en
dur. Toute marque/produit doit utiliser `fetch_dictionary_versions()` avec cache
SQLite `cpe_version_cache` (TTL 7j) et saisie libre en fallback.
