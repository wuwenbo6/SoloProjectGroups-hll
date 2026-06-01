package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"stun-turn-monitor/internal/scraper"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
)

const (
	measurementSession = "stun_session"
	measurementTraffic = "stun_traffic"
	measurementIP      = "stun_ip_distribution"
)

type Store struct {
	client    influxdb2.Client
	writeAPI  api.WriteAPI
	queryAPI  api.QueryAPI
	org       string
	bucket    string

	mu          sync.RWMutex
	latestCache map[string]*scraper.Metrics
}

func New(url, token, org, bucket string) *Store {
	client := influxdb2.NewClient(url, token)
	writeAPI := client.WriteAPI(org, bucket)
	queryAPI := client.QueryAPI(org)

	store := &Store{
		client:      client,
		writeAPI:    writeAPI,
		queryAPI:    queryAPI,
		org:         org,
		bucket:      bucket,
		latestCache: make(map[string]*scraper.Metrics),
	}

	go store.listenForWriteErrors()

	return store
}

func (s *Store) listenForWriteErrors() {
	for err := range s.writeAPI.Errors() {
		log.Printf("InfluxDB write error: %v", err)
	}
}

func (s *Store) Add(m *scraper.Metrics) {
	s.mu.Lock()
	s.latestCache[m.ServerName] = m
	s.mu.Unlock()

	p := influxdb2.NewPointWithMeasurement(measurementSession).
		AddTag("server", m.ServerName).
		AddField("session_count", m.SessionCount).
		SetTime(m.Timestamp)
	s.writeAPI.WritePoint(p)

	p2 := influxdb2.NewPointWithMeasurement(measurementTraffic).
		AddTag("server", m.ServerName).
		AddField("bytes_in", m.TotalBytesIn).
		AddField("bytes_out", m.TotalBytesOut).
		SetTime(m.Timestamp)
	s.writeAPI.WritePoint(p2)

	for ip, count := range m.IPDistribution {
		p3 := influxdb2.NewPointWithMeasurement(measurementIP).
			AddTag("server", m.ServerName).
			AddTag("ip", ip).
			AddField("count", count).
			SetTime(m.Timestamp)
		s.writeAPI.WritePoint(p3)
	}
}

func (s *Store) Get(serverName string, start, end time.Time) []*scraper.Metrics {
	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
		|> range(start: time(v: "%s"), stop: time(v: "%s"))
		|> filter(fn: (r) => r._measurement == "%s" and r.server == "%s")
		|> keep(columns: ["_time", "session_count"])
		|> sort(columns: ["_time"], desc: false)
	`, s.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), measurementSession, serverName)

	result, err := s.queryAPI.Query(context.Background(), fluxQuery)
	if err != nil {
		log.Printf("InfluxDB query error: %v", err)
		return s.getFromCache(serverName, start, end)
	}

	var metrics []*scraper.Metrics
	sessionMap := make(map[time.Time]int64)

	for result.Next() {
		if result.Record() != nil {
			t := result.Record().Time()
			val := result.Record().Value()
			if v, ok := val.(int64); ok {
				sessionMap[t] = v
			} else if f, ok := val.(float64); ok {
				sessionMap[t] = int64(f)
			}
		}
	}

	if result.Err() != nil {
		log.Printf("InfluxDB query result error: %v", result.Err())
	}

	trafficQuery := fmt.Sprintf(`
		from(bucket: "%s")
		|> range(start: time(v: "%s"), stop: time(v: "%s"))
		|> filter(fn: (r) => r._measurement == "%s" and r.server == "%s")
		|> keep(columns: ["_time", "_field", "_value"])
		|> sort(columns: ["_time"], desc: false)
	`, s.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), measurementTraffic, serverName)

	trafficResult, err := s.queryAPI.Query(context.Background(), trafficQuery)
	if err != nil {
		log.Printf("InfluxDB query error: %v", err)
	}

	bytesInMap := make(map[time.Time]int64)
	bytesOutMap := make(map[time.Time]int64)

	if trafficResult != nil {
		for trafficResult.Next() {
			if trafficResult.Record() != nil {
				t := trafficResult.Record().Time()
				field := trafficResult.Record().Field()
				val := trafficResult.Record().Value()
				var v int64
				if iv, ok := val.(int64); ok {
					v = iv
				} else if fv, ok := val.(float64); ok {
					v = int64(fv)
				}
				switch field {
				case "bytes_in":
					bytesInMap[t] = v
				case "bytes_out":
					bytesOutMap[t] = v
				}
			}
		}
	}

	for t, sessionCount := range sessionMap {
		metrics = append(metrics, &scraper.Metrics{
			ServerName:    serverName,
			Timestamp:     t,
			SessionCount:  sessionCount,
			TotalBytesIn:  bytesInMap[t],
			TotalBytesOut: bytesOutMap[t],
		})
	}

	return metrics
}

func (s *Store) getFromCache(serverName string, start, end time.Time) []*scraper.Metrics {
	s.mu.RLock()
	defer s.mu.RUnlock()

	m, ok := s.latestCache[serverName]
	if !ok {
		return nil
	}
	if m.Timestamp.After(start) && m.Timestamp.Before(end) {
		return []*scraper.Metrics{m}
	}
	return nil
}

func (s *Store) GetLatest(serverName string) *scraper.Metrics {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if m, ok := s.latestCache[serverName]; ok {
		return m
	}

	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
		|> range(start: -1h)
		|> filter(fn: (r) => r._measurement == "%s" and r.server == "%s")
		|> keep(columns: ["_time", "session_count"])
		|> sort(columns: ["_time"], desc: true)
		|> limit(n: 1)
	`, s.bucket, measurementSession, serverName)

	result, err := s.queryAPI.Query(context.Background(), fluxQuery)
	if err != nil {
		log.Printf("InfluxDB query error: %v", err)
		return nil
	}

	if result.Next() && result.Record() != nil {
		m := &scraper.Metrics{
			ServerName: serverName,
			Timestamp:  result.Record().Time(),
		}
		if v, ok := result.Record().Value().(int64); ok {
			m.SessionCount = v
		} else if f, ok := result.Record().Value().(float64); ok {
			m.SessionCount = int64(f)
		}

		s.mu.Lock()
		s.latestCache[serverName] = m
		s.mu.Unlock()

		return m
	}

	return nil
}

