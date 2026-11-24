# Y'a plouf !

[Dépôt GitHub](https://github.com/arnou/ya-plouf)

Application open source **AGPL-3.0-only** de gestion de clubs de plongée. Le premier parcours disponible couvre la préparation en ligne de la feuille de sécurité par le DP désigné.

## Essayer le parcours avec des données fictives

Avec Docker Compose, créer un fichier `.env` local. Générer une valeur différente pour chaque variable avec `openssl rand -hex 32`, puis renseigner `POSTGRES_PASSWORD` et `SAFETY_SIGNING_KEY`. Garder la clé de signature stable entre deux démarrages.

```sh
docker compose up --build -d
docker compose exec app npm run demo
```

Ouvrir [http://localhost:3000](http://localhost:3000) et saisir l’identifiant de sortie et le jeton DP affichés par la commande de démonstration. Le jeton expire après huit heures et reste en mémoire dans l’interface. Il donne accès à la sortie fictive créée par cette exécution.

Le DP peut prévisualiser les inscrits confirmés, initialiser la feuille alors que les inscriptions sont ouvertes, ajouter un adhérent ou un invité, retirer un participant et examiner les écarts. Chaque modification du niveau détenu, des qualifications ou du CACI proposée par le référentiel est soumise séparément au DP. Tant que le club n’a pas défini de référentiel CACI, une date renseignée appelle une vérification et une date absente déclenche une alerte.

Les comptes et sorties de ce parcours sont fournis par la démonstration. L’administration des comptes, l’inscription publique, la réservation et la synchronisation hors ligne, l’export réglementaire et les finances restent à réaliser. Utiliser uniquement des données fictives avec ce socle local.

## Développer

Avec Node.js 22.19 ou supérieur et PostgreSQL, définir `DATABASE_URL` et `SAFETY_SIGNING_KEY` dans l’environnement du serveur.

```sh
npm ci
npm run migrate
npm run build
npm start
```

Pendant le développement, `npm run dev:web` démarre Vite avec un proxy vers l’API locale. `npm test` lance les tests unitaires. Définir `TEST_DATABASE_URL` vers une base de test et relancer `npm test` pour vérifier aussi le parcours HTTP avec PostgreSQL. Le test crée un schéma temporaire.

## Architecture et documentation

Le domaine TypeScript contient les règles métier. Les cas d’usage s’appuient sur des ports. Hono fournit l’entrée HTTP et PostgreSQL fournit le stockage transactionnel. React et Vite fournissent l’interface DP.

- [Cahier des charges](docs/README.md)
- [Architecture cible](docs/architecture/README.md)
- [Previews Cloudflare par pull request](docs/deployment/cloudflare-preview.md)
- [Parcours de préparation de la feuille de sécurité](docs/functional/03-securite-hors-ligne.md)
- [Décisions ouvertes](docs/DECISIONS_OUVERTES.md)
- [Feuille de route](docs/ROADMAP.md)
- [Licence AGPL-3.0-only](LICENSE)
