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
	"github.com/user/gitnotepad/internal/encoding"
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

// MigrateAttachmentMetadata migrates attachment filenames from notes to metadata files
// This ensures old attachments without metadata get their original filenames restored
func MigrateAttachmentMetadata(storagePath string) error {
	fmt.Println("Starting attachment metadata migration...")

	// Read all user directories
	entries, err := os.ReadDir(storagePath)
	if err != nil {
		return fmt.Errorf("failed to read storage directory: %w", err)
	}

	totalMigrated := 0

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		username := entry.Name()
		// Skip special directories
		if username == "files" || username == "images" || strings.HasPrefix(username, ".") {
			continue
		}

		notesPath := filepath.Join(storagePath, username, "notes")
		if _, err := os.Stat(notesPath); os.IsNotExist(err) {
			continue
		}

		// Load existing metadata
		fileMeta := loadMetadataFile(filepath.Join(storagePath, username, "files", ".filemeta.json"))
		imageMeta := loadMetadataFile(filepath.Join(storagePath, username, "files", ".imagemeta.json"))

		userMigrated := 0

		// Walk through all notes
		filepath.WalkDir(notesPath, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}

			ext := filepath.Ext(path)
			if ext != ".md" && ext != ".txt" && ext != ".adoc" {
				return nil
			}

			// Read note file
			content, err := os.ReadFile(path)
			if err != nil {
				return nil
			}

			// Parse YAML frontmatter to get attachments
			attachments := parseAttachmentsFromNote(string(content))

			for _, att := range attachments {
				if att.Name == "" || att.URL == "" {
					continue
				}

				// Extract UUID filename from URL
				// URL patterns: /u/{username}/files/{uuid.ext} or /u/{username}/images/{uuid.ext}
				uuidFilename := extractUUIDFromURL(att.URL)
				if uuidFilename == "" {
					continue
				}

				// Determine if it's a file or image based on URL
				isImage := strings.Contains(att.URL, "/images/")

				if isImage {
					if _, exists := imageMeta[uuidFilename]; !exists {
						imageMeta[uuidFilename] = att.Name
						userMigrated++
					}
				} else {
					if _, exists := fileMeta[uuidFilename]; !exists {
						fileMeta[uuidFilename] = att.Name
						userMigrated++
					}
				}
			}

			return nil
		})

		// Save updated metadata
		if userMigrated > 0 {
			saveMetadataFile(filepath.Join(storagePath, username, "files", ".filemeta.json"), fileMeta)
			saveMetadataFile(filepath.Join(storagePath, username, "files", ".imagemeta.json"), imageMeta)
			totalMigrated += userMigrated
			encoding.Debug("User %s: migrated %d attachment(s)", username, userMigrated)
		}
	}

	if totalMigrated > 0 {
		encoding.Info("Attachment metadata migration completed: %d total", totalMigrated)
	}

	return nil
}

// loadMetadataFile loads metadata from a JSON file
func loadMetadataFile(path string) map[string]string {
	data := make(map[string]string)
	content, err := os.ReadFile(path)
	if err == nil {
		json.Unmarshal(content, &data)
	}
	return data
}

// saveMetadataFile saves metadata to a JSON file
func saveMetadataFile(path string, data map[string]string) error {
	// Ensure directory exists
	dir := filepath.Dir(path)
	os.MkdirAll(dir, 0755)

	content, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, content, 0644)
}

// extractUUIDFromURL extracts the UUID filename from an attachment URL
func extractUUIDFromURL(urlStr string) string {
	// Handle both absolute and relative URLs
	// Examples:
	// /u/username/files/abc123.pdf
	// /note/u/username/images/abc123.jpg
	// https://example.com/note/u/username/files/abc123.pdf

	parts := strings.Split(urlStr, "/")
	if len(parts) < 2 {
		return ""
	}

	// Get the last part (filename)
	filename := parts[len(parts)-1]

	// Verify it looks like a UUID-based filename (should not contain spaces, should have extension)
	if strings.Contains(filename, " ") || !strings.Contains(filename, ".") {
		return ""
	}

	return filename
}

// parseAttachmentsFromNote extracts attachments from note YAML frontmatter
func parseAttachmentsFromNote(content string) []attachmentInfo {
	var attachments []attachmentInfo

	// Check for YAML frontmatter
	if !strings.HasPrefix(content, "---") {
		return attachments
	}

	// Find end of frontmatter
	endIdx := strings.Index(content[3:], "\n---")
	if endIdx == -1 {
		return attachments
	}

	frontmatter := content[3 : endIdx+3]

	// Simple YAML parsing for attachments
	// Look for attachments: section
	lines := strings.Split(frontmatter, "\n")
	inAttachments := false
	currentAttachment := attachmentInfo{}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if trimmed == "attachments:" {
			inAttachments = true
			continue
		}

		if inAttachments {
			// Check if we're still in attachments section
			if len(line) > 0 && line[0] != ' ' && line[0] != '-' {
				break
			}

			if strings.HasPrefix(trimmed, "- name:") || strings.HasPrefix(trimmed, "-name:") {
				// New attachment entry with name on same line
				if currentAttachment.Name != "" {
					attachments = append(attachments, currentAttachment)
				}
				currentAttachment = attachmentInfo{}
				currentAttachment.Name = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(trimmed, "- name:"), "-name:"))
			} else if strings.HasPrefix(trimmed, "name:") {
				currentAttachment.Name = strings.TrimSpace(strings.TrimPrefix(trimmed, "name:"))
			} else if strings.HasPrefix(trimmed, "url:") {
				currentAttachment.URL = strings.TrimSpace(strings.TrimPrefix(trimmed, "url:"))
			} else if trimmed == "-" {
				// New attachment entry
				if currentAttachment.Name != "" {
					attachments = append(attachments, currentAttachment)
				}
				currentAttachment = attachmentInfo{}
			}
		}
	}

	// Don't forget the last attachment
	if currentAttachment.Name != "" {
		attachments = append(attachments, currentAttachment)
	}

	return attachments
}

type attachmentInfo struct {
	Name string
	URL  string
}
