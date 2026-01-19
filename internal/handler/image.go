package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/user/gitnotepad/internal/middleware"
)

// ImageMetadata stores the mapping between UUID filenames and original filenames
type ImageMetadata struct {
	sync.RWMutex
	cache map[string]map[string]string // username -> (uuid -> originalName)
}

var imageMetadata = &ImageMetadata{
	cache: make(map[string]map[string]string),
}

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

// getMetadataPath returns the path to the metadata file for a user
func (h *ImageHandler) getMetadataPath(username string) string {
	return filepath.Join(h.storagePath, username, "files", ".imagemeta.json")
}

// loadMetadata loads file metadata from disk for a user
func (h *ImageHandler) loadMetadata(username string) map[string]string {
	imageMetadata.RLock()
	if data, ok := imageMetadata.cache[username]; ok {
		imageMetadata.RUnlock()
		return data
	}
	imageMetadata.RUnlock()

	// Load from file
	metaPath := h.getMetadataPath(username)
	data := make(map[string]string)

	file, err := os.ReadFile(metaPath)
	if err == nil {
		json.Unmarshal(file, &data)
	}

	imageMetadata.Lock()
	imageMetadata.cache[username] = data
	imageMetadata.Unlock()

	return data
}

// saveMetadata saves file metadata to disk for a user
func (h *ImageHandler) saveMetadata(username string, uuidName, originalName string) error {
	imageMetadata.Lock()
	defer imageMetadata.Unlock()

	if imageMetadata.cache[username] == nil {
		imageMetadata.cache[username] = make(map[string]string)
	}
	imageMetadata.cache[username][uuidName] = originalName

	// Save to file
	metaPath := h.getMetadataPath(username)
	data, err := json.MarshalIndent(imageMetadata.cache[username], "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(metaPath, data, 0644)
}

// getOriginalName returns the original filename for a UUID filename
func (h *ImageHandler) getOriginalName(username, uuidName string) string {
	meta := h.loadMetadata(username)
	if name, ok := meta[uuidName]; ok {
		return name
	}
	return ""
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

	// Get original filename
	originalName := header.Filename

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

	// Save metadata mapping (UUID -> original filename)
	h.saveMetadata(username, filename, originalName)

	// Return URL for the file (with base path and username)
	fileURL := fmt.Sprintf("%s/u/%s/files/%s", h.basePath, username, filename)
	c.JSON(http.StatusOK, gin.H{
		"url":          fileURL,
		"filename":     filename,
		"originalName": originalName,
	})
}

func (h *ImageHandler) Serve(c *gin.Context) {
	username := c.Param("username")
	filename := c.Param("filename")
	download := c.Query("download") == "true"

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
	isLegacy := false

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// Try legacy path (global files directory) for backwards compatibility
		legacyPath := filepath.Join(h.storagePath, "files", filename)
		if _, err := os.Stat(legacyPath); os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
			return
		}
		filePath = legacyPath
		isLegacy = true
	}

	// Get original filename for download
	originalName := ""
	if !isLegacy {
		originalName = h.getOriginalName(username, filename)
	}
	if originalName == "" {
		originalName = filename // Fallback to UUID filename
	}

	// Serve file with original filename
	if download {
		// RFC 6266 / RFC 5987 compliant Content-Disposition
		// - filename: for legacy browsers (escape quotes/backslashes)
		// - filename*: for modern browsers (UTF-8 percent-encoded)
		safeFilename := strings.ReplaceAll(originalName, `\`, `\\`)
		safeFilename = strings.ReplaceAll(safeFilename, `"`, `\"`)
		encodedName := url.PathEscape(originalName)
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, safeFilename, encodedName))
	}
	c.File(filePath)
}

// deleteMetadata removes image metadata from disk for a user
func (h *ImageHandler) deleteMetadata(username, uuidName string) error {
	imageMetadata.Lock()
	defer imageMetadata.Unlock()

	if imageMetadata.cache[username] != nil {
		delete(imageMetadata.cache[username], uuidName)
	}

	// Save to file
	metaPath := h.getMetadataPath(username)
	if imageMetadata.cache[username] == nil || len(imageMetadata.cache[username]) == 0 {
		// Remove metadata file if empty
		os.Remove(metaPath)
		return nil
	}

	data, err := json.MarshalIndent(imageMetadata.cache[username], "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(metaPath, data, 0644)
}

// Delete removes an uploaded image
func (h *ImageHandler) Delete(c *gin.Context) {
	filename := c.Param("filename")

	// Security: prevent path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filename"})
		return
	}

	// Get user-specific files directory
	user := middleware.GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	filePath := filepath.Join(h.storagePath, user.Username, "files", filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
		return
	}

	// Delete the file
	if err := os.Remove(filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete image"})
		return
	}

	// Delete metadata
	h.deleteMetadata(user.Username, filename)

	c.JSON(http.StatusOK, gin.H{"message": "Image deleted"})
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
