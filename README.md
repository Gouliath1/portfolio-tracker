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
projectDevUtils/setup.bat
```

**For macOS/Linux:**
```bash
./projectDevUtils/setup.sh
```

**Cross-platform (Node.js):**
```bash
node projectDevUtils/setup.js
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
   cp src/data/positions.template.json src/data/positions.json
   ```
   Edit `src/data/positions.json` with your actual portfolio data.

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
├── src/
│   ├── app/                 # Next.js app directory
│   │   ├── api/            # API routes
│   │   │   └── prices/     # Stock price API endpoints
│   │   └── page.tsx        # Main dashboard page
│   ├── components/         # React components
│   │   ├── PerformanceChart.tsx
│   │   ├── PortfolioSummary.tsx
│   │   └── PositionsTable.tsx
│   ├── data/              # Data files
│   │   ├── positions.template.json  # Template for portfolio data
│   │   ├── positions.json          # Your portfolio data (gitignored)
│   │   └── dailyPrices.json        # Price cache
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── projectDevUtils/       # Development utilities and setup scripts
│   ├── setup.js          # Cross-platform setup script
│   ├── setup.sh          # Unix/macOS setup script
│   ├── setup.bat         # Windows setup script
│   └── gitPush.sh        # Git push utility
└── ...                   # Other config files
```

## 💼 Portfolio Data Setup

1. **Copy the template:**
   ```bash
   cp src/data/positions.template.json src/data/positions.json
   ```

2. **Edit your positions:**
   Open `src/data/positions.json` and replace the template data with your actual portfolio positions.

3. **Data format example:**
   ```json
   [
     {
       "ticker": "AAPL",
       "quantity": 100,
       "costPerUnit": 150.00,
       "transactionDate": "2024-01-15",
       "baseCcy": "USD",
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

### Common Issues

**Setup script fails:**
- Ensure Node.js 18+ is installed
- Check that you're in the correct directory
- Verify npm is working: `npm --version`

**Price updates not working:**
- Check your internet connection
- Verify ticker symbols are correct
- Try manual refresh using the refresh button

**Data not showing:**
- Ensure `positions.json` exists and contains valid data
- Check browser console for any errors
- Verify the data format matches the template

For more help, please open an issue on GitHub.

---

Built with ❤️ using Next.js, React, and TypeScript.
