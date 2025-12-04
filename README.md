# Alpha-Analytics

Dashboard de trading **local & privé** pour analyser tes performances à partir de rapports d’historique de compte (HTML).

- 🔒 100% local : aucune donnée envoyée sur un serveur  
- 📊 Stats avancées, equity curve, PnL par instrument / jour / heure  
- 🧮 Filtres dynamiques (dates, symbole, direction, résultat)  
- 📁 Import de rapport HTML exporté depuis ta plateforme de trading  
- 💾 Données stockées dans ton navigateur (localStorage)  
- 💻 Installable comme une “vraie” application de bureau (PWA)

---

## 🌐 Version en ligne

Tu peux utiliser l’app directement ici (recommandé) :

➡️ **[Alpha Analytics](https://dimzdev-dev.github.io/alpha-analytics/)**

Aucune installation, tout se passe dans ton navigateur.

---

## 🛠️ Utilisation en local

Si tu préfères cloner le projet et l’ouvrir en local :

```bash
git clone https://github.com/dimzdev-dev/alpha-analytics.git
cd alpha-analytics
# Ouvre index.html dans ton navigateur
# ou utilise une extension type "Live Server" / un petit serveur local
```

---

## 📥 Comment obtenir le rapport à importer ?

Alpha-Analytics fonctionne à partir d’un **rapport d’historique de compte** exporté depuis ta **plateforme de trading**.

En général, le principe est le suivant :

1. Ouvre ta plateforme de trading.  
2. Affiche l’**historique de ton compte** (historique des ordres / transactions).  
3. Choisis une période (par exemple : *Tout l’historique* ou une période personnalisée).  
4. Utilise l’option du type :  
   - *Enregistrer en tant que rapport*  
   - *Exporter l’historique*  
   - *Save as report* / *Export statement*  

5. **Format du fichier :** sélectionne le format **HTML** (`.html` / `.htm`).  
6. Une fois le fichier généré sur ton PC, tu peux l’**importer dans Alpha-Analytics** via le bouton **« Importer »**.

L’app va lire ce fichier localement, extraire les trades et calculer toutes les stats.

---

## 📊 Ce que le dashboard calcule

À partir des trades importés + des filtres appliqués, Alpha-Analytics affiche notamment :

- ✅ **Résultat net filtré**  
- ✅ **Taux de réussite (winrate)**  
- ✅ Nombre total de trades  
- ✅ Nombre d’instruments tradés  
- ✅ **PnL moyen par trade**  
- ✅ Gains totaux / pertes totales  
- ✅ **Profit factor**  
- ✅ Plus longue série gagnante / perdante  
- ✅ Meilleur trade / pire trade  
- ✅ Capital initial, capital fermé, **max drawdown** (valeur & %)

Et via les graphiques :

- 📈 **Évolution de l’equity**  
- 🥧 **PnL par instrument**  
- 📅 **PnL par jour de la semaine**  
- ⏰ **PnL par heure d’ouverture**

---

## 🧩 Fonctionnement & stockage

Toutes les données sont **stockées uniquement dans ton navigateur**, via `localStorage` :

- `tradeAnalytics_trades` : la liste des trades importés  
- `tradeAnalytics_meta` : informations du compte (nom, capital, type, devise)  
- `tradeAnalytics_version` : version de l’app installée côté utilisateur  

Tu peux supprimer toutes les données directement depuis l’onglet **Paramètres** via le bouton **« Réinitialiser toutes les données »**.

---

## 📲 Installation comme application (PWA)

Alpha-Analytics peut être installée comme une app :

- Sur desktop : bouton **« Installer l’application »** dans les paramètres, ou via le navigateur (icône *Installer l’appli*).  
- Sur mobile (navigateur compatible) : *Ajouter à l’écran d’accueil*.

Une fois installée, l’app se lance comme un programme classique, avec sa propre icône (favicon d’Alpha-Analytics).

---

## 🔔 Mises à jour de l’application

L’app vérifie régulièrement s’il existe une **nouvelle version** publiée (fichier `version.json` hébergé sur GitHub Pages).

- Si une nouvelle version est disponible, un **modal de mise à jour** s’affiche.  
- Tu peux cliquer sur **« Mettre à jour »** pour recharger l’app avec la dernière version.  
- Le numéro de version s’affiche en bas à gauche dans le footer.

---

## 🤝 Feedback & contact

Si tu veux :

- remonter un bug  
- proposer une amélioration  
- discuter de l’outil / des idées futures  

Tu peux :

- ouvrir une **issue GitHub** sur le dépôt  
- ou me contacter sur **Discord : `dimzdev`**

---

## ⚠️ Licence & utilisation du code

Le code de ce dépôt est **fourni à titre informatif**.

Important : le code source n’est pas libre de droit.  
Merci de **ne pas réutiliser, recopier ou redistribuer** ce projet sans mon autorisation explicite.

Si tu veux en discuter ou obtenir une autorisation spécifique, tu peux me contacter sur Discord : **dimzdev**.
