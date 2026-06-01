package scraper

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"sync"
	"time"

	"stun-turn-monitor/internal/config"
	"stun-turn-monitor/internal/timeparser"
)

type LogScraper struct {
	name        string
	logPath     string
	lastOffset  int64
	lastModTime time.Time
	mu          sync.Mutex

	sessionCount   int64
	totalBytesIn   int64
	totalBytesOut  int64
	ipDistribution map[string]int64

	lastTimestamp time.Time
}

var (
	sessionRegex = regexp.MustCompile(`session (\d+) created`)
	bytesRegex   = regexp.MustCompile(`bytes_in=(\d+).*bytes_out=(\d+)`)
	ipRegex      = regexp.MustCompile(`client\s+(\d+\.\d+\.\d+\.\d+)`)
	timeRegex    = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)`)
)

func NewLogScraper(cfg config.StunServer) *LogScraper {
	return &LogScraper{
		name:           cfg.Name,
		logPath:        cfg.LogPath,
		ipDistribution: make(map[string]int64),
	}
}

func (s *LogScraper) Scrape() (*Metrics, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	fileInfo, err := os.Stat(s.logPath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat log file: %w", err)
	}

	if fileInfo.Size() < s.lastOffset {
		s.lastOffset = 0
		s.sessionCount = 0
		s.totalBytesIn = 0
		s.totalBytesOut = 0
		s.ipDistribution = make(map[string]int64)
		s.lastTimestamp = time.Time{}
	}

	s.lastModTime = fileInfo.ModTime()

	file, err := os.Open(s.logPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open log file: %w", err)
	}
	defer file.Close()

	if _, err := file.Seek(s.lastOffset, 0); err != nil {
		return nil, fmt.Errorf("failed to seek log file: %w", err)
	}

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	var latestTimestamp time.Time

	for scanner.Scan() {
		line := scanner.Text()

		if matches := timeRegex.FindStringSubmatch(line); len(matches) > 1 {
			if t, err := timeparser.Parse(matches[1]); err == nil {
				latestTimestamp = t
			}
		}

		s.parseLine(line)
		s.lastOffset += int64(len(line) + 1)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("failed to scan log file: %w", err)
	}

	if !latestTimestamp.IsZero() {
		s.lastTimestamp = latestTimestamp
	}

	timestamp := s.lastTimestamp
	if timestamp.IsZero() {
		timestamp = time.Now()
	}

	ipCopy := make(map[string]int64)
	for k, v := range s.ipDistribution {
		ipCopy[k] = v
	}

	return &Metrics{
		ServerName:     s.name,
		Timestamp:      timestamp,
		SessionCount:   s.sessionCount,
		TotalBytesIn:   s.totalBytesIn,
		TotalBytesOut:  s.totalBytesOut,
		IPDistribution: ipCopy,
	}, nil
}

func (s *LogScraper) parseLine(line string) {
	if matches := sessionRegex.FindStringSubmatch(line); len(matches) > 1 {
		s.sessionCount++
	}

	if matches := bytesRegex.FindStringSubmatch(line); len(matches) > 2 {
		var in, out int64
		fmt.Sscanf(matches[1], "%d", &in)
		fmt.Sscanf(matches[2], "%d", &out)
		s.totalBytesIn += in
		s.totalBytesOut += out
	}

	if matches := ipRegex.FindStringSubmatch(line); len(matches) > 1 {
		ip := matches[1]
		s.ipDistribution[ip]++
	}
}

func (s *LogScraper) Name() string {
	return s.name
}

func extractTimestamp(line string) (time.Time, bool) {
	patterns := []string{
		`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?`,
		`\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2}\s+[+-]\d{4}`,
		`\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2}`,
		`\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}:\d{2}`,
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		matches := re.FindString(line)
		if matches != "" {
			if t, err := timeparser.Parse(matches); err == nil {
				return t, true
			}
		}
	}

	return time.Time{}, false
}
