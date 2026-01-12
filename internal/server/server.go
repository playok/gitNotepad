package server

import (
	"fmt"
	"html/template"
	"io/fs"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/database"
	"github.com/user/gitnotepad/internal/git"
	"github.com/user/gitnotepad/internal/handler"
	"github.com/user/gitnotepad/internal/middleware"
	"github.com/user/gitnotepad/internal/repository"
	"github.com/user/gitnotepad/web"
)

type Server struct {
	config  *config.Config
	router  *gin.Engine
	repo    *git.Repository
	db      *database.DB
	version string
}

// VersionInfo holds build version information
type VersionInfo struct {
	Version string
	Commit  string
	Date    string
}

// appVersion stores the current version (set via SetVersion)
var appVersion = VersionInfo{Version: "dev", Commit: "unknown", Date: "unknown"}

// SetVersion sets the application version info (call before creating server)
func SetVersion(version, commit, date string) {
	appVersion = VersionInfo{Version: version, Commit: commit, Date: date}
}

// GetVersion returns the current version info
func GetVersion() VersionInfo {
	return appVersion
}

// NewWithAdminPassword creates a new server with an optional admin password for first-time seeding
func NewWithAdminPassword(cfg *config.Config, adminPassword string) (*Server, error) {
	repo, err := git.NewRepository(cfg.Storage.Path)
	if err != nil {
		return nil, err
	}

	if cfg.Storage.AutoInitGit {
		if err := repo.Init(); err != nil {
			return nil, err
		}
	}

	// Initialize database
	db, err := database.New(cfg.Database.Path)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Migrate(); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	// Seed admin user if configured and password provided
	if cfg.Auth.Enabled && cfg.Auth.AdminUsername != "" && adminPassword != "" {
		if err := db.SeedAdminUser(cfg.Auth.AdminUsername, adminPassword); err != nil {
			return nil, fmt.Errorf("failed to seed admin user: %w", err)
		}
	}

	return newServer(cfg, repo, db)
}

// New creates a new server (for backward compatibility, admin must already exist in DB)
func New(cfg *config.Config) (*Server, error) {
	return NewWithAdminPassword(cfg, "")
}

func newServer(cfg *config.Config, repo *git.Repository, db *database.DB) (*Server, error) {
	// Run migration for folder separator change (/ -> :>:)
	if err := handler.MigrateFolderSeparator(cfg.Storage.Path, cfg.Encryption.Enabled, cfg.Encryption.Salt); err != nil {
		fmt.Printf("Warning: folder separator migration failed: %v\n", err)
	}

	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()
	router.UseRawPath = true
	router.UnescapePathValues = true

	s := &Server{
		config: cfg,
		router: router,
		repo:   repo,
		db:     db,
	}

	s.setupRoutes()
	return s, nil
}

