package handler

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/git"
	"github.com/user/gitnotepad/internal/middleware"
	"github.com/user/gitnotepad/internal/model"
)

// ShortLinkInfo contains short link data with optional expiry
type ShortLinkInfo struct {
	NoteID     string     `json:"note_id,omitempty"`
	FolderPath string     `json:"folder_path,omitempty"` // For folder sharing (empty = note link)
	Username   string     `json:"username"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	IsPublic   bool       `json:"is_public"`
}

type ShortLinkHandler struct {
	repo             *git.Repository
	config           *config.Config
	links            map[string]*ShortLinkInfo // shortCode -> ShortLinkInfo
	reverseMap       map[string]string         // noteId -> shortCode
	folderReverseMap map[string]string         // folderPath -> shortCode
	mu               sync.RWMutex
	storagePath      string
	basePath         string
}

func NewShortLinkHandler(repo *git.Repository, cfg *config.Config, basePath string) *ShortLinkHandler {
	h := &ShortLinkHandler{
		repo:             repo,
		config:           cfg,
		links:            make(map[string]*ShortLinkInfo),
		reverseMap:       make(map[string]string),
		folderReverseMap: make(map[string]string),
		storagePath:      filepath.Join(repo.GetPath(), ".shortlinks.json"),
		basePath:         basePath,
	}
	h.load()
	h.startCleanupScheduler()
	return h
}

func (h *ShortLinkHandler) load() {
	data, err := os.ReadFile(h.storagePath)
	if err != nil {
		return
	}

	// Try new format first
	var links map[string]*ShortLinkInfo
	if err := json.Unmarshal(data, &links); err != nil {
		// Try legacy format (map[string]string)
		var legacyLinks map[string]string
		if err := json.Unmarshal(data, &legacyLinks); err != nil {
			return
		}
		// Convert legacy format
		links = make(map[string]*ShortLinkInfo)
		for code, noteId := range legacyLinks {
			links[code] = &ShortLinkInfo{
				NoteID:    noteId,
				CreatedAt: time.Now(),
			}
		}
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	h.links = links
	h.reverseMap = make(map[string]string)
	h.folderReverseMap = make(map[string]string)
	for code, info := range links {
		if info.FolderPath != "" {
			h.folderReverseMap[info.FolderPath] = code
		} else if info.NoteID != "" {
			h.reverseMap[info.NoteID] = code
		}
	}
}

func (h *ShortLinkHandler) save() error {
	h.mu.RLock()
	data, err := json.MarshalIndent(h.links, "", "  ")
	h.mu.RUnlock()
	if err != nil {
		return err
	}
	return os.WriteFile(h.storagePath, data, 0644)
}

// startCleanupScheduler runs daily cleanup of expired links
func (h *ShortLinkHandler) startCleanupScheduler() {
	go func() {
		// Run cleanup once at startup
		h.cleanupExpiredLinks()

		// Then run daily at midnight
		for {
			now := time.Now()
			nextMidnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
			time.Sleep(time.Until(nextMidnight))
			h.cleanupExpiredLinks()
		}
	}()
}

// cleanupExpiredLinks removes expired short links
func (h *ShortLinkHandler) cleanupExpiredLinks() {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := time.Now()
	expiredCodes := []string{}

	for code, info := range h.links {
		if info.ExpiresAt != nil && info.ExpiresAt.Before(now) {
			expiredCodes = append(expiredCodes, code)
		}
	}

	for _, code := range expiredCodes {
		info := h.links[code]
		if info.FolderPath != "" {
			delete(h.folderReverseMap, info.FolderPath)
		} else {
			delete(h.reverseMap, info.NoteID)
		}
		delete(h.links, code)
	}

	if len(expiredCodes) > 0 {
		go h.save()
	}
}

func generateShortCode() string {
	bytes := make([]byte, 4)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// GenerateRequest represents the request body for generating a short link
type GenerateRequest struct {
	ExpiresIn *int  `json:"expires_in"` // Days until expiry (nil = never expires)
	IsPublic  *bool `json:"is_public"`  // Whether the link is publicly accessible without auth
}

// decodeNoteIDParam base64-decodes the note ID from path parameter
// Supports both standard and URL-safe base64 encoding
func decodeNoteIDParam(id string) string {
	// Try URL-safe base64 first (used by new frontend)
	decoded, err := base64.RawURLEncoding.DecodeString(id)
	if err != nil {
		// Fallback to standard base64 (for backwards compatibility)
		decoded, err = base64.StdEncoding.DecodeString(id)
		if err != nil {
			return id // Return original if decode fails
		}
	}
	return string(decoded)
}

// Generate creates or returns existing short link for a note
func (h *ShortLinkHandler) Generate(c *gin.Context) {
	noteId := decodeNoteIDParam(c.Param("id"))
	if noteId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note ID required"})
		return
	}

	// Get current user for public links
	user := middleware.GetCurrentUser(c)
	username := ""
	if user != nil {
		username = user.Username
	}

	// Parse request body for expiry
	var req GenerateRequest
	c.ShouldBindJSON(&req)

	h.mu.Lock()
	defer h.mu.Unlock()

	// Check if short link already exists
	if code, exists := h.reverseMap[noteId]; exists {
		info := h.links[code]
		changed := false
		// Update expiry if provided
		if req.ExpiresIn != nil {
			if *req.ExpiresIn == 0 {
				info.ExpiresAt = nil // Never expires
			} else {
				expiresAt := time.Now().AddDate(0, 0, *req.ExpiresIn)
				info.ExpiresAt = &expiresAt
			}
			changed = true
		}
		// Update public flag if provided
		if req.IsPublic != nil {
			info.IsPublic = *req.IsPublic
			changed = true
		}
		if changed {
			go h.save()
		}
		c.JSON(http.StatusOK, gin.H{
			"code":      code,
			"shortLink": h.basePath + "/s/" + code,
			"expiresAt": info.ExpiresAt,
			"isPublic":  info.IsPublic,
		})
		return
	}

	// Generate new short code
	code := generateShortCode()
	for {
		if _, exists := h.links[code]; !exists {
			break
		}
		code = generateShortCode()
	}

	// Calculate expiry
	var expiresAt *time.Time
	if req.ExpiresIn != nil && *req.ExpiresIn > 0 {
		t := time.Now().AddDate(0, 0, *req.ExpiresIn)
		expiresAt = &t
	}

	// Determine public flag
	isPublic := false
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}

	h.links[code] = &ShortLinkInfo{
		NoteID:    noteId,
		Username:  username,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
		IsPublic:  isPublic,
	}
	h.reverseMap[noteId] = code

	go h.save()

	c.JSON(http.StatusOK, gin.H{
		"code":      code,
		"shortLink": h.basePath + "/s/" + code,
		"expiresAt": expiresAt,
		"isPublic":  isPublic,
	})
}

// Redirect handles short link redirection
func (h *ShortLinkHandler) Redirect(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.Redirect(http.StatusFound, h.basePath+"/")
		return
	}

	h.mu.RLock()
	info, exists := h.links[code]
	h.mu.RUnlock()

	if !exists {
		c.Redirect(http.StatusFound, h.basePath+"/")
		return
	}

	// Check if link has expired
	if info.ExpiresAt != nil && info.ExpiresAt.Before(time.Now()) {
		c.HTML(http.StatusGone, "expired.html", gin.H{
			"basePath": h.basePath,
		})
		return
	}

	// For folder links
	if info.FolderPath != "" {
		if info.IsPublic {
			c.Redirect(http.StatusFound, h.basePath+"/folder-preview/"+code)
		} else {
			c.Redirect(http.StatusFound, h.basePath+"/#folder="+info.FolderPath)
		}
		return
	}

	// For public note links, redirect to public preview page
	if info.IsPublic {
		c.Redirect(http.StatusFound, h.basePath+"/preview/"+code)
		return
	}

	// Redirect to main page with note ID as hash
	c.Redirect(http.StatusFound, h.basePath+"/#note="+info.NoteID)
}

// Get returns the short link for a note if it exists
func (h *ShortLinkHandler) Get(c *gin.Context) {
	noteId := decodeNoteIDParam(c.Param("id"))
	if noteId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note ID required"})
		return
	}

	h.mu.RLock()
	code, exists := h.reverseMap[noteId]
	var info *ShortLinkInfo
	if exists {
		info = h.links[code]
	}
	h.mu.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "No short link for this note"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":      code,
		"shortLink": h.basePath + "/s/" + code,
		"expiresAt": info.ExpiresAt,
		"createdAt": info.CreatedAt,
		"isPublic":  info.IsPublic,
	})
}

// Delete removes a short link
func (h *ShortLinkHandler) Delete(c *gin.Context) {
	noteId := decodeNoteIDParam(c.Param("id"))
	if noteId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note ID required"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	code, exists := h.reverseMap[noteId]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "No short link for this note"})
		return
	}

	delete(h.links, code)
	delete(h.reverseMap, noteId)

	go h.save()

	c.JSON(http.StatusOK, gin.H{"message": "Short link deleted"})
}

// ShortLinkListItem represents a short link item in the list
type ShortLinkListItem struct {
	Code      string     `json:"code"`
	NoteID    string     `json:"note_id"`
	NoteTitle string     `json:"note_title"`
	ShortLink string     `json:"short_link"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	IsPublic  bool       `json:"is_public"`
}

