# Portfolio Tracker

A personal investment dashboard built with Next.js for tracking stock positions (US and Japanese equities), monitoring real-time P&L, and researching new stocks before buying. All portfolio data lives in your browser's `localStorage` — nothing is uploaded anywhere.

## ✨ Features

### Portfolio dashboard (Overview)
- Live position values, cost basis, and P&L in your chosen base currency (USD or JPY), with per-position and total figures
- Asset allocation donut by asset class (auto-classified from Yahoo Finance instrument type)
- Benchmark card comparing your money-weighted return (XIRR) against MSCI ACWI, replaying your actual cash flows into the index
- Portfolio health card — concentration, broker count, currency count
- Top holdings card
- Show/hide values toggle for screen-privacy, light/dark theme

### Analysis (deep-dive)
- Lifetime and annualized return breakdowns (XIRR) with expandable cash-flow detail
- Per-position and portfolio-level return calculations

### Assets
- Full position table with allocation by asset class

### Portfolios (multi-portfolio support)
- Switch between multiple named position sets, each stored independently in `localStorage`
- Add / sell positions via modal forms (buy/sell transactions, FIFO lot matching for realized P&L)
- Import a portfolio from a pasted CSV/file, or export the current one
- A demo portfolio ships out of the box so the app is usable before you add real data

### Screener
- Research universe: TOPIX/iShares 1475 ETF constituents (~1,475 Japanese stocks), loaded from a static BlackRock holdings list
- Fundamentals per stock — price, P/E, forward P/E, P/B, dividend yield, market cap, sector — sourced live from J-Quants (Japan) and Yahoo Finance/Twelve Data (fallback), fetched on demand and cached
- Freshness indicator dot per row (fresh / stale / not loaded) with hover tooltip
- Filter tabs: All / Loaded / Not loaded / Alerts; sortable, resizable columns; Excel export
- Line and candlestick price charts in a modal, per stock
- One-click buy — opens the Add Position modal pre-filled with the selected ticker
- Price alerts — set above/below thresholds per stock; alerted rows are polled hourly while the tab is open, with browser push notifications when a threshold is crossed
- Full horizontal scroll on mobile instead of hiding columns

### General
- Responsive design with a dedicated mobile bottom nav
- Multi-currency support (USD/JPY) with live FX conversion, settings panel to change base currency
- Local-first: portfolio data never leaves your browser; no backend database required for normal use

