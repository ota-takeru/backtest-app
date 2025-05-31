// Market data generator for testing
export function generateMarketData(symbol, startDate, endDate) {
  const data = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  let price = 1000; // Starting price

  while (current <= end) {
    // Skip weekends
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      // Generate realistic OHLC data with some volatility
      const volatility = 0.02;
      const change = (Math.random() - 0.5) * volatility;

      const open = price;
      const close = price * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = Math.floor(Math.random() * 1000000) + 100000;

      data.push({
        symbol,
        date: current.toISOString().split("T")[0],
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume,
      });

      price = close;
    }

    current.setDate(current.getDate() + 1);
  }

  return data;
}
