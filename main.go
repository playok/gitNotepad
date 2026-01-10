package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"syscall"

	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/database"
	"github.com/user/gitnotepad/internal/encoding"
	"github.com/user/gitnotepad/internal/encryption"
	"github.com/user/gitnotepad/internal/repository"
	"github.com/user/gitnotepad/internal/server"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"
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
	resetPassword := flag.String("reset-password", "", "Reset password for specified username")
	flag.Parse()

	if *showNginx {
		fmt.Print(nginxHelp)
		return
	}

	// Handle password reset
	if *resetPassword != "" {
		handlePasswordReset(*configPath, *resetPassword)
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

// handlePasswordReset resets the password for the specified username
func handlePasswordReset(configPath, username string) {
	// Load config to get database path
	var cfg *config.Config
	var err error

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		cfg = config.Default()
	} else {
		cfg, err = config.Load(configPath)
		if err != nil {
			log.Fatalf("Failed to load config: %v", err)
		}
	}

	// Connect to database
	db, err := database.New(cfg.Database.Path)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Get user repository
	userRepo := repository.NewUserRepository(db.DB)

	// Find user by username
	user, err := userRepo.GetByUsername(username)
	if err != nil {
		log.Fatalf("Failed to find user: %v", err)
	}
	if user == nil {
		log.Fatalf("User '%s' not found", username)
	}

	// Prompt for new password
	fmt.Printf("Resetting password for user: %s (ID: %d)\n", user.Username, user.ID)
	fmt.Print("Enter new password: ")

	passwordBytes, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		log.Fatalf("Failed to read password: %v", err)
	}
	fmt.Println()

	password := string(passwordBytes)
	if password == "" {
		log.Fatal("Password cannot be empty")
	}

	// Confirm password
	fmt.Print("Confirm new password: ")
	confirmBytes, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		log.Fatalf("Failed to read password confirmation: %v", err)
	}
	fmt.Println()

	if password != string(confirmBytes) {
		log.Fatal("Passwords do not match")
	}

	// Hash new password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	// Update user password
	user.PasswordHash = string(hash)
	if err := userRepo.Update(user); err != nil {
		log.Fatalf("Failed to update password: %v", err)
	}

	fmt.Printf("Password for user '%s' has been reset successfully.\n", username)
}
