import React from 'react';
import TradingDashboard from './components/TradingDashboard/TradingDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <TradingDashboard />
    </ErrorBoundary>
  );
}

export default App;
