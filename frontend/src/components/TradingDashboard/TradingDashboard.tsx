/**
 * Trading Dashboard Component
 * ===========================
 * Main container component for the trading platform.
 * Manages layout, state, and component orchestration.
 */

import React, { useState, useEffect } from 'react';
import { Layout, ConfigProvider } from '@arco-design/web-react';
import enUS from '@arco-design/web-react/es/locale/en-US';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@arco-design/web-react/dist/css/arco.css';

import PriceChart from '../PriceChart/PriceChart';
import MarketStats from '../MarketStats/MarketStats';
import BidEntry from '../BidEntry/BidEntry';
import PositionsTable from '../PositionsTable/PositionsTable';
import { wsManager } from '../../services/api';
import './TradingDashboard.css';

const { Header, Content } = Layout;

// Create Query Client for data fetching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
    },
  },
});

const TradingDashboard: React.FC = () => {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  useEffect(() => {
    // Connect to WebSocket on mount
    wsManager.connect();
    
    // Set professional Bloomberg-style theme
    document.body.style.backgroundColor = '#0a0b0d';
    document.body.style.color = '#f8f9fa';
    document.body.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    
    return () => {
      // Cleanup on unmount
      wsManager.disconnect();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={enUS}
        componentConfig={{
          Table: {
            border: true,
          },
          Card: {
            bordered: true,
          },
        }}
      >
        <Layout className="trading-dashboard">
          <Header className="dashboard-header">
            <div className="header-content">
              <div className="logo">
                <h1>Energy Trading Platform</h1>
                <span className="subtitle">Day-Ahead Market</span>
              </div>
              <div className="market-status">
                <div className="market-indicator">
                  <div className="status-dot"></div>
                  <span style={{ color: '#0ECB81' }}>Market Open</span>
                </div>
                <div className="market-indicator" style={{ color: '#b2b5be' }}>
                  CAISO RTM: Live
                </div>
              </div>
            </div>
          </Header>

          <Content className="dashboard-content">
            {/* Market Statistics Strip */}
            <MarketStats />

            {/* Main Trading Grid */}
            <div className="main-trading-grid">
              {/* Price Chart Panel */}
              <div className="trading-card">
                <div className="card-header">
                  <h3 className="card-title">Market Prices & Analysis</h3>
                </div>
                <div className="card-content">
                  <PriceChart 
                    onHourSelect={setSelectedHour}
                    selectedHour={selectedHour}
                  />
                </div>
              </div>

              {/* Bid Entry Panel */}
              <div className="trading-card">
                <div className="card-header">
                  <h3 className="card-title">Submit Orders</h3>
                </div>
                <div className="card-content">
                  <BidEntry 
                    selectedHour={selectedHour}
                    onSubmitSuccess={() => {
                      // Refresh positions after successful submission
                      queryClient.invalidateQueries({ queryKey: ['positions'] });
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Positions & P&L Table */}
            <div className="trading-card">
              <div className="card-header">
                <h3 className="card-title">Active Positions & Real-Time P&L</h3>
              </div>
              <div className="card-content">
                <PositionsTable />
              </div>
            </div>
          </Content>
        </Layout>
      </ConfigProvider>
    </QueryClientProvider>
  );
};

export default TradingDashboard;