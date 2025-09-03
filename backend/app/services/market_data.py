import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import pandas as pd
import numpy as np
from cachetools import TTLCache
import gridstatus
import logging

logger = logging.getLogger(__name__)


class MarketDataService:
    def __init__(self):
        self.cache = TTLCache(maxsize=100, ttl=300)  # 5-minute TTL
        self.caiso = gridstatus.CAISO()
        
    async def get_day_ahead_prices(self, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> pd.DataFrame:
        """Fetch day-ahead market prices from CAISO via GridStatus"""
        cache_key = f"dam_prices_{start_date}_{end_date}"
        
        if cache_key in self.cache:
            logger.info("Returning cached DAM prices")
            return self.cache[cache_key]
        
        try:
            if not start_date:
                start_date = datetime.now() - timedelta(days=7)
            if not end_date:
                end_date = datetime.now()
            
            loop = asyncio.get_event_loop()
            dam_prices = await loop.run_in_executor(
                None, 
                lambda: self.caiso.get_lmp(
                    start=start_date,
                    end=end_date,
                    market="DAM",
                    locations=["TH_NP15_GEN-APND"]
                )
            )
            
            self.cache[cache_key] = dam_prices
            return dam_prices
            
        except Exception as e:
            logger.error(f"Error fetching DAM prices: {e}")
            return self._get_mock_dam_prices(start_date, end_date)
    
    async def get_realtime_prices(self, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> pd.DataFrame:
        """Fetch real-time market prices from CAISO via GridStatus"""
        cache_key = f"rtm_prices_{start_date}_{end_date}"
        
        if cache_key in self.cache:
            logger.info("Returning cached RTM prices")
            return self.cache[cache_key]
        
        try:
            if not start_date:
                start_date = datetime.now() - timedelta(hours=24)
            if not end_date:
                end_date = datetime.now()
            
            loop = asyncio.get_event_loop()
            rtm_prices = await loop.run_in_executor(
                None,
                lambda: self.caiso.get_lmp(
                    start=start_date,
                    end=end_date,
                    market="RTM",
                    locations=["TH_NP15_GEN-APND"]
                )
            )
            
            self.cache[cache_key] = rtm_prices
            return rtm_prices
            
        except Exception as e:
            logger.error(f"Error fetching RTM prices: {e}")
            return self._get_mock_rtm_prices(start_date, end_date)
    
    def _get_mock_dam_prices(self, start_date: datetime, end_date: datetime) -> pd.DataFrame:
        """Generate mock DAM prices for development/testing"""
        dates = pd.date_range(start=start_date, end=end_date, freq='H')
        base_price = 50
        
        prices = []
        for date in dates:
            hour = date.hour
            
            # Simulate daily price patterns
            if 6 <= hour <= 9:  # Morning peak
                price = base_price * np.random.uniform(1.2, 1.5)
            elif 17 <= hour <= 21:  # Evening peak
                price = base_price * np.random.uniform(1.3, 1.6)
            elif 0 <= hour <= 5:  # Night valley
                price = base_price * np.random.uniform(0.6, 0.8)
            else:  # Mid-day
                price = base_price * np.random.uniform(0.9, 1.1)
            
            prices.append({
                'Time': date,
                'LMP': price + np.random.normal(0, 5),
                'Location': 'TH_NP15_GEN-APND'
            })
        
        return pd.DataFrame(prices)
    
    def _get_mock_rtm_prices(self, start_date: datetime, end_date: datetime) -> pd.DataFrame:
        """Generate mock RTM prices for development/testing"""
        dates = pd.date_range(start=start_date, end=end_date, freq='5min')
        base_price = 50
        
        prices = []
        for date in dates:
            hour = date.hour
            
            # Similar pattern to DAM but with more volatility
            if 6 <= hour <= 9:
                price = base_price * np.random.uniform(1.1, 1.6)
            elif 17 <= hour <= 21:
                price = base_price * np.random.uniform(1.2, 1.7)
            elif 0 <= hour <= 5:
                price = base_price * np.random.uniform(0.5, 0.9)
            else:
                price = base_price * np.random.uniform(0.8, 1.2)
            
            prices.append({
                'Time': date,
                'LMP': price + np.random.normal(0, 8),
                'Location': 'TH_NP15_GEN-APND'
            })
        
        return pd.DataFrame(prices)
    
    async def calculate_market_stats(self) -> Dict:
        """Calculate market statistics for the dashboard"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(hours=24)
            
            rtm_prices = await self.get_realtime_prices(start_date, end_date)
            
            if not rtm_prices.empty:
                prices = rtm_prices['LMP'].values
                
                # Calculate trend
                recent_avg = np.mean(prices[-12:])  # Last hour
                older_avg = np.mean(prices[-24:-12])  # Hour before that
                
                if recent_avg > older_avg * 1.05:
                    trend = "up"
                elif recent_avg < older_avg * 0.95:
                    trend = "down"
                else:
                    trend = "stable"
                
                return {
                    "avg_price_24h": float(np.mean(prices)),
                    "min_price_24h": float(np.min(prices)),
                    "max_price_24h": float(np.max(prices)),
                    "volatility": float(np.std(prices)),
                    "trend": trend,
                    "last_update": datetime.now().isoformat()
                }
            
            return {
                "avg_price_24h": 50.0,
                "min_price_24h": 30.0,
                "max_price_24h": 80.0,
                "volatility": 10.0,
                "trend": "stable",
                "last_update": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error calculating market stats: {e}")
            return {
                "avg_price_24h": 50.0,
                "min_price_24h": 30.0,
                "max_price_24h": 80.0,
                "volatility": 10.0,
                "trend": "stable",
                "last_update": datetime.now().isoformat()
            }