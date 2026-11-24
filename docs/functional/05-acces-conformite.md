# Accès, confidentialité, conformité et audit

## Principes validés

- Accès authentifié et permissions adaptées aux rôles : adhérent, organisateur, DP, formation, trésorerie, administration.
- Les autres utilisateurs ne peuvent pas modifier les données opérationnelles d'une sortie réservée hors ligne par le DP.
- Toute opération financière et tout mouvement de crédit sont tracés, atomiques et exécutés côté serveur.
- Les données personnelles réelles ne doivent jamais figurer dans le dépôt public, les exemples, les journaux publics ni les événements d'agenda accessibles trop largement.

## Exigences de conception proposées

- Contrôles d'autorisation côté API sur chaque opération, sans se fier à l'interface.
- Journal d'audit : acteur, horodatage, opération, objet, avant/après ou différence pertinente, identifiant de corrélation.
- Sauvegardes chiffrées et restauration testée, gestion des secrets par environnement, HTTPS, limitation des accès aux données hors ligne.
- Gestion des droits d'accès et des durées de conservation des données conformément au RGPD ; analyse particulière des données de santé/aptitude et du CACI, en privilégiant la **minimisation**.
- Ne pas stocker de diagnostic médical ou de copie de certificat sans nécessité justifiée et validation juridique.
- Accès au formulaire public protégé contre usurpation, spam et divulgation d'inscriptions.
- Les jetons OAuth Google et les clés d'envoi de courriels ne doivent jamais être exposés au navigateur ou au dépôt.

## Socle actuellement implémenté

- Les sessions utilisent un jeton opaque transmis en `Bearer` ; seul son condensat SHA-256 est stocké et une session expirée est refusée.
- Les rôles persistés sont multiples par utilisateur : `admin`, `responsible`, `dp` et `member`.
- L'API vérifie le rôle avant d'exécuter une opération de feuille de sécurité. Les rôles `dp` et `admin` peuvent atteindre cette ressource, puis le service vérifie que l'acteur est le DP désigné de la sortie.
- La migration des rôles conserve les comptes existants et attribue `dp` aux utilisateurs déjà désignés comme directeurs d'une sortie.

## À valider avant production

Politique de confidentialité, base légale et information des personnes, conservation des documents, obligations réglementaires exactes des feuilles de sécurité, rôles de responsable de traitement/sous-traitant, politique d'accès aux données médicales et procédure de reprise d'un appareil DP perdu.
