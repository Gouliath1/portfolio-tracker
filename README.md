# Portfolio Tracker

A modern, responsive portfolio tracking application built with Next.js that helps you monitor your stock investments with real-time price updates and performance analytics.

## ✨ Features

- 📊 **Real-time Portfolio Tracking** - Monitor your stock positions with live price updates
- 📈 **Performance Analytics** - Visualize your portfolio performance over time
- 💰 **P&L Calculations** - Track profit/loss for individual positions and overall portfolio
- 🌐 **Multi-Currency Support** - Support for USD and JPY stocks
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile devices
- 🔒 **Privacy First** - Your portfolio data stays local and private
- ⚡ **Smart Caching** - Efficient price caching to minimize API calls

## 🚀 Quick Setup

We provide cross-platform setup scripts to get you started quickly:

### Automatic Setup (Recommended)

**For Windows:**
```cmd
utils/setup.bat
```

**For macOS/Linux:**
```bash
./utils/setup.sh
```

**Cross-platform (Node.js):**
```bash
node utils/setup.js
# or
npm run setup
```

### Manual Setup

If you prefer to set up manually:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Gouliath1/portfolio-tracker.git
   cd portfolio-tracker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up your portfolio data:**
   ```bash
   cp data/positions.template.json data/positions.json
   ```
   Edit `data/positions.json` with your actual portfolio data.