// List returns all short links for the current user
func (h *ShortLinkHandler) List(c *gin.Context) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	items := make([]ShortLinkListItem, 0, len(h.links))
	for code, info := range h.links {
		items = append(items, ShortLinkListItem{
			Code:      code,
			NoteID:    info.NoteID,
			NoteTitle: "", // Will be populated by frontend or separate lookup
			ShortLink: h.basePath + "/s/" + code,
			ExpiresAt: info.ExpiresAt,
			CreatedAt: info.CreatedAt,
			IsPublic:  info.IsPublic,
		})
	}

	c.JSON(http.StatusOK, items)
}

// UpdateRequest represents the request body for updating a short link
type UpdateRequest struct {
	ExpiresIn *int  `json:"expires_in"` // Days until expiry (nil = no change, 0 = never expires, >0 = days)
	IsPublic  *bool `json:"is_public"`  // Whether the link is publicly accessible
}

// UpdateByCode updates a short link's expiry by code
func (h *ShortLinkHandler) UpdateByCode(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code required"})
		return
	}

	var req UpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	info, exists := h.links[code]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Short link not found"})
		return
	}

	// Update expiry
	if req.ExpiresIn != nil {
		if *req.ExpiresIn == 0 {
			info.ExpiresAt = nil // Never expires
		} else {
			expiresAt := time.Now().AddDate(0, 0, *req.ExpiresIn)
			info.ExpiresAt = &expiresAt
		}
	}

	// Update public flag
	if req.IsPublic != nil {
		info.IsPublic = *req.IsPublic
	}

	go h.save()

	c.JSON(http.StatusOK, gin.H{
		"code":      code,
		"shortLink": h.basePath + "/s/" + code,
		"expiresAt": info.ExpiresAt,
		"createdAt": info.CreatedAt,
		"isPublic":  info.IsPublic,
	})
}

