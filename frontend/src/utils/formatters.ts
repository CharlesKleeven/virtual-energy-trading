/**
 * Utility functions for formatting data
 */

/**
 * Format hour slot for display (e.g., "14:00 - 15:00")
 */
export const formatHourSlot = (hour: number): string => {
  // Handle invalid hour values
  if (isNaN(hour) || hour < 0 || hour > 23) {
    console.error('Invalid hour slot:', hour);
    return 'Invalid Hour';
  }
  return `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
};

/**
 * Format price with currency symbol
 */
export const formatPrice = (price: number): string => {
  return `$${price.toFixed(2)}`;
};

/**
 * Format quantity with unit
 */
export const formatQuantity = (quantity: number): string => {
  return `${quantity.toFixed(2)} MWh`;
};

/**
 * Format percentage change
 */
export const formatPercentage = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};