package market

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"marketdata/internal/database"
	"marketdata/internal/rabbitmq"
	"marketdata/internal/types"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
)

var symbols = []string{"BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"}

const (
	orderBookDepth = 10
	snapshotInterval = 5 * time.Second
)

type Simulator struct {
	rmq           *rabbitmq.Connection
	db            *database.DB
	prices        map[string]float64
	klines        map[string]*types.Kline
	orderBooks    map[string]*types.OrderBook
	dailyStats    map[string]*dailyStat
	mu            sync.RWMutex
	interval      string
	exportDir     string
}

type dailyStat struct {
	openPrice   float64
	highPrice   float64
	lowPrice    float64
	volume      float64
	quoteVolume float64
}

func NewSimulator(rmq *rabbitmq.Connection, db *database.DB, exportDir string) *Simulator {
	if exportDir == "" {
		exportDir = "./exports"
	}

	sim := &Simulator{
		rmq:        rmq,
		db:         db,
		prices:     make(map[string]float64),
		klines:     make(map[string]*types.Kline),
		orderBooks: make(map[string]*types.OrderBook),
		dailyStats: make(map[string]*dailyStat),
		interval:   "1m",
		exportDir:  exportDir,
	}

	initialPrices := map[string]float64{
		"BTCUSDT": 65000.0,
		"ETHUSDT": 3500.0,
		"BNBUSDT": 580.0,
		"SOLUSDT": 145.0,
		"XRPUSDT": 0.52,
	}

	for _, s := range symbols {
		sim.prices[s] = initialPrices[s]
		sim.initOrderBook(s)
	}

	return sim
}

func (s *Simulator) initOrderBook(symbol string) {
	price := s.prices[symbol]
	bids := make([]types.OrderBookEntry, orderBookDepth)
	asks := make([]types.OrderBookEntry, orderBookDepth)

	for i := 0; i < orderBookDepth; i++ {
		bidPrice := price * (1 - float64(i+1)*0.0005)
		askPrice := price * (1 + float64(i+1)*0.0005)
		bids[i] = types.OrderBookEntry{
			Price:    bidPrice,
			Quantity: rand.Float64()*5 + 0.5,
		}
		asks[i] = types.OrderBookEntry{
			Price:    askPrice,
			Quantity: rand.Float64()*5 + 0.5,
		}
	}

	s.orderBooks[symbol] = &types.OrderBook{
		Symbol:     symbol,
		Bids:       bids,
		Asks:       asks,
		LastUpdate: time.Now().UnixMilli(),
	}

	s.dailyStats[symbol] = &dailyStat{
		openPrice: price,
		highPrice: price,
		lowPrice:  price,
	}
}

