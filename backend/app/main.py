"""
Virtual Energy Trading Platform - Backend API
==============================================
FastAPI backend for day-ahead market trading simulation.

Architecture Overview:
- FastAPI for high-performance async API
- WebSocket support for real-time price updates
- GridStatus.io integration for real market data
- In-memory storage for demo (production would use PostgreSQL)
- 5-minute cache TTL to respect API rate limits

Author: Energy Trading Platform Team
"""

import asyncio
import json
from datetime import datetime, timedelta
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import logging

from .models.trading import (
    BidSubmission, Position, PnLCalculation, MarketStats
)
from .services.market_data import MarketDataService
from .services.trading_engine import TradingEngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Global service instances
market_service = MarketDataService()
trading_engine = TradingEngine()


class ConnectionManager:
    """
    WebSocket connection manager for real-time price updates.
    Handles multiple client connections and broadcasts price updates.
    """
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)


manager = ConnectionManager()


async def price_update_task():
    """
    Background task to fetch and broadcast price updates every 5 minutes.
    Runs continuously while the application is active.
    """
    while True:
        try:
            # Fetch latest prices
            end_date = datetime.now()
            start_date = end_date - timedelta(hours=1)
            
            rtm_prices = await market_service.get_realtime_prices(start_date, end_date)
            
            if not rtm_prices.empty:
                latest_price = rtm_prices.iloc[-1]
                
                # Broadcast to all connected clients
                await manager.broadcast({
                    "type": "price_update",
                    "data": {
                        "timestamp": latest_price['Time'].isoformat(),
                        "price": float(latest_price['LMP']),
                        "market": "RTM"
                    }
                })
                
                logger.info(f"Broadcasted price update: ${latest_price['LMP']:.2f}")
        
        except Exception as e:
            logger.error(f"Error in price update task: {e}")
        
        # Wait 5 minutes before next update
        await asyncio.sleep(300)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for background tasks.
    Starts price update task on startup and cleans up on shutdown.
    """
    # Startup
    task = asyncio.create_task(price_update_task())
    logger.info("Started price update background task")
    
    yield
    
    # Shutdown
    task.cancel()
    logger.info("Stopped price update background task")


# Create FastAPI application
app = FastAPI(
    title="Virtual Energy Trading Platform API",
    description="Day-ahead market trading simulation platform",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# API Endpoints
# =============

@app.get("/")
async def root():
    """Health check and API information endpoint"""
    return {
        "status": "online",
        "api": "Virtual Energy Trading Platform",
        "version": "1.0.0",
        "endpoints": {
            "market": "/api/market/*",
            "trading": "/api/bids/*, /api/positions/*",
            "websocket": "/ws/prices"
        }
    }


@app.post("/api/bids/submit")
async def submit_bids(submission: BidSubmission):
    """
    Submit day-ahead market bids.
    
    Validates:
    - Maximum 10 bids per hour slot
    - 11am cutoff for same-day trading
    - Valid price and quantity values
    
    Returns submission status with accepted/rejected bid IDs.
    """
    try:
        result = await trading_engine.submit_bids(submission)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error submitting bids: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/market/day-ahead")
async def get_day_ahead_prices(
    days: int = Query(7, ge=1, le=30, description="Number of days of historical data")
):
    """
    Get day-ahead market prices.
    
    Args:
        days: Number of days of historical data (1-30)
    
    Returns:
        Hourly DAM prices with timestamps
    """
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        dam_prices = await market_service.get_day_ahead_prices(start_date, end_date)
        
        # Convert DataFrame to JSON-friendly format
        if not dam_prices.empty:
            prices_list = []
            for _, row in dam_prices.iterrows():
                prices_list.append({
                    "timestamp": row['Time'].isoformat(),
                    "hour": row['Time'].hour,
                    "price": float(row['LMP']),
                    "location": row.get('Location', 'TH_NP15_GEN-APND')
                })
            
            return {
                "status": "success",
                "data": prices_list,
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                }
            }
        else:
            return {
                "status": "success",
                "data": [],
                "message": "No data available for specified period"
            }
    
    except Exception as e:
        logger.error(f"Error fetching DAM prices: {e}")
        raise HTTPException(status_code=500, detail="Error fetching market data")


@app.get("/api/market/realtime")
async def get_realtime_prices(
    hours: int = Query(24, ge=1, le=168, description="Number of hours of data")
):
    """
    Get real-time market prices at 5-minute intervals.
    
    Args:
        hours: Number of hours of historical data (1-168)
    
    Returns:
        5-minute RTM prices with timestamps
    """
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(hours=hours)
        
        rtm_prices = await market_service.get_realtime_prices(start_date, end_date)
        
        if not rtm_prices.empty:
            prices_list = []
            for _, row in rtm_prices.iterrows():
                prices_list.append({
                    "timestamp": row['Time'].isoformat(),
                    "price": float(row['LMP']),
                    "location": row.get('Location', 'TH_NP15_GEN-APND')
                })
            
            return {
                "status": "success",
                "data": prices_list,
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat()
                }
            }
        else:
            return {
                "status": "success",
                "data": [],
                "message": "No data available for specified period"
            }
    
    except Exception as e:
        logger.error(f"Error fetching RTM prices: {e}")
        raise HTTPException(status_code=500, detail="Error fetching market data")


@app.get("/api/market/stats")
async def get_market_stats():
    """
    Get current market statistics.
    
    Returns:
        24-hour statistics including avg, min, max, volatility, and trend
    """
    try:
        stats = await market_service.calculate_market_stats()
        return {
            "status": "success",
            "data": stats
        }
    except Exception as e:
        logger.error(f"Error calculating market stats: {e}")
        raise HTTPException(status_code=500, detail="Error calculating statistics")


@app.get("/api/positions")
async def get_positions(active_only: bool = Query(True)):
    """
    Get user's trading positions.
    
    Args:
        active_only: If true, only return active positions
    
    Returns:
        List of positions with details
    """
    try:
        positions = await trading_engine.get_positions(active_only)
        
        positions_data = []
        for pos in positions:
            positions_data.append({
                "id": pos.id,
                "bid_id": pos.bid_id,
                "hour_slot": pos.hour_slot,
                "quantity": pos.quantity,
                "da_price": pos.da_price,
                "trading_day": pos.trading_day.isoformat(),
                "created_at": pos.created_at.isoformat()
            })
        
        return {
            "status": "success",
            "data": positions_data,
            "count": len(positions_data)
        }
    
    except Exception as e:
        logger.error(f"Error fetching positions: {e}")
        raise HTTPException(status_code=500, detail="Error fetching positions")


@app.get("/api/pnl/calculate/{position_id}")
async def calculate_position_pnl(position_id: str):
    """
    Calculate P&L for a specific position.
    
    Args:
        position_id: ID of the position
    
    Returns:
        Detailed P&L calculation with interval breakdown
    """
    try:
        # Get real-time prices for P&L calculation
        end_date = datetime.now()
        start_date = end_date - timedelta(hours=24)
        rtm_prices = await market_service.get_realtime_prices(start_date, end_date)
        
        pnl = await trading_engine.calculate_pnl(position_id, rtm_prices)
        
        return {
            "status": "success",
            "data": {
                "position_id": pnl.position_id,
                "hour_slot": pnl.hour_slot,
                "quantity": pnl.quantity,
                "da_price": pnl.da_price,
                "rt_prices": pnl.rt_prices,
                "interval_pnl": pnl.interval_pnl,
                "total_pnl": pnl.total_pnl,
                "timestamp": pnl.timestamp.isoformat()
            }
        }
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error calculating P&L: {e}")
        raise HTTPException(status_code=500, detail="Error calculating P&L")


@app.get("/api/pnl/portfolio")
async def calculate_portfolio_pnl():
    """
    Calculate P&L for entire portfolio.
    
    Returns:
        Total portfolio P&L with position breakdown
    """
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(hours=24)
        rtm_prices = await market_service.get_realtime_prices(start_date, end_date)
        
        portfolio_pnl = await trading_engine.calculate_portfolio_pnl(rtm_prices)
        
        return {
            "status": "success",
            "data": portfolio_pnl
        }
    
    except Exception as e:
        logger.error(f"Error calculating portfolio P&L: {e}")
        raise HTTPException(status_code=500, detail="Error calculating portfolio P&L")


@app.websocket("/ws/prices")
async def websocket_prices(websocket: WebSocket):
    """
    WebSocket endpoint for real-time price updates.
    
    Clients receive price updates every 5 minutes automatically.
    Message format: {"type": "price_update", "data": {...}}
    """
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and wait for client messages
            data = await websocket.receive_text()
            
            # Echo back for connection testing
            if data == "ping":
                await websocket.send_text("pong")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)