func (s *Server) setupRoutes() {
	// Create repositories
	userRepo := repository.NewUserRepository(s.db.DB)
	sessionRepo := repository.NewSessionRepository(s.db.DB)

	// Create middleware
	authMiddleware := middleware.NewAuthMiddleware(userRepo, sessionRepo, s.config.Server.BasePath)

	// Create handlers
	noteHandler := handler.NewNoteHandler(s.repo, s.config)
	gitHandler := handler.NewGitHandler(s.repo)
	authHandler := handler.NewAuthHandler(s.repo, userRepo, sessionRepo, s.config)
	shortLinkHandler := handler.NewShortLinkHandler(s.repo, s.config, s.config.Server.BasePath)
	imageHandler := handler.NewImageHandler(s.config.Storage.Path, s.config.Server.BasePath)
	fileHandler := handler.NewFileHandler(s.config.Storage.Path, s.config.Server.BasePath)
	adminHandler := handler.NewAdminHandler(userRepo, s.config.Storage.Path)
	statsHandler := handler.NewStatsHandler(s.config)
	folderIconHandler := handler.NewFolderIconHandler(s.db)
	folderOrderHandler := handler.NewFolderOrderHandler(s.db)

	// Load embedded templates
	tmpl := template.Must(template.New("").ParseFS(web.Templates, "templates/*.html"))
	s.router.SetHTMLTemplate(tmpl)

	// Get base path for routing
	basePath := s.config.Server.BasePath

	// Create base group for all routes
	base := s.router.Group(basePath)

	// Serve embedded static files under base path
	staticFS, _ := fs.Sub(web.Static, "static")
	base.StaticFS("/static", http.FS(staticFS))

	// Login page (public)
	base.GET("/login", func(c *gin.Context) {
		c.HTML(200, "login.html", gin.H{
			"config":   s.config,
			"basePath": basePath,
		})
	})

	// Public API routes
	base.POST("/api/auth/login", authHandler.Login)

	// Short link redirect (public)
	base.GET("/s/:code", shortLinkHandler.Redirect)

	// Public preview page and API (no authentication required)
	base.GET("/preview/:code", shortLinkHandler.PublicPreview)
	base.GET("/api/public/note/:code", shortLinkHandler.GetPublicNote)

	// Config endpoint (public)
	base.GET("/api/config", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"editor":   s.config.Editor,
			"basePath": basePath,
			"version":  appVersion,
		})
	})

	// Folder icons GET - public with optional auth (to avoid 401 errors in browser console)
	base.GET("/api/folder-icons", authMiddleware.OptionalAuth(), folderIconHandler.List)

	// Folder order GET - public with optional auth
	base.GET("/api/folder-order", authMiddleware.OptionalAuth(), folderOrderHandler.Get)

	// Protected routes (require authentication)
	if s.config.Auth.Enabled {
		// Main page - require auth
		base.GET("/", authMiddleware.RequireAuth(), func(c *gin.Context) {
			user := middleware.GetCurrentUser(c)
			c.HTML(200, "index.html", gin.H{
				"config":   s.config,
				"user":     user,
				"basePath": basePath,
			})
		})

		// Popout preview page - require auth
		base.GET("/popout-preview", authMiddleware.RequireAuth(), func(c *gin.Context) {
			c.HTML(200, "popout-preview.html", gin.H{
				"basePath": basePath,
			})
		})

		// Protected API routes
		api := base.Group("/api")
		api.Use(authMiddleware.RequireAuth())
		{
			// Auth
			api.POST("/auth/logout", authHandler.Logout)
			api.GET("/auth/me", authHandler.GetCurrentUser)
			api.POST("/auth/verify", authHandler.Verify)

			// Notes CRUD
			api.GET("/notes", noteHandler.List)
			api.GET("/notes/:id", noteHandler.Get)
			api.POST("/notes", noteHandler.Create)
			api.PUT("/notes/:id", noteHandler.Update)
			api.DELETE("/notes/:id", noteHandler.Delete)
			api.POST("/notes/:id/decrypt", noteHandler.DecryptNote)

			// Folders
			api.GET("/folders", noteHandler.ListFolders)
			api.POST("/folders", noteHandler.CreateFolder)
			api.DELETE("/folders/*path", noteHandler.DeleteFolder)

			// Folder icons (GET is public with optional auth, POST/DELETE require auth)
			api.POST("/folder-icons", folderIconHandler.Set)
			api.DELETE("/folder-icons", folderIconHandler.Delete)

			// Folder order (GET is public with optional auth, PUT/DELETE require auth)
			api.PUT("/folder-order", folderOrderHandler.Set)
			api.PUT("/folder-order/all", folderOrderHandler.SaveAll)
			api.DELETE("/folder-order", folderOrderHandler.Delete)

			// Git history
			api.GET("/notes/:id/history", gitHandler.History)
			api.GET("/notes/:id/version/:commit", gitHandler.Version)

			// Short links
			api.POST("/notes/:id/shortlink", shortLinkHandler.Generate)
			api.GET("/notes/:id/shortlink", shortLinkHandler.Get)
			api.DELETE("/notes/:id/shortlink", shortLinkHandler.Delete)

			// Short links management
			api.GET("/shortlinks", shortLinkHandler.List)
			api.PUT("/shortlinks/:code", shortLinkHandler.UpdateByCode)
			api.DELETE("/shortlinks/:code", shortLinkHandler.DeleteByCode)

			// Image routes
			api.POST("/images", imageHandler.Upload)
			api.DELETE("/images/:filename", imageHandler.Delete)

			// File routes
			api.POST("/files", fileHandler.Upload)
			api.DELETE("/files/:filename", fileHandler.Delete)

			// Stats and data management
			api.GET("/stats", statsHandler.GetStats)
			api.GET("/notes/export", statsHandler.ExportNotes)
			api.POST("/notes/import", statsHandler.ImportNotes)
			api.DELETE("/notes", statsHandler.DeleteAllNotes)
		}

		// Admin routes
		admin := base.Group("/api/admin")
		admin.Use(authMiddleware.RequireAuth(), authMiddleware.RequireAdmin())
		{
			admin.GET("/users", adminHandler.ListUsers)
			admin.POST("/users", adminHandler.CreateUser)
			admin.DELETE("/users/:id", adminHandler.DeleteUser)
			admin.PUT("/users/:id/password", adminHandler.UpdatePassword)
		}
	} else {
		// Auth disabled - no authentication required
		base.GET("/", func(c *gin.Context) {
			c.HTML(200, "index.html", gin.H{
				"config":   s.config,
				"basePath": basePath,
			})
		})

		// Popout preview page
		base.GET("/popout-preview", func(c *gin.Context) {
			c.HTML(200, "popout-preview.html", gin.H{
				"basePath": basePath,
			})
		})

		api := base.Group("/api")
		{
			// Notes CRUD
			api.GET("/notes", noteHandler.List)
			api.GET("/notes/:id", noteHandler.Get)
			api.POST("/notes", noteHandler.Create)
			api.PUT("/notes/:id", noteHandler.Update)
			api.DELETE("/notes/:id", noteHandler.Delete)
			api.POST("/notes/:id/decrypt", noteHandler.DecryptNote)

			// Folders
			api.GET("/folders", noteHandler.ListFolders)
			api.POST("/folders", noteHandler.CreateFolder)
			api.DELETE("/folders/*path", noteHandler.DeleteFolder)

			// Folder icons (GET is already registered as public)
			api.POST("/folder-icons", folderIconHandler.Set)
			api.DELETE("/folder-icons", folderIconHandler.Delete)

			// Folder order (GET is already registered as public)
			api.PUT("/folder-order", folderOrderHandler.Set)
			api.PUT("/folder-order/all", folderOrderHandler.SaveAll)
			api.DELETE("/folder-order", folderOrderHandler.Delete)

			// Git history
			api.GET("/notes/:id/history", gitHandler.History)
			api.GET("/notes/:id/version/:commit", gitHandler.Version)

			// Auth (legacy)
			api.POST("/auth/verify", authHandler.Verify)

			// Short links
			api.POST("/notes/:id/shortlink", shortLinkHandler.Generate)
			api.GET("/notes/:id/shortlink", shortLinkHandler.Get)
			api.DELETE("/notes/:id/shortlink", shortLinkHandler.Delete)

			// Short links management
			api.GET("/shortlinks", shortLinkHandler.List)
			api.PUT("/shortlinks/:code", shortLinkHandler.UpdateByCode)
			api.DELETE("/shortlinks/:code", shortLinkHandler.DeleteByCode)

			// Image routes
			api.POST("/images", imageHandler.Upload)
			api.DELETE("/images/:filename", imageHandler.Delete)

			// File routes
			api.POST("/files", fileHandler.Upload)
			api.DELETE("/files/:filename", fileHandler.Delete)

			// Stats and data management
			api.GET("/stats", statsHandler.GetStats)
			api.GET("/notes/export", statsHandler.ExportNotes)
			api.POST("/notes/import", statsHandler.ImportNotes)
			api.DELETE("/notes", statsHandler.DeleteAllNotes)
		}
	}

	// Public image/file serving (always accessible)
	// User-specific routes: /u/{username}/files/{filename}
	base.GET("/u/:username/files/:filename", fileHandler.Serve)
	base.GET("/u/:username/images/:filename", imageHandler.Serve)
	// Legacy routes for backwards compatibility: /files/{filename}
	base.GET("/files/:filename", fileHandler.ServeLegacy)
	base.GET("/images/:filename", imageHandler.ServeLegacy)
}

func (s *Server) Run() error {
	addr := fmt.Sprintf("%s:%d", s.config.Server.Host, s.config.Server.Port)
	fmt.Printf("Server starting at http://%s\n", addr)
	return s.router.Run(addr)
}

func (s *Server) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}
