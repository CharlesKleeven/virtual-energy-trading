# Virtual Energy Trading Platform

Day-ahead energy market trading simulator with real-time P&L tracking using actual CAISO market data.

## Features

- Submit day-ahead market bids (11am cutoff validation)
- Real-time profit/loss tracking at 5-minute intervals  
- Interactive price charts with zoom/pan
- Dark/light theme
- CSV export of positions

## Run Locally

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend  
npm install
npm start
```

Visit http://localhost:3000

## Usage

1. Select trading day and hour slots
2. Enter bid price/quantity 
3. Submit bids (creates positions)
4. Track real-time P&L as prices update

P&L Formula: `(RT_price - DA_price) × quantity`