// DeleteByCode removes a short link by code
func (h *ShortLinkHandler) DeleteByCode(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code required"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	info, exists := h.links[code]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Short link not found"})
		return
	}

	delete(h.reverseMap, info.NoteID)
	delete(h.links, code)

	go h.save()

	c.JSON(http.StatusOK, gin.H{"message": "Short link deleted"})
}

// PublicPreview renders the public preview page for a shared note
func (h *ShortLinkHandler) PublicPreview(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.Redirect(http.StatusFound, h.basePath+"/")
		return
	}

	h.mu.RLock()
	info, exists := h.links[code]
	h.mu.RUnlock()

	if !exists {
		c.Redirect(http.StatusFound, h.basePath+"/")
		return
	}

	// Check if link is public
	if !info.IsPublic {
		c.Redirect(http.StatusFound, h.basePath+"/")
		return
	}

	// Check if link has expired
	if info.ExpiresAt != nil && info.ExpiresAt.Before(time.Now()) {
		c.HTML(http.StatusGone, "expired.html", gin.H{
			"basePath": h.basePath,
		})
		return
	}

	c.HTML(http.StatusOK, "preview.html", gin.H{
		"basePath": h.basePath,
		"code":     code,
	})
}

// GetPublicNote returns note content for public preview (no authentication required)
func (h *ShortLinkHandler) GetPublicNote(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code required"})
		return
	}

	h.mu.RLock()
	info, exists := h.links[code]
	h.mu.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Link not found"})
		return
	}

	// Check if link is public
	if !info.IsPublic {
		c.JSON(http.StatusForbidden, gin.H{"error": "This link is not public"})
		return
	}

	// Check if link has expired
	if info.ExpiresAt != nil && info.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "Link has expired"})
		return
	}

	// Construct the file path: {storagePath}/{username}/notes/{noteId}.{ext}
	notesPath := filepath.Join(h.config.Storage.Path, info.Username, "notes")

	// Try different extensions
	var note *model.Note
	var err error
	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath := filepath.Join(notesPath, info.NoteID+ext)
		data, readErr := os.ReadFile(filePath)
		if readErr != nil {
			continue
		}
		note, err = model.ParseNoteFromBytes(data, filePath)
		if err == nil {
			note.ID = info.NoteID
			break
		}
	}

	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Don't expose password-protected notes publicly
	if note.Private {
		c.JSON(http.StatusForbidden, gin.H{"error": "This note is password protected"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       note.ID,
		"title":    note.Title,
		"content":  note.Content,
		"type":     note.Type,
		"modified": note.Modified,
	})
}

