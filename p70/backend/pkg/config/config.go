package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port            int
	DatabasePath    string
	HeartbeatInterval int
	NodeTimeout     int
	FailoverEnabled bool
}

func Load() *Config {
	return &Config{
		Port:              getEnvInt("PORT", 8080),
		DatabasePath:      getEnvString("DATABASE_PATH", "swarm_manager.db"),
		HeartbeatInterval: getEnvInt("HEARTBEAT_INTERVAL", 30),
		NodeTimeout:       getEnvInt("NODE_TIMEOUT", 120),
		FailoverEnabled:   getEnvBool("FAILOVER_ENABLED", true),
	}
}

func getEnvString(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value, exists := os.LookupEnv(key); exists {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}
