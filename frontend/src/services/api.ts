/**
 * API Service Layer
 * =================
 * Centralized API client for backend communication.
 * Handles all HTTP requests and WebSocket connections.
 */

import axios from 'axios';
import { 
  BidSubmission, 
  Position, 
  PriceData, 
  PnLCalculation, 
  MarketStats 
} from '../types/trading';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const isDevelopment = process.env.NODE_ENV === 'development';

// Configure axios defaults
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request/response interceptors for error handling
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (isDevelopment) console.error('API Error:', error);
    // Could add toast notification here
    return Promise.reject(error);
  }
);

/**
 * Market Data API
 */
export const marketAPI = {
  /**
   * Fetch day-ahead market prices
   * @param days Number of days of historical data (1-30)
   */
  async getDayAheadPrices(days: number = 7): Promise<PriceData[]> {
    const response = await apiClient.get('/api/market/day-ahead', {
      params: { days }
    });
    return response.data.data;
  },

  /**
   * Fetch real-time market prices
   * @param hours Number of hours of data (1-168)
   */
  async getRealtimePrices(hours: number = 24): Promise<PriceData[]> {
    const response = await apiClient.get('/api/market/realtime', {
      params: { hours }
    });
    return response.data.data;
  },

  /**
   * Get market statistics
   */
  async getMarketStats(): Promise<MarketStats> {
    const response = await apiClient.get('/api/market/stats');
    return response.data.data;
  }
};

/**
 * Trading API
 */
export const tradingAPI = {
  /**
   * Submit day-ahead bids
   */
  async submitBids(submission: BidSubmission): Promise<any> {
    const response = await apiClient.post('/api/bids/submit', submission);
    return response.data;
  },

  /**
   * Get user positions
   */
  async getPositions(activeOnly: boolean = true): Promise<Position[]> {
    const response = await apiClient.get('/api/positions', {
      params: { active_only: activeOnly }
    });
    return response.data.data;
  },

  /**
   * Calculate P&L for a position
   */
  async calculatePositionPnL(positionId: string): Promise<PnLCalculation> {
    const response = await apiClient.get(`/api/pnl/calculate/${positionId}`);
    return response.data.data;
  },

  /**
   * Calculate portfolio P&L
   */
  async calculatePortfolioPnL(): Promise<any> {
    const response = await apiClient.get('/api/pnl/portfolio');
    return response.data.data;
  }
};

/**
 * WebSocket Manager
 */
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  /**
   * Connect to WebSocket server
   */
  connect() {
    const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/ws/prices`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        if (isDevelopment) console.log('WebSocket connected');
        // Send ping every 30 seconds to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send('ping');
          }
        }, 30000);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.notifyListeners('price_update', message);
        } catch (e) {
          if (isDevelopment) console.error('Error parsing WebSocket message:', e);
        }
      };

      this.ws.onerror = (error) => {
        if (isDevelopment) console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        if (isDevelopment) console.log('WebSocket disconnected');
        this.reconnect();
      };
    } catch (error) {
      if (isDevelopment) console.error('Failed to connect WebSocket:', error);
      this.reconnect();
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  private reconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      if (isDevelopment) console.log('Attempting to reconnect WebSocket...');
      this.connect();
    }, 5000);
  }

  /**
   * Subscribe to WebSocket events
   */
  subscribe(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Notify all listeners for an event
   */
  private notifyListeners(event: string, data: any) {
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        if (isDevelopment) console.error('Error in WebSocket listener:', e);
      }
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsManager = new WebSocketManager();