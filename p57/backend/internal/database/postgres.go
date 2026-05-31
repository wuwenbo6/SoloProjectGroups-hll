package database

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"marketdata/internal/types"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	pool *pgxpool.Pool
}

func NewDB(url string) (*DB, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}

	config.MaxConns = 20
	config.MinConns = 5
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(context.Background()); err != nil {
		return nil, err
	}

	log.Println("PostgreSQL connected")
	return &DB{pool: pool}, nil
}

func (db *DB) SaveKline(ctx context.Context, kline *types.Kline) error {
	query := `
		INSERT INTO kline_data (symbol, interval, open_time, open, high, low, close, volume, close_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (symbol, interval, open_time) DO UPDATE
		SET open = EXCLUDED.open,
		    high = EXCLUDED.high,
		    low = EXCLUDED.low,
		    close = EXCLUDED.close,
		    volume = EXCLUDED.volume,
		    close_time = EXCLUDED.close_time
	`

	_, err := db.pool.Exec(ctx, query,
		kline.Symbol,
		kline.Interval,
		kline.OpenTime,
		kline.Open,
		kline.High,
		kline.Low,
		kline.Close,
		kline.Volume,
		kline.CloseTime,
	)
	return err
}

func (db *DB) GetKlines(ctx context.Context, symbol, interval string, limit int) ([]types.Kline, error) {
	query := `
		SELECT symbol, interval, open_time, open, high, low, close, volume, close_time
		FROM kline_data
		WHERE symbol = $1 AND interval = $2
		ORDER BY open_time DESC
		LIMIT $3
	`

	rows, err := db.pool.Query(ctx, query, symbol, interval, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var klines []types.Kline
	for rows.Next() {
		var k types.Kline
		err := rows.Scan(
			&k.Symbol, &k.Interval, &k.OpenTime,
			&k.Open, &k.High, &k.Low, &k.Close,
			&k.Volume, &k.CloseTime,
		)
		if err != nil {
			return nil, err
		}
		klines = append(klines, k)
	}

	for i, j := 0, len(klines)-1; i < j; i, j = i+1, j-1 {
		klines[i], klines[j] = klines[j], klines[i]
	}

	return klines, nil
}

func (db *DB) SaveTrade(ctx context.Context, trade *types.Trade) error {
	query := `
		INSERT INTO trade_data (symbol, price, quantity, trade_time, is_buyer_maker, trade_id)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err := db.pool.Exec(ctx, query,
		trade.Symbol,
		trade.Price,
		trade.Quantity,
		trade.TradeTime,
		trade.IsBuyerMaker,
		trade.TradeID,
	)
	return err
}

func (db *DB) GetTrades(ctx context.Context, symbol string, startTime, endTime int64, limit int) ([]types.Trade, error) {
	query := `
		SELECT symbol, price, quantity, trade_time, is_buyer_maker, trade_id
		FROM trade_data
		WHERE symbol = $1 AND trade_time >= $2 AND trade_time <= $3
		ORDER BY trade_time DESC
		LIMIT $4
	`

	rows, err := db.pool.Query(ctx, query, symbol, startTime, endTime, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var trades []types.Trade
	for rows.Next() {
		var t types.Trade
		err := rows.Scan(
			&t.Symbol, &t.Price, &t.Quantity,
			&t.TradeTime, &t.IsBuyerMaker, &t.TradeID,
		)
		if err != nil {
			return nil, err
		}
		trades = append(trades, t)
	}

	return trades, nil
}

func (db *DB) SaveOrderBook(ctx context.Context, ob *types.OrderBook) error {
	bidsJSON, err := json.Marshal(ob.Bids)
	if err != nil {
		return err
	}
	asksJSON, err := json.Marshal(ob.Asks)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO orderbook_snapshot (symbol, bids, asks, last_update)
		VALUES ($1, $2, $3, $4)
	`

	_, err = db.pool.Exec(ctx, query,
		ob.Symbol,
		bidsJSON,
		asksJSON,
		ob.LastUpdate,
	)
	return err
}

func (db *DB) GetLatestOrderBook(ctx context.Context, symbol string) (*types.OrderBook, error) {
	query := `
		SELECT symbol, bids, asks, last_update
		FROM orderbook_snapshot
		WHERE symbol = $1
		ORDER BY last_update DESC
		LIMIT 1
	`

	var ob types.OrderBook
	var bidsJSON, asksJSON []byte

	err := db.pool.QueryRow(ctx, query, symbol).Scan(
		&ob.Symbol, &bidsJSON, &asksJSON, &ob.LastUpdate,
	)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(bidsJSON, &ob.Bids); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(asksJSON, &ob.Asks); err != nil {
		return nil, err
	}

	return &ob, nil
}

func (db *DB) SaveMarketSnapshot(ctx context.Context, snapshot *types.MarketSnapshot) error {
	query := `
		INSERT INTO market_snapshot (
			symbol, last_price, open_price, high_price, low_price,
			volume, quote_volume, price_change, change_percent, timestamp
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (symbol) DO UPDATE
		SET last_price = EXCLUDED.last_price,
		    open_price = EXCLUDED.open_price,
		    high_price = EXCLUDED.high_price,
		    low_price = EXCLUDED.low_price,
		    volume = EXCLUDED.volume,
		    quote_volume = EXCLUDED.quote_volume,
		    price_change = EXCLUDED.price_change,
		    change_percent = EXCLUDED.change_percent,
		    timestamp = EXCLUDED.timestamp
	`

	_, err := db.pool.Exec(ctx, query,
		snapshot.Symbol,
		snapshot.LastPrice,
		snapshot.OpenPrice,
		snapshot.HighPrice,
		snapshot.LowPrice,
		snapshot.Volume,
		snapshot.QuoteVolume,
		snapshot.PriceChange,
		snapshot.ChangePercent,
		snapshot.Timestamp,
	)
	return err
}

func (db *DB) GetMarketSnapshot(ctx context.Context, symbol string) (*types.MarketSnapshot, error) {
	query := `
		SELECT symbol, last_price, open_price, high_price, low_price,
		       volume, quote_volume, price_change, change_percent, timestamp
		FROM market_snapshot
		WHERE symbol = $1
	`

	var s types.MarketSnapshot
	err := db.pool.QueryRow(ctx, query, symbol).Scan(
		&s.Symbol, &s.LastPrice, &s.OpenPrice, &s.HighPrice, &s.LowPrice,
		&s.Volume, &s.QuoteVolume, &s.PriceChange, &s.ChangePercent, &s.Timestamp,
	)
	if err != nil {
		return nil, err
	}

	return &s, nil
}

func (db *DB) GetAllMarketSnapshots(ctx context.Context) (map[string]*types.MarketSnapshot, error) {
	query := `
		SELECT symbol, last_price, open_price, high_price, low_price,
		       volume, quote_volume, price_change, change_percent, timestamp
		FROM market_snapshot
	`

	rows, err := db.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	snapshots := make(map[string]*types.MarketSnapshot)
	for rows.Next() {
		var s types.MarketSnapshot
		err := rows.Scan(
			&s.Symbol, &s.LastPrice, &s.OpenPrice, &s.HighPrice, &s.LowPrice,
			&s.Volume, &s.QuoteVolume, &s.PriceChange, &s.ChangePercent, &s.Timestamp,
		)
		if err != nil {
			return nil, err
		}
		snapshots[s.Symbol] = &s
	}

	return snapshots, nil
}

func (db *DB) ExportTradesToCSV(ctx context.Context, symbol string, startTime, endTime int64, exportDir string) (string, int, error) {
	trades, err := db.GetTrades(ctx, symbol, startTime, endTime, 100000)
	if err != nil {
		return "", 0, err
	}

	if err := os.MkdirAll(exportDir, 0755); err != nil {
		return "", 0, err
	}

	filename := fmt.Sprintf("trades_%s_%d_%d.csv",
		symbol,
		startTime/1000,
		endTime/1000,
	)
	filepath := filepath.Join(exportDir, filename)

	file, err := os.Create(filepath)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	header := []string{"Symbol", "Price", "Quantity", "TradeTime", "IsBuyerMaker", "TradeID"}
	if err := writer.Write(header); err != nil {
		return "", 0, err
	}

	for _, trade := range trades {
		row := []string{
			trade.Symbol,
			strconv.FormatFloat(trade.Price, 'f', 8, 64),
			strconv.FormatFloat(trade.Quantity, 'f', 8, 64),
			strconv.FormatInt(trade.TradeTime, 10),
			strconv.FormatBool(trade.IsBuyerMaker),
			trade.TradeID,
		}
		if err := writer.Write(row); err != nil {
			return "", 0, err
		}
	}

	return filepath, len(trades), nil
}

func (db *DB) ExportTradesToJSON(ctx context.Context, symbol string, startTime, endTime int64, exportDir string) (string, int, error) {
	trades, err := db.GetTrades(ctx, symbol, startTime, endTime, 100000)
	if err != nil {
		return "", 0, err
	}

	if err := os.MkdirAll(exportDir, 0755); err != nil {
		return "", 0, err
	}

	filename := fmt.Sprintf("trades_%s_%d_%d.json",
		symbol,
		startTime/1000,
		endTime/1000,
	)
	filepath := filepath.Join(exportDir, filename)

	data, err := json.MarshalIndent(trades, "", "  ")
	if err != nil {
		return "", 0, err
	}

	if err := os.WriteFile(filepath, data, 0644); err != nil {
		return "", 0, err
	}

	return filepath, len(trades), nil
}

func (db *DB) Close() {
	db.pool.Close()
}
