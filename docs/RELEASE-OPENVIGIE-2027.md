# OpenVIGIE 2027 — notes de version

Version `v2027.0.0` — première release de la refonte 2027.

## Points forts

- Corrélation CVE fondée sur les données NVD du NIST, les CPE 2.3 et les plages
  de versions déclarées dans les configurations NVD.
- Refus explicite des versions Windows Server trop vagues : Windows Server 2022
  nécessite un numéro de build exact de la famille `10.0.20348.x`.
- Cache, limitation des appels NVD, statut de publication et origine de chaque
  CVE exposés au client.
- Comptes sécurisés, création d'organisation et sessions protégées par cookie
  HttpOnly, SameSite Strict et contrôle d'origine.
- Inventaire persistant isolé par organisation et cartographie interactive 3D
  avec types serveur, poste, switch, routeur, firewall, téléphone, cloud et
  service.
- Rapport hebdomadaire construit uniquement à partir des équipements de
  l'organisation connectée et de leurs instantanés NVD vérifiés.
- Catalogue enrichi (Docker, Wazuh, Suricata, OpenSSH, Alpine, pfSense, RHEL,
  VPN, SentinelOne, Sekoia et autres familles déjà présentes).
- Interface responsive, accessible et animations décoratives discrètes,
  automatiquement désactivées avec `prefers-reduced-motion`.
- Dépendances actualisées, audit sans vulnérabilité connue et CI dédiée au
  collecteur.
- Paramètres SMTP, destinataires, lecture des notifications et distributions
  d'alertes isolés par organisation et limités aux équipements de son parc.

## Mise à jour Docker sans perte de données

1. Sauvegarder le volume `openvigie_data` selon la procédure détaillée dans
   `docs/OPENVIGIE-2027.md`.
2. Conserver le fichier `.env` local et ne jamais le joindre à une issue, une
   image ou une archive publique.
3. Récupérer la version validée, puis exécuter `docker compose build --pull` et
   `docker compose up -d` sans option `-v`.
4. Vérifier `docker compose ps`, `http://localhost:3000/` et les journaux avant
   de supprimer une ancienne image.
5. En cas de retour arrière, restaurer la sauvegarde du volume avant de relancer
   l'ancienne version.

## Ruptures et précautions

- Les versions vagues ne produisent plus de liste CVE approximative.
- La première consultation d'un équipement exact peut attendre la réponse NVD ;
  les rapports programmés réutilisent ensuite uniquement le cache vérifié.
- Une clé NVD reste facultative mais augmente le débit autorisé par NVD. Elle
  doit rester dans l'environnement d'exécution.
- Après migration, reconfigurer les alertes email dans chaque organisation :
  les anciens réglages globaux ne sont pas attribués automatiquement à un
  compte. Ils restent dans la sauvegarde du volume et ne sont plus utilisés.