4. **Create environment file (optional):**
   ```bash
   cp .env.example .env.local
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📋 Prerequisites

- **Node.js** 18.0 or higher
- **npm** (comes with Node.js)
- **Git** (optional, for version control)

## 🛠️ Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build the application for production
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint for code quality
- `npm run setup` - Run the cross-platform setup script

## 📁 Project Structure

```
portfolio-tracker/
├── packages/
│   ├── server/            # Shared database + service layer (Next & mobile)
│   │   ├── src/database/  # Schema, startup, and operations
│   │   └── src/services/  # High-level portfolio services for web & mobile
│   ├── types/             # Shared TypeScript models
│   └── core/              # Shared business logic (currency, return calculations, …)
├── src/
│   ├── app/               # Next.js app directory
│   │   ├── api/           # API routes (thin wrappers around shared services)
│   │   └── page.tsx       # Main dashboard page
│   ├── components/        # React components
│   └── utils/             # Web-specific utilities and hooks
├── data/                  # Data files & database
│   ├── portfolio.db       # SQLite database
│   ├── positions.template.json  # Template for portfolio data
│   ├── positions.json     # Your portfolio data (gitignored)
│   └── positionsPrices.json     # Price cache
├── scripts/               # Development utilities and setup scripts
│   ├── setup.js          # Cross-platform setup script
│   ├── setup.sh          # Unix/macOS setup script
│   └── gitPush.sh        # Git push utility
├── instrumentation.ts    # Server startup hook
└── ...                   # Other config files
```

## 💼 Portfolio Data Setup

1. **Copy the template:**
   ```bash
   cp data/positions.template.json data/positions.json
   ```

2. **Edit your positions:**
   Open `data/positions.json` and replace the template data with your actual portfolio positions.

3. **Data format example:**
   ```json
   [
     {
       "ticker": "AAPL",
       "quantity": 100,
       "costPerUnit": 150.00,
       "transactionDate": "2024-01-15",
       "transactionCcy": "USD",
       "transactionFx": 149.50,
       "account": "Brokerage"
     }
   ]
   ```

**Note:** Your `positions.json` file is automatically gitignored to keep your financial data private.

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file for any environment-specific configuration:

```env
# Add your environment variables here if needed
# API_KEY=your_api_key_here
# DATABASE_URL=your_database_url_here
```

### Supported Stock Markets

- **US Stocks** - Use ticker symbols (e.g., AAPL, GOOGL, TSLA)
- **Japanese Stocks** - Use ticker + ".T" format (e.g., 7203.T, 6758.T)

## 🎯 Features Overview

### Portfolio Dashboard
- Real-time portfolio value and P&L
- Individual position tracking
- Performance metrics and analytics

### Database Architecture
- SQLite database with automatic initialization
- Shared service layer in `packages/server` for API and mobile reuse
- Portfolio service helpers (see `packages/server/src/services`) centralize portfolio calculations
- Dedicated service modules (`priceService`, `fxRateService`, `positionsAdminService`, `positionSetsService`, `historicalDataService`) expose typed operations for both web and mobile clients
- Cache-first API approach for optimal performance
- Automatic server startup initialization

### Shared Service Layer
- Located in `packages/server/src/services`
- Encapsulates database access, validation, and orchestration logic shared by Next.js routes and the upcoming Expo client
- Covered by Jest unit tests (`packages/server/__tests__/*Service.test.ts`) to ensure regressions are caught early

### Price Caching
- Smart caching system to minimize API calls
- Automatic daily price updates
- Manual refresh capability

### Data Privacy
- All portfolio data stored locally
- No sensitive data transmitted to external services
- Your financial information stays private

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

---

## 🚀 Production Deployment

### Building for Production

The application uses Next.js standalone build for production-ready deployments:

```bash
# Build the application
npm run build

# The standalone build will be created in .next/standalone/
```

### Production Structure

The standalone build creates a self-contained production package:

```
.next/standalone/
├── .next/            # Compiled Next.js application
├── data/             # Data files & database (copied from source)
├── node_modules/     # Runtime dependencies only
├── package.json      # Production dependencies
└── server.js         # Production server entry point
```

### Deployment Options

#### Option 1: Direct Deployment

```bash
# Deploy the standalone folder to your server
rsync -av .next/standalone/ user@server:/path/to/app/

# Ensure data directory exists and copy your data
rsync -av data/ user@server:/path/to/app/data/

# Start the production server
ssh user@server 'cd /path/to/app && node server.js'
```

#### Option 2: Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy the standalone build
COPY .next/standalone ./
COPY data ./data

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
```

Build and run:

```bash
npm run build
docker build -t portfolio-tracker .
docker run -p 3000:3000 -v $(pwd)/data:/app/data portfolio-tracker
```

#### Option 3: PM2 Process Manager

```bash
# Install PM2 globally
npm install -g pm2

# Deploy and start with PM2
pm2 start .next/standalone/server.js --name portfolio-tracker
pm2 startup
pm2 save
```

### Environment Configuration

For production, create environment variables:

```bash
# Production environment
NODE_ENV=production
PORT=3000
# Add any other production-specific variables
```

### Database Considerations

- The SQLite database (`data/portfolio.db`) is automatically created on first startup
- Your portfolio data (`data/positions.json`) should be deployed alongside the app
- Database initialization happens automatically via `instrumentation.ts`

### Security Notes

- No database management endpoints are exposed in production
- All database operations happen at server startup or through internal APIs
- Your portfolio data remains local to your server

## 🎯 Features Overview

### Portfolio Dashboard
- Real-time portfolio value and P&L
- Individual position tracking
- Performance metrics and analytics

### Price Caching
- Smart caching system to minimize API calls
- Automatic daily price updates
- Manual refresh capability

### Data Privacy
- All portfolio data stored locally
- No sensitive data transmitted to external services
- Your financial information stays private

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Development Issues

**Setup script fails:**
- Ensure Node.js 18+ is installed
- Check that you're in the correct directory
- Verify npm is working: `npm --version`

**Price updates not working:**
- Check your internet connection
- Verify ticker symbols are correct
- Try manual refresh using the refresh button

**Data not showing:**
- Ensure `positions.json` exists in the `data/` directory and contains valid data
- Check browser console for any errors
- Verify the data format matches the template

### Production Deployment Issues

**Database not initializing:**
- Check server logs for database connection errors
- Ensure the `data/` directory exists and is writable
- Verify that `instrumentation.ts` is being executed

**Missing data files:**
- Ensure `data/positions.json` and templates are deployed
- Check file permissions on the production server
- Verify data directory structure matches development

**Port conflicts:**
- Default port is 3000, set `PORT` environment variable to change
- Check if port is already in use: `lsof -i :3000`

**Build fails:**
- Run `npm run build` locally first to test
- Check for TypeScript errors or missing dependencies
- Ensure all required environment variables are set

For more help, please open an issue on GitHub.

---

Built with ❤️ using Next.js, React, and TypeScript.
