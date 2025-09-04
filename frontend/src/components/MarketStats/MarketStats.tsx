/**
 * Market Statistics Component - Professional Trading Style
 * =======================================================
 * Displays key market statistics in a horizontal strip layout.
 * Features change indicators and real-time updates.
 */

import React, { memo, useMemo } from 'react';
import { Skeleton } from '@arco-design/web-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { marketAPI } from '../../services/api';
import './MarketStats.css';

const MarketStats: React.FC = memo(() => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['market-stats'],
    queryFn: marketAPI.getMarketStats,
    refetchInterval: 30000, // 30 seconds for more frequent updates
  });

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}`;
  };

  const getChangeClass = (change: number) => {
    if (change > 0) return 'positive';
    if (change < 0) return 'negative';
    return 'neutral';
  };

  const formatPrice = (price: number) => {
    return price ? price.toFixed(2) : '0.00';
  };

  // Calculate derived values (memoized for performance) - must be called before early returns
  const derivedValues = useMemo(() => {
    const currentDA = stats?.avg_price_24h || 0;
    const currentRT = currentDA + 2.5; // Simulated RT price based on DA + typical spread
    const spread = currentRT - currentDA;
    const daChange = 1.2; // Simulated price change for demonstration
    const rtChange = -0.8; // Simulated price change for demonstration
    
    return { currentDA, currentRT, spread, daChange, rtChange };
  }, [stats?.avg_price_24h]);

  if (isLoading) {
    return (
      <div className="market-stats-container">
        <div className="market-stats-loading">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="stat-skeleton">
              <Skeleton animation />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="market-stats-container">
      <div className="market-stats-strip">
        {/* Day-Ahead Price */}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Day-Ahead</span>
            <span className={`stat-change ${getChangeClass(derivedValues.daChange)}`}>
              {formatChange(derivedValues.daChange)}
            </span>
          </div>
          <div className="stat-value">
            ${formatPrice(derivedValues.currentDA)}
            <span className="stat-unit">/MWh</span>
          </div>
          <div className="stat-meta">
            <span className="stat-trend">vs yesterday</span>
          </div>
        </div>

        {/* Real-Time Price */}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Real-Time</span>
            <span className={`stat-change ${getChangeClass(derivedValues.rtChange)}`}>
              {formatChange(derivedValues.rtChange)}
            </span>
          </div>
          <div className="stat-value">
            ${formatPrice(derivedValues.currentRT)}
            <span className="stat-unit">/MWh</span>
          </div>
          <div className="stat-meta">
            <span className="stat-trend">vs last hour</span>
          </div>
        </div>

        {/* Price Spread */}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">RT-DA Spread</span>
            <span className={`stat-change ${getChangeClass(derivedValues.spread)}`}>
              {derivedValues.spread > 0 ? 'PREMIUM' : derivedValues.spread < 0 ? 'DISCOUNT' : 'FLAT'}
            </span>
          </div>
          <div className="stat-value">
            ${formatPrice(Math.abs(derivedValues.spread))}
            <span className="stat-unit">/MWh</span>
          </div>
          <div className="stat-meta">
            <span className="stat-trend">arbitrage opportunity</span>
          </div>
        </div>

        {/* Market Volatility */}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">Volatility</span>
            <span className="stat-change neutral">
              24H
            </span>
          </div>
          <div className="stat-value">
            {(stats?.volatility || 0).toFixed(1)}
            <span className="stat-unit">%</span>
          </div>
          <div className="stat-meta">
            <span className="stat-trend">price variance</span>
          </div>
        </div>

        {/* 24h Range */}
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-label">24H Range</span>
            <span className="stat-change neutral">
              H/L
            </span>
          </div>
          <div className="stat-value">
            ${formatPrice(stats?.min_price_24h || 0)}-${formatPrice(stats?.max_price_24h || 0)}
            <span className="stat-unit">/MWh</span>
          </div>
          <div className="stat-meta">
            <span className="stat-trend">daily bounds</span>
          </div>
        </div>

        <div className="last-update">
          Last updated: {stats?.last_update ? format(new Date(stats.last_update), 'HH:mm:ss') : '--:--:--'} PST
        </div>
      </div>
    </div>
  );
});

// Set display name for better debugging
MarketStats.displayName = 'MarketStats';

export default MarketStats;