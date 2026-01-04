package handler

import (
	"net/http"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
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
}

func NewAuthHandler(repo *git.Repository, userRepo *repository.UserRepository, sessionRepo *repository.SessionRepository) *AuthHandler {
	return &AuthHandler{
		repo:        repo,
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
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

	user, err := h.userRepo.GetByUsername(req.Username)
	if err != nil || user == nil || !user.CheckPassword(req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Create session
	session := model.NewSession(user.ID, SessionDuration)
	if err := h.sessionRepo.Create(session); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
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
	cookie, err := c.Cookie(middleware.SessionCookieName)
	if err == nil {
		h.sessionRepo.Delete(cookie)
	}

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

	// Find the note file
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt"} {
		filePath := filepath.Join(storagePath, req.NoteID+ext)
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
