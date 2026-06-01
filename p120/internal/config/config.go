package config

import (
	"fmt"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Gateway  GatewayConfig  `mapstructure:"gateway"`
	Log      LogConfig      `mapstructure:"log"`
	MQTT     MQTTConfig     `mapstructure:"mqtt"`
	AccessLog AccessLogConfig `mapstructure:"access_log"`
}

type ServerConfig struct {
	CoAP CoAPServerConfig `mapstructure:"coap"`
	HTTP HTTPServerConfig `mapstructure:"http"`
}

type CoAPServerConfig struct {
	TCP   CoAPAddrConfig   `mapstructure:"tcp"`
	UDP   CoAPAddrConfig   `mapstructure:"udp"`
	DTLS  CoAPDTLSConfig   `mapstructure:"dtls"`
}

type CoAPAddrConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

type CoAPDTLSConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	Host       string `mapstructure:"host"`
	Port       int    `mapstructure:"port"`
	CertFile   string `mapstructure:"cert_file"`
	KeyFile    string `mapstructure:"key_file"`
	CAFile     string `mapstructure:"ca_file"`
	VerifyPeer bool   `mapstructure:"verify_peer"`
}

type HTTPServerConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

type DatabaseConfig struct {
	Path string `mapstructure:"path"`
}

type GatewayConfig struct {
	Timeout        int `mapstructure:"timeout"`
	MaxConnections int `mapstructure:"max_connections"`
	ObserveTimeout int `mapstructure:"observe_timeout"`
}

type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

type MQTTConfig struct {
	Enabled     bool   `mapstructure:"enabled"`
	Broker      string `mapstructure:"broker"`
	ClientID    string `mapstructure:"client_id"`
	Username    string `mapstructure:"username"`
	Password    string `mapstructure:"password"`
	TopicPrefix string `mapstructure:"topic_prefix"`
	QoS         int    `mapstructure:"qos"`
	KeepAlive   int    `mapstructure:"keep_alive"`
}

type AccessLogConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	FilePath   string `mapstructure:"file_path"`
	Format     string `mapstructure:"format"`
	MaxSize    int    `mapstructure:"max_size"`
	MaxBackups int    `mapstructure:"max_backups"`
	MaxAge     int    `mapstructure:"max_age"`
}

func Load(configPath string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(configPath)
	v.SetConfigType("yaml")

	v.AutomaticEnv()

	if err := v.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("read config failed: %w", err)
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshal config failed: %w", err)
	}

	return &cfg, nil
}
