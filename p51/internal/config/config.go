package config

import (
	"os"
	"gopkg.in/yaml.v3"
)

type Config struct {
	MQTT     MQTTConfig     `yaml:"mqtt"`
	Database DatabaseConfig `yaml:"database"`
	Server   ServerConfig   `yaml:"server"`
	Alert    AlertConfig    `yaml:"alert"`
}

type MQTTConfig struct {
	Broker   string `yaml:"broker"`
	ClientID string `yaml:"client_id"`
	Topic    string `yaml:"topic"`
}

type DatabaseConfig struct {
	DSN string `yaml:"dsn"`
}

type ServerConfig struct {
	Port int `yaml:"port"`
}

type AlertConfig struct {
	Temperature RangeAlert `yaml:"temperature"`
	Humidity    RangeAlert `yaml:"humidity"`
	CO2         MaxAlert   `yaml:"co2"`
}

type RangeAlert struct {
	Min float64 `yaml:"min"`
	Max float64 `yaml:"max"`
}

type MaxAlert struct {
	Max float64 `yaml:"max"`
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
