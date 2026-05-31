package gateway

import (
	"container/ring"
	"encoding/json"
	"log"
	"marketdata/internal/database"
	"marketdata/internal/rabbitmq"
	"marketdata/internal/types"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	workerCount     = 4
	messageQueueSize = 10000
	prefetchCount   = 1000
	cacheSize       = 1000
	clientSendBuffer = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type MessageCache struct {
	klineCache     map[string]*ring.Ring
	tradeCache     map[string]*ring.Ring
	orderBookCache map[string]*types.OrderBook
	snapshotCache  map[string]*types.MarketSnapshot
	klineMu        sync.RWMutex
	tradeMu        sync.RWMutex
	obMu           sync.RWMutex
	snapMu         sync.RWMutex
}

func NewMessageCache() *MessageCache {
	symbols := []string{"BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"}
	kc := make(map[string]*ring.Ring)
	tc := make(map[string]*ring.Ring)
	obc := make(map[string]*types.OrderBook)
	sc := make(map[string]*types.MarketSnapshot)
	for _, s := range symbols {
		kc[s] = ring.New(cacheSize)
		tc[s] = ring.New(cacheSize)
	}
	return &MessageCache{
		klineCache:     kc,
		tradeCache:     tc,
		orderBookCache: obc,
		snapshotCache:  sc,
	}
}

func (mc *MessageCache) AddKline(kline *types.Kline) {
	mc.klineMu.Lock()
	defer mc.klineMu.Unlock()
	if r, ok := mc.klineCache[kline.Symbol]; ok {
		r.Value = kline
		mc.klineCache[kline.Symbol] = r.Next()
	}
}

func (mc *MessageCache) AddTrade(trade *types.Trade) {
	mc.tradeMu.Lock()
	defer mc.tradeMu.Unlock()
	if r, ok := mc.tradeCache[trade.Symbol]; ok {
		r.Value = trade
		mc.tradeCache[trade.Symbol] = r.Next()
	}
}

func (mc *MessageCache) AddOrderBook(ob *types.OrderBook) {
	mc.obMu.Lock()
	defer mc.obMu.Unlock()
	mc.orderBookCache[ob.Symbol] = ob
}

func (mc *MessageCache) AddSnapshot(snap *types.MarketSnapshot) {
	mc.snapMu.Lock()
	defer mc.snapMu.Unlock()
	mc.snapshotCache[snap.Symbol] = snap
}

func (mc *MessageCache) GetRecentKlines(symbol string, since int64) []types.Kline {
	mc.klineMu.RLock()
	defer mc.klineMu.RUnlock()
	var result []types.Kline
	if r, ok := mc.klineCache[symbol]; ok {
		r.Do(func(v interface{}) {
			if v != nil {
				k := v.(*types.Kline)
				if k.OpenTime >= since {
					result = append(result, *k)
				}
			}
		})
	}
	return result
}

func (mc *MessageCache) GetRecentTrades(symbol string, since int64) []types.Trade {
	mc.tradeMu.RLock()
	defer mc.tradeMu.RUnlock()
	var result []types.Trade
	if r, ok := mc.tradeCache[symbol]; ok {
		r.Do(func(v interface{}) {
			if v != nil {
				t := v.(*types.Trade)
				if t.TradeTime >= since {
					result = append(result, *t)
				}
			}
		})
	}
	return result
}

func (mc *MessageCache) GetOrderBook(symbol string) *types.OrderBook {
	mc.obMu.RLock()
	defer mc.obMu.RUnlock()
	return mc.orderBookCache[symbol]
}

func (mc *MessageCache) GetSnapshot(symbol string) *types.MarketSnapshot {
	mc.snapMu.RLock()
	defer mc.snapMu.RUnlock()
	return mc.snapshotCache[symbol]
}

type Client struct {
	id           string
	conn         *websocket.Conn
	gateway      *Gateway
	subscribed   map[string]bool
	send         chan []byte
	mu           sync.RWMutex
	lastActive   int64
	disconnectAt int64
}

type Gateway struct {
	rmq         *rabbitmq.Connection
	db          *database.DB
	cache       *MessageCache
	clients     map[string]*Client
	broadcast   chan amqp.Delivery
	register    chan *Client
	unregister  chan *Client
	mu          sync.RWMutex
	queueName   string
	workerPool  chan struct{}
	msgCount    uint64
	dropCount   uint64
}

func NewGateway(rmq *rabbitmq.Connection, db *database.DB, instanceID string) *Gateway {
	return &Gateway{
		rmq:        rmq,
		db:         db,
		cache:      NewMessageCache(),
		clients:    make(map[string]*Client),
		broadcast:  make(chan amqp.Delivery, messageQueueSize),
		register:   make(chan *Client, 100),
		unregister: make(chan *Client, 100),
		queueName:  "ws_gateway_" + instanceID,
		workerPool: make(chan struct{}, workerCount),
	}
}

func (g *Gateway) Start() error {
	channel := g.rmq.Channel()

	if err := channel.Qos(prefetchCount, 0, false); err != nil {
		log.Printf("Warning: failed to set QoS: %v", err)
	}

	_, err := channel.QueueDeclare(
		g.queueName,
		true,
		false,
		false,
		false,
		amqp.Table{
			"x-max-length":       int32(100000),
			"x-overflow":         "drop-head",
			"x-message-ttl":      int32(60000),
		},
	)
	if err != nil {
		return err
	}

	err = channel.QueueBind(
		g.queueName,
		"",
		rabbitmq.ExchangeName,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	msgs, err := channel.Consume(
		g.queueName,
		"",
		false,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	for i := 0; i < workerCount; i++ {
		go g.worker(i)
	}

	go g.consumeMessages(msgs)
	go g.run()
	go g.monitor()

	log.Printf("WebSocket gateway started with queue: %s, workers: %d", g.queueName, workerCount)
	return nil
}

func (g *Gateway) consumeMessages(msgs <-chan amqp.Delivery) {
	for msg := range msgs {
		select {
		case g.broadcast <- msg:
		default:
			atomic.AddUint64(&g.dropCount, 1)
			msg.Nack(false, false)
		}
	}
}

func (g *Gateway) worker(id int) {
	for msg := range g.broadcast {
		g.processMessage(&msg)
		msg.Ack(false)
		atomic.AddUint64(&g.msgCount, 1)
	}
}

func (g *Gateway) processMessage(msg *amqp.Delivery) {
	var marketMsg types.MarketMessage
	if err := json.Unmarshal(msg.Body, &marketMsg); err != nil {
		return
	}

	g.updateCache(&marketMsg)

	g.mu.RLock()
	clients := make([]*Client, 0, len(g.clients))
	for _, client := range g.clients {
		clients = append(clients, client)
	}
	g.mu.RUnlock()

	var wg sync.WaitGroup
	batchSize := len(clients) / workerCount
	if batchSize < 1 {
		batchSize = 1
	}

	for i := 0; i < len(clients); i += batchSize {
		end := i + batchSize
		if end > len(clients) {
			end = len(clients)
		}
		wg.Add(1)
		go func(clients []*Client) {
			defer wg.Done()
			for _, client := range clients {
				client.forwardMessage(msg.Body, &marketMsg)
			}
		}(clients[i:end])
	}
	wg.Wait()
}

func (g *Gateway) updateCache(marketMsg *types.MarketMessage) {
	switch marketMsg.Type {
	case "kline":
		var kline types.Kline
		if err := json.Unmarshal(marketMsg.Data, &kline); err == nil {
			g.cache.AddKline(&kline)
		}
	case "trade":
		var trade types.Trade
		if err := json.Unmarshal(marketMsg.Data, &trade); err == nil {
			g.cache.AddTrade(&trade)
		}
	case "orderbook":
		var ob types.OrderBook
		if err := json.Unmarshal(marketMsg.Data, &ob); err == nil {
			g.cache.AddOrderBook(&ob)
		}
	case "snapshot":
		var snap types.MarketSnapshot
		if err := json.Unmarshal(marketMsg.Data, &snap); err == nil {
			g.cache.AddSnapshot(&snap)
		}
	}
}

func (g *Gateway) run() {
	for {
		select {
		case client := <-g.register:
			g.mu.Lock()
			g.clients[client.id] = client
			g.mu.Unlock()
			log.Printf("Client connected: %s, total: %d", client.id, len(g.clients))

			go g.sendCachedData(client)

		case client := <-g.unregister:
			g.mu.Lock()
			if _, ok := g.clients[client.id]; ok {
				client.disconnectAt = time.Now().UnixMilli()
				delete(g.clients, client.id)
				close(client.send)
				log.Printf("Client disconnected: %s, total: %d", client.id, len(g.clients))
			}
			g.mu.Unlock()
		}
	}
}

func (g *Gateway) sendCachedData(client *Client) {
	client.mu.RLock()
	subscribed := make([]string, 0, len(client.subscribed))
	for s := range client.subscribed {
		subscribed = append(subscribed, s)
	}
	client.mu.RUnlock()

	since := client.disconnectAt
	if since == 0 {
		since = time.Now().Add(-5 * time.Minute).UnixMilli()
	}

	for _, symbol := range subscribed {
		klines := g.cache.GetRecentKlines(symbol, since)
		for _, kline := range klines {
			data, _ := json.Marshal(kline)
			msg := types.MarketMessage{
				Type: "kline",
				Data: data,
			}
			msgBytes, _ := json.Marshal(msg)
			select {
			case client.send <- msgBytes:
			default:
			}
		}

		trades := g.cache.GetRecentTrades(symbol, since)
		for _, trade := range trades {
			data, _ := json.Marshal(trade)
			msg := types.MarketMessage{
				Type: "trade",
				Data: data,
			}
			msgBytes, _ := json.Marshal(msg)
			select {
			case client.send <- msgBytes:
			default:
			}
		}
	}
}

func (g *Gateway) monitor() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		msgCount := atomic.SwapUint64(&g.msgCount, 0)
		dropCount := atomic.SwapUint64(&g.dropCount, 0)
		queueLen := len(g.broadcast)
		g.mu.RLock()
		clientCount := len(g.clients)
		g.mu.RUnlock()

		log.Printf("Gateway stats - clients: %d, queue: %d/%d, processed: %d, dropped: %d",
			clientCount, queueLen, cap(g.broadcast), msgCount, dropCount)
	}
}

func (c *Client) forwardMessage(message []byte, marketMsg *types.MarketMessage) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	switch marketMsg.Type {
	case "kline":
		var kline types.Kline
		if err := json.Unmarshal(marketMsg.Data, &kline); err == nil {
			if !c.subscribed[kline.Symbol] {
				return
			}
		}
	case "trade":
		var trade types.Trade
		if err := json.Unmarshal(marketMsg.Data, &trade); err == nil {
			if !c.subscribed[trade.Symbol] {
				return
			}
		}
	case "orderbook":
		var ob types.OrderBook
		if err := json.Unmarshal(marketMsg.Data, &ob); err == nil {
			if !c.subscribed[ob.Symbol] {
				return
			}
		}
	case "snapshot":
		var snap types.MarketSnapshot
		if err := json.Unmarshal(marketMsg.Data, &snap); err == nil {
			if !c.subscribed[snap.Symbol] {
				return
			}
		}
	}

	select {
	case c.send <- message:
	default:
	}
}