## 🚀 Quick Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Gouliath1/portfolio-tracker.git
   cd portfolio-tracker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **(Optional) Create an environment file** for the screener's data providers and the production market-data cache:
   ```bash
   cp .env.example .env.local
   ```
   See `.env.example` for details — J-Quants and Twelve Data keys are optional and only needed for screener fundamentals; without them the app falls back to Yahoo Finance.

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:** navigate to [http://localhost:3000](http://localhost:3000)

On first load you'll see a demo portfolio and a welcome prompt to import your own data (via the Settings panel → Portfolios), or you can add positions manually with the Add Position modal.

## 📋 Prerequisites

- **Node.js** 18.0 or higher
- **npm** (comes with Node.js)
- **Git** (optional, for version control)

## 🛠️ Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run dev:clean` - Start dev server via `scripts/startDev.sh`
- `npm run build` - Build the application for production
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint for code quality
- `npm test` / `npm run test:watch` / `npm run test:coverage` / `npm run test:ci` - Run the Jest test suite

## 📁 Project Structure

```
portfolio-tracker/
├── src/
│   ├── app/                # Next.js app directory
│   │   ├── api/            # API routes (prices, pnl, dividends, screener, fx-rates, …)
│   │   ├── screener/       # Stock screener page
│   │   ├── returns/deep-dive/  # Analysis (XIRR) page
│   │   └── page.tsx        # Main dashboard page (Overview / Assets / Portfolios)
│   ├── components/         # React components (layout, overview, screener, management, tables, charts)
│   ├── hooks/               # Shared React hooks (base currency, alert polling, ticker names, …)
│   ├── lib/
│   │   ├── core/            # Shared business logic (currency, XIRR/return calculations) — aliased as @portfolio/core
│   │   └── server/          # Server-side services (Yahoo/J-Quants fetchers, market-data cache) — aliased as @portfolio/server
│   ├── types/                # Shared TypeScript models — aliased as @portfolio/types
│   ├── data/                 # Demo portfolio data
│   └── utils/                # localStorage-backed position store, caches, hooks helpers
├── data/                   # Server-side SQLite caches (market data, screener), gitignored
├── scripts/                # Dev/deploy utilities (fetch-constituents, startDev, gitPush)
├── instrumentation.ts      # Server startup hook (no-op — data is client-side)
└── ...                     # Other config files
```

## 💼 Managing Your Portfolio Data

Portfolio positions are **not** stored in a checked-in file — they live in your browser's `localStorage`, one entry per portfolio ("position set"). To get your real data in:

- **Manually:** use the ➕ Add Position button to record a buy transaction (ticker, quantity, cost, date, account, currency); use the sell action on a position to record a sale.
- **Bulk import:** open Settings → Portfolios → Import, and paste/upload a CSV of transactions. Imported sets are auto-migrated to the internal transaction format.
- **Multiple portfolios:** create, rename, switch between, or delete named position sets from the same panel; export any set back out as a file.

Since everything is local to the browser, clearing site data / a different browser / a different device won't carry your portfolio over — export before doing so if you need to move it.

## 🔧 Configuration

### Environment Variables

See `.env.example` for the full list. Nothing is required for basic use; these enable extra data sources:

- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` - cloud SQLite for the market-data cache in production (Vercel's filesystem is read-only); local dev uses `data/marketCache.db` automatically
- `JQUANTS_API_KEY` (or `JQUANTS_EMAIL` / `JQUANTS_PASSWORD`) - official JPX fundamentals (P/E, P/B, dividend yield) for Japanese screener stocks
- `TWELVE_DATA_API_KEY` - fundamentals for US/JP stocks via Twelve Data (free tier); falls back to Yahoo Finance when unset
- `YAHOO_COOKIE` / `YAHOO_CRUMB` - manual override if Yahoo's crumb endpoint is rate-limited

### Supported Stock Markets

- **US Stocks** - Use ticker symbols (e.g., AAPL, GOOGL, TSLA)
- **Japanese Stocks** - Use ticker + ".T" format (e.g., 7203.T, 6758.T)

## 🌐 Infrastructure

| What | Provider | Notes |
|------|----------|-------|
| Hosting / deployment | [Vercel](https://vercel.com) | Free tier, auto-deploy on push to `main` |
| Live URL | `tracker.julienguille.com` | Custom subdomain |
| Domain registrar | [GoDaddy](https://godaddy.com) | Manages `julienguille.com` DNS |
| Server / web hosting | [OVH](https://ovh.com) | Hosts other sites on the same domain |

### DNS setup (GoDaddy)

To point `tracker.julienguille.com` to Vercel, a CNAME record is set in GoDaddy:

| Type | Name | Value |
|------|------|-------|
| CNAME | `tracker` | `9d28ed80412bd346.vercel-dns-017.com.` |

### Spending protection

Vercel project → **Settings → Billing → Spending Limit** is set to **$0** — Vercel will pause the project rather than charge anything if free-tier limits are ever exceeded.

## 🔒 Data Privacy

- Portfolio positions and transactions are stored entirely in browser `localStorage` — they are never sent to a server for persistence.
- Server-side SQLite (`data/`) only caches market data (prices, FX rates, screener fundamentals) — public information, not your holdings.
- No portfolio data is transmitted to third parties beyond the price/fundamentals lookups (Yahoo Finance, J-Quants, Twelve Data) needed to fetch quotes for your tickers.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

**Price updates not working:**
- Check your internet connection
- Verify ticker symbols are correct (Japanese tickers need the `.T` suffix)
- Use the manual refresh button, or per-row refresh on the screener

**My portfolio disappeared:**
- Portfolio data lives in browser `localStorage`. Clearing browser data, using a different browser, or private/incognito mode will not show previously entered positions. Export your position set beforehand if you need to move or back it up.

**Screener fundamentals missing or stale:**
- Fundamentals are fetched on demand and cached; use "Refresh page" / "Refresh all" or the per-row ⟳ to force a refetch
- Without `JQUANTS_API_KEY` or `TWELVE_DATA_API_KEY` set, the app falls back to Yahoo Finance, which can be rate-limited — see `.env.example` for the manual crumb override

**Build fails:**
- Run `npm run build` locally first to test
- Check for TypeScript errors or missing dependencies

For more help, please open an issue on GitHub.

---

Built with ❤️ using Next.js, React, and TypeScript.
