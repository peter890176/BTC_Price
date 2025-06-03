// Final implementation has been verified and refined by the developer.

import React, { useState, useEffect, useRef } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
// import AnnotationPlugin from 'chartjs-plugin-annotation'; // Temporarily remove annotation plugin
import { Container, Typography, Box, Button } from '@mui/material';

// Register Chart.js components and plugins
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend); // Temporarily remove annotation plugin

// Custom vertical line plugin
const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw: (chart) => {
    if (chart.tooltip?._active?.length) {
      const ctx = chart.ctx;
      const activeElement = chart.tooltip._active[0];
      const x = activeElement.element.x;
      const topY = chart.scales.y.top;
      const bottomY = chart.scales.y.bottom;

      // Draw vertical line
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.setLineDash([5, 5]); // Dashed line
      ctx.stroke();
      ctx.restore();
    }
  }
};

// Custom plugin to draw "Previous close" label
const previousCloseLabelPlugin = {
  id: 'previousCloseLabel',
  afterDraw: (chart) => {
    const datasets = chart.data.datasets;
    const previousCloseDataset = datasets.find(dataset => dataset.label && dataset.label.includes('Close'));
    
    if (previousCloseDataset && previousCloseDataset.data.length > 0) {
      const ctx = chart.ctx;
      const yScale = chart.scales.y;
      const chartArea = chart.chartArea;
      
      const previousClosePrice = previousCloseDataset.data[0];
      const yPosition = yScale.getPixelForValue(previousClosePrice);
      const xPosition = chartArea.right + 10; // Position just outside the right edge of chart area
      
      // Get current interval from chart options to determine label text
      const interval = chart.options.plugins.title.interval || '1m';
      let labelText;
      
      switch (interval) {
        case '1m':
          labelText = `Previous close: $${previousClosePrice.toLocaleString()}`;
          break;
        case '1w':
          labelText = `Last week close: $${previousClosePrice.toLocaleString()}`;
          break;
        case '1M':
          labelText = `Last month close: $${previousClosePrice.toLocaleString()}`;
          break;
        case '3M':
          labelText = `3M ago close: $${previousClosePrice.toLocaleString()}`;
          break;
        case 'YTD':
          labelText = `Last year close: $${previousClosePrice.toLocaleString()}`;
          break;
        case '1Y':
          labelText = `1Y ago close: $${previousClosePrice.toLocaleString()}`;
          break;
        default:
          labelText = `Previous close: $${previousClosePrice.toLocaleString()}`;
      }
      
      ctx.save();
      
      // Draw background box first
      ctx.font = '11px Arial';
      const textMetrics = ctx.measureText(labelText);
      const padding = 4;
      const boxWidth = textMetrics.width + padding * 2;
      const boxHeight = 16;
      
      // White background with slight transparency
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(
        xPosition,
        yPosition - boxHeight / 2,
        boxWidth,
        boxHeight
      );
      
      // Light gray border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(
        xPosition,
        yPosition - boxHeight / 2,
        boxWidth,
        boxHeight
      );
      
      // Draw text
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; // Dark gray text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, xPosition + padding, yPosition);
      
      ctx.restore();
    }
  }
};

// Register custom plugins
ChartJS.register(verticalLinePlugin, previousCloseLabelPlugin);

