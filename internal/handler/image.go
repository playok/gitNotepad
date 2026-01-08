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

type ImageHandler struct {
	storagePath string
	basePath    string
}

func NewImageHandler(storagePath string, basePath string) *ImageHandler {
	return &ImageHandler{
		storagePath: storagePath,
		basePath:    basePath,
	}
}

// getUserFilesPath returns the user-specific files directory
func (h *ImageHandler) getUserFilesPath(c *gin.Context) string {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		// Fallback to global files directory
		return filepath.Join(h.storagePath, "files")
	}

	userFilesPath := filepath.Join(h.storagePath, user.Username, "files")
	os.MkdirAll(userFilesPath, 0755)
	return userFilesPath
}

func (h *ImageHandler) Upload(c *gin.Context) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No image provided"})
		return
	}
	defer file.Close()

	// Validate content type
	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type"})
		return
	}

	// Determine file extension
	ext := ".png"
	switch contentType {
	case "image/jpeg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "image/svg+xml":
		ext = ".svg"
	}

	// Get user-specific files directory
	userFilesPath := h.getUserFilesPath(c)

	// Generate UUID filename
	filename := uuid.New().String() + ext
	filePath := filepath.Join(userFilesPath, filename)

	// Create file
	dst, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save image"})
		return
	}
	defer dst.Close()

	// Copy file content
	if _, err := io.Copy(dst, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save image"})
		return
	}

	// Get username for URL
	user := middleware.GetCurrentUser(c)
	username := "shared"
	if user != nil {
		username = user.Username
	}

	// Return URL for the file (with base path and username)
	fileURL := fmt.Sprintf("%s/u/%s/files/%s", h.basePath, username, filename)
	c.JSON(http.StatusOK, gin.H{
		"url":      fileURL,
		"filename": filename,
	})
}

func (h *ImageHandler) Serve(c *gin.Context) {
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
			c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
			return
		}
		c.File(legacyPath)
		return
	}

	c.File(filePath)
}

// ServeLegacy serves files from the legacy global files directory
func (h *ImageHandler) ServeLegacy(c *gin.Context) {
	filename := c.Param("filename")

	// Security: prevent path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filename"})
		return
	}

	filePath := filepath.Join(h.storagePath, "files", filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
		return
	}

	c.File(filePath)
}
