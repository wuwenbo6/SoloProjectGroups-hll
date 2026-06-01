package doh

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/miekg/dns"

	"dns-proxy/resolver"
)

type DoHClient struct {
	resolver.BaseUpstream
	Endpoint   string
	HTTPClient *http.Client
}

func NewDoHClient(name, endpoint string, timeout time.Duration) *DoHClient {
	c := &DoHClient{
		Endpoint: endpoint,
		HTTPClient: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		},
	}
	c.SetName(name)
	c.SetHealthy(true)
	return c
}

func (c *DoHClient) Type() string { return "DoH" }

func (c *DoHClient) Query(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	if req == nil {
		return nil, fmt.Errorf("nil DNS request")
	}

	packed, err := req.Pack()
	if err != nil {
		return nil, fmt.Errorf("failed to pack DNS request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.Endpoint, bytes.NewReader(packed))
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/dns-message")
	httpReq.Header.Set("Accept", "application/dns-message")
	httpReq.Header.Set("User-Agent", "dns-proxy/1.0")

	resp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("DoH request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DoH returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read DoH response: %w", err)
	}

	dnsResp := new(dns.Msg)
	if err := dnsResp.Unpack(body); err != nil {
		return nil, fmt.Errorf("failed to unpack DNS response: %w", err)
	}

	dnsResp.Id = req.Id

	return dnsResp, nil
}
