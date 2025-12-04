// ===== Constantes / stockage =====
const STORAGE_KEY_TRADES = "tradeAnalytics_trades";
const STORAGE_KEY_META = "tradeAnalytics_meta";
const DEFAULT_CAPITAL = 10000;
const IMPORT_DELAY_MS = 1200;
const CURRENT_VERSION = "1.0.7"; // même valeur que dans version.json
const STORAGE_KEY_VERSION = "tradeAnalytics_version";


let allTrades = [];
let accountMeta = null;

let equityChart = null;
let pnlBySymbolChart = null;
let pnlByWeekdayChart = null;
let pnlByHourChart = null;
let currentCurrency = "EUR";

const filters = {
    fromDate: null,
    toDate: null,
    symbol: "ALL",
    direction: "ALL",
    result: "ALL",
};

// ===== Utilitaires =====
function parseMtDateTime(str) {
    if (!str) return null;
    const parts = str.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const [dateStr, timeStr] = parts;
    const [y, m, d] = dateStr.split(".").map(Number);
    const [hh, mm, ss] = timeStr.split(":").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
}

function toNumber(str) {
    if (str === null || str === undefined) return 0;
    const cleaned = String(str)
        .replace(/\u00A0/g, " ") // nbsp
        .replace(/\s+/g, "")
        .replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

function formatNumber(v, digits = 2) {
    if (v === null || v === undefined || isNaN(v)) return "–";
    return v.toLocaleString("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

// ===== Parsing FTMO (rapport que tu m'as envoyé) =====
function parseFtmoReport(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");

    const table = doc.querySelector("table");
    if (!table) return [];

    const rows = Array.from(table.rows);
    const trades = [];

    const idxPositions = rows.findIndex((r) =>
        r.textContent.includes("Positions")
    );
    if (idxPositions === -1) return [];

    // idxPositions + 1 = header, +2 = première ligne de données
    for (let i = idxPositions + 2; i < rows.length; i++) {
        const row = rows[i];
        const txt = row.textContent.trim();
        if (!txt) continue;

        // On s'arrête quand on arrive à "Ordres"
        if (txt.includes("Ordres")) break;

        const tds = Array.from(row.querySelectorAll("td"));
        if (tds.length < 10) continue;

        const openTimeStr = tds[0]?.textContent.trim() || "";
        const ticket = tds[1]?.textContent.trim() || "";
        const symbol = tds[2]?.textContent.trim() || "";
        const type = tds[3]?.textContent.trim().toLowerCase() || "";

        // Structure FTMO : Time, Position, Symbol, Type, [hidden], Volume, Price, SL, TP, CloseTime, ClosePrice, Commission, Swap, Profit
        const volume = toNumber(tds[5]?.textContent);
        const openPrice = toNumber(tds[6]?.textContent);
        const sl = toNumber(tds[7]?.textContent);
        const tp = toNumber(tds[8]?.textContent);
        const closeTimeStr = tds[9]?.textContent.trim() || "";
        const closePrice = toNumber(tds[10]?.textContent);
        const commission = toNumber(tds[11]?.textContent);
        const swap = toNumber(tds[12]?.textContent);
        const profit = toNumber(tds[13]?.textContent);

        if (!symbol || !["buy", "sell"].includes(type)) continue;

        trades.push({
            ticket,
            symbol,
            type, // 'buy' ou 'sell'
            volume,
            openTime: openTimeStr,
            closeTime: closeTimeStr,
            openPrice,
            closePrice,
            sl,
            tp,
            commission,
            swap,
            profit,
        });
    }

    return trades;
}

/**
 * Parsing MT4 "Statement" anglais :
 * Sections "Closed Transactions:", "Open Trades:", "Summary:"
 * Colonnes : Ticket, Open Time, Type, Size, Item, Price, S/L, T/P, Close Time, Price, Commission, Taxes, Swap, Profit
 */
function parseMt4Statement(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    const tables = Array.from(doc.querySelectorAll("table"));
    if (!tables.length) return [];

    let closedTable = null;

    // On cherche la table qui contient "Closed Transactions:"
    for (const table of tables) {
        const text = table.textContent || "";
        if (text.includes("Closed Transactions:") && text.includes("Open Trades:")) {
            closedTable = table;
            break;
        }
    }
    if (!closedTable) return [];

    const rows = Array.from(closedTable.rows);
    const trades = [];

    // Trouver la ligne "Closed Transactions:"
    let startIndex = rows.findIndex(r =>
        r.textContent.includes("Closed Transactions:")
    );
    if (startIndex === -1) return [];

    // Ligne suivant "Closed Transactions:" = en-tête (Ticket/Open Time/Type/...)
    // Les vraies données commencent à startIndex + 2
    for (let i = startIndex + 2; i < rows.length; i++) {
        const row = rows[i];
        const txt = row.textContent.trim();

        if (!txt) continue;

        // On s'arrête quand on arrive à "Open Trades:"
        if (txt.includes("Open Trades:")) break;

        const tds = Array.from(row.querySelectorAll("td"));
        if (tds.length < 14) continue;

        const typeCell = tds[2]?.textContent.trim().toLowerCase() || "";

        // On ignore les lignes de balance, pending, cancelled, etc.
        if (!["buy", "sell"].includes(typeCell)) continue;

        const ticket = tds[0]?.textContent.trim() || "";
        const openTimeStr = tds[1]?.textContent.trim() || "";
        const type = typeCell;
        const volume = toNumber(tds[3]?.textContent);
        const symbol = (tds[4]?.textContent.trim() || "").toUpperCase();

        const openPrice = toNumber(tds[5]?.textContent);
        const sl = toNumber(tds[6]?.textContent);
        const tp = toNumber(tds[7]?.textContent);
        const closeTimeStr = tds[8]?.textContent.trim() || "";
        const closePrice = toNumber(tds[9]?.textContent);
        const commission = toNumber(tds[10]?.textContent);
        // const taxes = toNumber(tds[11]?.textContent); // pas utilisé pour l'instant
        const swap = toNumber(tds[12]?.textContent);
        const profit = toNumber(tds[13]?.textContent);

        trades.push({
            ticket,
            symbol,
            type,
            volume,
            openTime: openTimeStr,
            closeTime: closeTimeStr,
            openPrice,
            closePrice,
            sl,
            tp,
            commission,
            swap,
            profit,
        });
    }

    return trades;
}

// ===== Parsing MT4 "classique" (fallback générique) =====
function parseMt4Classic(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");
    const tables = Array.from(doc.querySelectorAll("table"));
    if (!tables.length) return [];

    const trades = [];

    tables.forEach((table) => {
        const rows = Array.from(table.rows);
        for (const row of rows) {
            const tds = Array.from(row.querySelectorAll("td"));
            if (tds.length < 8) continue;

            const txtCells = tds.map((td) =>
                td.textContent.trim().toLowerCase()
            );

            const hasBuy = txtCells.some((t) => t === "buy");
            const hasSell = txtCells.some((t) => t === "sell");
            if (!hasBuy && !hasSell) continue;

            const typeIndex = txtCells.findIndex(
                (t) => t === "buy" || t === "sell"
            );
            const type = txtCells[typeIndex];

            // heuristique très générique : on suppose [Time?, ? , type, volume, symbol, ... , profit]
            const openTimeStr = tds[0].textContent.trim();
            const symbol =
                tds[typeIndex + 1]?.textContent.trim() ||
                tds[2]?.textContent.trim() ||
                "";
            const volume = toNumber(tds[typeIndex - 1]?.textContent);
            const profit = toNumber(tds[tds.length - 1]?.textContent);

            if (!symbol) continue;

            trades.push({
                ticket: "",
                symbol,
                type,
                volume,
                openTime: openTimeStr,
                closeTime: openTimeStr, // approximatif
                openPrice: 0,
                closePrice: 0,
                sl: 0,
                tp: 0,
                commission: 0,
                swap: 0,
                profit,
            });
        }
    });

    return trades;
}

// ===== Choix auto du parser =====
function parseUniversalReport(htmlText) {
    // 1) Rapport FTMO français (celui que tu utilises)
    if (
        htmlText.includes("Rapport d'historique de trading") &&
        htmlText.includes("Positions") &&
        htmlText.includes("Transactions")
    ) {
        const r = parseFtmoReport(htmlText);
        if (r.length) return r;
    }

    // 2) Statement MT4 anglais "Closed Transactions / Open Trades"
    if (
        htmlText.includes("Closed Transactions:") &&
        htmlText.includes("Open Trades:") &&
        htmlText.includes("Summary:")
    ) {
        const r2 = parseMt4Statement(htmlText);
        if (r2.length) return r2;
    }

    // 3) Fallback générique
    return parseMt4Classic(htmlText);
}


// ===== Stats & distributions =====
function computeStats(trades, startingCapital) {
    const totalTrades = trades.length;

    if (!totalTrades) {
        return {
            net: 0,
            wins: 0,
            losses: 0,
            totalTrades: 0,
            grossProfit: 0,
            grossLoss: 0,
            profitFactor: null,
            avgPnl: null,
            avgWin: null,
            avgLoss: null,
            bestTrade: null,
            worstTrade: null,
            startingCapital,
            closedEquity: startingCapital,
            maxDrawdownAbs: 0,
            maxDrawdownPct: 0,
            longestWinStreak: 0,
            longestLossStreak: 0,
            equityPoints: [],
            pnlBySymbol: {},
            pnlByWeekday: Array(7).fill(0),
            pnlByHour: Array(24).fill(0),
        };
    }

    // Trier par date de clôture
    const sorted = [...trades].sort((a, b) => {
        const da =
            parseMtDateTime(a.closeTime) ||
            parseMtDateTime(a.openTime) ||
            new Date();
        const db =
            parseMtDateTime(b.closeTime) ||
            parseMtDateTime(b.openTime) ||
            new Date();
        return da - db;
    });

    let net = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;

    let bestTrade = null;
    let worstTrade = null;

    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let longestWinStreak = 0;
    let longestLossStreak = 0;

    let peakEquity = startingCapital;
    let minEquity = startingCapital;

    const equityPoints = [];
    const pnlBySymbol = {};
    const pnlByWeekday = Array(7).fill(0);
    const pnlByHour = Array(24).fill(0);

    for (const t of sorted) {
        const p = t.profit || 0;
        net += p;

        if (p > 0) {
            wins++;
            grossProfit += p;
            currentWinStreak++;
            currentLossStreak = 0;
            if (currentWinStreak > longestWinStreak)
                longestWinStreak = currentWinStreak;
        } else if (p < 0) {
            losses++;
            grossLoss += p;
            currentLossStreak++;
            currentWinStreak = 0;
            if (currentLossStreak > longestLossStreak)
                longestLossStreak = currentLossStreak;
        } else {
            currentWinStreak = 0;
            currentLossStreak = 0;
        }

        if (!bestTrade || p > bestTrade.profit) bestTrade = t;
        if (!worstTrade || p < worstTrade.profit) worstTrade = t;

        const eq = startingCapital + net;
        if (eq > peakEquity) peakEquity = eq;
        if (eq < minEquity) minEquity = eq;

        // Equity curve
        const dt =
            parseMtDateTime(t.closeTime) ||
            parseMtDateTime(t.openTime) ||
            new Date();
        equityPoints.push({ date: dt, equity: eq });

        // PnL par symbole
        pnlBySymbol[t.symbol] = (pnlBySymbol[t.symbol] || 0) + p;

        // PnL par jour
        const d = parseMtDateTime(t.openTime) || dt;
        const dow = d.getDay(); // 0 = dimanche
        pnlByWeekday[dow] += p;

        // PnL par heure d'ouverture
        const hour = d.getHours();
        pnlByHour[hour] += p;
    }

    const avgPnl = net / totalTrades;
    const avgWin = wins ? grossProfit / wins : null;
    const avgLoss = losses ? grossLoss / losses : null;
    const profitFactor = grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null;

    const closedEquity = startingCapital + net;
    const maxDrawdownAbs = startingCapital - minEquity;
    const maxDrawdownPct =
        startingCapital > 0 ? (maxDrawdownAbs / startingCapital) * 100 : 0;

    return {
        net,
        wins,
        losses,
        totalTrades,
        grossProfit,
        grossLoss,
        profitFactor,
        avgPnl,
        avgWin,
        avgLoss,
        bestTrade,
        worstTrade,
        startingCapital,
        closedEquity,
        maxDrawdownAbs,
        maxDrawdownPct,
        longestWinStreak,
        longestLossStreak,
        equityPoints,
        pnlBySymbol,
        pnlByWeekday,
        pnlByHour,
    };
}

// ===== Filtres =====
function updateFiltersFromInputs() {
    const fromInput = document.getElementById("filter-date-from");
    const toInput = document.getElementById("filter-date-to");
    const symbolSelect = document.getElementById("filter-symbol");
    const dirSelect = document.getElementById("filter-direction");
    const resultSelect = document.getElementById("filter-result");

    filters.fromDate = fromInput.value
        ? new Date(fromInput.value + "T00:00:00")
        : null;
    filters.toDate = toInput.value
        ? new Date(toInput.value + "T23:59:59")
        : null;
    filters.symbol = symbolSelect.value || "ALL";
    filters.direction = dirSelect.value || "ALL";
    filters.result = resultSelect.value || "ALL";

    updateFiltersSummary();
}

function tradeMatchesFilters(t) {
    const dt =
        parseMtDateTime(t.closeTime) || parseMtDateTime(t.openTime) || null;

    if (filters.fromDate && dt && dt < filters.fromDate) return false;
    if (filters.toDate && dt && dt > filters.toDate) return false;

    if (filters.symbol !== "ALL" && t.symbol !== filters.symbol) return false;

    if (filters.direction === "long" && t.type !== "buy") return false;
    if (filters.direction === "short" && t.type !== "sell") return false;

    if (filters.result === "WIN" && !(t.profit > 0)) return false;
    if (filters.result === "LOSS" && !(t.profit < 0)) return false;

    return true;
}

function applyFilters() {
    return allTrades.filter(tradeMatchesFilters);
}

function updateFiltersSummary() {
    const summaryEl = document.getElementById("filters-summary");
    const parts = [];

    if (filters.fromDate || filters.toDate) {
        let txt = "Période : ";
        if (filters.fromDate) {
            txt += "du " + filters.fromDate.toLocaleDateString("fr-FR");
        }
        if (filters.toDate) {
            txt +=
                (filters.fromDate ? " " : "") +
                "au " +
                filters.toDate.toLocaleDateString("fr-FR");
        }
        parts.push(txt);
    }

    if (filters.symbol !== "ALL") {
        parts.push("Symbole : " + filters.symbol);
    }

    if (filters.direction !== "ALL") {
        parts.push(
            "Direction : " +
                (filters.direction === "long" ? "long" : "short")
        );
    }

    if (filters.result !== "ALL") {
        parts.push(
            "Résultat : " + (filters.result === "WIN" ? "gagnants" : "perdants")
        );
    }

    if (!parts.length) {
        summaryEl.textContent = "Aucun filtre appliqué (tous les trades).";
    } else {
        summaryEl.textContent = parts.join(" · ");
    }
}

function resetFilters() {
    document.getElementById("filter-date-from").value = "";
    document.getElementById("filter-date-to").value = "";
    document.getElementById("filter-symbol").value = "ALL";
    document.getElementById("filter-direction").value = "ALL";
    document.getElementById("filter-result").value = "ALL";

    filters.fromDate = null;
    filters.toDate = null;
    filters.symbol = "ALL";
    filters.direction = "ALL";
    filters.result = "ALL";

    updateFiltersSummary();
}

// ===== UI : mise à jour dashboard =====
function updateAccountDisplay() {
    const nameEl = document.getElementById("account-name-display");
    const typeEl = document.getElementById("account-type-display");

    if (accountMeta) {
        nameEl.textContent = accountMeta.accountName || "Non défini";
        typeEl.textContent = accountMeta.accountType || "MT4 / MT5";
    } else {
        nameEl.textContent = "Non défini";
        typeEl.textContent = "MT4 / MT5";
    }
}

function updateFooterVersion() {
    const el = document.getElementById("footer-app-info");
    if (!el) return;
    el.textContent = `Alpha-Analytics · App locale · v${CURRENT_VERSION}`;
}


// ===== Devise & format monnaie =====
function getCurrencySymbol() {
    return currentCurrency === "USD" ? "$" : "€";
}

function formatCurrency(value) {
    // null / undefined / NaN -> tiret
    if (value === null || value === undefined) {
        return "–";
    }

    const num = Number(value);
    if (!isFinite(num)) {
        return "–";
    }

    return (
        num.toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }) +
        " " +
        getCurrencySymbol()
    );
}


function updateCurrencyUI() {
    const pnlHeader = document.getElementById("pnl-header-label");
    if (pnlHeader) {
        pnlHeader.textContent = `PnL (${getCurrencySymbol()})`;
    }
}

function updateDashboard(stats, filteredTrades) {
    document.getElementById("stat-trades-count").textContent =
        stats.totalTrades;
    document.getElementById("stat-pnl-total").textContent = formatCurrency(
        stats.net
    );

    const pnlChip = document.getElementById("stat-pnl-chip");
    pnlChip.classList.remove("loss");

    if (stats.totalTrades === 0) {
        pnlChip.textContent = "En attente de données";
    } else if (stats.net >= 0) {
        pnlChip.textContent = "En gain sur la période filtrée";
    } else {
        pnlChip.textContent = "En perte sur la période filtrée";
        pnlChip.classList.add("loss");
    }

    const winrate =
        stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : null;
    document.getElementById("stat-winrate").textContent =
        winrate === null ? "–" : formatNumber(winrate, 1) + " %";

    document.getElementById("stat-trades-win").textContent = stats.wins;
    document.getElementById("stat-trades-loss").textContent = stats.losses;

    const instruments = new Set(filteredTrades.map((t) => t.symbol));
    document.getElementById("stat-instruments-count").textContent =
        instruments.size;

    document.getElementById("stat-avg-pnl").textContent = formatCurrency(
        stats.avgPnl
    );
    document.getElementById("stat-avg-win").textContent = formatCurrency(
        stats.avgWin
    );
    document.getElementById("stat-avg-loss").textContent = formatCurrency(
        stats.avgLoss
    );

    document.getElementById("stat-gross-profit").textContent = formatCurrency(
        stats.grossProfit
    );
    document.getElementById("stat-gross-loss").textContent = formatCurrency(
        stats.grossLoss
    );

    document.getElementById("stat-profit-factor").textContent =
        stats.profitFactor === null
            ? "–"
            : formatNumber(stats.profitFactor, 2);

    document.getElementById("stat-best-win-streak").textContent =
        stats.longestWinStreak;
    document.getElementById("stat-best-loss-streak").textContent =
        stats.longestLossStreak;
    document.getElementById("stat-streaks").textContent =
        stats.totalTrades === 0
            ? "–"
            : `${stats.longestWinStreak}W / ${stats.longestLossStreak}L`;

    document.getElementById("stat-starting-capital").textContent =
        formatCurrency(stats.startingCapital);
    document.getElementById("stat-closed-equity").textContent =
        formatCurrency(stats.closedEquity);
    document.getElementById("stat-max-dd-abs").textContent =
        formatCurrency(stats.maxDrawdownAbs);
    document.getElementById("stat-max-dd-pct").textContent =
        formatNumber(stats.maxDrawdownPct, 2) + " %";

    // Best / worst trade
    const bestEl = document.getElementById("stat-best-trade");
    const worstEl = document.getElementById("stat-worst-trade");
    const summaryEl = document.getElementById("stat-summary");

    if (!stats.totalTrades) {
        bestEl.textContent = "–";
        worstEl.textContent = "–";
        summaryEl.textContent =
            "Importe un rapport MT4 pour voir un résumé détaillé de ta performance.";
        return;
    }

    if (stats.bestTrade) {
        bestEl.textContent =
            `${stats.bestTrade.symbol} · ` +
            formatCurrency(stats.bestTrade.profit);
    } else {
        bestEl.textContent = "–";
    }

    if (stats.worstTrade) {
        worstEl.textContent =
            `${stats.worstTrade.symbol} · ` +
            formatCurrency(stats.worstTrade.profit);
    } else {
        worstEl.textContent = "–";
    }

    summaryEl.textContent = `Sur ${stats.totalTrades} trades filtrés, ton winrate est de ${
        winrate ? formatNumber(winrate, 1) + " %" : "–"
    } pour un résultat net de ${formatCurrency(stats.net)}.`;
}

// ===== Table historique =====
function renderTradesTable(trades) {
    const tbody = document.getElementById("trades-tbody");
    const countEl = document.getElementById("trades-count-table");
    tbody.innerHTML = "";
    countEl.textContent = trades.length;

    for (const t of trades) {
        const tr = document.createElement("tr");

        const dt = parseMtDateTime(t.closeTime) || parseMtDateTime(t.openTime);
        const dateStr = dt
            ? dt.toLocaleString("fr-FR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : t.closeTime || t.openTime;

        const dirLabel = t.type === "buy" ? "Long" : "Short";
        const dirClass = t.type === "buy" ? "pill-long" : "pill-short";

        const pnlClass =
            t.profit > 0 ? "text-success" : t.profit < 0 ? "text-danger" : "";

        tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${t.symbol}</td>
      <td><span class="pill ${dirClass}">${dirLabel}</span></td>
      <td>${t.volume}</td>
      <td>${t.openPrice || ""}</td>
      <td>${t.closePrice || ""}</td>
      <td class="${pnlClass}">${formatCurrency(t.profit)}</td>
    `;

        tbody.appendChild(tr);
    }
}

// ===== Graphiques =====
function updateCharts(stats) {
    const equityCanvas = document.getElementById("equityChart");
    const pnlBySymbolCanvas = document.getElementById("pnlBySymbolChart");
    const pnlByWeekdayCanvas = document.getElementById("pnlByWeekdayChart");
    const pnlByHourCanvas = document.getElementById("pnlByHourChart");

    if (
        !equityCanvas ||
        !pnlBySymbolCanvas ||
        !pnlByWeekdayCanvas ||
        !pnlByHourCanvas
    ) {
        return;
    }

    if (equityChart) equityChart.destroy();
    if (pnlBySymbolChart) pnlBySymbolChart.destroy();
    if (pnlByWeekdayChart) pnlByWeekdayChart.destroy();
    if (pnlByHourChart) pnlByHourChart.destroy();

    const eqLabels = stats.equityPoints.map((p) =>
        p.date.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
        })
    );
    const eqData = stats.equityPoints.map((p) => p.equity);

    equityChart = new Chart(equityCanvas.getContext("2d"), {
        type: "line",
        data: {
            labels: eqLabels,
            datasets: [
                {
                    label: "Equity",
                    data: eqData,
                    tension: 0.25,
                },
            ],
        },
        options: {
            responsive: true,
            animation: {
                duration: 600,
                easing: "easeOutCubic",
            },
        },
    });

    // PnL par symbole (doughnut)
    const symbolLabels = Object.keys(stats.pnlBySymbol);
    const symbolData = Object.values(stats.pnlBySymbol);

    pnlBySymbolChart = new Chart(
        pnlBySymbolCanvas.getContext("2d"),
        {
            type: "doughnut",
            data: {
                labels: symbolLabels,
                datasets: [
                    {
                        label: "PnL par instrument",
                        data: symbolData,
                    },
                ],
            },
            options: {
                responsive: true,
                animation: {
                    duration: 600,
                },
            },
        }
    );

    // PnL par jour de la semaine (on remet Lundi en premier)
    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
    const weekdayLabels = [
        "Lundi",
        "Mardi",
        "Mercredi",
        "Jeudi",
        "Vendredi",
        "Samedi",
        "Dimanche",
    ];
    const weekdayData = weekdayOrder.map((idx) => stats.pnlByWeekday[idx]);

    pnlByWeekdayChart = new Chart(
        pnlByWeekdayCanvas.getContext("2d"),
        {
            type: "bar",
            data: {
                labels: weekdayLabels,
                datasets: [
                    {
                        label: "PnL par jour",
                        data: weekdayData,
                    },
                ],
            },
            options: {
                responsive: true,
                animation: {
                    duration: 600,
                },
            },
        }
    );

    // PnL par heure
    const hoursLabels = Array.from({ length: 24 }, (_, i) => `${i}h`);
    const hoursData = stats.pnlByHour;

    pnlByHourChart = new Chart(pnlByHourCanvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: hoursLabels,
            datasets: [
                {
                    label: "PnL par heure",
                    data: hoursData,
                },
            ],
        },
        options: {
            responsive: true,
            animation: {
                duration: 600,
            },
        },
    });
}

// ===== LocalStorage =====
function loadFromStorage() {
    try {
        const rawTrades = localStorage.getItem(STORAGE_KEY_TRADES);
        const rawMeta = localStorage.getItem(STORAGE_KEY_META);

        allTrades = rawTrades ? JSON.parse(rawTrades) : [];
        accountMeta = rawMeta ? JSON.parse(rawMeta) : null;

        // --- gestion de la devise ---
        if (accountMeta && accountMeta.currency) {
            currentCurrency = accountMeta.currency;
        } else {
            currentCurrency = "EUR";
            if (accountMeta) {
                accountMeta.currency = "EUR";
                localStorage.setItem(
                    STORAGE_KEY_META,
                    JSON.stringify(accountMeta)
                );
            }
        }
    } catch (e) {
        allTrades = [];
        accountMeta = null;
        currentCurrency = "EUR";
    }

    updateCurrencyUI();
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY_TRADES, JSON.stringify(allTrades));
    localStorage.setItem(STORAGE_KEY_META, JSON.stringify(accountMeta));
}

function compareVersions(a, b) {
    // "1.0.0" -> [1,0,0]
    const pa = a.split(".").map(n => parseInt(n, 10));
    const pb = b.split(".").map(n => parseInt(n, 10));
    const len = Math.max(pa.length, pb.length);

    for (let i = 0; i < len; i++) {
        const va = pa[i] || 0;
        const vb = pb[i] || 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
    }
    return 0;
}

function checkForUpdate() {
    // Ne pas checker en local file://
    if (location.protocol === "file:") return;

    fetch("version.json?cb=" + Date.now())
        .then(res => {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        })
        .then(data => {
            const remoteVersion = data.version || "0.0.0";
            const changelog = data.changelog || "";

            const storedVersion = localStorage.getItem(STORAGE_KEY_VERSION) || CURRENT_VERSION;

            // Si la version distante est plus récente
            if (compareVersions(remoteVersion, CURRENT_VERSION) === 1) {
                // Sauvegarde la dernière version vue
                localStorage.setItem(STORAGE_KEY_VERSION, remoteVersion);
                showUpdateModal(remoteVersion, changelog);
            }
        })
        .catch(err => {
            console.warn("Erreur checkForUpdate:", err);
        });
}

function showUpdateModal(version, changelog) {
    const modal = document.getElementById("update-modal");
    const changelogEl = document.getElementById("update-modal-changelog");
    const closeBtn = document.getElementById("update-modal-close");
    const laterBtn = document.getElementById("update-remind-later");
    const reloadBtn = document.getElementById("update-reload-now");

    if (!modal) return;

    changelogEl.textContent = changelog
        ? `Notes de version (${version}) : ${changelog}`
        : `Version ${version} disponible.`;

    const close = () => {
        modal.classList.add("closing");
        setTimeout(() => {
            modal.classList.remove("active");
            modal.classList.remove("closing");
        }, 200);
    };

    closeBtn?.addEventListener("click", close);
    laterBtn?.addEventListener("click", close);

    reloadBtn?.addEventListener("click", () => {
        // Force un rechargement complet
        window.location.reload(true);
    });

    modal.classList.add("active");
}


// ===== Filtres : symbole =====
function populateSymbolFilter() {
    const select = document.getElementById("filter-symbol");
    if (!select) return;

    const previousValue = select.value;
    const symbols = Array.from(new Set(allTrades.map((t) => t.symbol))).sort();

    select.innerHTML = '<option value="ALL">Tous</option>';
    for (const sym of symbols) {
        const opt = document.createElement("option");
        opt.value = sym;
        opt.textContent = sym;
        select.appendChild(opt);
    }

    if (symbols.includes(previousValue)) {
        select.value = previousValue;
    } else {
        select.value = "ALL";
    }
}

// ===== Navigation / Modal / Chargement =====
function setupNavigation() {
    const buttons = document.querySelectorAll(".nav-btn");
    const sections = document.querySelectorAll(".section");

    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-target");

            buttons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            sections.forEach((sec) => {
                if (sec.id === targetId) {
                    sec.classList.add("active");
                } else {
                    sec.classList.remove("active");
                }
            });
        });
    });
}

function setupModal() {
    const modal = document.getElementById("import-modal");
    const openBtn = document.getElementById("open-import-modal-btn");
    const closeBtns = document.querySelectorAll(".import-modal-close");

    if (!modal || !openBtn) return;

    openBtn.addEventListener("click", () => {
        modal.classList.add("active");
    });

    closeBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            modal.classList.add("closing");
            setTimeout(() => {
                modal.classList.remove("active");
                modal.classList.remove("closing");
            }, 180);
        });
    });
}

function hideLoadingOverlay() {
    const overlay = document.getElementById("loading-overlay");
    if (!overlay) return;
    setTimeout(() => {
        overlay.classList.add("hidden");
    }, 400);
}

// ===== Import MT4/FTMO =====
function setupImportForm() {
    const form = document.getElementById("import-form");
    const statusEl = document.getElementById("import-modal-status");
    const modal = document.getElementById("import-modal");
    const submitBtn = document.getElementById("import-submit-btn");
    const connectionStatus = document.getElementById("connection-status");

    if (!form || !submitBtn) return;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        statusEl.textContent = "";

        const fileInput = document.getElementById("import-file");
        const accountNameInput = document.getElementById("account-name");
        const capitalInput = document.getElementById("account-capital");
        const accountTypeInput = form.querySelector(
            "input[name='account-type']:checked"
        );
        const currencyInput = form.querySelector(
            "input[name='account-currency']:checked"
        );

        if (!fileInput.files || !fileInput.files.length) {
            statusEl.textContent = "Sélectionne d'abord un fichier HTML.";
            return;
        }

        const file = fileInput.files[0];

        // Devise choisie
        const currency = currencyInput ? currencyInput.value : "EUR";
        currentCurrency = currency;
        updateCurrencyUI();

        // Animation bouton
        submitBtn.classList.add("loading");
        submitBtn.innerHTML =
            '<i class="fa-solid fa-circle-notch"></i> Importation...';

        const reader = new FileReader();
        reader.onload = (evt) => {
            const html = evt.target.result;
            let trades = [];
            try {
                trades = parseUniversalReport(html);
            } catch (err) {
                console.error(err);
                trades = [];
            }

            if (!trades.length) {
                submitBtn.classList.remove("loading");
                submitBtn.innerHTML =
                    '<i class="fa-solid fa-file-arrow-up"></i> Importer';
                statusEl.textContent =
                    "Aucun trade trouvé dans ce rapport. Vérifie le format MT4/FTMO.";
                return;
            }

            // META compte
            const accountName = (accountNameInput.value || "Compte local").trim();
            const accountType = accountTypeInput
                ? accountTypeInput.value
                : "MT4";
            let startingCapital = toNumber(capitalInput.value);
            if (!startingCapital) {
                startingCapital = DEFAULT_CAPITAL;
            }

            accountMeta = {
                accountName,
                accountType,
                startingCapital,
                currency, // <-- on stocke la devise
            };

            // On remplace les trades existants (un compte à la fois)
            allTrades = trades;

            // Sauvegarde + mise à jour UI après un délai pour laisser "charger"
            setTimeout(() => {
                saveToStorage();
                populateSymbolFilter();
                updateFiltersFromInputs();

                const filtered = applyFilters();
                const stats = computeStats(
                    filtered,
                    accountMeta.startingCapital
                );

                updateAccountDisplay();
                updateDashboard(stats, filtered);
                renderTradesTable(filtered);
                updateCharts(stats);
                updateCurrencyUI();

                // Badge connexion
                if (connectionStatus) {
                    connectionStatus.textContent = `Rapport importé · ${allTrades.length} trades`;
                }

                // Fin animation bouton
                submitBtn.classList.remove("loading");
                submitBtn.innerHTML =
                    '<i class="fa-solid fa-check"></i> Importé';

                // Fermer le modal proprement
                modal.classList.add("closing");
                setTimeout(() => {
                    modal.classList.remove("active");
                    modal.classList.remove("closing");
                    submitBtn.innerHTML =
                        '<i class="fa-solid fa-file-arrow-up"></i> Importer';
                }, 250);
            }, IMPORT_DELAY_MS);
        };

        reader.onerror = () => {
            submitBtn.classList.remove("loading");
            submitBtn.innerHTML =
                '<i class="fa-solid fa-file-arrow-up"></i> Importer';
            statusEl.textContent =
                "Erreur de lecture du fichier. Réessaie avec un rapport MT4/FTMO valide.";
        };

        reader.readAsText(file);
    });
}

// ===== Reset data (Paramètres + Dashboard) =====
function setupResetData() {
    const settingsBtn = document.getElementById("btn-reset-data");            // bouton onglet Paramètres
    const dashBtn     = document.getElementById("btn-reset-data-dashboard"); // bouton refresh sur le Dashboard
    const modal       = document.getElementById("reset-modal");

    if (!modal) return;

    const confirmBtn  = document.getElementById("reset-confirm");
    const closeBtns   = modal.querySelectorAll(".reset-close");

    const connectionStatus = document.getElementById("connection-status");

    const openModal = () => {
        modal.classList.add("active");
    };

    const closeModal = () => {
        modal.classList.add("closing");
        setTimeout(() => {
            modal.classList.remove("active");
            modal.classList.remove("closing");
        }, 180);
    };

    // Ouverture depuis Paramètres + Dashboard
    [settingsBtn, dashBtn].forEach((btn) => {
        if (!btn) return;
        btn.addEventListener("click", openModal);
    });

    // Boutons "Annuler" + croix
    closeBtns.forEach((btn) => {
        btn.addEventListener("click", closeModal);
    });

    // Confirmer la réinitialisation
    confirmBtn.addEventListener("click", () => {
        // 1. supprimer le stockage
        localStorage.removeItem(STORAGE_KEY_TRADES);
        localStorage.removeItem(STORAGE_KEY_META);

        // 2. reset variables en mémoire
        allTrades   = [];
        accountMeta = null;
        currentCurrency = "EUR";

        // 3. UI : filtres / compte / stats / tableaux / graphs
        populateSymbolFilter();
        resetFilters();
        updateAccountDisplay();

        const stats = computeStats([], DEFAULT_CAPITAL);
        updateDashboard(stats, []);
        renderTradesTable([]);
        updateCharts(stats);

        // 4. remettre le badge si tu l'utilises encore
        if (connectionStatus) {
            connectionStatus.textContent = "Mode import · données locales";
        }

        // 5. fermer le modal
        closeModal();
    });
}



// ===== Filtres UI actions =====
function setupFiltersUi() {
    const toggleBtn = document.getElementById("btn-toggle-filters");
    const panel = document.getElementById("filters-panel");
    const resetBtn = document.getElementById("btn-reset-filters");

    if (toggleBtn && panel) {
        toggleBtn.addEventListener("click", () => {
            panel.classList.toggle("collapsed");
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            resetFilters();
            const filtered = applyFilters();
            const stats = computeStats(
                filtered,
                (accountMeta && accountMeta.startingCapital) ||
                    DEFAULT_CAPITAL
            );
            updateDashboard(stats, filtered);
            renderTradesTable(filtered);
            updateCharts(stats);
        });
    }

    const inputs = [
        "filter-date-from",
        "filter-date-to",
        "filter-symbol",
        "filter-direction",
        "filter-result",
    ];

    inputs.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", () => {
            updateFiltersFromInputs();
            const filtered = applyFilters();
            const stats = computeStats(
                filtered,
                (accountMeta && accountMeta.startingCapital) ||
                    DEFAULT_CAPITAL
            );
            updateDashboard(stats, filtered);
            renderTradesTable(filtered);
            updateCharts(stats);
        });
    });
}

// ===== Install PWA / "Créer un raccourci" avec modal =====
let deferredInstallPrompt = null;

function setupInstallButton() {
    const headerBtn   = document.getElementById("btn-install-pwa-header");
    const settingsBtn = document.getElementById("btn-install-pwa"); // bouton dans Paramètres
    const modal       = document.getElementById("install-modal");
    if (!modal) return;

    const confirmBtn  = document.getElementById("install-confirm");
    const cancelBtns  = modal.querySelectorAll(".install-cancel");
    const progressBar = document.getElementById("install-progress-bar");
    const progressText = document.getElementById("install-progress-text");

    const triggers = [headerBtn, settingsBtn].filter(Boolean);

    const openModal = () => {
        if (progressBar) progressBar.style.width = "0%";
        if (progressText) progressText.textContent = "En attente de confirmation...";
        modal.classList.add("active");
    };

    const closeModal = () => {
        modal.classList.add("closing");
        setTimeout(() => {
            modal.classList.remove("active");
            modal.classList.remove("closing");
        }, 180);
    };

    // Le navigateur signale que l'app est installable
    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;

        // on affiche les deux boutons (header + paramètres)
        triggers.forEach((btn) => {
            btn.style.display = "inline-flex";
        });
    });

    // Clic sur un des boutons "Installer"
    triggers.forEach((btn) => {
        btn.addEventListener("click", () => {
            if (!deferredInstallPrompt) return;
            openModal();
        });
    });

    // Fermer le modal (croix / annuler)
    cancelBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            closeModal();
        });
    });

    // Clic sur "Installer" dans le modal
    confirmBtn.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;

        confirmBtn.disabled = true;

        let progress = 0;
        let intervalId = null;

        if (progressBar) {
            intervalId = setInterval(() => {
                progress = Math.min(progress + 5, 95);
                progressBar.style.width = progress + "%";
            }, 120);
        }

        try {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;

            if (intervalId) clearInterval(intervalId);
            if (progressBar) progressBar.style.width = "100%";

            if (progressText) {
                if (outcome === "accepted") {
                    progressText.textContent =
                        "Installation acceptée 👍 L'application va apparaître comme un raccourci sur ton appareil.";
                } else {
                    progressText.textContent =
                        "Installation annulée. Tu pourras réessayer plus tard depuis les paramètres ou le bouton en haut à droite.";
                }
            }

            deferredInstallPrompt = null;

            setTimeout(() => {
                closeModal();
                confirmBtn.disabled = false;
            }, 900);
        } catch (err) {
            console.error("Erreur install PWA", err);
            if (intervalId) clearInterval(intervalId);
            if (progressBar) progressBar.style.width = "0%";
            if (progressText) {
                progressText.textContent =
                    "Une erreur est survenue pendant l'installation. Réessaie plus tard.";
            }
            setTimeout(() => {
                closeModal();
                confirmBtn.disabled = false;
            }, 900);
        }
    });
}

// ===== Scroll smooth & inertiel dans .content =====
function setupSmoothScroll() {
    const container = document.querySelector(".content");
    if (!container) return;

    // position actuelle / cible
    let currentScroll = container.scrollTop;
    let targetScroll  = container.scrollTop;
    let isAnimating   = false;

    // Réglages
    const SPEED_FACTOR = 0.6;  // 0.5–0.8 = naturel ; <0.5 = très lent
    const SMOOTHNESS   = 0.08; // 0.05–0.12 = très fluide

    function onWheel(e) {
        e.preventDefault(); // on remplace le scroll natif

        // delta de la molette (trackpad / souris)
        const delta = e.deltaY;

        // on ajoute une fraction du delta à la cible
        targetScroll += delta * SPEED_FACTOR;

        // bornes
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (targetScroll < 0) targetScroll = 0;
        if (targetScroll > maxScroll) targetScroll = maxScroll;

        // on lance l’animation si pas déjà en cours
        if (!isAnimating) {
            isAnimating = true;
            requestAnimationFrame(animate);
        }
    }

    function animate() {
        // on rapproche doucement current → target
        const diff = targetScroll - currentScroll;
        currentScroll += diff * SMOOTHNESS;

        container.scrollTop = currentScroll;

        // tant qu’on n’est pas assez proche, on continue
        if (Math.abs(diff) > 0.5) {
            requestAnimationFrame(animate);
        } else {
            // snap à la position finale
            container.scrollTop = targetScroll;
            currentScroll = targetScroll;
            isAnimating = false;
        }
    }

    container.addEventListener("wheel", onWheel, { passive: false });
}



// ===== Init =====
window.addEventListener("load", () => {
    hideLoadingOverlay();
});

document.addEventListener("DOMContentLoaded", () => {
    loadFromStorage();
    setupNavigation();
    setupModal();
    setupImportForm();
    setupResetData();
    setupFiltersUi();
    setupInstallButton();
    setupSmoothScroll();

    updateFooterVersion()

    checkForUpdate();
    setInterval(checkForUpdate, 30000);



    populateSymbolFilter();
    updateAccountDisplay();
    updateFiltersFromInputs();

    const filtered = applyFilters();
    const startingCapital =
        (accountMeta && accountMeta.startingCapital) || DEFAULT_CAPITAL;
    const stats = computeStats(filtered, startingCapital);

    updateDashboard(stats, filtered);
    renderTradesTable(filtered);
    updateCharts(stats);

    if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("sw.js")
        .catch((err) => console.warn("SW registration failed", err));
}

});


