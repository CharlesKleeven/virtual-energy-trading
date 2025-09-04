# Virtual Energy Trading Platform

Day-ahead energy market trading simulator with real-time P&L tracking using live CAISO market data.

## Quick Start

**Backend:**
```bash
cd backend && uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend && npm start
```

Visit http://localhost:3000

## Core Features

- **Day-Ahead Market Simulation**: Submit up to 10 bids per hour slot, 11am cutoff enforced
- **Real-Time P&L Tracking**: Sum of 12 intervals: `Σ((RTM_price - DAM_price) × quantity)` for each 5-min in the hour
- **Live CAISO Data**: GridStatus.io API integration for authentic market prices
- **Interactive Visualizations**: Price charts with zoom, market statistics dashboard
- **Position Management**: Track multiple positions with sortable table and CSV export

## Tech Stack

React, TypeScript, Arco Design, FastAPI, GridStatus.io

## Trading Workflow

1. **Monitor Markets**: View DAM/RTM price charts and market statistics
2. **Submit Bids**: Enter price/quantity for specific hours (max 10 per hour, before 11am)
3. **Track Performance**: Real-time P&L calculations as RTM prices update every 5 minutes

## Key Constraints

- **11am Cutoff**: Same-day DAM bids must be submitted before 11am PST
- **10 Bid Limit**: Maximum 10 bids allowed per hour slot
- **Small Trader**: Assumes bids don't move market prices
- **P&L Formula**: Sum of 12 five-minute intervals within each hour: Σ((RTM_price - DAM_price) × Quantity)