func (c *Client) readPump() {
	defer func() {
		c.gateway.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(8192)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		atomic.StoreInt64(&c.lastActive, time.Now().UnixMilli())
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		atomic.StoreInt64(&c.lastActive, time.Now().UnixMilli())
		c.handleMessage(message)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

			n := len(c.send)
			for i := 0; i < n && i < 10; i++ {
				select {
				case msg := <-c.send:
					if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
						return
					}
				default:
					break
				}
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(rawMsg []byte) {
	var wsMsg types.WSMessage
	if err := json.Unmarshal(rawMsg, &wsMsg); err != nil {
		log.Printf("Failed to parse message: %v", err)
		return
	}

	switch wsMsg.Action {
	case "subscribe":
		c.subscribe(wsMsg.Symbol)
	case "unsubscribe":
		c.unsubscribe(wsMsg.Symbol)
	case "subscribe_all":
		c.subscribeAll()
	case "unsubscribe_all":
		c.unsubscribeAll()
	case "get_history":
		c.sendHistory(wsMsg.Symbol, wsMsg.Interval)
	case "get_recent":
		c.sendRecent(wsMsg.Symbol)
	}
}

func (c *Client) subscribe(symbol string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.subscribed[symbol] = true

	resp := types.WSSubscribeResponse{
		Type:    "subscribed",
		Success: true,
		Message: "Subscribed to " + symbol,
	}
	data, _ := json.Marshal(resp)

	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) unsubscribe(symbol string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.subscribed, symbol)

	resp := types.WSSubscribeResponse{
		Type:    "unsubscribed",
		Success: true,
		Message: "Unsubscribed from " + symbol,
	}
	data, _ := json.Marshal(resp)

	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) subscribeAll() {
	c.mu.Lock()
	defer c.mu.Unlock()

	symbols := []string{"BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"}
	for _, s := range symbols {
		c.subscribed[s] = true
	}

	resp := types.WSSubscribeResponse{
		Type:    "subscribed",
		Success: true,
		Message: "Subscribed to all symbols",
	}
	data, _ := json.Marshal(resp)

	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) unsubscribeAll() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.subscribed = make(map[string]bool)

	resp := types.WSSubscribeResponse{
		Type:    "unsubscribed",
		Success: true,
		Message: "Unsubscribed from all symbols",
	}
	data, _ := json.Marshal(resp)

	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) sendHistory(symbol, interval string) {
	if symbol == "" {
		symbol = "BTCUSDT"
	}
	if interval == "" {
		interval = "1m"
	}

	klines, err := c.gateway.db.GetKlines(c.gateway.rmq.Channel().Context(), symbol, interval, 200)
	if err != nil {
		log.Printf("Failed to get history: %v", err)
		return
	}

	data, _ := json.Marshal(klines)
	historyMsg := map[string]interface{}{
		"type": "history",
		"data": data,
	}
	msgBytes, _ := json.Marshal(historyMsg)

	select {
	case c.send <- msgBytes:
	default:
	}
}

func (c *Client) sendRecent(symbol string) {
	if symbol == "" {
		symbol = "BTCUSDT"
	}

	since := time.Now().Add(-5 * time.Minute).UnixMilli()
	klines := c.gateway.cache.GetRecentKlines(symbol, since)
	trades := c.gateway.cache.GetRecentTrades(symbol, since)

	result := map[string]interface{}{
		"type":   "recent",
		"symbol": symbol,
		"klines": klines,
		"trades": trades,
	}
	msgBytes, _ := json.Marshal(result)

	select {
	case c.send <- msgBytes:
	default:
	}
}

func (g *Gateway) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &Client{
		id:         uuid.New().String(),
		conn:       conn,
		gateway:    g,
		subscribed: make(map[string]bool),
		send:       make(chan []byte, clientSendBuffer),
		lastActive: time.Now().UnixMilli(),
	}

	g.register <- client

	go client.writePump()
	client.readPump()
}
