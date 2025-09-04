"""
Trading Engine Service
======================
Core trading logic for the Virtual Energy Trading Platform.
Handles bid management, position tracking, and P&L calculations.

Key Features:
- Bid submission with validation (11am cutoff)
- Position management with real-time tracking
- P&L calculation using (RT_price - DA_price) × quantity formula
- In-memory storage for demo purposes
"""

import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import numpy as np
import pandas as pd
from collections import defaultdict
import logging

from ..models.trading import (
    Bid, BidSubmission, Position, PnLCalculation,
    BidStatus, MarketType
)

logger = logging.getLogger(__name__)


class TradingEngine:
    """
    Main trading engine for managing bids, positions, and P&L calculations.
    
    Architecture Decision:
    Using in-memory storage for demo purposes to focus on UX and functionality
    rather than database setup. In production, this would use PostgreSQL or similar.
    """
    
    def __init__(self):
        # In-memory storage - suitable for demo
        self.bids: Dict[str, Bid] = {}
        self.positions: Dict[str, Position] = {}
        self.bid_history: List[BidSubmission] = []
        
    async def submit_bids(self, submission: BidSubmission) -> Dict:
        """
        Submit day-ahead market bids with validation.
        
        Validation Rules:
        1. Maximum 10 bids per hour slot
        2. 11am cutoff for same-day trading
        3. Price and quantity must be positive
        
        Args:
            submission: BidSubmission containing bids and trading day
            
        Returns:
            Dict with submission status and accepted bid IDs
        """
        try:
            # Validation is handled by Pydantic model
            accepted_bids = []
            rejected_bids = []
            
            for bid in submission.bids:
                # Generate unique ID
                bid.id = str(uuid.uuid4())
                
                # Additional business logic validation
                if self._validate_bid_business_rules(bid, submission.trading_day):
                    bid.status = BidStatus.ACCEPTED
                    self.bids[bid.id] = bid
                    accepted_bids.append(bid.id)
                    
                    # Create position for accepted bid
                    await self._create_position_from_bid(bid, submission.trading_day)
                else:
                    bid.status = BidStatus.REJECTED
                    rejected_bids.append(bid.id)
            
            # Store submission history
            self.bid_history.append(submission)
            
            logger.info(f"Processed bid submission: {len(accepted_bids)} accepted, {len(rejected_bids)} rejected")
            
            return {
                "status": "success",
                "accepted_bids": accepted_bids,
                "rejected_bids": rejected_bids,
                "message": f"Successfully submitted {len(accepted_bids)} bids"
            }
            
        except Exception as e:
            logger.error(f"Error submitting bids: {e}")
            return {
                "status": "error",
                "message": str(e)
            }
    
    def _validate_bid_business_rules(self, bid: Bid, trading_day: datetime) -> bool:
        """
        Additional business rule validation beyond Pydantic.
        
        Future enhancements could include:
        - Credit limit checks
        - Market power restrictions
        - Historical performance validation
        """
        # For demo, basic validation only
        return True
    
    async def _create_position_from_bid(self, bid: Bid, trading_day: datetime):
        """
        Create a position entry when a bid is accepted.
        
        Positions track the actual commitments that will be settled
        against real-time prices for P&L calculation.
        """
        position = Position(
            id=str(uuid.uuid4()),
            bid_id=bid.id,
            hour_slot=bid.hour_slot,
            quantity=bid.quantity,
            da_price=bid.price,
            trading_day=trading_day
        )
        self.positions[position.id] = position
        
    async def get_positions(self, active_only: bool = True) -> List[Position]:
        """
        Retrieve user positions with optional filtering.
        
        Args:
            active_only: If True, only return positions for future/current hours
            
        Returns:
            List of Position objects
        """
        positions = list(self.positions.values())
        
        if active_only:
            current_time = datetime.now()
            positions = [
                p for p in positions 
                if p.trading_day.date() >= current_time.date()
            ]
        
        # Sort by trading day and hour slot for better UX
        positions.sort(key=lambda x: (x.trading_day, x.hour_slot))
        return positions
    
    async def calculate_pnl(self, position_id: str, rt_prices: pd.DataFrame) -> PnLCalculation:
        """
        Calculate P&L for a position using real-time prices.
        
        Formula: P&L = Σ(RT_price - DA_price) × quantity
        
        This calculation is done at 5-minute granularity as RT prices
        are published every 5 minutes, providing 12 data points per hour.
        
        Args:
            position_id: ID of the position to calculate P&L for
            rt_prices: DataFrame with real-time prices (5-min intervals)
            
        Returns:
            PnLCalculation object with detailed breakdown
        """
        if position_id not in self.positions:
            raise ValueError(f"Position {position_id} not found")
        
        position = self.positions[position_id]
        
        # Filter RT prices for the position's hour
        hour_start = position.trading_day.replace(
            hour=position.hour_slot, 
            minute=0, 
            second=0, 
            microsecond=0
        )
        hour_end = hour_start + timedelta(hours=1)
        
        # Get prices for the specific hour
        mask = (rt_prices['Time'] >= hour_start) & (rt_prices['Time'] < hour_end)
        hour_prices = rt_prices.loc[mask, 'LMP'].values
        
        # If no RT prices available yet (future hour), use DA price as estimate
        if len(hour_prices) == 0:
            hour_prices = [position.da_price]
        
        # Calculate P&L for each 5-minute interval
        interval_pnl = [(rt_price - position.da_price) * position.quantity 
                        for rt_price in hour_prices]
        
        # Total P&L is sum of all intervals (offsetting entire hourly contract)
        total_pnl = sum(interval_pnl) if interval_pnl else 0
        
        return PnLCalculation(
            position_id=position_id,
            hour_slot=position.hour_slot,
            quantity=position.quantity,
            da_price=position.da_price,
            rt_prices=list(hour_prices),
            interval_pnl=interval_pnl,
            total_pnl=total_pnl
        )
    
    async def calculate_portfolio_pnl(self, rt_prices: pd.DataFrame) -> Dict:
        """
        Calculate P&L for entire portfolio.
        
        Returns:
            Dict with total P&L and breakdown by position
        """
        portfolio_pnl = []
        total_pnl = 0
        
        for position_id in self.positions:
            try:
                pnl_calc = await self.calculate_pnl(position_id, rt_prices)
                portfolio_pnl.append({
                    "position_id": position_id,
                    "hour_slot": pnl_calc.hour_slot,
                    "pnl": pnl_calc.total_pnl
                })
                total_pnl += pnl_calc.total_pnl
            except Exception as e:
                logger.error(f"Error calculating P&L for position {position_id}: {e}")
        
        return {
            "total_pnl": total_pnl,
            "positions": portfolio_pnl,
            "calculated_at": datetime.now().isoformat()
        }
    
    async def clear_expired_positions(self):
        """
        Clean up positions that are more than 24 hours old.
        Called periodically to manage memory usage.
        """
        cutoff_time = datetime.now() - timedelta(days=1)
        
        expired_positions = [
            pid for pid, pos in self.positions.items()
            if pos.trading_day < cutoff_time
        ]
        
        for pid in expired_positions:
            del self.positions[pid]
        
        if expired_positions:
            logger.info(f"Cleared {len(expired_positions)} expired positions")