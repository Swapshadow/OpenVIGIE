# OpenVigie 2027 — architecture et mise à niveau

## NIST, NVD et corrélation des CVE

Le **NIST** est l’organisme fédéral américain qui opère la **National Vulnerability Database (NVD)**. Le NIST n’est donc pas une seconde base à fusionner avec la NVD : la NVD est le service et le jeu de données exploité par OpenVigie, notamment via les API CVE 2.0 et CPE 2.0.

OpenVigie n’associe jamais une CVE à un équipement sur la seule présence d’un mot dans son titre ou sa description. Une association doit être démontrée par :

1. une identité CPE 2.3 structurée (partie, fournisseur, produit) ;
2. une version exacte ou une plage `versionStart*` / `versionEnd*` qui couvre la version installée ;
3. un enregistrement NVD qui n’est pas au statut `Rejected` ;
4. à défaut de configuration CPE, une plage structurée `affected` du CNA publiée dans l’enregistrement NVD ;
5. exceptionnellement, une plage issue d’un avis primaire explicitement auditée dans le code.

Les CPE génériques sans version ni bornes sont exclus. Pour Windows Server 2022, le libellé « 2022 » ou « 21H2 » est volontairement refusé : l’utilisateur doit saisir le build exact (`winver`, par exemple `10.0.20348.x`). Cette règle empêche le retour de milliers d’entrées historiques sans preuve d’applicabilité au niveau de correctif installé.

L’API NVD est régulée à une requête toutes les 6,2 secondes sans clé et 0,7 seconde avec clé. Les résultats par équipement sont mis en cache dans le volume Docker ; une erreur NVD ne transforme jamais une absence de données en « aucun risque ».

## Organisations et isolation

- Un premier utilisateur crée son organisation lors de l’inscription.
- Les mots de passe sont dérivés avec scrypt et un sel aléatoire ; aucune valeur en clair n’est stockée.
- Les sessions aléatoires sont conservées sous forme de hash et remises au navigateur dans un cookie HttpOnly, `SameSite=Strict`.
- Chaque équipement porte obligatoirement l’identifiant de son organisation. Les lectures et suppressions utilisent simultanément l’identifiant de l’équipement et celui de l’organisation.
- Le rapport hebdomadaire lit uniquement les équipements de l’organisation de la session. Il ne déclenche pas une collecte NVD synchrone : il exploite les instantanés stricts déjà vérifiés et signale les équipements non vérifiés.

## Mise à jour Docker sans perte de données

1. Sauvegarder le volume de données avant toute mise à niveau :

   ```powershell
   docker run --rm -v openvigie_openvigie_data:/data -v ${PWD}:/backup alpine tar czf /backup/openvigie-data-backup.tgz -C /data .
   ```

2. Récupérer la version puis reconstruire les services applicatifs :

   ```powershell
   git fetch --tags
   git checkout <version-validée>
   docker compose up -d --build collector web
   ```

3. Ne pas exécuter `docker compose down -v` : l’option `-v` supprimerait les volumes.
4. Vérifier `docker compose ps`, puis ouvrir `http://localhost:3000/`.
5. En cas de retour arrière, restaurer le tag précédent ; le schéma est migré de façon additive.

Les volumes `openvigie_data`, `openvigie_ollama`, `openvigie_caddy_data` et `openvigie_caddy_config` sont déclarés comme volumes nommés et sont préservés par `docker compose up -d --build`.

## Vérifications avant release

- tests Python du collecteur et des limites d’organisation ;
- lint et build du client web ;
- construction Docker locale ;
- parcours d’inscription, inventaire, cartographie et rapport ;
- recherche de secrets et contrôle des fichiers suivis ;
- release uniquement si l’isolation email et les critères de migration ont également été validés.