func (s *Simulator) LoadSnapshots(ctx context.Context) error {
	if s.db == nil {
		log.Println("No database configured, skipping snapshot loading")
		return nil
	}

	snapshots, err := s.db.GetAllMarketSnapshots(ctx)
	if err != nil {
		log.Printf("Failed to load snapshots: %v, using default prices", err)
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for symbol, snap := range snapshots {
		if _, exists := s.prices[symbol]; exists {
			s.prices[symbol] = snap.LastPrice
			s.dailyStats[symbol] = &dailyStat{
				openPrice:   snap.OpenPrice,
				highPrice:   snap.HighPrice,
				lowPrice:    snap.LowPrice,
				volume:      snap.Volume,
				quoteVolume: snap.QuoteVolume,
			}
			log.Printf("Loaded snapshot for %s: price=%.2f", symbol, snap.LastPrice)
		}
	}

	return nil
}

func (s *Simulator) Start(ctx context.Context) {
	log.Println("Starting market data simulator...")

	if err := s.LoadSnapshots(ctx); err != nil {
		log.Printf("Warning: failed to load snapshots: %v", err)
	}

	tradeTicker := time.NewTicker(200 * time.Millisecond)
	klineTicker := time.NewTicker(1 * time.Minute)
	orderBookTicker := time.NewTicker(500 * time.Millisecond)
	snapshotTicker := time.NewTicker(snapshotInterval)

	go func() {
		for {
			select {
			case <-ctx.Done():
				tradeTicker.Stop()
				klineTicker.Stop()
				orderBookTicker.Stop()
				snapshotTicker.Stop()
				return
			case <-tradeTicker.C:
				s.generateTrades(ctx)
			case <-klineTicker.C:
				s.rotateKlines(ctx)
			case <-orderBookTicker.C:
				s.updateOrderBooks(ctx)
			case <-snapshotTicker.C:
				s.saveSnapshots(ctx)
			}
		}
	}()
}

func (s *Simulator) generateTrades(ctx context.Context) {
	for _, symbol := range symbols {
		s.mu.Lock()
		price := s.prices[symbol]
		change := (rand.Float64() - 0.5) * 0.001
		newPrice := price * (1 + change)
		s.prices[symbol] = newPrice

		trade := &types.Trade{
			Symbol:       symbol,
			Price:        newPrice,
			Quantity:     rand.Float64() * 5,
			TradeTime:    time.Now().UnixMilli(),
			IsBuyerMaker: rand.Float64() > 0.5,
			TradeID:      uuid.New().String(),
		}

		s.updateKline(symbol, newPrice, trade.Quantity)
		s.updateDailyStats(symbol, newPrice, trade.Quantity)
		s.mu.Unlock()

		s.publishTrade(ctx, trade)

		if s.db != nil {
			go func(t *types.Trade) {
				if err := s.db.SaveTrade(ctx, t); err != nil {
					log.Printf("Failed to save trade: %v", err)
				}
			}(trade)
		}
	}
}

func (s *Simulator) updateKline(symbol string, price float64, volume float64) {
	now := time.Now()
	openTime := now.Truncate(time.Minute).UnixMilli()
	closeTime := openTime + 60000 - 1

	key := symbol + "_" + s.interval

	kline, exists := s.klines[key]
	if !exists || kline.OpenTime != openTime {
		kline = &types.Kline{
			Symbol:    symbol,
			Interval:  s.interval,
			OpenTime:  openTime,
			Open:      price,
			High:      price,
			Low:       price,
			Close:     price,
			Volume:    0,
			CloseTime: closeTime,
		}
		s.klines[key] = kline
	}

	if price > kline.High {
		kline.High = price
	}
	if price < kline.Low {
		kline.Low = price
	}
	kline.Close = price
	kline.Volume += volume
}

func (s *Simulator) updateDailyStats(symbol string, price float64, volume float64) {
	stats := s.dailyStats[symbol]
	if price > stats.highPrice {
		stats.highPrice = price
	}
	if price < stats.lowPrice {
		stats.lowPrice = price
	}
	stats.volume += volume
	stats.quoteVolume += price * volume
}

func (s *Simulator) rotateKlines(ctx context.Context) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, kline := range s.klines {
		s.publishKline(ctx, kline)

		if s.db != nil {
			go func(k *types.Kline) {
				if err := s.db.SaveKline(ctx, k); err != nil {
					log.Printf("Failed to save kline: %v", err)
				}
			}(kline)
		}
	}
}

func (s *Simulator) updateOrderBooks(ctx context.Context) {
	for _, symbol := range symbols {
		s.mu.Lock()
		ob := s.orderBooks[symbol]
		price := s.prices[symbol]

		for i := range ob.Bids {
			bidPrice := price * (1 - float64(i+1)*0.0005)
			ob.Bids[i].Price = bidPrice
			ob.Bids[i].Quantity = ob.Bids[i].Quantity*(0.9+rand.Float64()*0.2) + rand.Float64()*0.5
		}

		for i := range ob.Asks {
			askPrice := price * (1 + float64(i+1)*0.0005)
			ob.Asks[i].Price = askPrice
			ob.Asks[i].Quantity = ob.Asks[i].Quantity*(0.9+rand.Float64()*0.2) + rand.Float64()*0.5
		}

		ob.LastUpdate = time.Now().UnixMilli()
		obCopy := *ob
		s.mu.Unlock()

		s.publishOrderBook(ctx, &obCopy)

		if s.db != nil && rand.Float64() < 0.1 {
			go func(o *types.OrderBook) {
				if err := s.db.SaveOrderBook(ctx, o); err != nil {
					log.Printf("Failed to save orderbook: %v", err)
				}
			}(&obCopy)
		}
	}
}

