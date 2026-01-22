package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/encoding"
	"github.com/user/gitnotepad/internal/middleware"
	"github.com/user/gitnotepad/internal/model"
	"github.com/user/gitnotepad/internal/repository"
)

type AdminHandler struct {
	userRepo    *repository.UserRepository
	storagePath string
}

func NewAdminHandler(userRepo *repository.UserRepository, storagePath string) *AdminHandler {
	return &AdminHandler{
		userRepo:    userRepo,
		storagePath: storagePath,
	}
}

// CreateUserRequest represents the request to create a new user
type CreateUserRequest struct {
	Username string `json:"username" binding:"required,min=3,max=32"`
	Password string `json:"password" binding:"required,min=6"`
	IsAdmin  bool   `json:"is_admin"`
}

// CreateUser creates a new user (admin only)
func (h *AdminHandler) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if username already exists
	existing, _ := h.userRepo.GetByUsername(req.Username)
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Username already exists"})
		return
	}

	user := &model.User{
		Username: req.Username,
		IsAdmin:  req.IsAdmin,
	}

	if err := user.SetPassword(req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := h.userRepo.Create(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Create user storage directory
	userDir := filepath.Join(h.storagePath, user.Username)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		// Log error but don't fail - directory will be created on first note save
		// The user was created successfully in DB
	}

	// Log user creation
	adminUser := middleware.GetCurrentUser(c)
	adminName := "unknown"
	if adminUser != nil {
		adminName = adminUser.Username
	}
	encoding.Info("User created: username=%s, is_admin=%v, by=%s, ip=%s", user.Username, user.IsAdmin, adminName, c.ClientIP())

	c.JSON(http.StatusCreated, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"is_admin": user.IsAdmin,
	})
}

// ListUsers returns all users (admin only)
func (h *AdminHandler) ListUsers(c *gin.Context) {
	users, err := h.userRepo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list users"})
		return
	}

	// Return users without password hash
	result := make([]gin.H, len(users))
	for i, user := range users {
		result[i] = gin.H{
			"id":         user.ID,
			"username":   user.Username,
			"is_admin":   user.IsAdmin,
			"created_at": user.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, result)
}

// DeleteUser removes a user (admin only)
func (h *AdminHandler) DeleteUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Check if user exists
	user, err := h.userRepo.GetByID(id)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Prevent deleting the last admin
	if user.IsAdmin {
		users, _ := h.userRepo.List()
		adminCount := 0
		for _, u := range users {
			if u.IsAdmin {
				adminCount++
			}
		}
		if adminCount <= 1 {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete the last admin"})
			return
		}
	}

	if err := h.userRepo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	// Delete user storage directory
	userDir := filepath.Join(h.storagePath, user.Username)
	if err := os.RemoveAll(userDir); err != nil {
		// Log error but don't fail - user was deleted from DB successfully
		// Directory might not exist or have permission issues
	}

	// Log user deletion
	adminUser := middleware.GetCurrentUser(c)
	adminName := "unknown"
	if adminUser != nil {
		adminName = adminUser.Username
	}
	encoding.Info("User deleted: username=%s, by=%s, ip=%s", user.Username, adminName, c.ClientIP())

	c.JSON(http.StatusOK, gin.H{"message": "User deleted"})
}

// UpdatePasswordRequest represents the request to update password
type UpdatePasswordRequest struct {
	Password string `json:"password" binding:"required,min=6"`
}

// UpdatePassword updates a user's password (admin only)
func (h *AdminHandler) UpdatePassword(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var req UpdatePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.GetByID(id)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if err := user.SetPassword(req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := h.userRepo.Update(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	// Log password update
	adminUser := middleware.GetCurrentUser(c)
	adminName := "unknown"
	if adminUser != nil {
		adminName = adminUser.Username
	}
	encoding.Info("Password changed: username=%s, by=%s, ip=%s", user.Username, adminName, c.ClientIP())

	c.JSON(http.StatusOK, gin.H{"message": "Password updated"})
}
