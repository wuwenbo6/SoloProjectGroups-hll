package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server     ServerConfig     `yaml:"server"`
	CodeServer CodeServerConfig `yaml:"code_server"`
	Workspace  WorkspaceConfig  `yaml:"workspace"`
	Auth       AuthConfig       `yaml:"auth"`
	Data       DataConfig       `yaml:"data"`
	Backup     BackupConfig     `yaml:"backup"`
}

type ServerConfig struct {
	Host string `yaml:"host"`
	Port int    `yaml:"port"`
}

type CodeServerConfig struct {
	BinaryPath         string  `yaml:"binary_path"`
	BasePort           int     `yaml:"base_port"`
	MaxInstances       int     `yaml:"max_instances"`
	CPULimit           float64 `yaml:"cpu_limit"`
	MemoryLimitMB      int     `yaml:"memory_limit_mb"`
	IdleTimeoutMinutes int     `yaml:"idle_timeout_minutes"`
}

type WorkspaceConfig struct {
	BaseDir string `yaml:"base_dir"`
}

type AuthConfig struct {
	AdminToken string `yaml:"admin_token"`
}

type DataConfig struct {
	DBPath string `yaml:"db_path"`
}

type BackupConfig struct {
	Enabled           bool     `yaml:"enabled"`
	StorageType       string   `yaml:"storage_type"`
	LocalDir          string   `yaml:"local_dir"`
	AutoBackupHours   int      `yaml:"auto_backup_hours"`
	MaxBackupsPerUser int      `yaml:"max_backups_per_user"`
	S3                S3Config `yaml:"s3"`
}

type S3Config struct {
	Bucket    string `yaml:"bucket"`
	Region    string `yaml:"region"`
	AccessKey string `yaml:"access_key"`
	SecretKey string `yaml:"secret_key"`
	Endpoint  string `yaml:"endpoint"`
}

var AppConfig *Config

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	AppConfig = &cfg
	return &cfg, nil
}
