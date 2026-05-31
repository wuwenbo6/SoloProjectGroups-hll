package types

import "encoding/json"

type Kline struct {
	Symbol    string  `json:"symbol"`
	Interval  string  `json:"interval"`
	OpenTime  int64   `json:"openTime"`
	Open      float64 `json:"open"`
	High      float64 `json:"high"`
	Low       float64 `json:"low"`
	Close     float64 `json:"close"`
	Volume    float64 `json:"volume"`
	CloseTime int64   `json:"closeTime"`
}

type Trade struct {
	Symbol       string  `json:"symbol"`
	Price        float64 `json:"price"`
	Quantity     float64 `json:"quantity"`
	TradeTime    int64   `json:"tradeTime"`
	IsBuyerMaker bool    `json:"isBuyerMaker"`
	TradeID      string  `json:"tradeId,omitempty"`
}

type OrderBookEntry struct {
	Price    float64 `json:"price"`
	Quantity float64 `json:"quantity"`
}

type OrderBook struct {
	Symbol      string           `json:"symbol"`
	Bids        []OrderBookEntry `json:"bids"`
	Asks        []OrderBookEntry `json:"asks"`
	LastUpdate  int64            `json:"lastUpdate"`
}

type MarketSnapshot struct {
	Symbol       string  `json:"symbol"`
	LastPrice    float64 `json:"lastPrice"`
	OpenPrice    float64 `json:"openPrice"`
	HighPrice    float64 `json:"highPrice"`
	LowPrice     float64 `json:"lowPrice"`
	Volume       float64 `json:"volume"`
	QuoteVolume  float64 `json:"quoteVolume"`
	PriceChange  float64 `json:"priceChange"`
	ChangePercent float64 `json:"changePercent"`
	Timestamp    int64   `json:"timestamp"`
}

type MarketMessage struct {
	Type  string          `json:"type"`
	Data  json.RawMessage `json:"data"`
}

type WSMessage struct {
	Action   string   `json:"action"`
	Symbol   string   `json:"symbol,omitempty"`
	Symbols  []string `json:"symbols,omitempty"`
	Interval string   `json:"interval,omitempty"`
	Format   string   `json:"format,omitempty"`
	StartTime int64   `json:"startTime,omitempty"`
	EndTime   int64   `json:"endTime,omitempty"`
}

type WSSubscribeResponse struct {
	Type    string `json:"type"`
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

type ExportRequest struct {
	Symbol    string `json:"symbol"`
	Format    string `json:"format"`
	StartTime int64  `json:"startTime"`
	EndTime   int64  `json:"endTime"`
}

type ExportResponse struct {
	Type     string `json:"type"`
	Success  bool   `json:"success"`
	Message  string `json:"message,omitempty"`
	FilePath string `json:"filePath,omitempty"`
	Format   string `json:"format,omitempty"`
	Count    int    `json:"count,omitempty"`
}
