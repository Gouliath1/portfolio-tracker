# Portfolio Tracker API Endpoints

This document describes the available API endpoints for the portfolio tracker application.
All routes are thin wrappers around the shared service layer found in `packages/server/src/services`, so web and mobile clients consume the same data-access functions. The Next.js implementations live under `apps/web/src/app/api/*`.

## API Endpoints

### GET /api/positions

Returns the raw positions data from your portfolio.

**Response:**
```json
{
  "success": true,
  "positions": [
    {
      "transactionDate": "2023/05/30",
      "ticker": "7940.T",
      "fullName": "Wavelock HLDGS",
      "account": "JP NISA",
      "quantity": 1600,
      "costPerUnit": 572,
      "baseCcy": "JPY",
      "transactionFx": 1
    }
    // ... more positions
  ],
  "count": 15
}
```

**Usage:**
```bash
curl http://localhost:3000/api/positions
```

### GET /api/pnl

Returns calculated profit and loss data for all positions using current market prices.

**Parameters:**
- `refresh` (optional): Set to `true` to force refresh current prices from Yahoo Finance

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalValueJPY": 16841248.837,
    "totalCostJPY": 13853200,
    "totalPnlJPY": 2988048.837,
    "totalPnlPercentage": 21.13
  },
  "positions": [
    {
      "ticker": "7940.T",
      "fullName": "Wavelock HLDGS",
      "account": "JP NISA",
      "quantity": 1600,
      "costPerUnit": 572,
      "currentPrice": 597,
      "costInJPY": 915200,
      "currentValueJPY": 955200,
      "pnlJPY": 40000,
      "pnlPercentage": 4.37,
      "baseCcy": "JPY"
    }
    // ... more positions
  ],
  "count": 15,
  "timestamp": "2025-06-30T13:24:59.641Z"
}
```

**Usage:**
```bash
# Get PnL with cached prices (faster)
curl http://localhost:3000/api/pnl

# Get PnL with fresh prices from Yahoo Finance (slower, but more accurate)
curl "http://localhost:3000/api/pnl?refresh=true"
```

### GET /api/prices

Returns current cached price data for all symbols.

**Response:**
```json
{
  "success": true,
  "prices": {
    "7940.T": 597,
    "8604.T": 952,
    "AAPL": 201.08
    // ... more prices
  },
  "count": 10,
  "lastUpdated": "2025-06-30T13:24:59.641Z"
}
```

### GET /api/historical-data

Returns historical price data for all symbols.

**Response:**
```json
{
  "success": true,
  "historicalData": {
    "7940.T": {
      "2025-06-30": 597,
      "2025-05-31": 593,
      "2025-04-30": 582
      // ... more historical data
    }
    // ... more symbols
  },
  "count": 10
}
```

### POST /api/historical-data

Refreshes historical price data for all positions from Yahoo Finance.

**Usage:**
```bash
curl -X POST http://localhost:3000/api/historical-data
```

## Data Structure

### Position Types

- **RawPosition**: Basic position data as stored in positions.json
- **Position**: Enhanced position data with calculated current values and P&L
- **PortfolioSummary**: Complete portfolio overview with totals and position details

### Currency Handling

- All monetary values are converted to JPY for consistency
- `baseCcy` indicates the original currency of the position
- `transactionFx` is the exchange rate used at the time of purchase

### Price Data

- Current prices are fetched from Yahoo Finance API
- Historical prices are stored monthly for performance
- Rate limiting is implemented to respect Yahoo Finance's terms
- All prices are cached for better performance

## Error Handling

All endpoints return structured error responses:

```json
{
  "success": false,
  "error": "Error description",
  "details": "Detailed error message"
}
```

HTTP status codes:
- `200`: Success
- `500`: Server error (API failure, file read error, etc.)
