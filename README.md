# Alpha-Analytics

Local trading dashboard pour analyser tes performances **MT4 / FTMO** en toute confidentialité.  
L’application tourne **100% en local** dans ton navigateur (HTML/CSS/JS), les données sont stockées dans `localStorage` et **ne quittent jamais ta machine**.

---

## ✨ Fonctionnalités

- 🧾 **Import de rapports**
  - Rapports **MT4 classiques** (`Statement.html`)
  - Rapports **FTMO / MT5-like** (tableaux `Closed Transactions`, `Open Trades`, etc.)
- 💱 **Devise** au choix
  - Affichage des PnL en **€** ou en **$**
  - Stocké dans `localStorage` pour garder la préférence
- 📊 **Dashboard complet**
  - Résultat net filtré
  - Winrate, nombre de trades
  - Profit factor, PnL moyen par trade
  - Best / worst trade
  - Max drawdown et equity fermée
- 📈 **Graphiques**
  - Évolution de l’equity
  - PnL par instrument
  - PnL par jour de la semaine
  - PnL par heure d’ouverture
- 🔎 **Filtres dynamiques**
  - Date de début / fin
  - Symbole
  - Direction (long / short)
  - Résultat (gagnant / perdant)
  - Résumé des filtres appliqués
- 🧮 **Historique détaillé**
  - Tableau de tous les trades filtrés
  - Direction colorée (Long / Short)
  - PnL coloré (gagnant / perdant)
- 💾 **Gestion des données locales**
  - Stockage dans :
    - `tradeAnalytics_trades`
    - `tradeAnalytics_meta`
  - Bouton **“Réinitialiser toutes les données”** avec modal de confirmation
- 💻 **PWA / Raccourci bureau**
  - Bouton “Installer l’app” dans l’onglet **Paramètres** et dans le header
  - Utilise l’API **BeforeInstallPrompt** pour permettre l’installation comme une app
- 🎨 **UI / UX**
  - Dark mode, design dashboard moderne
  - Animations douces, modals custom
  - Scroll lisse sur la page

---

## 🧱 Stack technique

- **Frontend** : HTML5, CSS3, JavaScript vanilla
- **Charts** : [Chart.js](https://www.chartjs.org/)
- **Stockage** : `localStorage` (aucun backend)
- **PWA** : manifest + install via `beforeinstallprompt` (optionnel)

---

## 📁 Structure du projet

Exemple de structure minimale :

```text
alpha-analytics/
├─ index.html
├─ css/
│  └─ styles.css
├─ js/
│  └─ app.js
├─ img/
│  ├─ logo.png        # logo Alpha-Analytics (header)
│  └─ favicon.png     # icône de l’app / PWA
└─ README.md

