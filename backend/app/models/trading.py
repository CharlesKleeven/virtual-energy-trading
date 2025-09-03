from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, validator
from enum import Enum


class MarketType(str, Enum):
    DAY_AHEAD = "day_ahead"
    REAL_TIME = "real_time"


class BidStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CLEARED = "cleared"


class Bid(BaseModel):
    id: Optional[str] = None
    hour_slot: int = Field(..., ge=0, le=23, description="Hour slot (0-23)")
    price: float = Field(..., gt=0, description="Price in $/MWh")
    quantity: float = Field(..., gt=0, description="Quantity in MWh")
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    status: BidStatus = BidStatus.PENDING
    
    @validator('hour_slot')
    def validate_hour_slot(cls, v):
        if not 0 <= v <= 23:
            raise ValueError('Hour slot must be between 0 and 23')
        return v


class BidSubmission(BaseModel):
    bids: List[Bid]
    trading_day: datetime
    
    @validator('bids')
    def validate_bid_count(cls, v):
        hour_counts = {}
        for bid in v:
            hour_counts[bid.hour_slot] = hour_counts.get(bid.hour_slot, 0) + 1
            if hour_counts[bid.hour_slot] > 10:
                raise ValueError(f'Maximum 10 bids allowed per hour slot. Hour {bid.hour_slot} has {hour_counts[bid.hour_slot]} bids')
        return v
    
    @validator('trading_day')
    def validate_cutoff_time(cls, v):
        now = datetime.utcnow()
        cutoff = v.replace(hour=11, minute=0, second=0, microsecond=0)
        
        if v.date() == now.date() and now > cutoff:
            raise ValueError('Cannot submit bids after 11:00 AM for same day trading')
        return v


class Position(BaseModel):
    id: str
    bid_id: str
    hour_slot: int
    quantity: float
    da_price: float
    trading_day: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    

class PriceData(BaseModel):
    timestamp: datetime
    hour: int
    price: float
    market_type: MarketType
    location: str = "TH_NP15_GEN-APND"


class PnLCalculation(BaseModel):
    position_id: str
    hour_slot: int
    quantity: float
    da_price: float
    rt_prices: List[float]
    interval_pnl: List[float]
    total_pnl: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class MarketStats(BaseModel):
    avg_price_24h: float
    min_price_24h: float
    max_price_24h: float
    volatility: float
    trend: str
    last_update: datetime