function PriceChart() {
  const [interval, setInterval] = useState('1m'); // Time interval state
  const [isComponentReady, setIsComponentReady] = useState(false); // Component ready state
  const [currentPrice, setCurrentPrice] = useState(null); // Current price
  const [priceChange24h, setPriceChange24h] = useState(null); // 24h price change
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        data: [],
        // borderColor is now handled by segment or default
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: false,
        tension: 0.1,
      },
    ],
  });
  const [yesterdayClose, setYesterdayClose] = useState(null);
  const [previousClose, setPreviousClose] = useState(null); // More generic previous period closing price
  const chartRef = useRef(null); // Ref for chart instance
  const wsRef = useRef(null); // WebSocket reference

  // Fetch previous period's closing price based on selected interval
  useEffect(() => {
    const fetchPreviousClose = async () => {
      try {
        let apiInterval, limit, description;
        
        switch (interval) {
          case '1m':
            // Today: Use yesterday's closing price (second last data point)
            apiInterval = '1d';
            limit = 2;
            description = "yesterday's close";
            break;
          case '1w':
            // Week: Use last week's last day closing price with 1h intervals (same as historical data)
            apiInterval = '1h';
            limit = 1000;
            description = "last week's close";
            break;
          case '1M':
            // Month: Use last month's last day closing price with 4h intervals (same as historical data)
            apiInterval = '4h';
            limit = 1000;
            description = "last month's close";
            break;
          case '3M':
            // 3 months: Use 3 months ago closing price with 1d intervals (same as historical data)
            apiInterval = '1d';
            limit = 1000;
            description = "3 months ago close";
            break;
          case 'YTD':
            // Year to date: Use last year's last day closing price with 1d intervals (same as historical data)
            apiInterval = '1d';
            limit = 1000;
            description = "last year-end close";
            break;
          case '1Y':
            // 1 year: Use 1 year ago closing price with exact same time range as historical data
            // Use same API call pattern as historical data fetch
            apiInterval = '1d';
            limit = 1000; // Use higher limit to ensure we get the data
            description = "1 year ago close";
            // We'll fetch with startTime parameter instead of just limit
            break;
          default:
            apiInterval = '1d';
            limit = 2;
            description = "yesterday's close";
        }

        // Build API URL with appropriate parameters
        let apiUrl;
        if (interval === '1w') {
          // For 1 week, use same time range as historical data (7 days back)
          const now = Date.now();
          const startTime = now - (7 * 24 * 60 * 60 * 1000);
          apiUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${apiInterval}&startTime=${startTime}&endTime=${now}&limit=${limit}`;
        } else if (interval === '1M') {
          // For 1 month, use same time range as historical data (30 days back)
          const now = Date.now();
          const startTime = now - (30 * 24 * 60 * 60 * 1000);
          apiUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${apiInterval}&startTime=${startTime}&endTime=${now}&limit=${limit}`;
        } else if (interval === '3M') {
          // For 3 months, use same time range as historical data (90 days back)
          const now = Date.now();
          const startTime = now - (90 * 24 * 60 * 60 * 1000);
          apiUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${apiInterval}&startTime=${startTime}&endTime=${now}&limit=${limit}`;
        } else if (interval === 'YTD') {
          // For YTD, use same time range as historical data (from Jan 1st to now)
          const now = Date.now();
          const today = new Date();
          const yearStart = new Date(today.getFullYear(), 0, 1);
          const startTime = yearStart.getTime();
          apiUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${apiInterval}&startTime=${startTime}&endTime=${now}&limit=${limit}`;
        } else if (interval === '1Y') {
          // For 1Y, use startTime and endTime to match historical data fetch
          const now = Date.now();
          const startTime = now - (365 * 24 * 60 * 60 * 1000);
          apiUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${apiInterval}&startTime=${startTime}&endTime=${now}&limit=${limit}`;
        } else {
          // For other intervals, use the original limit-based approach
          apiUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${apiInterval}&limit=${limit}`;
        }

        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`Error fetching previous close: ${response.statusText}`);
        }
        const data = await response.json();
        
        let previousClosePrice;
        if (interval === '1m') {
          // Today: Use yesterday's closing price (second last data point)
          previousClosePrice = data[data.length - 2] && data[data.length - 2][4] ? parseFloat(data[data.length - 2][4]) : null;
        } else if (['1w', '1M', '3M', 'YTD', '1Y'].includes(interval)) {
          // For all other intervals that use time ranges, use the first data point (oldest) as previous close
          previousClosePrice = data[0] && data[0][4] ? parseFloat(data[0][4]) : null;
          // Debug: log the date and price we're using
          if (data[0]) {
            const dateUsed = new Date(data[0][0]);
            console.log(`${interval} previous close: Using price from ${dateUsed.toDateString()}: $${previousClosePrice}`);
          }
        } else {
          // For other cases, use the second last closing price
          previousClosePrice = data[data.length - 2] && data[data.length - 2][4] ? parseFloat(data[data.length - 2][4]) : null;
        }
        
        if (previousClosePrice) {
          setPreviousClose(previousClosePrice);
          // For backward compatibility, also set yesterdayClose if 1m interval
          if (interval === '1m') {
            setYesterdayClose(previousClosePrice);
          }
          console.log(`${description} price fetched:`, previousClosePrice);
        } else {
          console.error(`Could not parse ${description} price from API response:`, data);
        }
      } catch (error) {
        console.error(`Failed to fetch previous close for ${interval}:`, error);
      }
    };
    fetchPreviousClose();
  }, [interval]); // Re-fetch when interval changes

  // Fetch 24h price statistics
  useEffect(() => {
    const fetch24hStats = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
        if (!response.ok) {
          throw new Error(`Error fetching 24h stats: ${response.statusText}`);
        }
        const data = await response.json();
        // Only update 24h change percentage, let fast price API handle price updates
        setPriceChange24h(parseFloat(data.priceChangePercent));
        console.log("24h change percentage fetched:", data.priceChangePercent);
      } catch (error) {
        console.error("Failed to fetch 24h stats:", error);
      }
    };
    
    // Fast price updates - fetch current price every 2 seconds
    const fetchFastPrice = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        if (!response.ok) {
          throw new Error(`Error fetching price: ${response.statusText}`);
        }
        const data = await response.json();
        setCurrentPrice(parseFloat(data.price));
      } catch (error) {
        console.error("Failed to fetch fast price:", error);
      }
    };

    fetch24hStats();
    
    // Update 24h percentage change every 10 seconds (less frequent since it changes slower)
    const interval24h = setInterval(fetch24hStats, 10000);
    // Update price every 1 second for ultra-frequent updates
    const intervalFastPrice = setInterval(fetchFastPrice, 1000);
    
    return () => {
      clearInterval(interval24h);
      clearInterval(intervalFastPrice);
    };
  }, []);

  // Fetch historical K-line data and setup WebSocket connection
  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        // Calculate time range and API interval based on selected interval
        const getTimeConfig = () => {
          const now = Date.now();
          const today = new Date();
          
          switch (interval) {
            case '1m':
              // Today from 00:00 to 23:59:59
              today.setHours(0, 0, 0, 0);
              const todayEnd = new Date(today);
              todayEnd.setHours(23, 59, 59, 999);
              return {
                startTime: today.getTime(),
                endTime: todayEnd.getTime(),
                apiInterval: interval,
                intervalMs: 60000
              };
            
            case '1w':
              // Last 7 days with 1h intervals
              return {
                startTime: now - (7 * 24 * 60 * 60 * 1000),
                endTime: now,
                apiInterval: '1h',
                intervalMs: 3600000
              };
            
            case '1M':
              // Last 30 days with 4h intervals
              return {
                startTime: now - (30 * 24 * 60 * 60 * 1000),
                endTime: now,
                apiInterval: '4h',
                intervalMs: 14400000
              };
            
            case '3M':
              // Last 90 days with 1d intervals
              return {
                startTime: now - (90 * 24 * 60 * 60 * 1000),
                endTime: now,
                apiInterval: '1d',
                intervalMs: 86400000
              };
            
            case 'YTD':
              // From Jan 1st to now with 1d intervals
              const yearStart = new Date(today.getFullYear(), 0, 1);
              return {
                startTime: yearStart.getTime(),
                endTime: now,
                apiInterval: '1d',
                intervalMs: 86400000
              };
            
            case '1Y':
              // Last 365 days with 1d intervals
              return {
                startTime: now - (365 * 24 * 60 * 60 * 1000),
                endTime: now,
                apiInterval: '1d',
                intervalMs: 86400000
              };
            
            default:
              today.setHours(0, 0, 0, 0);
              return {
                startTime: today.getTime(),
                endTime: now,
                apiInterval: '1m',
                intervalMs: 60000
              };
          }
        };

        const { startTime, endTime, apiInterval, intervalMs } = getTimeConfig();
        
        console.log('Fetching data for:', interval);
        console.log('Time range:', new Date(startTime).toLocaleString(), 'to', new Date(endTime).toLocaleString());
        console.log('Using API interval:', apiInterval);
        
        // Fetch data in batches to avoid API limits
        let allData = [];
        let currentStartTime = startTime;
        const batchSize = 1000;
        
        while (currentStartTime < endTime) {
          const batchEndTime = Math.min(currentStartTime + (batchSize * intervalMs), endTime);
          
          const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${apiInterval}&startTime=${currentStartTime}&endTime=${batchEndTime}&limit=${batchSize}`);
          if (!response.ok) {
            throw new Error(`Error fetching historical klines: ${response.statusText}`);
          }
          
          const batchData = await response.json();
          if (batchData.length === 0) break;
          
          allData = allData.concat(batchData);
          currentStartTime = batchData[batchData.length - 1][0] + intervalMs;
          
          console.log(`Fetched batch: ${batchData.length} items, total: ${allData.length}`);
        }
        
        const data = allData;
        
        // Generate labels and prices
        const labels = [];
        const prices = [];
        
        if (interval === '1m') {
          // For 1-minute interval, generate complete 24-hour labels (00:00 to 23:59)
          for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute++) {
              const timeLabel = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
              labels.push(timeLabel);
              
              // Find corresponding price from API data
              const targetTime = new Date();
              targetTime.setHours(hour, minute, 0, 0);
              
              // Look for matching kline data
              const matchingKline = data.find(kline => {
                const klineTime = new Date(kline[0]);
                return klineTime.getHours() === hour && klineTime.getMinutes() === minute;
              });
              
              if (matchingKline) {
                prices.push(parseFloat(matchingKline[4])); // Close price
              } else {
                prices.push(null); // No data for this time point
              }
            }
          }
        } else {
          // For other intervals, use API data directly
          data.forEach(kline => {
            const klineTime = new Date(kline[0]); // Open time
            const closePrice = parseFloat(kline[4]); // Close price
            
            let label;
            switch (interval) {
              case '1w':
                // Show date format MM/DD HH:00
                const month = (klineTime.getMonth() + 1).toString().padStart(2, '0');
                const day = klineTime.getDate().toString().padStart(2, '0');
                const hour = klineTime.getHours().toString().padStart(2, '0');
                label = `${month}/${day} ${hour}:00`;
                break;
              
              case '1M':
                // Show date format MM/DD HH:00 for 4h intervals
                const monthM = (klineTime.getMonth() + 1).toString().padStart(2, '0');
                const dayM = klineTime.getDate().toString().padStart(2, '0');
                const hourM = klineTime.getHours().toString().padStart(2, '0');
                label = `${monthM}/${dayM} ${hourM}:00`;
                break;
              
              case '3M':
              case 'YTD':
              case '1Y':
                // Show date format MM/DD
                const monthLong = (klineTime.getMonth() + 1).toString().padStart(2, '0');
                const dayLong = klineTime.getDate().toString().padStart(2, '0');
                label = `${monthLong}/${dayLong}`;
                break;
              
              default:
                label = klineTime.toLocaleTimeString();
            }
            
            labels.push(label);
            prices.push(closePrice);
          });
        }
        
        // Set initial chart data
        setChartData({
          labels: labels,
          datasets: [
            {
              data: prices,
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              fill: false,
              tension: 0.1,
              spanGaps: false, // Don't connect null values
              pointRadius: (context) => {
                // Only show dot for the last non-null point
                const isLastNonNull = context.dataIndex === prices.findLastIndex(price => price !== null);
                return isLastNonNull ? 6 : 0;
              },
              pointBackgroundColor: (context) => {
                // Last point color matches line color
                const isLastNonNull = context.dataIndex === prices.findLastIndex(price => price !== null);
                if (isLastNonNull && prices[context.dataIndex] !== null) {
                  return prices.length > 0 && previousClose !== null 
                    ? (prices[context.dataIndex] > previousClose 
                       ? 'rgba(0, 128, 0, 1)'  // Green
                       : 'rgba(255, 0, 0, 1)') // Red
                    : 'rgba(128, 128, 128, 1)'; // Gray
                }
                return 'transparent';
              },
              pointBorderColor: (context) => {
                // Last point border color
                const isLastNonNull = context.dataIndex === prices.findLastIndex(price => price !== null);
                if (isLastNonNull && prices[context.dataIndex] !== null) {
                  return 'white';
                }
                return 'transparent';
              },
              pointBorderWidth: 2,
              pointHoverRadius: 4,
              // Determine line color based on latest price vs previous close
              borderColor: (() => {
                const lastValidPrice = prices.filter(price => price !== null).pop();
                return lastValidPrice && previousClose !== null 
                  ? (lastValidPrice > previousClose 
                     ? 'rgba(0, 128, 0, 1)'  // Green
                     : 'rgba(255, 0, 0, 1)') // Red
                  : 'rgba(128, 128, 128, 1)'; // Gray
              })(),
            },
            // Update previous period's closing price horizontal reference line
            ...(previousClose !== null ? [{
              label: interval === '1m' ? 'Yesterday Close' : 
                     interval === '1w' ? 'Last Week Close' :
                     interval === '1M' ? 'Last Month Close' :
                     interval === '3M' ? '3M Ago Close' :
                     interval === 'YTD' ? 'Last Year Close' :
                     interval === '1Y' ? '1Y Ago Close' : 'Previous Close',
              data: new Array(labels.length).fill(previousClose),
              borderColor: 'rgba(0, 0, 0, 0.8)',
              borderWidth: 2,
              borderDash: [6, 6], // Dashed line
              pointRadius: 0,
              pointHoverRadius: 0,
              fill: false,
              tension: 0,
            }] : [])
          ],
        });
        
        console.log('Historical data loaded from 00:00 to now:', data.length, 'klines');
        if (data.length > 0) {
          const firstDate = new Date(data[0][0]);
          const lastDate = new Date(data[data.length - 1][0]);
          const firstPrice = parseFloat(data[0][4]);
          const lastPrice = parseFloat(data[data.length - 1][4]);
          console.log(`${interval} Data Range:`, {
            totalPoints: data.length,
            firstDate: firstDate.toDateString(),
            firstPrice: `$${firstPrice}`,
            lastDate: lastDate.toDateString(), 
            lastPrice: `$${lastPrice}`
          });
          
          // For 1Y, show sample dates throughout the dataset
          if (interval === '1Y' && data.length > 10) {
            console.log('1Y Sample dates:');
            [0, Math.floor(data.length * 0.25), Math.floor(data.length * 0.5), Math.floor(data.length * 0.75), data.length - 1].forEach((index, i) => {
              if (data[index]) {
                const date = new Date(data[index][0]);
                const price = parseFloat(data[index][4]);
                console.log(`  ${['Start', '25%', '50%', '75%', 'End'][i]}: ${date.toDateString()} - $${price}`);
              }
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch historical data:", error);
      }
    };

    fetchHistoricalData();
  }, [interval, previousClose]); // Depend on interval and previousClose to ensure color updates

  useEffect(() => {
    // Clean up old WebSocket connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Only use WebSocket for intraday intervals (1m only)
    if (interval !== '1m') {
      console.log(`No WebSocket needed for ${interval} interval`);
      return;
    }

    const ws = new ReconnectingWebSocket(`wss://stream.binance.com:9443/ws/btcusdt@kline_1m`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const kline = data.k;
      const closePrice = parseFloat(kline.c);
      
      // Update current price
      setCurrentPrice(closePrice);
      
      const klineDataTime = new Date(kline.t);
      const hours = klineDataTime.getHours().toString().padStart(2, '0');
      const minutes = klineDataTime.getMinutes().toString().padStart(2, '0');
      const timestamp = `${hours}:${minutes}`;

      setChartData((prev) => {
        // Find corresponding time index position
        const timeIndex = prev.labels.indexOf(timestamp);
        if (timeIndex === -1) return prev; // Don't update if corresponding time not found
        
        // Update data at corresponding position
        const newData = [...prev.datasets[0].data];
        newData[timeIndex] = closePrice;
        
        return {
          labels: prev.labels, // Keep full day labels unchanged
          datasets: [
            {
              ...prev.datasets[0],
              data: newData,
              pointRadius: (context) => {
                // Only show dot for the last data point (current time)
                return context.dataIndex === timeIndex ? 6 : 0;
              },
              pointBackgroundColor: (context) => {
                // Last point color matches line color
                if (context.dataIndex === timeIndex) {
                  return closePrice > previousClose 
                    ? 'rgba(0, 128, 0, 1)'  // Green
                    : 'rgba(255, 0, 0, 1)'; // Red
                }
                return 'transparent';
              },
              pointBorderColor: (context) => {
                // Last point border color
                if (context.dataIndex === timeIndex) {
                  return 'white';
                }
                return 'transparent';
              },
              pointBorderWidth: 2,
              pointHoverRadius: 4, // Show dot on hover
              // Determine line color based on latest price vs yesterday's close
              borderColor: previousClose !== null 
                ? (closePrice > previousClose 
                   ? 'rgba(0, 128, 0, 1)'  // Green, above yesterday's close
                   : 'rgba(255, 0, 0, 1)') // Red, below yesterday's close
                : 'rgba(128, 128, 128, 1)', // Gray, yesterday's close not loaded
            },
            // Update previous period's closing price horizontal reference line
            ...(previousClose !== null ? [{
              label: interval === '1m' ? 'Yesterday Close' : 
                     interval === '1w' ? 'Last Week Close' :
                     interval === '1M' ? 'Last Month Close' :
                     interval === '3M' ? '3M Ago Close' :
                     interval === 'YTD' ? 'Last Year Close' :
                     interval === '1Y' ? '1Y Ago Close' : 'Previous Close',
              data: new Array(prev.labels.length).fill(previousClose),
              borderColor: 'rgba(0, 0, 0, 0.8)',
              borderWidth: 2,
              borderDash: [6, 6], // Dashed line
              pointRadius: 0,
              pointHoverRadius: 0,
              fill: false,
              tension: 0,
            }] : [])
          ],
        };
      });
    };

    ws.onopen = () => console.log(`WebSocket connected (${interval})`);
    ws.onclose = () => {
      console.log(`WebSocket disconnected (${interval}), attempting to reconnect...`);
    };
    ws.onerror = (error) => {
      console.error(`WebSocket error (${interval}):`, error);
      console.log('WebSocket will attempt automatic reconnection...');
    };

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [interval, previousClose]); // Add interval and previousClose to dependencies to ensure WebSocket and color updates

  // Ensure component is ready
  useEffect(() => {
    setIsComponentReady(true);
    // Force set initial state
    setInterval('1m');
  }, []);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        left: 160,
        right: 160  // Reserve more space on the right for external labels
      }
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      tooltip: {
        mode: 'index',
        intersect: false,
        filter: function(tooltipItem) {
          // Filter out previous close price dataset from tooltip
          return !tooltipItem.dataset.label || !tooltipItem.dataset.label.includes('Close');
        },
        callbacks: {
          title: function(context) {
            // Ensure context array is not empty
            if (context && context.length > 0) {
              return `Time: ${context[0].label}`;
            }
            return 'Time: No Data';
          },
          label: function(context) {
            const value = context.parsed.y;
            if (value !== null) {
              return `$${value.toLocaleString()}`;
            }
            return 'No Data';
          }
        }
      },
      legend: {
        display: false, // Hide legend
      },
      title: {
        display: false,
        text: `BTC/USDT Real-time Price Chart`,
        interval: interval, // Pass interval info to plugins
      },
    },
    scales: {
      x: {
        title: {
          display: false,
          text: 'Time',
        },
        ticks: {
          callback: function(value, index, ticks) {
            const label = this.getLabelForValue(value);
            
            // Show different tick intervals based on the selected interval
            switch (interval) {
              case '1m':
                // Only show time marks every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
                if (label && (label.endsWith(':00') && 
                    (label.startsWith('00:') || label.startsWith('04:') || 
                     label.startsWith('08:') || label.startsWith('12:') || 
                     label.startsWith('16:') || label.startsWith('20:')))) {
                  return label;
                }
                return '';
              
              case '1w':
                // Show only midnight marks for weekly data (00:00 only, about once per day)
                if (label && label.includes(' 00:00')) {
                  return label;
                }
                return '';
              
              case '1M':
                // Show every 36th label for monthly data (about every week)
                return index % 36 === 0 ? label : '';
              
              case '3M':
                // Show every 10th label for 3-month data (about every 10 days)
                return index % 10 === 0 ? label : '';
              
              case 'YTD':
                // Show every 15th label for YTD data (about every 2 weeks)
                return index % 15 === 0 ? label : '';
              
              case '1Y':
                // Show every 20th label for 1-year data (about every 3 weeks)
                return index % 20 === 0 ? label : '';
              
              default:
                return index % 5 === 0 ? label : '';
            }
          },
          maxTicksLimit: (() => {
            switch (interval) {
              case '1m': return 8;   // Every 4 hours, total 6
              case '1w': return 3;   // Weekly interval, only show 3 labels
              case '1M': return 5;   // Monthly interval, about every week
              case '3M': return 10;  // 3 months
              case 'YTD': return 12; // Year to date
              case '1Y': return 18;  // 1 year
              default: return 15;
            }
          })(), // Dynamically set tick limit based on interval
          autoSkip: false
        }
      },
      y: {
        title: {
          display: false,
          text: 'Price (USDT)',
        },
      },
    },
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" align="center" gutterBottom>
          
        </Typography>
        
        {/* Real-time price information */}
        <Box sx={{ mb: 3, p: 3, backgroundColor: '#f8f9fa', borderRadius: 2, textAlign: 'center' }}>
          <Typography variant="h3" align="center" sx={{ fontWeight: 'bold', mb: 1 }}>
            BTC/USDT
          </Typography>
          <Typography variant="h4" align="center" sx={{ 
            fontWeight: 'bold', 
            color: currentPrice && previousClose 
              ? (currentPrice > previousClose ? '#4caf50' : '#f44336') 
              : '#333',
            mb: 1 
          }}>
            {currentPrice !== null ? `$${currentPrice.toLocaleString()}` : 'Loading...'}
            {currentPrice !== null && previousClose !== null 
              ? (() => {
                  const changePercent = ((currentPrice - previousClose) / previousClose * 100);
                  return ` (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;
                })()
              : ''}
          </Typography>
        </Box>
        
        {/* Time interval toggle buttons */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button 
            onClick={() => setInterval('1m')}
            variant={(isComponentReady && interval === '1m') ? 'contained' : 'outlined'}
            color="primary"
            size="small"
          >
            Today
          </Button>
          <Button 
            onClick={() => setInterval('1w')}
            variant={(isComponentReady && interval === '1w') ? 'contained' : 'outlined'}
            color="primary"
            size="small"
          >
            1 Week
          </Button>
          <Button 
            onClick={() => setInterval('1M')}
            variant={(isComponentReady && interval === '1M') ? 'contained' : 'outlined'}
            color="primary"
            size="small"
          >
            1 Month
          </Button>
          <Button 
            onClick={() => setInterval('3M')}
            variant={(isComponentReady && interval === '3M') ? 'contained' : 'outlined'}
            color="primary"
            size="small"
          >
            3 Months
          </Button>
          <Button 
            onClick={() => setInterval('YTD')}
            variant={(isComponentReady && interval === 'YTD') ? 'contained' : 'outlined'}
            color="primary"
            size="small"
          >
            YTD
          </Button>
          <Button 
            onClick={() => setInterval('1Y')}
            variant={(isComponentReady && interval === '1Y') ? 'contained' : 'outlined'}
            color="primary"
            size="small"
          >
            1 Year
          </Button>
        </Box>
        
        <Box sx={{ height: '500px', mb: 2 }}>
          <Line ref={chartRef} data={chartData} options={options} />
        </Box>
      </Box>
    </Container>
  );
}

export default PriceChart;