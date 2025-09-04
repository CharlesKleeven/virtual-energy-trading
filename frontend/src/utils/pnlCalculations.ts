/**
 * P&L Calculation Utilities
 * ========================
 * Mock P&L calculations for demonstration purposes when backend is unavailable
 * 
 * Core Concept: Each hourly DAM contract is offset by RTM prices every 5 minutes
 * - 1 hour = 12 five-minute intervals
 * - Each interval: (RTM_price - DAM_price) × quantity
 * - Total P&L: SUM of all 12 intervals (not average)
 * 
 * Formula: Σ((RTM_price - DAM_price) × quantity) for all 12 five-minute periods
 */

import { Position } from '../types/trading';

/**
 * Calculate mock real-time price for demonstration
 * Creates realistic price variations based on hour slot and time intervals
 */
export const calculateMockRtPrice = (daPrice: number, hourSlot: number): number => {
  const fiveMinInterval = Math.floor(Date.now() / 300000);
  const baseVariation = ((hourSlot % 3) - 1) * 1.5;
  const timeVariation = (fiveMinInterval % 12) * 0.2;
  return daPrice + baseVariation + timeVariation;
};

/**
 * Calculate mock P&L for a position using simplified single-interval approach
 * Full calculation uses 12 intervals, but this provides quick estimate
 * Formula: (RT_price - DA_price) × quantity
 */
export const calculateMockPositionPnL = (position: Position): number => {
  const rtPrice = calculateMockRtPrice(position.da_price, position.hour_slot);
  return (rtPrice - position.da_price) * position.quantity;
};

/**
 * Generate mock P&L details for all 12 five-minute intervals within an hour
 * This is the complete P&L calculation as per assignment requirements:
 * - Creates 12 RTM prices (one per 5-minute interval)
 * - Calculates interval P&L: (RTM_price - DAM_price) × quantity
 * - Sums all 12 intervals for total P&L (not averaged)
 */
export const generateMockPnLDetails = (position: Position) => {
  const baseRtPrice = position.da_price + ((position.hour_slot % 3) - 1) * 1.5;
  const rtPrices = Array.from({ length: 12 }, (_, i) => 
    baseRtPrice + (Math.sin(i * 0.5) * 0.8) + (position.hour_slot % 7) * 0.3
  );
  const intervalPnL = rtPrices.map(rtPrice => (rtPrice - position.da_price) * position.quantity);
  
  return {
    rt_prices: rtPrices,
    interval_pnl: intervalPnL,
    total_pnl: intervalPnL.reduce((sum, pnl) => sum + pnl, 0) // Sum for entire hourly contract
  };
};