// FolderGenerateRequest represents the request body for generating a folder short link
type FolderGenerateRequest struct {
	FolderPath string `json:"folder_path"`
	ExpiresIn  *int   `json:"expires_in"` // Days until expiry (nil = never expires)
	IsPublic   *bool  `json:"is_public"`  // Whether the link is publicly accessible
}

// GenerateFolderLink creates or returns existing short link for a folder
func (h *ShortLinkHandler) GenerateFolderLink(c *gin.Context) {
	var req FolderGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.FolderPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Folder path required"})
		return
	}

	// Get current user
	user := middleware.GetCurrentUser(c)
	username := ""
	if user != nil {
		username = user.Username
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	// Check if short link already exists for this folder
	if code, exists := h.folderReverseMap[req.FolderPath]; exists {
		info := h.links[code]
		changed := false
		// Update expiry if provided
		if req.ExpiresIn != nil {
			if *req.ExpiresIn == 0 {
				info.ExpiresAt = nil
			} else {
				expiresAt := time.Now().AddDate(0, 0, *req.ExpiresIn)
				info.ExpiresAt = &expiresAt
			}
			changed = true
		}
		// Update public flag if provided
		if req.IsPublic != nil {
			info.IsPublic = *req.IsPublic
			changed = true
		}
		if changed {
			go h.save()
		}
		c.JSON(http.StatusOK, gin.H{
			"code":       code,
			"shortLink":  h.basePath + "/s/" + code,
			"folderPath": info.FolderPath,
			"expiresAt":  info.ExpiresAt,
			"isPublic":   info.IsPublic,
		})
		return
	}

	// Generate new short code
	code := generateShortCode()
	for {
		if _, exists := h.links[code]; !exists {
			break
		}
		code = generateShortCode()
	}

	// Calculate expiry
	var expiresAt *time.Time
	if req.ExpiresIn != nil && *req.ExpiresIn > 0 {
		t := time.Now().AddDate(0, 0, *req.ExpiresIn)
		expiresAt = &t
	}

	// Determine public flag (default true for folder sharing)
	isPublic := true
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}

	h.links[code] = &ShortLinkInfo{
		FolderPath: req.FolderPath,
		Username:   username,
		ExpiresAt:  expiresAt,
		CreatedAt:  time.Now(),
		IsPublic:   isPublic,
	}
	h.folderReverseMap[req.FolderPath] = code

	go h.save()

	c.JSON(http.StatusOK, gin.H{
		"code":       code,
		"shortLink":  h.basePath + "/s/" + code,
		"folderPath": req.FolderPath,
		"expiresAt":  expiresAt,
		"isPublic":   isPublic,
	})
}

