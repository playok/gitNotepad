package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Storage  StorageConfig  `yaml:"storage"`
	Editor   EditorConfig   `yaml:"editor"`
	Auth     AuthConfig     `yaml:"auth"`
	Database DatabaseConfig `yaml:"database"`
}

type ServerConfig struct {
	Port int    `yaml:"port"`
	Host string `yaml:"host"`
}

type StorageConfig struct {
	Path        string `yaml:"path"`
	AutoInitGit bool   `yaml:"auto_init_git"`
}

type EditorConfig struct {
	DefaultType string `yaml:"default_type"`
	AutoSave    bool   `yaml:"auto_save"`
}

type AuthConfig struct {
	Enabled        bool   `yaml:"enabled"`
	SessionTimeout int    `yaml:"session_timeout"` // hours
	AdminUsername  string `yaml:"admin_username"`
	AdminPassword  string `yaml:"admin_password"`
}

type DatabaseConfig struct {
	Path string `yaml:"path"`
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

	// Set defaults
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8080
	}
	if cfg.Server.Host == "" {
		cfg.Server.Host = "0.0.0.0"
	}
	if cfg.Storage.Path == "" {
		cfg.Storage.Path = "./data"
	}
	if cfg.Editor.DefaultType == "" {
		cfg.Editor.DefaultType = "markdown"
	}
	if cfg.Database.Path == "" {
		cfg.Database.Path = "./data/gitnotepad.db"
	}
	if cfg.Auth.SessionTimeout == 0 {
		cfg.Auth.SessionTimeout = 168 // 7 days
	}

	return &cfg, nil
}

func Default() *Config {
	return &Config{
		Server: ServerConfig{
			Port: 8080,
			Host: "0.0.0.0",
		},
		Storage: StorageConfig{
			Path:        "./data",
			AutoInitGit: true,
		},
		Editor: EditorConfig{
			DefaultType: "markdown",
			AutoSave:    false,
		},
		Auth: AuthConfig{
			Enabled:        true,
			SessionTimeout: 168, // 7 days in hours
			AdminUsername:  "admin",
			AdminPassword:  "admin123",
		},
		Database: DatabaseConfig{
			Path: "./data/gitnotepad.db",
		},
	}
}
