/**
 * Trading Types and Interfaces
 * ============================
 * Type definitions for the Virtual Energy Trading Platform.
 * Mirrors backend models with frontend-specific additions.
 */

export interface Bid {
  id?: string;
  hour_slot: number;
  price: number;
  quantity: number; // positive=buy, negative=sell
  submitted_at?: string;
  status?: 'pending' | 'accepted' | 'rejected' | 'cleared';
}

export interface BidSubmission {
  bids: Bid[];
  trading_day: string;
}

export interface Position {
  id: string;
  bid_id: string;
  hour_slot: number;
  quantity: number; // positive=buy, negative=sell
  da_price: number;
  trading_day: string;
  created_at: string;
}

export interface PriceData {
  timestamp: string;
  hour?: number;
  price: number;
  location?: string;
}

export interface PnLCalculation {
  position_id: string;
  hour_slot: number;
  quantity: number;
  da_price: number;
  rt_prices: number[];
  interval_pnl: number[];
  total_pnl: number;
  timestamp: string;
}

export interface MarketStats {
  avg_price_24h: number;
  min_price_24h: number;
  max_price_24h: number;
  volatility: number;
  trend: 'up' | 'down' | 'stable';
  last_update: string;
}

