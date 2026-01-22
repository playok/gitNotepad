package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"syscall"

	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/daemon"
	"github.com/user/gitnotepad/internal/database"
	"github.com/user/gitnotepad/internal/encoding"
	"github.com/user/gitnotepad/internal/encryption"
	"github.com/user/gitnotepad/internal/handler"
	"github.com/user/gitnotepad/internal/repository"
	"github.com/user/gitnotepad/internal/server"
	"github.com/user/gitnotepad/internal/telegram"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"
)

// Build-time variables (set via ldflags)
var (
	version = "dev"
	commit  = "unknown"
	date    = "unknown"
)

func nginxHelp(port int, basePath string) string {
	if basePath == "" {
		basePath = "/note"
	}
	return fmt.Sprintf(`
Nginx Reverse Proxy Configuration
==================================

To run Git Notepad behind nginx at a sub-path (e.g., %s):

1. Edit config.yaml:

   server:
     port: %d
     host: "127.0.0.1"
     base_path: "%s"

2. Add to nginx.conf:

   location %s {
       proxy_pass http://127.0.0.1:%d;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       client_max_body_size 100M;  # File upload size limit

       # WebSocket support
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
   }

3. Reload nginx:
   $ nginx -s reload

4. Access at: http://your-domain%s

Note: client_max_body_size sets the maximum file upload size.
      Default nginx limit is 1MB. Adjust as needed.
`, basePath, port, basePath, basePath, port, basePath)
}

const usageHelp = `
Git Notepad - Web-based note application with Git version control

Usage:
  gitnotepad [options]
  gitnotepad <command> [options]

Commands:
  start       Start the daemon in background
  stop        Stop the running daemon
  restart     Restart the daemon
  status      Show daemon status
  run         Run in foreground (for debugging)

Options:
  -config string
        Path to config file (default "config.yaml")
  -nginx
        Show nginx reverse proxy configuration
  -reset-password string
        Reset password for specified username
  -migrate-paths
        Migrate note paths from old separator (/) to new separator (:>:)
  -migrate-titles
        Migrate note titles to include folder path prefix (for folder sharing)
  -help
        Show this help message

Default Behavior (no arguments):
  - If initial setup needed (admin password not set): runs in foreground for setup
  - If setup complete: starts as daemon (same as 'gitnotepad start')

Examples:
  gitnotepad                    # Auto: foreground setup or daemon start
  gitnotepad start              # Start as daemon
  gitnotepad run                # Run in foreground
  gitnotepad stop               # Stop daemon
  gitnotepad status             # Check daemon status
  gitnotepad -config my.yaml    # Use custom config
  gitnotepad -migrate-paths     # Manually run path migration
  gitnotepad -migrate-titles    # Migrate note titles for folder sharing
`

