import React, { useState, useEffect } from 'react';
import {
  Form,
  InputNumber,
  Button,
  Select,
  DatePicker,
  Space,
  Table,
  Popconfirm,
  Tag,
} from '@arco-design/web-react';
import { IconPlus, IconDelete, IconCopy } from '@arco-design/web-react/icon';
import { useMutation } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { tradingAPI } from '../../services/api';
import { Bid, BidSubmission } from '../../types/trading';
import { formatHourSlot } from '../../utils/formatters';
import './BidEntry.css';

const FormItem = Form.Item;

interface BidEntryProps {
  selectedHour?: number | null;
  onSubmitSuccess?: () => void;
}

const BidEntry: React.FC<BidEntryProps> = ({ selectedHour, onSubmitSuccess }) => {
  const [form] = Form.useForm();
  const [bids, setBids] = useState<Bid[]>([]);
  const [tradingDay, setTradingDay] = useState<Dayjs>(dayjs());
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);

  const isPastCutoff = () => {
    if (!tradingDay.isSame(dayjs(), 'day')) return false;
    const cutoff = dayjs().hour(11).minute(0).second(0);
    return dayjs().isAfter(cutoff);
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
    setNotification({ type, message });
  };

  const submitMutation = useMutation({
    mutationFn: (submission: BidSubmission) => tradingAPI.submitBids(submission),
    onSuccess: (data) => {
      showNotification('success', `Successfully submitted ${data.accepted_bids?.length || 0} bids`);
      setBids([]);
      form.resetFields();
      onSubmitSuccess?.();
    },
    onError: (error: any) => {
      showNotification('error', error.response?.data?.detail || 'Failed to submit bids');
    },
  });

  const handleAddBid = () => {
    form.validate().then((values) => {
      const hours = selectedHours.length > 0 ? selectedHours : [values.hour_slot];
      const newBids = hours.map(hour => ({
        hour_slot: hour,
        price: values.price,
        quantity: values.quantity,
      }));

      const hourCounts: Record<number, number> = {};
      [...bids, ...newBids].forEach(bid => {
        hourCounts[bid.hour_slot] = (hourCounts[bid.hour_slot] || 0) + 1;
      });

      for (const [hour, count] of Object.entries(hourCounts)) {
        if (count > 10) {
          showNotification('warning', `Maximum 10 bids allowed for hour ${hour}`);
          return;
        }
      }

      setBids([...bids, ...newBids]);
      form.resetFields(['price', 'quantity']);
      setSelectedHours([]);
    });
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

    const submission: BidSubmission = {
      bids,
      trading_day: tradingDay.toDate().toISOString(),
    };

    submitMutation.mutate(submission);
  };

  const handleClearAll = () => {
    setBids([]);
    form.resetFields();
    setSelectedHours([]);
    showNotification('success', 'All bids cleared');
  };

  const handleBulkCopy = () => {
    if (bids.length === 0) {
      showNotification('warning', 'No bids to copy');
      return;
    }

    const lastBid = bids[bids.length - 1];
    const copiedBids: Bid[] = [];

    for (let hour = 0; hour < 24; hour++) {
      if (!bids.some(b => b.hour_slot === hour)) {
        copiedBids.push({
          ...lastBid,
          hour_slot: hour,
        });
      }
    }

    if (copiedBids.length > 0) {
      setBids([...bids, ...copiedBids]);
      showNotification('success', `Copied bid to ${copiedBids.length} hours`);
    }
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
      render: (qty: number) => qty.toFixed(2),
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
          {notification.message}
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
          rules={[{ required: true, message: 'Please select trading day' }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            value={tradingDay}
            onChange={(dateString, date) => date && setTradingDay(date)}
            disabledDate={(date) => date && date.isBefore(dayjs(), 'day')}
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
          rules={[{ required: true, message: 'Please select hour slot' }]}
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
          rules={[
            { required: true, message: 'Please enter price' },
            { type: 'number', min: 0.01, message: 'Price must be positive' },
          ]}
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
          rules={[
            { required: true, message: 'Please enter quantity' },
            { type: 'number', min: 0.1, message: 'Quantity must be at least 0.1' },
          ]}
        >
          <InputNumber
            placeholder="Enter quantity"
            suffix="MWh"
            precision={2}
            min={0.1}
            style={{ width: '100%' }}
          />
        </FormItem>

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
            icon={<IconCopy />}
            onClick={handleBulkCopy}
            disabled={bids.length === 0}
          >
            Copy to All Hours
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
            style={{ width: '100%', marginTop: 16 }}
          >
            Submit All Bids
          </Button>
        </div>
      )}
    </div>
  );
};

export default BidEntry;