// GetFolderLink returns the short link for a folder if it exists
func (h *ShortLinkHandler) GetFolderLink(c *gin.Context) {
	folderPath := c.Query("path")
	if folderPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Folder path required"})
		return
	}

	h.mu.RLock()
	code, exists := h.folderReverseMap[folderPath]
	var info *ShortLinkInfo
	if exists {
		info = h.links[code]
	}
	h.mu.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "No short link for this folder"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":       code,
		"shortLink":  h.basePath + "/s/" + code,
		"folderPath": info.FolderPath,
		"expiresAt":  info.ExpiresAt,
		"createdAt":  info.CreatedAt,
		"isPublic":   info.IsPublic,
	})
}

// DeleteFolderLink removes a folder short link
func (h *ShortLinkHandler) DeleteFolderLink(c *gin.Context) {
	folderPath := c.Query("path")
	if folderPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Folder path required"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	code, exists := h.folderReverseMap[folderPath]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "No short link for this folder"})
		return
	}

	delete(h.links, code)
	delete(h.folderReverseMap, folderPath)

	go h.save()

	c.JSON(http.StatusOK, gin.H{"message": "Folder short link deleted"})
}

// FolderPreview renders the public preview page for a shared folder
func (h *ShortLinkHandler) FolderPreview(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.Redirect(http.StatusFound, h.basePath+"/")
		return
	}

	h.mu.RLock()
	info, exists := h.links[code]
	h.mu.RUnlock()

	if !exists || info.FolderPath == "" {
		c.Redirect(http.StatusFound, h.basePath+"/")
		return
	}

	// Check if link is public
	if !info.IsPublic {
		c.Redirect(http.StatusFound, h.basePath+"/")
		return
	}

	// Check if link has expired
	if info.ExpiresAt != nil && info.ExpiresAt.Before(time.Now()) {
		c.HTML(http.StatusGone, "expired.html", gin.H{
			"basePath": h.basePath,
		})
		return
	}

	c.HTML(http.StatusOK, "folder-preview.html", gin.H{
		"basePath": h.basePath,
		"code":     code,
	})
}

// FolderNoteListItem represents a note in the folder tree
type FolderNoteListItem struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	Type     string    `json:"type"`
	Modified time.Time `json:"modified"`
	Children []FolderNoteListItem `json:"children,omitempty"`
	IsFolder bool      `json:"is_folder,omitempty"`
}

