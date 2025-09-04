"""
Unit Tests for P&L Calculations
================================
Tests the core P&L calculation logic for the trading engine.
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.trading_engine import TradingEngine
from app.models.trading import Position, Bid, BidSubmission


class TestPnLCalculations:
    """Test suite for P&L calculation functionality"""
    
    @pytest.fixture
    def trading_engine(self):
        """Create a trading engine instance for testing"""
        return TradingEngine()
    
    @pytest.fixture
    def sample_position(self):
        """Create a sample position for testing"""
        return Position(
            id="test-position-1",
            bid_id="test-bid-1",
            hour_slot=10,
            quantity=50.0,
            da_price=45.0,
            trading_day=datetime.now()
        )
    
    @pytest.fixture
    def sample_rt_prices(self):
        """Generate sample real-time prices for testing"""
        # Create 5-minute interval prices for one hour
        base_time = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
        prices = []
        
        for i in range(12):  # 12 intervals of 5 minutes
            prices.append({
                'Time': base_time + timedelta(minutes=i*5),
                'LMP': 45.0 + np.random.uniform(-5, 5)  # Random price around DA price
            })
        
        return pd.DataFrame(prices)
    
    @pytest.mark.asyncio
    async def test_pnl_calculation_profit(self, trading_engine, sample_position):
        """Test P&L calculation when position is profitable"""
        # Setup
        trading_engine.positions[sample_position.id] = sample_position
        
        # Create RT prices higher than DA price (profitable scenario)
        base_time = sample_position.trading_day.replace(
            hour=sample_position.hour_slot, minute=0, second=0, microsecond=0
        )
        rt_prices = pd.DataFrame([
            {'Time': base_time + timedelta(minutes=i*5), 'LMP': 50.0}
            for i in range(12)
        ])
        
        # Calculate P&L
        pnl = await trading_engine.calculate_pnl(sample_position.id, rt_prices)
        
        # Assertions
        assert pnl.position_id == sample_position.id
        assert pnl.hour_slot == sample_position.hour_slot
        assert pnl.quantity == sample_position.quantity
        assert pnl.da_price == sample_position.da_price
        
        # P&L should be positive: (50 - 45) * 50 = 250
        expected_pnl = (50.0 - 45.0) * 50.0
        assert abs(pnl.total_pnl - expected_pnl) < 0.01
        
        # All interval P&Ls should be positive
        assert all(p > 0 for p in pnl.interval_pnl)
    
    @pytest.mark.asyncio
    async def test_pnl_calculation_loss(self, trading_engine, sample_position):
        """Test P&L calculation when position is at a loss"""
        # Setup
        trading_engine.positions[sample_position.id] = sample_position
        
        # Create RT prices lower than DA price (loss scenario)
        base_time = sample_position.trading_day.replace(
            hour=sample_position.hour_slot, minute=0, second=0, microsecond=0
        )
        rt_prices = pd.DataFrame([
            {'Time': base_time + timedelta(minutes=i*5), 'LMP': 40.0}
            for i in range(12)
        ])
        
        # Calculate P&L
        pnl = await trading_engine.calculate_pnl(sample_position.id, rt_prices)
        
        # P&L should be negative: (40 - 45) * 50 = -250
        expected_pnl = (40.0 - 45.0) * 50.0
        assert abs(pnl.total_pnl - expected_pnl) < 0.01
        
        # All interval P&Ls should be negative
        assert all(p < 0 for p in pnl.interval_pnl)
    
    @pytest.mark.asyncio
    async def test_pnl_calculation_variable_prices(self, trading_engine, sample_position):
        """Test P&L calculation with variable RT prices"""
        # Setup
        trading_engine.positions[sample_position.id] = sample_position
        
        # Create variable RT prices
        base_time = sample_position.trading_day.replace(
            hour=sample_position.hour_slot, minute=0, second=0, microsecond=0
        )
        rt_price_values = [40, 42, 44, 46, 48, 50, 52, 48, 46, 44, 42, 40]
        rt_prices = pd.DataFrame([
            {'Time': base_time + timedelta(minutes=i*5), 'LMP': rt_price_values[i]}
            for i in range(12)
        ])
        
        # Calculate P&L
        pnl = await trading_engine.calculate_pnl(sample_position.id, rt_prices)
        
        # Calculate expected P&L - sum of all 12 intervals (not average)
        expected_pnl = sum((rt_price - 45.0) * 50.0 for rt_price in rt_price_values)
        
        assert abs(pnl.total_pnl - expected_pnl) < 0.01
        assert len(pnl.interval_pnl) == 12
        assert len(pnl.rt_prices) == 12
    
    @pytest.mark.asyncio
    async def test_portfolio_pnl_calculation(self, trading_engine):
        """Test portfolio-wide P&L calculation"""
        # Create multiple positions
        positions_data = [
            ("pos1", 10, 50.0, 45.0),
            ("pos2", 11, 30.0, 50.0),
            ("pos3", 12, 40.0, 48.0),
        ]
        
        for pos_id, hour, qty, price in positions_data:
            position = Position(
                id=pos_id,
                bid_id=f"bid-{pos_id}",
                hour_slot=hour,
                quantity=qty,
                da_price=price,
                trading_day=datetime.now()
            )
            trading_engine.positions[pos_id] = position
        
        # Create RT prices (all at 47.0 for simplicity)
        base_time = datetime.now().replace(minute=0, second=0, microsecond=0)
        rt_prices = pd.DataFrame([
            {'Time': base_time.replace(hour=h) + timedelta(minutes=i*5), 'LMP': 47.0}
            for h in range(10, 13)
            for i in range(12)
        ])
        
        # Calculate portfolio P&L
        portfolio_pnl = await trading_engine.calculate_portfolio_pnl(rt_prices)
        
        # Verify structure
        assert 'total_pnl' in portfolio_pnl
        assert 'positions' in portfolio_pnl
        assert len(portfolio_pnl['positions']) == 3
        
        # Calculate expected total P&L
        expected_total = 0
        expected_total += (47.0 - 45.0) * 50.0  # pos1: profit
        expected_total += (47.0 - 50.0) * 30.0  # pos2: loss
        expected_total += (47.0 - 48.0) * 40.0  # pos3: loss
        
        assert abs(portfolio_pnl['total_pnl'] - expected_total) < 0.01
    
    @pytest.mark.asyncio
    async def test_pnl_with_missing_rt_prices(self, trading_engine, sample_position):
        """Test P&L calculation when RT prices are not yet available"""
        # Setup
        trading_engine.positions[sample_position.id] = sample_position
        
        # Empty RT prices (future position)
        rt_prices = pd.DataFrame(columns=['Time', 'LMP'])
        
        # Calculate P&L
        pnl = await trading_engine.calculate_pnl(sample_position.id, rt_prices)
        
        # Should use DA price as estimate, resulting in zero P&L
        assert pnl.total_pnl == 0
        assert len(pnl.rt_prices) == 1
        assert pnl.rt_prices[0] == sample_position.da_price


if __name__ == "__main__":
    pytest.main([__file__, "-v"])