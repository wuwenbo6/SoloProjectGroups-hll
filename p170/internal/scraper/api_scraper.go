package scraper

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"stun-turn-monitor/internal/config"
)

type APIScraper struct {
	name   string
	url    string
	client *http.Client
}

func NewAPIScraper(cfg config.StunServer) *APIScraper {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	return &APIScraper{
		name: cfg.Name,
		url:  cfg.APIURL,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

type APIResponse struct {
	SessionCount   int64            `json:"session_count"`
	TotalBytesIn   int64            `json:"total_bytes_in"`
	TotalBytesOut  int64            `json:"total_bytes_out"`
	IPDistribution map[string]int64 `json:"ip_distribution"`
}

func (s *APIScraper) Scrape() (*Metrics, error) {
	resp, err := s.client.Get(s.url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch metrics: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var apiResp APIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &Metrics{
		ServerName:     s.name,
		Timestamp:      time.Now(),
		SessionCount:   apiResp.SessionCount,
		TotalBytesIn:   apiResp.TotalBytesIn,
		TotalBytesOut:  apiResp.TotalBytesOut,
		IPDistribution: apiResp.IPDistribution,
	}, nil
}

func (s *APIScraper) Name() string {
	return s.name
}
