package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/encoding"
	"github.com/user/gitnotepad/internal/encryption"
	"github.com/user/gitnotepad/internal/server"
)

const nginxHelp = `
Nginx Reverse Proxy Configuration
==================================

To run Git Notepad behind nginx at a sub-path (e.g., /note):

1. Edit config.yaml:
   ┌─────────────────────────────────────┐
   │ server:                             │
   │   port: 8080                        │
   │   host: "127.0.0.1"                 │
   │   base_path: "/note"                │
   └─────────────────────────────────────┘

2. Add to nginx.conf:
   ┌─────────────────────────────────────────────────────────────┐
   │ location /note {                                            │
   │     proxy_pass http://127.0.0.1:8080;                       │
   │     proxy_set_header Host $host;                            │
   │     proxy_set_header X-Real-IP $remote_addr;                │
   │     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; │
   │     proxy_set_header X-Forwarded-Proto $scheme;             │
   │ }                                                           │
   └─────────────────────────────────────────────────────────────┘

3. Reload nginx:
   $ nginx -s reload

4. Access at: http://your-domain/note
`

func main() {
	configPath := flag.String("config", "config.yaml", "Path to config file")
	showNginx := flag.Bool("nginx", false, "Show nginx reverse proxy configuration")
	flag.Parse()

	if *showNginx {
		fmt.Print(nginxHelp)
		return
	}

	var cfg *config.Config
	var err error

	if _, err := os.Stat(*configPath); os.IsNotExist(err) {
		fmt.Printf("Config file not found at %s, using defaults\n", *configPath)
		cfg = config.Default()
	} else {
		cfg, err = config.Load(*configPath)
		if err != nil {
			log.Fatalf("Failed to load config: %v", err)
		}
	}

	// Initialize logging encoding (for EUC-KR console output support)
	encoding.Init(cfg.Logging.Encoding)

	fmt.Println("Git Notepad")
	fmt.Println("===========")
	fmt.Printf("Storage path: %s\n", cfg.Storage.Path)
	fmt.Printf("Default editor type: %s\n", cfg.Editor.DefaultType)
	fmt.Println()

	// Generate encryption salt if encryption is enabled but salt is empty
	configChanged := false
	if cfg.Encryption.Enabled && cfg.Encryption.Salt == "" {
		salt, err := encryption.GenerateSalt()
		if err != nil {
			log.Fatalf("Failed to generate encryption salt: %v", err)
		}
		cfg.Encryption.Salt = salt
		configChanged = true
		fmt.Println("Encryption salt generated.")
	}

	// Prompt for admin password on first run
	var adminPassword string
	if cfg.NeedsAdminPassword() {
		var err error
		adminPassword, err = config.PromptAdminPassword()
		if err != nil {
			log.Fatalf("Failed to get admin password: %v", err)
		}
		cfg.Auth.AdminPasswordHash = config.HashPassword(adminPassword)
		configChanged = true
	}

	// Save config if changed
	if configChanged {
		if err := cfg.Save(*configPath); err != nil {
			log.Fatalf("Failed to save config: %v", err)
		}
		fmt.Printf("Config saved to %s\n\n", *configPath)
	}

	srv, err := server.NewWithAdminPassword(cfg, adminPassword)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	if err := srv.Run(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
