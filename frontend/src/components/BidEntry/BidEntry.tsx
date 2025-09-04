import React, { useState, useEffect } from 'react';
import {
  Form,
  InputNumber,
  Input,
  Button,
  Select,
  DatePicker,
  Space,
  Table,
  Popconfirm,
  Tag,
} from '@arco-design/web-react';
import { IconPlus, IconDelete } from '@arco-design/web-react/icon';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAfter, isBefore, isSameDay, setHours, setMinutes, setSeconds } from 'date-fns';
import { tradingAPI } from '../../services/api';
import { Bid, BidSubmission } from '../../types/trading';
import { formatHourSlot } from '../../utils/formatters';
import './BidEntry.css';

const FormItem = Form.Item;

interface BidEntryProps {
  selectedHour?: number | null;
}

const BidEntry: React.FC<BidEntryProps> = ({ selectedHour }) => {
  const [form] = Form.useForm();
  const [bids, setBids] = useState<Bid[]>([]);
  const [tradingDay, setTradingDay] = useState<Date | null>(null);
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);
  const queryClient = useQueryClient();

  const isPastCutoff = () => {
    if (!tradingDay || !isSameDay(tradingDay, new Date())) return false;
    const cutoff = setSeconds(setMinutes(setHours(new Date(), 11), 0), 0);
    return isAfter(new Date(), cutoff);
  };

  useEffect(() => {
    if (selectedHour !== null && selectedHour !== undefined) {
      form.setFieldValue('hour_slot', selectedHour);
      setSelectedHours([selectedHour]);
    }
  }, [selectedHour, form]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (type: 'success' | 'error' | 'warning', message: string) => {
    // Ensure message is always a string
    const safeMessage = typeof message === 'string' ? message : 'Unknown error';
    setNotification({ type, message: safeMessage });
  };

  const submitMutation = useMutation({
    mutationFn: (submission: BidSubmission) => tradingAPI.submitBids(submission),
    onSuccess: (data) => {
      showNotification('success', `Successfully submitted ${data.accepted_bids?.length || 0} bids`);
      setBids([]);
      form.resetFields();
      // Refresh positions table after successful submission
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
    onError: (error: any) => {
      // Log error only in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Bid submission error:', error);
      }
      
      let errorMessage = 'Failed to submit bids';
      
      if (error.response?.data?.detail) {
        // Handle Pydantic validation errors (arrays of error objects)
        if (Array.isArray(error.response.data.detail)) {
          const errors = error.response.data.detail.map((err: any) => err.msg).join(', ');
          errorMessage = `Validation errors: ${errors}`;
        } else if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      showNotification('error', errorMessage);
    },
  });

  const handleAddBid = () => {
    // Manual validation with friendly messages
    const price = form.getFieldValue('price');
    const quantity = form.getFieldValue('quantity');
    const hourSlot = form.getFieldValue('hour_slot');
    
    const missingFields = [];
    if (!tradingDay) missingFields.push('trading day');
    if (!price || Number(price) <= 0) missingFields.push('price');
    if (quantity === null || quantity === undefined || Number(quantity) === 0) missingFields.push('quantity');
    if (selectedHours.length === 0 && (hourSlot === null || hourSlot === undefined)) missingFields.push('hour slot');
    
    if (missingFields.length > 0) {
      const fieldsList = missingFields.join(', ').replace(/,([^,]*)$/, ' and$1');
      showNotification('warning', `Please select ${fieldsList} to add a bid`);
      return;
    }
    
    // Create bids - simple positive/negative quantities
    const hours = selectedHours.length > 0 ? selectedHours : [hourSlot];
    
    const newBids = hours.map(hour => {
      const hourNumber = Number(hour);
      const priceNumber = Number(price);
      const quantityNumber = Number(quantity);
      
      // Validate the numbers before creating bid
      if (isNaN(hourNumber) || hourNumber < 0 || hourNumber > 23) {
        throw new Error(`Invalid hour slot: ${hour}`);
      }
      if (isNaN(priceNumber) || priceNumber <= 0) {
        throw new Error(`Invalid price: ${price}`);
      }
      if (isNaN(quantityNumber) || quantityNumber === 0) {
        throw new Error(`Invalid quantity: ${quantity}`);
      }
      
      const bid = {
        hour_slot: hourNumber,
        price: priceNumber,
        quantity: quantityNumber,
      };
      return bid;
    });

    // Check bid limits
    const hourCounts: Record<number, number> = {};
    [...bids, ...newBids].forEach(bid => {
      hourCounts[bid.hour_slot] = (hourCounts[bid.hour_slot] || 0) + 1;
    });

    for (const [hour, count] of Object.entries(hourCounts)) {
      if (count >= 10) {
        showNotification('warning', `Maximum 10 bids allowed for hour ${hour}`);
        return;
      }
    }

    
    // Add bids successfully
    setBids([...bids, ...newBids]);
    form.resetFields(['price', 'quantity', 'hour_slot']);
    setSelectedHours([]);
    
    const bidCount = newBids.length;
    showNotification('success', `Added ${bidCount} bid${bidCount > 1 ? 's' : ''} successfully`);
  };

  const handleRemoveBid = (index: number) => {
    setBids(bids.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (bids.length === 0) {
      showNotification('warning', 'Please add at least one bid');
      return;
    }

    if (isPastCutoff()) {
      showNotification('error', 'Cannot submit bids after 11:00 AM for same-day trading');
      return;
    }

    if (!tradingDay) {
      showNotification('error', 'Please select a trading day before submitting bids');
      return;
    }

    try {
      const submission: BidSubmission = {
        bids: bids.map(bid => ({
          ...bid,
          quantity: bid.quantity, // Preserve sign for buy/sell indication
        })),
        trading_day: tradingDay.toISOString(), // Full datetime format
      };

      submitMutation.mutate(submission);
    } catch (error: any) {
      // Log error only in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Submit error:', error);
      }
      showNotification('error', 'Failed to submit bids');
    }
  };

  const handleClearAll = () => {
    setBids([]);
    form.resetFields();
    setSelectedHours([]);
    showNotification('success', 'All bids cleared');
  };


  const columns = [
    {
      title: 'Hour',
      dataIndex: 'hour_slot',
      key: 'hour_slot',
      render: (hour: number) => (
        <Tag color="blue">{formatHourSlot(hour)}</Tag>
      ),
    },
    {
      title: 'Price ($/MWh)',
      dataIndex: 'price',
      key: 'price',
      render: (price: number) => `$${price.toFixed(2)}`,
    },
    {
      title: 'Quantity (MWh)',
      dataIndex: 'quantity',
      key: 'quantity',
      render: (qty: number) => (
        <span style={{ color: qty < 0 ? '#ef4444' : '#22c55e' }}>
          {qty > 0 ? '+' : ''}{qty.toFixed(2)} MWh ({qty > 0 ? 'Buy' : 'Sell'})
        </span>
      ),
    },
    {
      title: 'Total ($)',
      key: 'total',
      render: (_: any, record: Bid) => 
        `$${(record.price * record.quantity).toFixed(2)}`,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, __: Bid, index: number) => (
        <Popconfirm
          title="Remove this bid?"
          onOk={() => handleRemoveBid(index)}
        >
          <Button 
            type="text" 
            size="small" 
            icon={<IconDelete />} 
            status="danger"
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="bid-entry-container">
      {/* Notification */}
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {typeof notification.message === 'string' ? notification.message : 'Error occurred'}
        </div>
      )}
      
      <Form
        form={form}
        layout="vertical"
        className="bid-form"
      >
        {/* Trading Day Selection */}
        <FormItem
          label="Trading Day"
          field="trading_day"
        >
          <DatePicker
            style={{ width: '100%' }}
            value={tradingDay || undefined}
            onChange={(dateString, date) => setTradingDay(date ? date.toDate() : null)}
            disabledDate={(date) => date && isBefore(date.toDate(), new Date())}
            placeholder="Select trading day"
          />
        </FormItem>

        {isPastCutoff() && (
          <div className="cutoff-warning">
            Past 11:00 AM cutoff for same-day trading. Select a future date.
          </div>
        )}


        {/* Hour Selection */}
        <FormItem
          label="Hour Slot(s)"
          field="hour_slot"
        >
          <Select
            placeholder="Select hour(s)"
            mode="multiple"
            value={selectedHours}
            onChange={setSelectedHours}
            style={{ width: '100%' }}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <Select.Option key={i} value={i}>
                {formatHourSlot(i)}
              </Select.Option>
            ))}
          </Select>
        </FormItem>

        {/* Price Input */}
        <FormItem
          label="Bid Price ($/MWh)"
          field="price"
        >
          <InputNumber
            placeholder="Enter price"
            prefix="$"
            suffix="/MWh"
            precision={2}
            min={0.01}
            style={{ width: '100%' }}
          />
        </FormItem>

        {/* Quantity Input */}
        <FormItem
          label="Quantity (MWh)"
          field="quantity"
        >
          <InputNumber
            placeholder="Enter quantity (+ for buy, - for sell)"
            suffix="MWh"
            precision={2}
            min={-999999}
            max={999999}
            step={0.1}
            style={{ width: '100%' }}
          />
        </FormItem>
        
        {/* Trading Instructions */}
        <div style={{ 
          background: '#0f1014', 
          padding: '10px 12px', 
          borderRadius: '4px', 
          marginBottom: '16px',
          border: '1px solid #2a2f3a'
        }}>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', fontWeight: 500 }}>
            Trading Convention:
          </div>
          <div style={{ fontSize: '10px', color: '#9ca3af', lineHeight: '1.4' }}>
            Positive quantities = Buy orders • Negative quantities = Sell orders
          </div>
        </div>

        {/* Action Buttons */}
        <Space>
          <Button
            type="primary"
            icon={<IconPlus />}
            onClick={handleAddBid}
          >
            Add Bid
          </Button>
          <Button
            onClick={handleClearAll}
            disabled={bids.length === 0}
            style={{ color: '#f44336' }}
          >
            Clear All
          </Button>
        </Space>
      </Form>

      {/* Bid List */}
      {bids.length > 0 && (
        <div className="bid-list">
          <h3>Pending Bids ({bids.length})</h3>
          <Table
            columns={columns}
            data={bids}
            rowKey={(record: Bid, index?: number) => `bid-${index}-${record.hour_slot}-${record.price}-${Math.abs(record.quantity)}`}
            pagination={false}
            size="small"
          />

          <div className="bid-summary">
            <div>
              Total Value: $
              {bids.reduce((sum, bid) => sum + bid.price * bid.quantity, 0).toFixed(2)}
            </div>
            <div>
              Total Quantity: {' '}
              {bids.reduce((sum, bid) => sum + bid.quantity, 0).toFixed(2)} MWh
            </div>
          </div>

          <Button
            type="primary"
            size="large"
            onClick={handleSubmit}
            loading={submitMutation.isPending}
            disabled={submitMutation.isPending || bids.length === 0}
            style={{ width: '100%', marginTop: 16 }}
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit All Bids'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default BidEntry;