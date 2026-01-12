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

// FileMetadata stores the mapping between UUID filenames and original filenames
type FileMetadata struct {
	sync.RWMutex
	cache map[string]map[string]string // username -> (uuid -> originalName)
}

var fileMetadata = &FileMetadata{
	cache: make(map[string]map[string]string),
}

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

// getMetadataPath returns the path to the metadata file for a user
func (h *FileHandler) getMetadataPath(username string) string {
	return filepath.Join(h.storagePath, username, "files", ".filemeta.json")
}

// loadMetadata loads file metadata from disk for a user
func (h *FileHandler) loadMetadata(username string) map[string]string {
	fileMetadata.RLock()
	if data, ok := fileMetadata.cache[username]; ok {
		fileMetadata.RUnlock()
		return data
	}
	fileMetadata.RUnlock()

	// Load from file
	metaPath := h.getMetadataPath(username)
	data := make(map[string]string)

	file, err := os.ReadFile(metaPath)
	if err == nil {
		json.Unmarshal(file, &data)
	}

	fileMetadata.Lock()
	fileMetadata.cache[username] = data
	fileMetadata.Unlock()

	return data
}

// saveMetadata saves file metadata to disk for a user
func (h *FileHandler) saveMetadata(username string, uuidName, originalName string) error {
	fileMetadata.Lock()
	defer fileMetadata.Unlock()

	if fileMetadata.cache[username] == nil {
		fileMetadata.cache[username] = make(map[string]string)
	}
	fileMetadata.cache[username][uuidName] = originalName

	// Save to file
	metaPath := h.getMetadataPath(username)
	data, err := json.MarshalIndent(fileMetadata.cache[username], "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(metaPath, data, 0644)
}

// getOriginalName returns the original filename for a UUID filename
func (h *FileHandler) getOriginalName(username, uuidName string) string {
	meta := h.loadMetadata(username)
	if name, ok := meta[uuidName]; ok {
		return name
	}
	return ""
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

func (h *FileHandler) Serve(c *gin.Context) {
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
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
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

	// Set Content-Disposition header for download with original filename
	if download {
		// RFC 5987 encoded filename for non-ASCII characters
		encodedName := url.PathEscape(originalName)
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"; filename*=UTF-8''%s", originalName, encodedName))
	}

	c.File(filePath)
}

// deleteMetadata removes file metadata from disk for a user
func (h *FileHandler) deleteMetadata(username, uuidName string) error {
	fileMetadata.Lock()
	defer fileMetadata.Unlock()

	if fileMetadata.cache[username] != nil {
		delete(fileMetadata.cache[username], uuidName)
	}

	// Save to file
	metaPath := h.getMetadataPath(username)
	if fileMetadata.cache[username] == nil || len(fileMetadata.cache[username]) == 0 {
		// Remove metadata file if empty
		os.Remove(metaPath)
		return nil
	}

	data, err := json.MarshalIndent(fileMetadata.cache[username], "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(metaPath, data, 0644)
}

// Delete removes an uploaded file
func (h *FileHandler) Delete(c *gin.Context) {
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
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	// Delete the file
	if err := os.Remove(filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete file"})
		return
	}

	// Delete metadata
	h.deleteMetadata(user.Username, filename)

	c.JSON(http.StatusOK, gin.H{"message": "File deleted"})
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
