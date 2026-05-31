package config

import (
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	MQTT      MQTTConfig      `mapstructure:"mqtt"`
	Database  DatabaseConfig  `mapstructure:"database"`
	Inverters []InverterConfig `mapstructure:"inverters"`
	Alarm     AlarmConfig     `mapstructure:"alarm"`
	Modbus    ModbusConfig    `mapstructure:"modbus"`
}

type ServerConfig struct {
	Port int `mapstructure:"port"`
}

type MQTTConfig struct {
	Broker   string `mapstructure:"broker"`
	ClientID string `mapstructure:"client_id"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
	Topic    string `mapstructure:"topic"`
}

type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	DBName   string `mapstructure:"dbname"`
	SSLMode  string `mapstructure:"sslmode"`
}

type InverterConfig struct {
	ID         string `mapstructure:"id"`
	Name       string `mapstructure:"name"`
	RatedPower float64 `mapstructure:"rated_power"`
}

type AlarmConfig struct {
	PowerDropThreshold float64 `mapstructure:"power_drop_threshold"`
	CheckInterval      int     `mapstructure:"check_interval"`
}

type ModbusConfig struct {
	Enabled           bool `mapstructure:"enabled"`
	Port              int  `mapstructure:"port"`
	SimulationInterval int `mapstructure:"simulation_interval"`
}

func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	if err := viper.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("failed to read config: %w", err)
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	return &config, nil
}
