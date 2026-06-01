package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server struct {
		HTTPPort   int `yaml:"http_port"`
		SyslogPort int `yaml:"syslog_port"`
		WinlogPort int `yaml:"winlog_port"`
	} `yaml:"server"`
	Elasticsearch struct {
		URL         string `yaml:"url"`
		IndexPrefix string `yaml:"index_prefix"`
	} `yaml:"elasticsearch"`
	Rules struct {
		DefaultRulesDir    string `yaml:"default_rules_dir"`
		EventWindowSeconds int    `yaml:"event_window_seconds"`
	} `yaml:"rules"`
	Logging struct {
		Level string `yaml:"level"`
	} `yaml:"logging"`
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

	return &cfg, nil
}