func main() {
	// Check for daemon commands first (before flag parsing)
	explicitRun := false // Track if "run" command was explicitly given
	if len(os.Args) > 1 {
		cmd := os.Args[1]
		switch cmd {
		case "start", "stop", "restart", "status":
			handleDaemonCommand(cmd, os.Args[2:])
			return
		case "run":
			// Run in foreground mode - continue with normal execution
			explicitRun = true
			os.Args = append([]string{os.Args[0]}, os.Args[2:]...)
		case "help", "-h", "--help":
			fmt.Print(usageHelp)
			return
		}
	}

	configPath := flag.String("config", "config.yaml", "Path to config file")
	showNginx := flag.Bool("nginx", false, "Show nginx reverse proxy configuration")
	resetPassword := flag.String("reset-password", "", "Reset password for specified username")
	migratePaths := flag.Bool("migrate-paths", false, "Migrate note paths from old separator (/) to new separator (:>:)")
	migrateTitles := flag.Bool("migrate-titles", false, "Migrate note titles to include folder path prefix (for folder sharing)")
	daemonChild := flag.Bool("daemon-child", false, "Internal flag for daemon child process")
	flag.Parse()

	if *showNginx {
		// Load config to get actual port and base_path
		var cfg *config.Config
		if _, err := os.Stat(*configPath); os.IsNotExist(err) {
			cfg = config.Default()
		} else {
			var loadErr error
			cfg, loadErr = config.Load(*configPath)
			if loadErr != nil {
				cfg = config.Default()
			}
		}
		fmt.Print(nginxHelp(cfg.Server.Port, cfg.Server.BasePath))
		return
	}

	// Handle password reset
	if *resetPassword != "" {
		handlePasswordReset(*configPath, *resetPassword)
		return
	}

	// Handle path migration
	if *migratePaths {
		handlePathMigration(*configPath)
		return
	}

	// Handle title migration
	if *migrateTitles {
		handleTitleMigration(*configPath)
		return
	}

	// If no command given (not run, not daemon-child), check if setup is needed
	// If setup is done, default to "start" command
	if !explicitRun && (len(os.Args) == 1 || (len(os.Args) == 3 && os.Args[1] == "-config")) {
		if !needsInitialSetup(*configPath) {
			// Setup is complete, default to daemon mode
			fmt.Println("Starting Git Notepad daemon...")
			handleDaemonCommand("start", os.Args[1:])
			return
		}
		// Need initial setup, continue in foreground mode
		fmt.Println("Initial setup required. Running in foreground mode...")
	}

	var cfg *config.Config
	var err error
	var configNeedsMigration bool

	if _, err := os.Stat(*configPath); os.IsNotExist(err) {
		fmt.Printf("Config file not found at %s, using defaults\n", *configPath)
		cfg = config.Default()
	} else {
		result, loadErr := config.LoadWithMigrationCheck(*configPath)
		if loadErr != nil {
			log.Fatalf("Failed to load config: %v", loadErr)
		}
		cfg = result.Config
		configNeedsMigration = result.NeedsMigration
	}

	// Setup logging
	d := daemon.New(cfg, *configPath)
	if *daemonChild {
		// Running as daemon child - log to file only
		d.SetupLoggingFileOnly()
		// Write PID file
		if err := d.WritePID(os.Getpid()); err != nil {
			log.Printf("Warning: failed to write PID file: %v", err)
		}
	} else {
		// Running in foreground - log to both console and file (if enabled)
		d.SetupLogging()
	}

	// Initialize logging encoding and level
	encoding.Init(cfg.Logging.Encoding)
	encoding.SetLevel(cfg.Logging.Level)

	// Use log.Println in daemon mode, fmt.Println in foreground mode
	if *daemonChild {
		log.Println("Git Notepad")
		log.Println("===========")
		log.Printf("Storage path: %s", cfg.Storage.Path)
		log.Printf("Default editor type: %s", cfg.Editor.DefaultType)
	} else {
		fmt.Println("Git Notepad")
		fmt.Println("===========")
		fmt.Printf("Storage path: %s\n", cfg.Storage.Path)
		fmt.Printf("Default editor type: %s\n", cfg.Editor.DefaultType)
		fmt.Println()
	}

	// Generate encryption salt if encryption is enabled but salt is empty
	configChanged := configNeedsMigration
	if cfg.Encryption.Enabled && cfg.Encryption.Salt == "" {
		salt, err := encryption.GenerateSalt()
		if err != nil {
			log.Fatalf("Failed to generate encryption salt: %v", err)
		}
		cfg.Encryption.Salt = salt
		configChanged = true
		log.Println("Encryption salt generated.")
	}

	// Prompt for admin password on first run (only in foreground mode)
	var adminPassword string
	if cfg.NeedsAdminPassword() {
		if *daemonChild {
			log.Fatal("Admin password not set. Please run in foreground mode first to set admin password.")
		}
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
		log.Printf("Config saved to %s", *configPath)
	}

	// Set version info before creating server
	server.SetVersion(version, commit, date)

	srv, err := server.NewWithAdminPassword(cfg, adminPassword)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	// Start Telegram bot if enabled
	bot, err := telegram.New(cfg)
	if err != nil {
		log.Printf("Warning: Failed to create Telegram bot: %v", err)
	} else if bot != nil {
		// Set WebSocket hub for real-time note list updates
		bot.SetHub(srv.GetHub())
		go bot.Start()
		defer bot.Stop()
	}

	if err := srv.Run(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// handleDaemonCommand handles start/stop/restart/status commands
func handleDaemonCommand(cmd string, args []string) {
	// Parse flags for daemon commands
	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	configPath := fs.String("config", "config.yaml", "Path to config file")
	fs.Parse(args)

	// Load config
	var cfg *config.Config

	if _, statErr := os.Stat(*configPath); os.IsNotExist(statErr) {
		cfg = config.Default()
	} else {
		var loadErr error
		cfg, loadErr = config.Load(*configPath)
		if loadErr != nil {
			log.Fatalf("Failed to load config: %v", loadErr)
		}
	}

	d := daemon.New(cfg, *configPath)

	switch cmd {
	case "start":
		if err := d.Start(); err != nil {
			log.Fatalf("Failed to start: %v", err)
		}
	case "stop":
		if err := d.Stop(); err != nil {
			log.Fatalf("Failed to stop: %v", err)
		}
	case "restart":
		if err := d.Restart(); err != nil {
			log.Fatalf("Failed to restart: %v", err)
		}
	case "status":
		d.Status()
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

// needsInitialSetup checks if initial setup is required (admin password not set)
func needsInitialSetup(configPath string) bool {
	// Check if config file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// No config file - needs setup
		return true
	}

	// Load config
	cfg, err := config.Load(configPath)
	if err != nil {
		// Can't load config - needs setup
		return true
	}

	// Check if auth is enabled and admin password is not set
	if cfg.Auth.Enabled && cfg.Auth.AdminPasswordHash == "" {
		return true
	}

	return false
}

// handlePathMigration runs the folder separator migration manually
func handlePathMigration(configPath string) {
	// Load config
	var cfg *config.Config

	if _, statErr := os.Stat(configPath); os.IsNotExist(statErr) {
		cfg = config.Default()
	} else {
		var loadErr error
		cfg, loadErr = config.Load(configPath)
		if loadErr != nil {
			log.Fatalf("Failed to load config: %v", loadErr)
		}
	}

	fmt.Println("Running folder separator migration...")
	fmt.Printf("Storage path: %s\n", cfg.Storage.Path)
	fmt.Println("Migrating from '/' separator to ':>:' separator...")
	fmt.Println()

	if err := handler.MigrateFolderSeparator(cfg.Storage.Path, cfg.Encryption.Enabled, cfg.Encryption.Salt); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	fmt.Println("Migration completed successfully.")
}

// handleTitleMigration runs the note title folder path migration manually
func handleTitleMigration(configPath string) {
	// Load config
	var cfg *config.Config

	if _, statErr := os.Stat(configPath); os.IsNotExist(statErr) {
		cfg = config.Default()
	} else {
		var loadErr error
		cfg, loadErr = config.Load(configPath)
		if loadErr != nil {
			log.Fatalf("Failed to load config: %v", loadErr)
		}
	}

	fmt.Println("Running note title migration...")
	fmt.Printf("Storage path: %s\n", cfg.Storage.Path)
	fmt.Println("Adding folder path prefix to note titles in subfolders...")
	fmt.Println()

	if err := handler.MigrateNoteTitleFolderPath(cfg.Storage.Path); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	fmt.Println("Title migration completed successfully.")
}
