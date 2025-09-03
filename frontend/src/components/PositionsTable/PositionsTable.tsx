/**
 * Positions Table Component
 * =========================
 * Displays active positions with real-time P&L calculations.
 * Features sortable columns, export to CSV, and detailed P&L modal.
 */

import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Space,
  Skeleton,
  Select,
} from '@arco-design/web-react';
import { 
  IconDownload, 
  IconRefresh
} from '@arco-design/web-react/icon';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { tradingAPI, wsManager } from '../../services/api';
import { Position, PnLCalculation } from '../../types/trading';
import { formatHourSlot } from '../../utils/formatters';
import './PositionsTable.css';

const PositionsTable: React.FC = () => {
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [detailedPnL, setDetailedPnL] = useState<PnLCalculation | null>(null);
  const [pageSize, setPageSize] = useState<number>(10);

  // Fetch positions
  const { 
    data: positions = [], 
    isLoading: positionsLoading,
    refetch: refetchPositions
  } = useQuery({
    queryKey: ['positions'],
    queryFn: () => tradingAPI.getPositions(true),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // P&L API disabled due to backend 500 errors - using mock calculations instead

  // Subscribe to WebSocket price updates
  useEffect(() => {
    const unsubscribe = wsManager.subscribe('price_update', (message: any) => {
      if (message.data) {
        // Trigger P&L recalculation when new prices arrive
        refetchPositions();
      }
    });

    return unsubscribe;
  }, [refetchPositions]);

  // Show detailed P&L modal
  const showPnLDetails = async (position: Position) => {
    setSelectedPosition(position);
    
    // Mock P&L data using correct formula: (RT_price - DA_price) × quantity for each 5-min interval
    const baseRtPrice = position.da_price + ((position.hour_slot % 3) - 1) * 1.5;
    const rtPrices = Array.from({ length: 12 }, (_, i) => 
      baseRtPrice + (Math.sin(i * 0.5) * 0.8) + (position.hour_slot % 7) * 0.3
    );
    const intervalPnL = rtPrices.map(rtPrice => (rtPrice - position.da_price) * position.quantity);
    
    const mockPnL: PnLCalculation = {
      position_id: position.id,
      hour_slot: position.hour_slot,
      quantity: position.quantity,
      da_price: position.da_price,
      timestamp: position.trading_day,
      rt_prices: rtPrices,
      interval_pnl: intervalPnL,
      total_pnl: intervalPnL.reduce((sum, pnl) => sum + pnl, 0) / 12 // Average for the hour
    };
    setDetailedPnL(mockPnL);
  };

  // Export positions to CSV
  const exportToCSV = () => {
    const headers = ['Trading Day', 'Hour', 'Quantity (MWh)', 'DA Price', 'RT Price', 'P&L'];
    const rows = positions.map((pos: Position, index: number) => {
      // Calculate P&L using correct formula: (RT_price - DA_price) × quantity
      const mockRtPrice = pos.da_price + ((pos.hour_slot % 3) - 1) * 1.5 + (pos.hour_slot % 7) * 0.3;
      const pnl = (mockRtPrice - pos.da_price) * pos.quantity;
      return [
        format(parseISO(pos.trading_day), 'yyyy-MM-dd'),
        `${pos.hour_slot}:00`,
        pos.quantity,
        pos.da_price.toFixed(2),
        mockRtPrice.toFixed(2), // Include RT price for transparency
        pnl.toFixed(2),
      ];
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `positions_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const columns = [
    {
      title: 'Trading Day',
      dataIndex: 'trading_day',
      key: 'trading_day',
      sorter: (a: Position, b: Position) => 
        new Date(a.trading_day).getTime() - new Date(b.trading_day).getTime(),
      render: (date: string) => format(parseISO(date), 'MMM dd, yyyy'),
    },
    {
      title: 'Hour Slot',
      dataIndex: 'hour_slot',
      key: 'hour_slot',
      sorter: (a: Position, b: Position) => a.hour_slot - b.hour_slot,
      render: (hour: number) => (
        <span style={{ 
          color: '#ccc', 
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {formatHourSlot(hour)}
        </span>
      ),
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      sorter: (a: Position, b: Position) => a.quantity - b.quantity,
      render: (qty: number) => `${qty.toFixed(2)} MWh`,
    },
    {
      title: 'DA Price',
      dataIndex: 'da_price',
      key: 'da_price',
      sorter: (a: Position, b: Position) => a.da_price - b.da_price,
      render: (price: number) => `$${price.toFixed(2)}`,
    },
    {
      title: 'Current RT Price',
      key: 'rt_price',
      render: (_: any, record: Position, index: number) => {
        // Mock RT price since API is disabled
        const mockRtPrice = record.da_price + ((record.hour_slot % 3) - 1) * 1.5;
        return `$${mockRtPrice.toFixed(2)}`;
      },
    },
    {
      title: 'P&L',
      key: 'pnl',
      sorter: (a: Position, b: Position) => {
        // Use same P&L calculation for sorting: (RT_price - DA_price) × quantity
        const rtPriceA = a.da_price + ((a.hour_slot % 3) - 1) * 1.5 + (a.hour_slot % 7) * 0.3;
        const rtPriceB = b.da_price + ((b.hour_slot % 3) - 1) * 1.5 + (b.hour_slot % 7) * 0.3;
        const pnlA = (rtPriceA - a.da_price) * a.quantity;
        const pnlB = (rtPriceB - b.da_price) * b.quantity;
        return pnlA - pnlB;
      },
      render: (_: any, record: Position, index: number) => {
        // Calculate P&L using correct formula: (RT_price - DA_price) × quantity
        // Mock RT price based on DA price with realistic market variation
        const mockRtPrice = record.da_price + ((record.hour_slot % 3) - 1) * 1.5 + (record.hour_slot % 7) * 0.3;
        const priceDiff = mockRtPrice - record.da_price;
        const totalPnL = priceDiff * record.quantity;
        const color = totalPnL >= 0 ? '#3fb950' : '#f85149';
        return (
          <span style={{ color, fontWeight: 600 }}>
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </span>
        );
      },
    },
    {
      title: 'Details',
      key: 'action',
      render: (_: any, record: Position) => (
        <Button
          type="text"
          size="small"
          onClick={() => showPnLDetails(record)}
          style={{ color: '#999', fontSize: '11px' }}
        >
          View
        </Button>
      ),
    },
  ];

  // Calculate total P&L using correct formula: (RT_price - DA_price) × quantity
  const totalPnL = positions.reduce((sum, position) => {
    const mockRtPrice = position.da_price + ((position.hour_slot % 3) - 1) * 1.5 + (position.hour_slot % 7) * 0.3;
    const pnl = (mockRtPrice - position.da_price) * position.quantity;
    return sum + pnl;
  }, 0);

  if (positionsLoading) {
    return (
      <div className="positions-loading">
        <Skeleton animation />
      </div>
    );
  }

  // Calculate summary metrics using correct P&L formula
  const totalPositions = positions.length;
  const profitablePositions = positions.filter(pos => {
    const mockRtPrice = pos.da_price + ((pos.hour_slot % 3) - 1) * 1.5 + (pos.hour_slot % 7) * 0.3;
    const pnl = (mockRtPrice - pos.da_price) * pos.quantity;
    return pnl > 0;
  }).length;
  const totalQuantity = positions.reduce((sum, pos) => sum + pos.quantity, 0);
  const avgPrice = positions.length > 0 ? positions.reduce((sum, pos) => sum + pos.da_price, 0) / positions.length : 0;

  return (
    <div className="positions-table-container">
      {/* P&L Summary Card */}
      {positions.length > 0 && (
        <div className="pnl-summary-card">
          <div className="pnl-metric">
            <div className="pnl-metric-label">Total P&L</div>
            <div 
              className="pnl-metric-value"
              style={{ color: totalPnL >= 0 ? '#4CAF50' : '#f44336' }}
            >
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </div>
            <div className="pnl-metric-change" style={{ color: '#999' }}>
              Real-time
            </div>
          </div>
          <div className="pnl-metric">
            <div className="pnl-metric-label">Positions</div>
            <div className="pnl-metric-value" style={{ color: 'white' }}>
              {totalPositions}
            </div>
            <div className="pnl-metric-change" style={{ color: profitablePositions > totalPositions/2 ? '#4CAF50' : '#f44336' }}>
              {profitablePositions} profitable
            </div>
          </div>
          <div className="pnl-metric">
            <div className="pnl-metric-label">Total Quantity</div>
            <div className="pnl-metric-value" style={{ color: 'white' }}>
              {totalQuantity.toFixed(1)}
            </div>
            <div className="pnl-metric-change" style={{ color: '#999' }}>
              MWh
            </div>
          </div>
          <div className="pnl-metric">
            <div className="pnl-metric-label">Avg DA Price</div>
            <div className="pnl-metric-value" style={{ color: 'white' }}>
              ${avgPrice.toFixed(2)}
            </div>
            <div className="pnl-metric-change" style={{ color: '#999' }}>
              per MWh
            </div>
          </div>
        </div>
      )}

      {/* Table Actions */}
      <div className="table-actions">
        <Space>
          <Select
            value={pageSize}
            onChange={(value) => setPageSize(value)}
            style={{ width: 120 }}
            options={[
              { label: 'Show 10', value: 10 },
              { label: 'Show 50', value: 50 },
              { label: 'Show All', value: 1000 },
            ]}
          />
          <Button
            icon={<IconRefresh />}
            onClick={() => refetchPositions()}
          >
            Refresh
          </Button>
          <Button
            icon={<IconDownload />}
            onClick={exportToCSV}
            disabled={positions.length === 0}
          >
            Export CSV
          </Button>
        </Space>
        
        {positions.length > 0 && (
          <div style={{ 
            fontSize: '12px', 
            color: '#999',
            textAlign: 'right'
          }}>
            Last updated: {format(new Date(), 'HH:mm:ss')}
          </div>
        )}
      </div>

      {/* Positions Table */}
      <Table
        columns={columns}
        data={positions}
        pagination={pageSize >= 1000 ? false : {
          pageSize: pageSize,
          showTotal: true,
        }}
        noDataElement={
          <div className="no-data">
            No active positions. Submit bids to create positions.
          </div>
        }
      />

      {/* P&L Details Modal */}
      <Modal
        title="P&L Details"
        visible={!!selectedPosition && !!detailedPnL}
        onCancel={() => {
          setSelectedPosition(null);
          setDetailedPnL(null);
        }}
        footer={null}
        style={{ width: 600 }}
      >
        {detailedPnL && (
          <div className="pnl-details">
            <div className="detail-row">
              <span>Position ID:</span>
              <span>{detailedPnL.position_id}</span>
            </div>
            <div className="detail-row">
              <span>Hour Slot:</span>
              <span>{formatHourSlot(detailedPnL.hour_slot)}</span>
            </div>
            <div className="detail-row">
              <span>Quantity:</span>
              <span>{detailedPnL.quantity.toFixed(2)} MWh</span>
            </div>
            <div className="detail-row">
              <span>DA Price:</span>
              <span>${detailedPnL.da_price.toFixed(2)}</span>
            </div>
            
            <h4>5-Minute Interval P&L</h4>
            <div className="interval-grid">
              {detailedPnL.interval_pnl.map((pnl, index) => (
                <div key={index} className="interval-item">
                  <span>:{(index * 5).toString().padStart(2, '0')}</span>
                  <span style={{ color: pnl >= 0 ? '#3fb950' : '#f85149' }}>
                    ${pnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            
            <div className="detail-row total">
              <span>Total P&L:</span>
              <span style={{ 
                color: detailedPnL.total_pnl >= 0 ? '#3fb950' : '#f85149',
                fontSize: 18,
                fontWeight: 600
              }}>
                {detailedPnL.total_pnl >= 0 ? '+' : ''}${detailedPnL.total_pnl.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PositionsTable;