package handler

import (
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/encryption"
	"github.com/user/gitnotepad/internal/git"
	"github.com/user/gitnotepad/internal/middleware"
	"github.com/user/gitnotepad/internal/model"
	"github.com/user/gitnotepad/internal/repository"
)

const SessionDuration = 7 * 24 * time.Hour // 7 days

type AuthHandler struct {
	repo        *git.Repository
	userRepo    *repository.UserRepository
	sessionRepo *repository.SessionRepository
	config      *config.Config
}

func NewAuthHandler(repo *git.Repository, userRepo *repository.UserRepository, sessionRepo *repository.SessionRepository, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		repo:        repo,
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
		config:      cfg,
	}
}

// LoginRequest represents login credentials
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login handles user authentication
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	clientIP := c.ClientIP()

	user, err := h.userRepo.GetByUsername(req.Username)
	if err != nil || user == nil || !user.CheckPassword(req.Password) {
		log.Printf("[AUTH] Login failed: username=%s, ip=%s, reason=invalid_credentials", req.Username, clientIP)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Create session
	session := model.NewSession(user.ID, SessionDuration)
	if err := h.sessionRepo.Create(session); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// Derive and store encryption key if encryption is enabled
	if h.config.Encryption.Enabled && h.config.Encryption.Salt != "" {
		key, err := encryption.DeriveKey(req.Password, h.config.Encryption.Salt)
		if err == nil {
			encryption.GetKeyStore().Store(session.Token, key)
		}
	}

	// Set cookie
	c.SetCookie(
		middleware.SessionCookieName,
		session.Token,
		int(SessionDuration.Seconds()),
		"/",
		"",
		false, // secure (set true in production with HTTPS)
		true,  // httpOnly
	)

	log.Printf("[AUTH] Login success: username=%s, ip=%s, is_admin=%v", user.Username, clientIP, user.IsAdmin)

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"is_admin": user.IsAdmin,
		},
	})
}

// Logout handles session termination
func (h *AuthHandler) Logout(c *gin.Context) {
	clientIP := c.ClientIP()
	user := middleware.GetCurrentUser(c)
	username := "unknown"
	if user != nil {
		username = user.Username
	}

	cookie, err := c.Cookie(middleware.SessionCookieName)
	if err == nil {
		// Remove encryption key from store
		encryption.GetKeyStore().Delete(cookie)
		// Delete session from database
		h.sessionRepo.Delete(cookie)
	}

	log.Printf("[AUTH] Logout: username=%s, ip=%s", username, clientIP)

	c.SetCookie(middleware.SessionCookieName, "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}

// GetCurrentUser returns the currently logged in user
func (h *AuthHandler) GetCurrentUser(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"is_admin": user.IsAdmin,
	})
}

// VerifyRequest for note password verification (legacy)
type VerifyRequest struct {
	NoteID   string `json:"note_id" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Verify verifies note password (legacy - for private notes)
func (h *AuthHandler) Verify(c *gin.Context) {
	var req VerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get user storage path
	user := middleware.GetCurrentUser(c)
	var storagePath string
	if user != nil {
		storagePath = user.GetStoragePath(h.repo.GetPath())
	} else {
		storagePath = h.repo.GetPath()
	}

	// Notes are stored in the "notes" subdirectory
	notesPath := filepath.Join(storagePath, "notes")

	// Find the note file
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath := filepath.Join(notesPath, req.NoteID+ext)
		note, err = model.ParseNoteFromFile(filePath)
		if err == nil {
			break
		}
	}

	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	if !note.Private {
		c.JSON(http.StatusOK, gin.H{"valid": true, "message": "Note is not private"})
		return
	}

	if note.CheckPassword(req.Password) {
		c.JSON(http.StatusOK, gin.H{"valid": true})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"valid": false, "error": "Invalid password"})
	}
}
