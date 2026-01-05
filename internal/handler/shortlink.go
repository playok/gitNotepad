package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/git"
)

// ShortLinkInfo contains short link data with optional expiry
type ShortLinkInfo struct {
	NoteID    string     `json:"note_id"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type ShortLinkHandler struct {
	repo        *git.Repository
	links       map[string]*ShortLinkInfo // shortCode -> ShortLinkInfo
	reverseMap  map[string]string         // noteId -> shortCode
	mu          sync.RWMutex
	storagePath string
	basePath    string
}

func NewShortLinkHandler(repo *git.Repository, basePath string) *ShortLinkHandler {
	h := &ShortLinkHandler{
		repo:        repo,
		links:       make(map[string]*ShortLinkInfo),
		reverseMap:  make(map[string]string),
		storagePath: filepath.Join(repo.GetPath(), ".shortlinks.json"),
		basePath:    basePath,
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
	for code, info := range links {
		h.reverseMap[info.NoteID] = code
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
		delete(h.reverseMap, info.NoteID)
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
	ExpiresIn *int `json:"expires_in"` // Days until expiry (nil = never expires)
}

// Generate creates or returns existing short link for a note
func (h *ShortLinkHandler) Generate(c *gin.Context) {
	noteId := c.Param("id")
	if noteId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note ID required"})
		return
	}

	// Parse request body for expiry
	var req GenerateRequest
	c.ShouldBindJSON(&req)

	h.mu.Lock()
	defer h.mu.Unlock()

	// Check if short link already exists
	if code, exists := h.reverseMap[noteId]; exists {
		info := h.links[code]
		// Update expiry if provided
		if req.ExpiresIn != nil {
			if *req.ExpiresIn == 0 {
				info.ExpiresAt = nil // Never expires
			} else {
				expiresAt := time.Now().AddDate(0, 0, *req.ExpiresIn)
				info.ExpiresAt = &expiresAt
			}
			go h.save()
		}
		c.JSON(http.StatusOK, gin.H{
			"code":      code,
			"shortLink": h.basePath + "/s/" + code,
			"expiresAt": info.ExpiresAt,
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

	h.links[code] = &ShortLinkInfo{
		NoteID:    noteId,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}
	h.reverseMap[noteId] = code

	go h.save()

	c.JSON(http.StatusOK, gin.H{
		"code":      code,
		"shortLink": h.basePath + "/s/" + code,
		"expiresAt": expiresAt,
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

	// Redirect to main page with note ID as hash
	c.Redirect(http.StatusFound, h.basePath+"/#note="+info.NoteID)
}

// Get returns the short link for a note if it exists
func (h *ShortLinkHandler) Get(c *gin.Context) {
	noteId := c.Param("id")
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
	})
}

// Delete removes a short link
func (h *ShortLinkHandler) Delete(c *gin.Context) {
	noteId := c.Param("id")
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
