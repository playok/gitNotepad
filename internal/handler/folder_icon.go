package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/database"
)

type FolderIconHandler struct {
	db *database.DB
}

func NewFolderIconHandler(db *database.DB) *FolderIconHandler {
	return &FolderIconHandler{db: db}
}

type FolderIcon struct {
	FolderPath string `json:"folder_path"`
	Icon       string `json:"icon"`
}

type SetFolderIconRequest struct {
	FolderPath string `json:"folder_path" binding:"required"`
	Icon       string `json:"icon" binding:"required"`
}

// List returns all folder icons for the current user
func (h *FolderIconHandler) List(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		// Return empty map for unauthenticated users instead of 401
		c.JSON(http.StatusOK, make(map[string]string))
		return
	}

	rows, err := h.db.Query(
		"SELECT folder_path, icon FROM folder_icons WHERE user_id = ?",
		userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch folder icons"})
		return
	}
	defer rows.Close()

	icons := make(map[string]string)
	for rows.Next() {
		var folderPath, icon string
		if err := rows.Scan(&folderPath, &icon); err != nil {
			continue
		}
		icons[folderPath] = icon
	}

	c.JSON(http.StatusOK, icons)
}

// Set creates or updates a folder icon
func (h *FolderIconHandler) Set(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req SetFolderIconRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Upsert folder icon
	_, err := h.db.Exec(
		`INSERT INTO folder_icons (user_id, folder_path, icon) VALUES (?, ?, ?)
		 ON CONFLICT(user_id, folder_path) DO UPDATE SET icon = excluded.icon`,
		userID, req.FolderPath, req.Icon,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save folder icon"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Icon saved"})
}

// Delete removes a folder icon
func (h *FolderIconHandler) Delete(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	folderPath := c.Query("folder_path")
	if folderPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "folder_path is required"})
		return
	}

	_, err := h.db.Exec(
		"DELETE FROM folder_icons WHERE user_id = ? AND folder_path = ?",
		userID, folderPath,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder icon"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Icon deleted"})
}
