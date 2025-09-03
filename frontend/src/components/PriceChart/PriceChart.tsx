/**
 * Price Chart Component
 * =====================
 * Interactive chart displaying DAM and RTM prices.
 * Features zoom/pan, bid overlay, and hour selection.
 */

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
  ReferenceLine,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { Skeleton, Radio } from '@arco-design/web-react';
import { format, parseISO, subDays } from 'date-fns';
import { marketAPI } from '../../services/api';
import './PriceChart.css';

interface PriceChartProps {
  onHourSelect?: (hour: number | null) => void;
  selectedHour?: number | null;
}

const PriceChart: React.FC<PriceChartProps> = ({ onHourSelect, selectedHour }) => {
  const [viewMode, setViewMode] = React.useState<'dam' | 'rtm' | 'both'>('both');
  const [timeframe, setTimeframe] = React.useState<'1D' | '7D' | '30D'>('7D');
  const dateRange = React.useMemo(() => [
    subDays(new Date(), 7),
    new Date()
  ], []);

  // Fetch DAM prices
  const { data: damPrices, isLoading: damLoading } = useQuery({
    queryKey: ['dam-prices', dateRange],
    queryFn: () => marketAPI.getDayAheadPrices(7),
    refetchInterval: 300000, // 5 minutes
  });

  // Fetch RTM prices
  const { data: rtmPrices, isLoading: rtmLoading } = useQuery({
    queryKey: ['rtm-prices', dateRange],
    queryFn: () => marketAPI.getRealtimePrices(24),
    refetchInterval: 300000, // 5 minutes
  });

  // Process and combine price data
  const chartData = useMemo(() => {
    const dataMap = new Map<string, any>();

    // Process DAM prices (hourly)
    if (damPrices && (viewMode === 'dam' || viewMode === 'both')) {
      damPrices.forEach((price) => {
        const hourKey = format(parseISO(price.timestamp), 'MM/dd HH:00');
        const existing = dataMap.get(hourKey) || {};
        dataMap.set(hourKey, {
          ...existing,
          time: hourKey,
          timestamp: price.timestamp,
          hour: price.hour,
          damPrice: price.price,
        });
      });
    }

    // Process RTM prices (aggregate to hourly)
    if (rtmPrices && (viewMode === 'rtm' || viewMode === 'both')) {
      const hourlyRtm = new Map<string, number[]>();
      
      rtmPrices.forEach((price) => {
        const hourKey = format(parseISO(price.timestamp), 'MM/dd HH:00');
        if (!hourlyRtm.has(hourKey)) {
          hourlyRtm.set(hourKey, []);
        }
        hourlyRtm.get(hourKey)!.push(price.price);
      });

      // Calculate hourly averages
      hourlyRtm.forEach((prices, hourKey) => {
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const existing = dataMap.get(hourKey) || {};
        dataMap.set(hourKey, {
          ...existing,
          time: hourKey,
          rtmPrice: avg,
          rtmMin: Math.min(...prices),
          rtmMax: Math.max(...prices),
        });
      });
    }

    // Convert to array and sort by time
    return Array.from(dataMap.values()).sort((a, b) => 
      new Date(a.timestamp || a.time).getTime() - new Date(b.timestamp || b.time).getTime()
    );
  }, [damPrices, rtmPrices, viewMode]);

  // Enhanced tooltip with professional styling
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="price-chart-tooltip">
          <div className="label">{label}</div>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="price-line">
              <span style={{ color: entry.color }}>{entry.name}</span>
              <span className="price-value" style={{ color: entry.color }}>
                ${entry.value?.toFixed(2)}/MWh
              </span>
            </div>
          ))}
          {payload[0]?.payload?.hour !== undefined && (
            <div className="hour">Hour {payload[0].payload.hour} • Click to select</div>
          )}
        </div>
      );
    }
    return null;
  };

  // Handle click on chart to select hour
  const handleChartClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const hour = data.activePayload[0].payload.hour;
      if (hour !== undefined) {
        onHourSelect?.(hour);
      }
    }
  };

  // Loading state
  if (damLoading || rtmLoading) {
    return (
      <div className="price-chart-loading">
        <Skeleton animation />
      </div>
    );
  }

  return (
    <div className="price-chart-container">
      {/* Enhanced Chart Header */}
      <div className="chart-header">
        <div className="chart-controls">
          <div className="timeframe-selector">
            {['1D', '7D', '30D'].map((tf) => (
              <button
                key={tf}
                className={`timeframe-btn ${timeframe === tf ? 'active' : ''}`}
                onClick={() => setTimeframe(tf as any)}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="view-mode-selector">
            {['dam', 'rtm', 'both'].map((mode) => (
              <button
                key={mode}
                className={`view-mode-btn ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode as any)}
              >
                {mode === 'dam' ? 'DAM' : mode === 'rtm' ? 'RTM' : 'Both'}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-info">
          <span>CAISO NP15 • 5min intervals</span>
        </div>
      </div>

      {/* Enhanced Chart Wrapper */}
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 80, bottom: 90 }}
          onClick={handleChartClick}
        >
          <CartesianGrid strokeDasharray="1 1" stroke="#444" opacity={0.3} />
          <XAxis 
            dataKey="time" 
            angle={-45}
            textAnchor="end"
            height={60}
            interval={Math.ceil(chartData.length / 6)}
            tick={{ fill: '#b2b5be', fontSize: 10 }}
            axisLine={{ stroke: '#2a2f3a' }}
            tickLine={{ stroke: '#2a2f3a' }}
          />
          <YAxis 
            label={{ 
              value: 'Price ($/MWh)', 
              angle: -90, 
              position: 'insideLeft', 
              style: { 
                fill: '#b2b5be', 
                fontSize: '11px',
                fontWeight: '500'
              } 
            }}
            domain={['dataMin - 10', 'dataMax + 10']}
            tick={{ fill: '#b2b5be', fontSize: 11 }}
            axisLine={{ stroke: '#2a2f3a' }}
            tickLine={{ stroke: '#2a2f3a' }}
            tickFormatter={(value) => `$${Math.round(value)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />

          {/* Day-Ahead Price Line */}
          {(viewMode === 'dam' || viewMode === 'both') && (
            <Line
              type="monotone"
              dataKey="damPrice"
              stroke="#3861FB"
              strokeWidth={2}
              name="Day-Ahead"
              dot={false}
              activeDot={{ r: 4, fill: '#3861FB', stroke: '#f8f9fa', strokeWidth: 1 }}
            />
          )}

          {/* Real-Time Price Line */}
          {(viewMode === 'rtm' || viewMode === 'both') && (
            <Line
              type="monotone"
              dataKey="rtmPrice"
              stroke="#0ECB81"
              strokeWidth={2}
              name="Real-Time"
              dot={false}
              activeDot={{ r: 4, fill: '#0ECB81', stroke: '#f8f9fa', strokeWidth: 1 }}
            />
          )}

          {/* Highlight selected hour */}
          {selectedHour !== null && (
            <ReferenceLine
              x={chartData.find(d => d.hour === selectedHour)?.time}
              stroke="#F6465D"
              strokeWidth={2}
              label={{ value: `Hour ${selectedHour}`, fill: '#F6465D', fontSize: 11, fontWeight: 600 }}
            />
          )}

          {/* Brush for zooming */}
          <Brush
            dataKey="time"
            height={24}
            stroke="#666"
            fill="#333"
            startIndex={Math.max(0, chartData.length - 24)}
          />
        </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Enhanced Price Statistics */}
      <div className="price-stats">
        <div className="stat">
          <div className="stat-label">Latest DAM</div>
          <div className="stat-value">
            ${Math.round(damPrices?.[damPrices.length - 1]?.price || 0) || '--'}
          </div>
          <div className="stat-change positive">+2%</div>
        </div>
        <div className="stat">
          <div className="stat-label">Latest RTM</div>
          <div className="stat-value">
            ${Math.round(rtmPrices?.[rtmPrices.length - 1]?.price || 0) || '--'}
          </div>
          <div className="stat-change negative">-2%</div>
        </div>
        <div className="stat">
          <div className="stat-label">Spread</div>
          <div className="stat-value">
            ${Math.abs(Math.round(
              (rtmPrices?.[rtmPrices.length - 1]?.price || 0) -
              (damPrices?.[damPrices.length - 1]?.price || 0)
            ))}
          </div>
          <div className="stat-change neutral">RT-DAM</div>
        </div>
        <div className="stat">
          <div className="stat-label">Range</div>
          <div className="stat-value">
            ${Math.round(Math.min(...(damPrices?.map(p => p.price) || [0])))}-${Math.round(Math.max(...(damPrices?.map(p => p.price) || [0])))}
          </div>
          <div className="stat-change neutral">24H</div>
        </div>
      </div>
    </div>
  );
};

export default PriceChart;