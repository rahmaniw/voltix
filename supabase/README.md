# Courriel de réservation Voltix

La page utilise Supabase Auth avec un code de vérification à usage unique, la connexion par mot de passe et Google OAuth. Une fonction Edge envoie ensuite le récapitulatif via Resend. Aucune donnée bancaire n’est demandée ou stockée. Les réservations ne sont pas persistées dans une base de données.

## Configuration du navigateur

1. Créez un projet Supabase et activez l’authentification par courriel.
2. Dans `supabase-config.js`, renseignez l’URL du projet et sa clé `anon` publique. Ne placez jamais une clé `service_role` ou une clé Resend dans ce fichier.
3. Dans les modèles **Magic Link** et **Confirm signup** de Supabase Auth, affichez le code avec `{{ .Token }}`. Ne remplacez pas ce code par un lien si vous voulez que les personnes le saisissent sur la page.
4. Configurez le SMTP de Supabase Auth avec un expéditeur vérifié dans Resend.

La création de compte par mot de passe exige au moins 8 caractères dans le formulaire. Supabase vérifie ensuite l’adresse par OTP quand la confirmation par courriel est activée. La connexion par mot de passe et les sessions OAuth sont traitées par `supabase-js`; aucun mot de passe n’est enregistré par Voltix.

## Connexion Google

La page utilise `supabase-js` pour démarrer OAuth et restaurer la session après le retour de Google. Pour activer cette option :

1. Dans Google Cloud, créez un identifiant OAuth de type **Application Web**. Ajoutez l’origine HTTPS du site aux origines JavaScript autorisées.
2. Ajoutez comme URI de redirection autorisée l’URL de rappel affichée dans la configuration du fournisseur Google de Supabase, généralement `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Dans Supabase Auth > Providers > Google, activez Google et renseignez le Client ID et le Client Secret. Gardez le secret dans Supabase; ne le placez jamais dans les fichiers du site.
4. Dans la configuration des URL d’authentification Supabase, ajoutez l’URL HTTPS de `commande.html` aux URL de redirection autorisées.

## Fonction d’envoi

Déployez `functions/send-reservation` avec la CLI Supabase. Définissez les secrets de fonction côté Supabase, jamais dans le navigateur :

- `APP_ORIGIN` : origine HTTPS exacte du site, sans chemin ni barre oblique finale.
- `RESEND_API_KEY` : clé API Resend.
- `RESEND_FROM_EMAIL` : adresse expéditrice vérifiée dans Resend.
- `SUPABASE_URL` et `SUPABASE_ANON_KEY` : URL du projet et clé publique utilisées pour vérifier l’utilisateur.

La fonction exige un utilisateur authentifié dont l’adresse est vérifiée. Elle recalcule les montants côté serveur puis envoie un récapitulatif; elle ne stocke pas la commande.

La fonction d’authentification et l’envoi de courriel ne peuvent pas fonctionner depuis une ouverture `file://`. Hébergez le site en HTTPS et configurez les valeurs avant de proposer le formulaire au public.
