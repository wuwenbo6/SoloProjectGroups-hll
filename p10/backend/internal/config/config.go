package config

type Config struct {
	MQTT   MQTTConfig
	Server ServerConfig
	DB     DBConfig
}

type MQTTConfig struct {
	Broker   string
	ClientID string
	Username string
	Password string
	Topic    string
}

type ServerConfig struct {
	Port string
}

type DBConfig struct {
	Path string
}

func Load() *Config {
	return &Config{
		MQTT: MQTTConfig{
			Broker:   "tcp://localhost:1883",
			ClientID: "iot-backend",
			Topic:    "zigbee/sensor/#",
		},
		Server: ServerConfig{
			Port: "8080",
		},
		DB: DBConfig{
			Path: "iot.db",
		},
	}
}
