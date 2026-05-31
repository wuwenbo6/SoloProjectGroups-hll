import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import axios from 'axios';

const WS_GATEWAYS = [
  'ws://localhost:8081/ws',
  'ws://localhost:8082/ws'
];

const API_BASE = 'http://localhost:8080';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

function App() {
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [subscriptions, setSubscriptions] = useState(new Set());
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [trades, setTrades] = useState([]);
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [snapshot, setSnapshot] = useState(null);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);

  const chartRef = useRef(null);
  const chartContainerRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const wsRef = useRef(null);
  const initialPriceRef = useRef(null);
  const lastKlineTimeRef = useRef({});
  const disconnectTimeRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const maxBidQtyRef = useRef(1);
  const maxAskQtyRef = useRef(1);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = WS_GATEWAYS[gatewayIndex % WS_GATEWAYS.length];
    console.log(`Connecting to gateway: ${wsUrl}, attempt: ${reconnectAttempts + 1}`);
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      setReconnectAttempts(0);
      
      subscriptions.forEach(symbol => {
        ws.send(JSON.stringify({ action: 'subscribe', symbol }));
      });

      if (disconnectTimeRef.current) {
        console.log('Requesting missed data since:', new Date(disconnectTimeRef.current));
        subscriptions.forEach(symbol => {
          ws.send(JSON.stringify({ 
            action: 'get_recent', 
            symbol 
          }));
        });
      }
      disconnectTimeRef.current = null;
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
      setWsConnected(false);
      disconnectTimeRef.current = Date.now();

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectTimerRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          setGatewayIndex(prev => prev + 1);
        }, RECONNECT_DELAY);
      } else {
        console.log('Max reconnection attempts reached');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (e) {
        console.error('Failed to parse message:', e, event.data);
      }
    };

    wsRef.current = ws;
  }, [gatewayIndex, subscriptions, reconnectAttempts]);

  const handleMessage = (message) => {
    switch (message.type) {
      case 'kline':
        handleKline(message.data);
        break;
      case 'trade':
        handleTrade(message.data);
        break;
      case 'history':
        handleHistory(message.data);
        break;
      case 'recent':
        handleRecentData(message);
        break;
      case 'orderbook':
        handleOrderBook(message.data);
        break;
      case 'snapshot':
        handleSnapshot(message.data);
        break;
      case 'subscribed':
      case 'unsubscribed':
        console.log('Subscription response:', message);
        break;
      default:
        break;
    }
  };

  const handleOrderBook = (data) => {
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }

    if (data.symbol !== selectedSymbol) {
      return;
    }

    let maxBidQty = 1;
    let maxAskQty = 1;
    
    data.bids.forEach(b => { maxBidQty = Math.max(maxBidQty, b.quantity); });
    data.asks.forEach(a => { maxAskQty = Math.max(maxAskQty, a.quantity); });
    
    maxBidQtyRef.current = maxBidQty;
    maxAskQtyRef.current = maxAskQty;

    setOrderBook({
      bids: data.bids.slice(0, 10),
      asks: data.asks.slice(0, 10)
    });
  };

  const handleSnapshot = (data) => {
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }

    if (data.symbol !== selectedSymbol) {
      return;
    }

    setSnapshot(data);
    setCurrentPrice(data.lastPrice);
    setPriceChange(data.changePercent);
  };

  const handleKline = (data) => {
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }

    const key = data.symbol;
    const lastTime = lastKlineTimeRef.current[key];
    
    if (lastTime && data.openTime < lastTime) {
      return;
    }
    lastKlineTimeRef.current[key] = data.openTime;

    if (data.symbol !== selectedSymbol) {
      return;
    }

    const kline = {
      time: data.openTime / 1000,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
    };

    if (candleSeriesRef.current) {
      candleSeriesRef.current.update(kline);
    }

    setCurrentPrice(data.close);
    
    if (initialPriceRef.current === null) {
      initialPriceRef.current = data.open;
    }
    const change = ((data.close - initialPriceRef.current) / initialPriceRef.current) * 100;
    setPriceChange(change);
  };

  const handleTrade = (data) => {
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }

    if (data.symbol !== selectedSymbol) {
      return;
    }

    setCurrentPrice(data.price);
    
    setTrades(prev => {
      const exists = prev.some(t => t.tradeTime === data.tradeTime && Math.abs(t.price - data.price) < 0.0001);
      if (exists) {
        return prev;
      }
      return [data, ...prev].slice(0, 100);
    });
  };

  const handleHistory = (data) => {
    const klines = (typeof data === 'string' ? JSON.parse(data) : data).map(k => ({
      time: k.openTime / 1000,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    if (candleSeriesRef.current && klines.length > 0) {
      candleSeriesRef.current.setData(klines);
      const lastKline = klines[klines.length - 1];
      const firstKline = klines[0];
      setCurrentPrice(lastKline.close);
      initialPriceRef.current = firstKline.open;
      const change = ((lastKline.close - firstKline.open) / firstKline.open) * 100;
      setPriceChange(change);
      lastKlineTimeRef.current[selectedSymbol] = lastKline.time * 1000;
    }
  };

  const handleRecentData = (message) => {
    console.log('Received recent data for:', message.symbol, '- klines:', message.klines?.length, 'trades:', message.trades?.length);

    if (message.klines && message.klines.length > 0) {
      message.klines.forEach(kline => {
        handleKline(kline);
      });
    }

    if (message.trades && message.trades.length > 0 && message.symbol === selectedSymbol) {
      setTrades(prev => {
        const combined = [...message.trades, ...prev];
        const unique = [];
        const seen = new Set();
        combined.forEach(t => {
          const key = `${t.tradeTime}-${t.price}-${t.quantity}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(t);
          }
        });
        return unique.slice(0, 100);
      });
    }
  };

  const subscribe = (symbol) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', symbol }));
      setSubscriptions(prev => new Set([...prev, symbol]));
      
      wsRef.current.send(JSON.stringify({ 
        action: 'get_recent', 
        symbol 
      }));
    }
  };

  const unsubscribe = (symbol) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'unsubscribe', symbol }));
      setSubscriptions(prev => {
        const newSet = new Set(prev);
        newSet.delete(symbol);
        return newSet;
      });
    }
  };

  const fetchHistory = useCallback((symbol) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        action: 'get_history', 
        symbol,
        interval: '1m'
      }));
    }
  }, []);

  const handleExport = async () => {
    setExporting(true);
    setExportResult(null);

    try {
      const endTime = Date.now();
      const startTime = endTime - 24 * 60 * 60 * 1000;

      const response = await axios.post(`${API_BASE}/api/export/trades`, {
        symbol: selectedSymbol,
        format: exportFormat,
        startTime,
        endTime
      });

      const data = response.data;
      if (data.success) {
        const filename = data.filePath.split('/').pop();
        const downloadUrl = `${API_BASE}/api/export/download/${filename}`;
        setExportResult({
          success: true,
          message: `成功导出 ${data.count} 条记录`,
          downloadUrl
        });
      } else {
        setExportResult({ success: false, message: data.error || '导出失败' });
      }
    } catch (error) {
      console.error('Export error:', error);
      setExportResult({ success: false, message: error.message || '导出失败' });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: '#1a1a2e' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: 'rgba(42, 46, 57, 0.5)',
      },
      timeScale: {
        borderColor: 'rgba(42, 46, 57, 0.5)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff4444',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff4444',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    initialPriceRef.current = null;
    lastKlineTimeRef.current = {};
    setOrderBook({ bids: [], asks: [] });
    setSnapshot(null);
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData([]);
    }
    setTrades([]);
    fetchHistory(selectedSymbol);
  }, [selectedSymbol, fetchHistory]);

  const formatPrice = (price) => {
    if (!price) return '0.00';
    if (price >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (price >= 1) {
      return price.toFixed(4);
    } else {
      return price.toFixed(6);
    }
  };

  const formatVolume = (volume) => {
    if (!volume) return '0';
    if (volume >= 1000000) {
      return (volume / 1000000).toFixed(2) + 'M';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(2) + 'K';
    }
    return volume.toFixed(2);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN');
  };

  const calcSpread = () => {
    if (orderBook.bids.length === 0 || orderBook.asks.length === 0) return '0.00';
    const bestBid = orderBook.bids[0]?.price || 0;
    const bestAsk = orderBook.asks[0]?.price || 0;
    return (bestAsk - bestBid).toFixed(2);
  };

  return (
    <div className="app">
      <div className="header">
        <h1>📈 实时行情 K线图</h1>
        <p>Go + RabbitMQ + WebSocket 实时行情系统</p>
        <div className={`connection-status ${wsConnected ? 'connected' : 'disconnected'}`}>
          <span className={`status-dot ${wsConnected ? 'connected' : 'disconnected'}`}></span>
          {wsConnected ? '已连接' : `重连中 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`} 
          {wsConnected && ` (Gateway ${(gatewayIndex % WS_GATEWAYS.length) + 1})`}
        </div>
      </div>

      <div className="controls">
        <div className="control-group">
          <label>选择交易对</label>
          <div className="symbol-selector">
            {SYMBOLS.map(symbol => (
              <button
                key={symbol}
                className={`symbol-btn ${selectedSymbol === symbol ? 'active' : ''}`}
                onClick={() => setSelectedSymbol(symbol)}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>

        <div className="action-buttons">
          <button
            className="action-btn subscribe-btn"
            onClick={() => subscribe(selectedSymbol)}
            disabled={subscriptions.has(selectedSymbol) || !wsConnected}
          >
            订阅
          </button>
          <button
            className="action-btn unsubscribe-btn"
            onClick={() => unsubscribe(selectedSymbol)}
            disabled={!subscriptions.has(selectedSymbol) || !wsConnected}
          >
            取消订阅
          </button>
        </div>
      </div>

      <div className="chart-container">
        <div className="chart-header">
          <div className="chart-title">{selectedSymbol} / 1m K线</div>
          <div className="price-info">
            <div className="price-label">当前价格</div>
            <div className="price-value">${formatPrice(currentPrice)}</div>
            <div className={`price-change ${priceChange >= 0 ? 'up' : 'down'}`}>
              {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
            </div>
          </div>
        </div>
        <div ref={chartContainerRef} id="chart"></div>
      </div>

      <div className="dashboard-grid">
        <div className="orderbook-container">
          <h3>📊 订单簿 Level 2</h3>
          <div className="orderbook-header">
            <span>价格</span>
            <span>数量</span>
            <span>累计</span>
          </div>
          <div className="orderbook-rows">
            {[...orderBook.asks].reverse().map((ask, i) => (
              <div key={`ask-${i}`} className="orderbook-row ask">
                <div
                  className="price-bar"
                  style={{ width: `${(ask.quantity / maxAskQtyRef.current) * 100}%` }}
                />
                <span>{formatPrice(ask.price)}</span>
                <span>{ask.quantity.toFixed(4)}</span>
                <span>{ask.quantity.toFixed(4)}</span>
              </div>
            ))}
          </div>
          <div className="spread">
            买卖价差: ${calcSpread()}
          </div>
          <div className="orderbook-rows">
            {orderBook.bids.map((bid, i) => (
              <div key={`bid-${i}`} className="orderbook-row bid">
                <div
                  className="price-bar"
                  style={{ width: `${(bid.quantity / maxBidQtyRef.current) * 100}%` }}
                />
                <span>{formatPrice(bid.price)}</span>
                <span>{bid.quantity.toFixed(4)}</span>
                <span>{bid.quantity.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="snapshot-container">
          <h3>📋 行情快照</h3>
          <div className="snapshot-grid">
            <div className="snapshot-item">
              <span className="snapshot-label">最新价</span>
              <span className="snapshot-value">${formatPrice(snapshot?.lastPrice)}</span>
            </div>
            <div className="snapshot-item">
              <span className="snapshot-label">开盘价</span>
              <span className="snapshot-value">${formatPrice(snapshot?.openPrice)}</span>
            </div>
            <div className="snapshot-item">
              <span className="snapshot-label">最高价</span>
              <span className="snapshot-value positive">${formatPrice(snapshot?.highPrice)}</span>
            </div>
            <div className="snapshot-item">
              <span className="snapshot-label">最低价</span>
              <span className="snapshot-value negative">${formatPrice(snapshot?.lowPrice)}</span>
            </div>
            <div className="snapshot-item">
              <span className="snapshot-label">成交量</span>
              <span className="snapshot-value">{formatVolume(snapshot?.volume)}</span>
            </div>
            <div className="snapshot-item">
              <span className="snapshot-label">成交额</span>
              <span className="snapshot-value">${formatVolume(snapshot?.quoteVolume)}</span>
            </div>
            <div className="snapshot-item">
              <span className="snapshot-label">涨跌额</span>
              <span className={`snapshot-value ${(snapshot?.priceChange || 0) >= 0 ? 'positive' : 'negative'}`}>
                ${formatPrice(Math.abs(snapshot?.priceChange || 0))}
              </span>
            </div>
            <div className="snapshot-item">
              <span className="snapshot-label">涨跌幅</span>
              <span className={`snapshot-value ${(snapshot?.changePercent || 0) >= 0 ? 'positive' : 'negative'}`}>
                {(snapshot?.changePercent || 0).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="subscriptions">
        <h3>已订阅的交易对 ({subscriptions.size})</h3>
        {subscriptions.size === 0 ? (
          <div className="no-subscriptions">暂无订阅，请选择交易对并点击订阅按钮</div>
        ) : (
          <div className="subscription-list">
            {Array.from(subscriptions).map(symbol => (
              <div key={symbol} className="subscription-tag">
                <span>{symbol}</span>
                <button
                  className="unsubscribe-tag-btn"
                  onClick={() => unsubscribe(symbol)}
                  title="取消订阅"
                  disabled={!wsConnected}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="trade-feed">
        <h3>实时成交记录 - {selectedSymbol} ({trades.length})</h3>
        <div className="trade-list">
          {trades.length === 0 ? (
            <div className="no-subscriptions">等待成交数据...</div>
          ) : (
            trades.slice(0, 50).map((trade, index) => (
              <div
                key={`${trade.tradeTime}-${index}`}
                className={`trade-item ${trade.isBuyerMaker ? 'sell' : 'buy'}`}
              >
                <span>
                  {trade.isBuyerMaker ? 'SELL' : 'BUY'} {formatPrice(trade.price)}
                </span>
                <span>{trade.quantity.toFixed(4)}</span>
                <span className="trade-time">{formatTime(trade.tradeTime)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="export-container">
        <h3>💾 导出交易日志</h3>
        <div className="export-form">
          <div className="export-group">
            <label>交易对</label>
            <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>
              {SYMBOLS.map(symbol => (
                <option key={symbol} value={symbol}>{symbol}</option>
              ))}
            </select>
          </div>
          <div className="export-group">
            <label>格式</label>
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <button
            className="export-btn"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? '导出中...' : '导出最近24小时数据'}
          </button>
        </div>
        {exportResult && (
          <div className={`export-result ${exportResult.success ? 'success' : 'error'}`}>
            {exportResult.message}
            {exportResult.success && (
              <div>
                <a href={exportResult.downloadUrl} target="_blank" rel="noopener noreferrer">
                  点击下载文件
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
