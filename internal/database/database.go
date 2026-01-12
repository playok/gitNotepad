package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
}

// New creates a new database connection
func New(dbPath string) (*DB, error) {
	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{db}, nil
}

// Migrate runs database migrations
func (db *DB) Migrate() error {
	migrations := []string{
		// Users table
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			is_admin BOOLEAN DEFAULT FALSE,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		// Sessions table
		`CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token TEXT UNIQUE NOT NULL,
			expires_at DATETIME NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		// Indexes
		`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
		`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
		// Folder icons table
		`CREATE TABLE IF NOT EXISTS folder_icons (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			folder_path TEXT NOT NULL,
			icon TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			UNIQUE(user_id, folder_path)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_folder_icons_user ON folder_icons(user_id)`,
		// Folder order table
		`CREATE TABLE IF NOT EXISTS folder_order (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			parent_path TEXT NOT NULL DEFAULT '',
			order_json TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			UNIQUE(user_id, parent_path)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_folder_order_user ON folder_order(user_id)`,
	}

	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}

	return nil
}

// SeedAdminUser creates the initial admin user if no admin exists
func (db *DB) SeedAdminUser(username, password string) error {
	if username == "" || password == "" {
		return nil // Skip if not configured
	}

	// Check if any admin exists
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE is_admin = TRUE").Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to check admin existence: %w", err)
	}

	if count > 0 {
		return nil // Admin already exists
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Create admin user
	_, err = db.Exec(
		"INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, TRUE)",
		username, string(hash),
	)
	if err != nil {
		return fmt.Errorf("failed to create admin user: %w", err)
	}

	return nil
}

// Close closes the database connection
func (db *DB) Close() error {
	return db.DB.Close()
}
