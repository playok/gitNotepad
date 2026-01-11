package config

import (
	"bufio"
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"syscall"

	"golang.org/x/term"
	"gopkg.in/yaml.v3"
)

type Config struct {
	Server     ServerConfig     `yaml:"server"`
	Storage    StorageConfig    `yaml:"storage"`
	Editor     EditorConfig     `yaml:"editor"`
	Auth       AuthConfig       `yaml:"auth"`
	Database   DatabaseConfig   `yaml:"database"`
	Logging    LoggingConfig    `yaml:"logging"`
	Encryption EncryptionConfig `yaml:"encryption"`
	Daemon     DaemonConfig     `yaml:"daemon"`
}

type EncryptionConfig struct {
	Enabled bool   `yaml:"enabled"`
	Salt    string `yaml:"salt"` // Base64 encoded salt for PBKDF2
}

type ServerConfig struct {
	Port     int    `yaml:"port"`
	Host     string `yaml:"host"`
	BasePath string `yaml:"base_path"`
}

type StorageConfig struct {
	Path        string `yaml:"path"`
	AutoInitGit bool   `yaml:"auto_init_git"`
}

type LoggingConfig struct {
	Encoding   string `yaml:"encoding"`    // "utf-8" (default) or "euc-kr" for console output
	File       bool   `yaml:"file"`        // Enable file logging
	Dir        string `yaml:"dir"`         // Log directory
	MaxSize    int    `yaml:"max_size"`    // Max size in MB before rotation
	MaxAge     int    `yaml:"max_age"`     // Max days to retain old log files
	MaxBackups int    `yaml:"max_backups"` // Max number of old log files to retain
}

type DaemonConfig struct {
	PidFile string `yaml:"pid_file"` // PID file path
}

type EditorConfig struct {
	DefaultType string `yaml:"default_type"`
	AutoSave    bool   `yaml:"auto_save"`
}

type AuthConfig struct {
	Enabled           bool   `yaml:"enabled"`
	SessionTimeout    int    `yaml:"session_timeout"` // hours
	AdminUsername     string `yaml:"admin_username"`
	AdminPasswordHash string `yaml:"admin_password_hash"` // SHA-512 hash
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
	if cfg.Logging.Encoding == "" {
		cfg.Logging.Encoding = getDefaultEncoding()
	}
	if cfg.Logging.Dir == "" {
		cfg.Logging.Dir = "./logs"
	}
	if cfg.Logging.MaxSize == 0 {
		cfg.Logging.MaxSize = 10 // 10 MB
	}
	if cfg.Logging.MaxAge == 0 {
		cfg.Logging.MaxAge = 30 // 30 days
	}
	if cfg.Logging.MaxBackups == 0 {
		cfg.Logging.MaxBackups = 5
	}
	if cfg.Daemon.PidFile == "" {
		cfg.Daemon.PidFile = "./gitnotepad.pid"
	}

	return &cfg, nil
}

// getDefaultEncoding returns the default encoding based on LANG environment variable
func getDefaultEncoding() string {
	lang := strings.ToLower(os.Getenv("LANG"))
	if strings.Contains(lang, "euckr") || strings.Contains(lang, "euc-kr") {
		return "euc-kr"
	}
	return "utf-8"
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
			Enabled:           true,
			SessionTimeout:    168, // 7 days in hours
			AdminUsername:     "admin",
			AdminPasswordHash: "", // Will be set on first run
		},
		Database: DatabaseConfig{
			Path: "./data/gitnotepad.db",
		},
		Logging: LoggingConfig{
			Encoding:   getDefaultEncoding(),
			File:       false,
			Dir:        "./logs",
			MaxSize:    10,  // 10 MB
			MaxAge:     30,  // 30 days
			MaxBackups: 5,
		},
		Encryption: EncryptionConfig{
			Enabled: false,
			Salt:    "", // Will be generated on first run if encryption enabled
		},
		Daemon: DaemonConfig{
			PidFile: "./gitnotepad.pid",
		},
	}
}

// HashPassword creates a SHA-512 hash of the password
func HashPassword(password string) string {
	hash := sha512.Sum512([]byte(password))
	return hex.EncodeToString(hash[:])
}

// VerifyPassword checks if the password matches the hash
func VerifyPassword(password, hash string) bool {
	return HashPassword(password) == hash
}

// NeedsAdminPassword returns true if admin password hash is not set
func (c *Config) NeedsAdminPassword() bool {
	return c.Auth.Enabled && c.Auth.AdminPasswordHash == ""
}

// PromptAdminPassword prompts for admin password in the terminal
func PromptAdminPassword() (string, error) {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println()
	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Println("║              Initial Admin Password Setup                  ║")
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	for {
		fmt.Print("Enter admin password: ")
		password, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			// Fallback for non-terminal environments
			passwordStr, err := reader.ReadString('\n')
			if err != nil {
				return "", fmt.Errorf("failed to read password: %w", err)
			}
			password = []byte(strings.TrimSpace(passwordStr))
		}
		fmt.Println()

		if len(password) < 4 {
			fmt.Println("Password must be at least 4 characters. Please try again.")
			continue
		}

		fmt.Print("Confirm admin password: ")
		confirm, err := term.ReadPassword(int(syscall.Stdin))
		if err != nil {
			confirmStr, err := reader.ReadString('\n')
			if err != nil {
				return "", fmt.Errorf("failed to read password: %w", err)
			}
			confirm = []byte(strings.TrimSpace(confirmStr))
		}
		fmt.Println()

		if string(password) != string(confirm) {
			fmt.Println("Passwords do not match. Please try again.")
			continue
		}

		fmt.Println("Admin password set successfully!")
		fmt.Println()
		return string(password), nil
	}
}

// Save saves the config to a file
func (c *Config) Save(path string) error {
	data, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Add comments to the YAML
	content := "# Git Notepad Configuration\n\n" + string(data)

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}
