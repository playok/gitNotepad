package server

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/database"
	"github.com/user/gitnotepad/internal/git"
	"github.com/user/gitnotepad/internal/handler"
	"github.com/user/gitnotepad/internal/middleware"
	"github.com/user/gitnotepad/internal/repository"
)

type Server struct {
	config *config.Config
	router *gin.Engine
	repo   *git.Repository
	db     *database.DB
}

func New(cfg *config.Config) (*Server, error) {
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

	// Seed admin user if configured
	if cfg.Auth.Enabled && cfg.Auth.AdminUsername != "" {
		if err := db.SeedAdminUser(cfg.Auth.AdminUsername, cfg.Auth.AdminPassword); err != nil {
			return nil, fmt.Errorf("failed to seed admin user: %w", err)
		}
	}

	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

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
	authMiddleware := middleware.NewAuthMiddleware(userRepo, sessionRepo)

	// Create handlers
	noteHandler := handler.NewNoteHandler(s.repo, s.config)
	gitHandler := handler.NewGitHandler(s.repo)
	authHandler := handler.NewAuthHandler(s.repo, userRepo, sessionRepo)
	shortLinkHandler := handler.NewShortLinkHandler(s.repo, s.config.Server.BasePath)
	imageHandler := handler.NewImageHandler(s.config.Storage.Path, s.config.Server.BasePath)
	fileHandler := handler.NewFileHandler(s.config.Storage.Path, s.config.Server.BasePath)
	adminHandler := handler.NewAdminHandler(userRepo)
	statsHandler := handler.NewStatsHandler(s.config)

	// Load templates
	s.router.LoadHTMLGlob("./web/templates/*")

	// Get base path for routing
	basePath := s.config.Server.BasePath

	// Create base group for all routes
	base := s.router.Group(basePath)

	// Serve static files under base path
	base.Static("/static", "./web/static")

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

	// Config endpoint (public)
	base.GET("/api/config", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"editor":   s.config.Editor,
			"basePath": basePath,
		})
	})

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

			// Git history
			api.GET("/notes/:id/history", gitHandler.History)
			api.GET("/notes/:id/version/:commit", gitHandler.Version)

			// Short links
			api.POST("/notes/:id/shortlink", shortLinkHandler.Generate)
			api.GET("/notes/:id/shortlink", shortLinkHandler.Get)
			api.DELETE("/notes/:id/shortlink", shortLinkHandler.Delete)

			// Image routes
			api.POST("/images", imageHandler.Upload)

			// File routes
			api.POST("/files", fileHandler.Upload)

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

		api := base.Group("/api")
		{
			// Notes CRUD
			api.GET("/notes", noteHandler.List)
			api.GET("/notes/:id", noteHandler.Get)
			api.POST("/notes", noteHandler.Create)
			api.PUT("/notes/:id", noteHandler.Update)
			api.DELETE("/notes/:id", noteHandler.Delete)

			// Git history
			api.GET("/notes/:id/history", gitHandler.History)
			api.GET("/notes/:id/version/:commit", gitHandler.Version)

			// Auth (legacy)
			api.POST("/auth/verify", authHandler.Verify)

			// Short links
			api.POST("/notes/:id/shortlink", shortLinkHandler.Generate)
			api.GET("/notes/:id/shortlink", shortLinkHandler.Get)
			api.DELETE("/notes/:id/shortlink", shortLinkHandler.Delete)

			// Image routes
			api.POST("/images", imageHandler.Upload)

			// File routes
			api.POST("/files", fileHandler.Upload)

			// Stats and data management
			api.GET("/stats", statsHandler.GetStats)
			api.GET("/notes/export", statsHandler.ExportNotes)
			api.POST("/notes/import", statsHandler.ImportNotes)
			api.DELETE("/notes", statsHandler.DeleteAllNotes)
		}
	}

	// Public image/file serving (always accessible)
	base.GET("/images/:filename", imageHandler.Serve)
	base.GET("/files/:filename", fileHandler.Serve)
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
