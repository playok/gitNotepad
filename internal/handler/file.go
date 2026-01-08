package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/gitnotepad/internal/middleware"
)

type FileHandler struct {
	storagePath string
	basePath    string
}

func NewFileHandler(storagePath string, basePath string) *FileHandler {
	return &FileHandler{
		storagePath: storagePath,
		basePath:    basePath,
	}
}

// getUserFilesPath returns the user-specific files directory
func (h *FileHandler) getUserFilesPath(c *gin.Context) string {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		// Fallback to global files directory
		return filepath.Join(h.storagePath, "files")
	}

	userFilesPath := filepath.Join(h.storagePath, user.Username, "files")
	os.MkdirAll(userFilesPath, 0755)
	return userFilesPath
}

func (h *FileHandler) Upload(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}
	defer file.Close()

	// Get original filename and extension
	originalName := header.Filename
	ext := filepath.Ext(originalName)
	if ext == "" {
		ext = ".bin"
	}

	// Get user-specific files directory
	userFilesPath := h.getUserFilesPath(c)

	// Generate UUID filename with original extension
	filename := uuid.New().String() + ext
	filePath := filepath.Join(userFilesPath, filename)

	// Create file
	dst, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	defer dst.Close()

	// Copy file content
	if _, err := io.Copy(dst, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Get username for URL
	user := middleware.GetCurrentUser(c)
	username := "shared"
	if user != nil {
		username = user.Username
	}

	// Return URL for the file (with base path and username)
	fileURL := fmt.Sprintf("%s/files/%s/%s", h.basePath, username, filename)
	c.JSON(http.StatusOK, gin.H{
		"url":          fileURL,
		"filename":     filename,
		"originalName": originalName,
	})
}

func (h *FileHandler) Serve(c *gin.Context) {
	username := c.Param("username")
	filename := c.Param("filename")

	// Security: prevent path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filename"})
		return
	}
	if strings.Contains(username, "..") || strings.Contains(username, "/") || strings.Contains(username, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid username"})
		return
	}

	filePath := filepath.Join(h.storagePath, username, "files", filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// Try legacy path (global files directory) for backwards compatibility
		legacyPath := filepath.Join(h.storagePath, "files", filename)
		if _, err := os.Stat(legacyPath); os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
			return
		}
		c.File(legacyPath)
		return
	}

	c.File(filePath)
}

// ServeLegacy serves files from the legacy global files directory
func (h *FileHandler) ServeLegacy(c *gin.Context) {
	filename := c.Param("filename")

	// Security: prevent path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filename"})
		return
	}

	filePath := filepath.Join(h.storagePath, "files", filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	c.File(filePath)
}