func (s *Simulator) saveSnapshots(ctx context.Context) {
	if s.db == nil {
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, symbol := range symbols {
		price := s.prices[symbol]
		stats := s.dailyStats[symbol]
		priceChange := price - stats.openPrice
		changePercent := (priceChange / stats.openPrice) * 100

		snapshot := &types.MarketSnapshot{
			Symbol:        symbol,
			LastPrice:     price,
			OpenPrice:     stats.openPrice,
			HighPrice:     stats.highPrice,
			LowPrice:      stats.lowPrice,
			Volume:        stats.volume,
			QuoteVolume:   stats.quoteVolume,
			PriceChange:   priceChange,
			ChangePercent: changePercent,
			Timestamp:     time.Now().UnixMilli(),
		}

		go func(snap *types.MarketSnapshot) {
			if err := s.db.SaveMarketSnapshot(ctx, snap); err != nil {
				log.Printf("Failed to save snapshot for %s: %v", snap.Symbol, err)
			}
		}(snapshot)

		s.publishSnapshot(ctx, snapshot)
	}
}

func (s *Simulator) ExportTrades(ctx context.Context, symbol, format string, startTime, endTime int64) (string, int, error) {
	if s.db == nil {
		return "", 0, fmt.Errorf("database not configured")
	}

	if startTime == 0 {
		startTime = time.Now().Add(-24 * time.Hour).UnixMilli()
	}
	if endTime == 0 {
		endTime = time.Now().UnixMilli()
	}

	var filePath string
	var count int
	var err error

	switch format {
	case "csv":
		filePath, count, err = s.db.ExportTradesToCSV(ctx, symbol, startTime, endTime, s.exportDir)
	case "json":
		filePath, count, err = s.db.ExportTradesToJSON(ctx, symbol, startTime, endTime, s.exportDir)
	default:
		return "", 0, fmt.Errorf("unsupported format: %s", format)
	}

	return filePath, count, err
}

func (s *Simulator) publishTrade(ctx context.Context, trade *types.Trade) {
	data, err := json.Marshal(trade)
	if err != nil {
		log.Printf("Failed to marshal trade: %v", err)
		return
	}

	msg := types.MarketMessage{
		Type: "trade",
		Data: data,
	}

	body, _ := json.Marshal(msg)
	s.publishMessage(ctx, body)
}

func (s *Simulator) publishKline(ctx context.Context, kline *types.Kline) {
	data, err := json.Marshal(kline)
	if err != nil {
		log.Printf("Failed to marshal kline: %v", err)
		return
	}

	msg := types.MarketMessage{
		Type: "kline",
		Data: data,
	}

	body, _ := json.Marshal(msg)
	s.publishMessage(ctx, body)
}

func (s *Simulator) publishOrderBook(ctx context.Context, ob *types.OrderBook) {
	data, err := json.Marshal(ob)
	if err != nil {
		log.Printf("Failed to marshal orderbook: %v", err)
		return
	}

	msg := types.MarketMessage{
		Type: "orderbook",
		Data: data,
	}

	body, _ := json.Marshal(msg)
	s.publishMessage(ctx, body)
}

func (s *Simulator) publishSnapshot(ctx context.Context, snapshot *types.MarketSnapshot) {
	data, err := json.Marshal(snapshot)
	if err != nil {
		log.Printf("Failed to marshal snapshot: %v", err)
		return
	}

	msg := types.MarketMessage{
		Type: "snapshot",
		Data: data,
	}

	body, _ := json.Marshal(msg)
	s.publishMessage(ctx, body)
}

func (s *Simulator) publishMessage(ctx context.Context, body []byte) {
	channel := s.rmq.Channel()
	if channel == nil || channel.IsClosed() {
		return
	}

	err := channel.PublishWithContext(
		ctx,
		rabbitmq.ExchangeName,
		"",
		false,
		false,
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)
	if err != nil {
		log.Printf("Failed to publish message: %v", err)
	}
}

func (s *Simulator) GetCurrentKline(symbol string) *types.Kline {
	s.mu.RLock()
	defer s.mu.RUnlock()

	key := symbol + "_" + s.interval
	return s.klines[key]
}

func (s *Simulator) GetOrderBook(symbol string) *types.OrderBook {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ob := s.orderBooks[symbol]
	if ob == nil {
		return nil
	}

	obCopy := *ob
	obCopy.Bids = make([]types.OrderBookEntry, len(ob.Bids))
	obCopy.Asks = make([]types.OrderBookEntry, len(ob.Asks))
	copy(obCopy.Bids, ob.Bids)
	copy(obCopy.Asks, ob.Asks)
	return &obCopy
}

func (s *Simulator) GetSnapshot(symbol string) *types.MarketSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	price := s.prices[symbol]
	stats := s.dailyStats[symbol]
	priceChange := price - stats.openPrice
	changePercent := (priceChange / stats.openPrice) * 100

	return &types.MarketSnapshot{
		Symbol:        symbol,
		LastPrice:     price,
		OpenPrice:     stats.openPrice,
		HighPrice:     stats.highPrice,
		LowPrice:      stats.lowPrice,
		Volume:        stats.volume,
		QuoteVolume:   stats.quoteVolume,
		PriceChange:   priceChange,
		ChangePercent: changePercent,
		Timestamp:     time.Now().UnixMilli(),
	}
}

func GetSymbols() []string {
	return symbols
}

func SortBids(bids []types.OrderBookEntry) {
	sort.Slice(bids, func(i, j int) bool {
		return bids[i].Price > bids[j].Price
	})
}

func SortAsks(asks []types.OrderBookEntry) {
	sort.Slice(asks, func(i, j int) bool {
		return asks[i].Price < asks[j].Price
	})
}
