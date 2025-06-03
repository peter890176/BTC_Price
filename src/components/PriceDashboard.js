import React, { useState, useEffect } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';

function PriceDashboard() {
  const [prices, setPrices] = useState({ btcusdt: {} });

  useEffect(() => {
    const ws = new ReconnectingWebSocket('wss://stream.binance.com:9443/stream?streams=btcusdt@ticker');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.stream && data.data) {
        setPrices((prev) => ({
          ...prev,
          [data.stream.split('@')[0]]: {
            price: data.data.c, // Latest price
            change: data.data.P, // 24h price change percentage
          },
        }));
      }
    };

    ws.onclose = () => console.log('WebSocket disconnected');
    ws.onerror = (error) => console.error('WebSocket error:', error);

    return () => ws.close(); // Close connection when component unmounts
  }, []);

  return (
    <div>
      {/* Price display content removed */}
    </div>
  );
}

export default PriceDashboard; 