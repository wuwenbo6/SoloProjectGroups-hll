package config

import (
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server      ServerConfig   `yaml:"server"`
	InfluxDB    InfluxConfig   `yaml:"influxdb"`
	Alert       AlertConfig    `yaml:"alert"`
	StunServers []StunServer   `yaml:"stun_servers"`
	Frontend    FrontendConfig `yaml:"frontend"`
}

type AlertConfig struct {
	Enabled   bool          `yaml:"enabled"`
	MaxAlerts int           `yaml:"max_alerts"`
	Rules     []AlertRule   `yaml:"rules"`
}

type AlertRule struct {
	ServerName       string        `yaml:"server_name"`
	SessionThreshold int64         `yaml:"session_threshold"`
	Level            string        `yaml:"level"`
	Duration         time.Duration `yaml:"duration"`
	Cooldown         time.Duration `yaml:"cooldown"`
}

type ServerConfig struct {
	ListenAddr     string        `yaml:"listen_addr"`
	ScrapeInterval time.Duration `yaml:"scrape_interval"`
}

type InfluxConfig struct {
	URL    string `yaml:"url"`
	Token  string `yaml:"token"`
	Org    string `yaml:"org"`
	Bucket string `yaml:"bucket"`
}

type StunServer struct {
	Name    string        `yaml:"name"`
	Type    string        `yaml:"type"`
	APIURL  string        `yaml:"api_url,omitempty"`
	Timeout time.Duration `yaml:"timeout,omitempty"`
	LogPath string        `yaml:"log_path,omitempty"`
}

type FrontendConfig struct {
	Enable    bool   `yaml:"enable"`
	StaticDir string `yaml:"static_dir"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	if cfg.Server.ListenAddr == "" {
		cfg.Server.ListenAddr = ":8080"
	}
	if cfg.Server.ScrapeInterval == 0 {
		cfg.Server.ScrapeInterval = 10 * time.Second
	}
	if cfg.InfluxDB.URL == "" {
		cfg.InfluxDB.URL = "http://localhost:8086"
	}
	if cfg.InfluxDB.Token == "" {
		cfg.InfluxDB.Token = "my-token"
	}
	if cfg.InfluxDB.Org == "" {
		cfg.InfluxDB.Org = "my-org"
	}
	if cfg.InfluxDB.Bucket == "" {
		cfg.InfluxDB.Bucket = "stun-monitor"
	}
	if cfg.Frontend.StaticDir == "" {
		cfg.Frontend.StaticDir = "./static"
	}

	return &cfg, nil
}
