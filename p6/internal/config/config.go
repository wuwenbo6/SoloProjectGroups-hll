package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server struct {
		HTTPPort   string `yaml:"http_port"`
		ModbusPort int    `yaml:"modbus_port"`
	} `yaml:"server"`
	Database struct {
		Host     string `yaml:"host"`
		Port     int    `yaml:"port"`
		User     string `yaml:"user"`
		Password string `yaml:"password"`
		DBName   string `yaml:"dbname"`
		SSLMode  string `yaml:"sslmode"`
	} `yaml:"database"`
	Pollution struct {
		Level1Threshold       float64 `yaml:"level1_threshold"`
		Level2Threshold       float64 `yaml:"level2_threshold"`
		Level3Threshold       float64 `yaml:"level3_threshold"`
		Level4Threshold       float64 `yaml:"level4_threshold"`
		FrequencyWindowMinutes int    `yaml:"frequency_window_minutes"`
	} `yaml:"pollution"`
}

var App Config

func Load() error {
	data, err := os.ReadFile("config.yaml")
	if err != nil {
		return err
	}
	return yaml.Unmarshal(data, &App)
}