// GetPublicFolder returns folder notes for public preview
func (h *ShortLinkHandler) GetPublicFolder(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code required"})
		return
	}

	h.mu.RLock()
	info, exists := h.links[code]
	h.mu.RUnlock()

	if !exists || info.FolderPath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder link not found"})
		return
	}

	// Check if link is public
	if !info.IsPublic {
		c.JSON(http.StatusForbidden, gin.H{"error": "This link is not public"})
		return
	}

	// Check if link has expired
	if info.ExpiresAt != nil && info.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "Link has expired"})
		return
	}

	// Get all notes in the folder (including subdirectories)
	notesPath := filepath.Join(h.config.Storage.Path, info.Username, "notes")
	folderPrefix := info.FolderPath + ":>:"

	// Convert folder path separator (:>:) to file system path separator
	folderDirPath := strings.ReplaceAll(info.FolderPath, ":>:", string(filepath.Separator))
	targetFolderPath := filepath.Join(notesPath, folderDirPath)

	notes := []FolderNoteListItem{}

	// Check if folder exists
	if _, err := os.Stat(targetFolderPath); os.IsNotExist(err) {
		c.JSON(http.StatusOK, gin.H{
			"folderPath": info.FolderPath,
			"notes":      notes,
		})
		return
	}

	// Walk through all files recursively in the target folder
	filepath.WalkDir(targetFolderPath, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}

		if d.IsDir() {
			// Skip .git directories
			if d.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}

		ext := filepath.Ext(d.Name())
		if ext != ".md" && ext != ".txt" && ext != ".adoc" {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		note, err := model.ParseNoteFromBytes(data, path)
		if err != nil {
			return nil
		}

		// Check if note title has the folder prefix (for folder sharing to work correctly)
		if !strings.HasPrefix(note.Title, folderPrefix) && note.Title != info.FolderPath {
			return nil
		}

		// Skip password-protected notes
		if note.Private {
			return nil
		}

		// Build note ID from relative path
		relPath, _ := filepath.Rel(notesPath, path)
		relPath = filepath.ToSlash(relPath) // Convert to forward slash for consistency
		fileNameWithoutExt := strings.TrimSuffix(relPath, ext)
		noteID := fileNameWithoutExt

		notes = append(notes, FolderNoteListItem{
			ID:       noteID,
			Title:    note.Title,
			Type:     note.Type,
			Modified: note.Modified,
		})

		return nil
	})

	c.JSON(http.StatusOK, gin.H{
		"folderPath": info.FolderPath,
		"notes":      notes,
	})
}

// GetPublicFolderNote returns a specific note from a shared folder
func (h *ShortLinkHandler) GetPublicFolderNote(c *gin.Context) {
	code := c.Param("code")
	noteID := c.Param("noteId")

	if code == "" || noteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Code and note ID required"})
		return
	}

	h.mu.RLock()
	info, exists := h.links[code]
	h.mu.RUnlock()

	if !exists || info.FolderPath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder link not found"})
		return
	}

	// Check if link is public
	if !info.IsPublic {
		c.JSON(http.StatusForbidden, gin.H{"error": "This link is not public"})
		return
	}

	// Check if link has expired
	if info.ExpiresAt != nil && info.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusGone, gin.H{"error": "Link has expired"})
		return
	}

	// Decode note ID (format: "FolderPath/uuid" with / separator)
	decodedNoteID := decodeNoteIDParam(noteID)

	// Verify note belongs to the shared folder
	// Note ID format: "Telegram/uuid" or "folder:>:subfolder/uuid"
	if !strings.HasPrefix(decodedNoteID, info.FolderPath+"/") && decodedNoteID != info.FolderPath {
		c.JSON(http.StatusForbidden, gin.H{"error": "Note not in shared folder"})
		return
	}

	// Extract the actual file UUID from the note ID
	// e.g., "Telegram/uuid" -> "uuid"
	var fileID string
	if strings.HasPrefix(decodedNoteID, info.FolderPath+"/") {
		fileID = strings.TrimPrefix(decodedNoteID, info.FolderPath+"/")
	} else {
		fileID = decodedNoteID
	}

	// Build the actual file path
	notesPath := filepath.Join(h.config.Storage.Path, info.Username, "notes")
	folderDirPath := strings.ReplaceAll(info.FolderPath, ":>:", string(filepath.Separator))
	targetFolderPath := filepath.Join(notesPath, folderDirPath)

	var note *model.Note
	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath := filepath.Join(targetFolderPath, fileID+ext)
		data, readErr := os.ReadFile(filePath)
		if readErr != nil {
			continue
		}
		note, _ = model.ParseNoteFromBytes(data, filePath)
		if note != nil {
			note.ID = decodedNoteID
			break
		}
	}

	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Don't expose password-protected notes
	if note.Private {
		c.JSON(http.StatusForbidden, gin.H{"error": "This note is password protected"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       note.ID,
		"title":    note.Title,
		"content":  note.Content,
		"type":     note.Type,
		"modified": note.Modified,
	})
}
