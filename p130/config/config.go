package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabasePath string
	HEPUDPPort   int
	HEPTCPPort   int
	APIPort      int
	WebDir       string
}

func Load() *Config {
	return &Config{
		DatabasePath: getEnv("DB_PATH", "./sip_calls.db"),
		HEPUDPPort:   getEnvInt("HEP_UDP_PORT", 9060),
		HEPTCPPort:   getEnvInt("HEP_TCP_PORT", 9061),
		APIPort:      getEnvInt("API_PORT", 8080),
		WebDir:       getEnv("WEB_DIR", "./web"),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}