func (s *Store) GetIPDistribution(serverName string, start, end time.Time) map[string]int64 {
	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
		|> range(start: time(v: "%s"), stop: time(v: "%s"))
		|> filter(fn: (r) => r._measurement == "%s" and r.server == "%s")
		|> keep(columns: ["ip", "count"])
		|> group(columns: ["ip"])
		|> sum(column: "count")
	`, s.bucket, start.Format(time.RFC3339), end.Format(time.RFC3339), measurementIP, serverName)

	result, err := s.queryAPI.Query(context.Background(), fluxQuery)
	if err != nil {
		log.Printf("InfluxDB query error: %v", err)
		return nil
	}

	ipDist := make(map[string]int64)
	for result.Next() {
		if result.Record() != nil {
			ip := result.Record().ValueByKey("ip")
			count := result.Record().Value()
			if ipStr, ok := ip.(string); ok {
				var c int64
				if iv, ok := count.(int64); ok {
					c = iv
				} else if fv, ok := count.(float64); ok {
					c = int64(fv)
				}
				ipDist[ipStr] = c
			}
		}
	}

	return ipDist
}

func (s *Store) ListServers() []string {
	fluxQuery := fmt.Sprintf(`
		from(bucket: "%s")
		|> range(start: -30d)
		|> keep(columns: ["server"])
		|> group()
		|> distinct(column: "server")
	`, s.bucket)

	result, err := s.queryAPI.Query(context.Background(), fluxQuery)
	if err != nil {
		log.Printf("InfluxDB query error: %v", err)
		s.mu.RLock()
		defer s.mu.RUnlock()
		servers := make([]string, 0, len(s.latestCache))
		for name := range s.latestCache {
			servers = append(servers, name)
		}
		return servers
	}

	var servers []string
	for result.Next() {
		if result.Record() != nil {
			if name, ok := result.Record().Value().(string); ok {
				servers = append(servers, name)
			}
		}
	}

	return servers
}

func (s *Store) GetAllLatest() map[string]*scraper.Metrics {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]*scraper.Metrics)
	for name, m := range s.latestCache {
		result[name] = m
	}
	return result
}

func (s *Store) Flush() {
	s.writeAPI.Flush()
}

func (s *Store) Close() {
	s.client.Close()
}

type InfluxPoint struct {
	Measurement string            `json:"measurement"`
	Tags        map[string]string `json:"tags"`
	Fields      map[string]interface{} `json:"fields"`
	Timestamp   time.Time         `json:"timestamp"`
}

func MarshalInfluxPoint(p *InfluxPoint) (string, error) {
	data, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func UnmarshalInfluxPoint(data string) (*InfluxPoint, error) {
	var p InfluxPoint
	err := json.Unmarshal([]byte(data), &p)
	if err != nil {
		return nil, err
	}
	return &p, nil
}
