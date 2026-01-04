package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/git"
)

type ShortLinkHandler struct {
	repo        *git.Repository
	links       map[string]string // shortCode -> noteId
	reverseMap  map[string]string // noteId -> shortCode
	mu          sync.RWMutex
	storagePath string
}

func NewShortLinkHandler(repo *git.Repository) *ShortLinkHandler {
	h := &ShortLinkHandler{
		repo:        repo,
		links:       make(map[string]string),
		reverseMap:  make(map[string]string),
		storagePath: filepath.Join(repo.GetPath(), ".shortlinks.json"),
	}
	h.load()
	return h
}

func (h *ShortLinkHandler) load() {
	data, err := os.ReadFile(h.storagePath)
	if err != nil {
		return
	}

	var links map[string]string
	if err := json.Unmarshal(data, &links); err != nil {
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	h.links = links
	h.reverseMap = make(map[string]string)
	for code, noteId := range links {
		h.reverseMap[noteId] = code
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

func generateShortCode() string {
	bytes := make([]byte, 4)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// Generate creates or returns existing short link for a note
func (h *ShortLinkHandler) Generate(c *gin.Context) {
	noteId := c.Param("id")
	if noteId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note ID required"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	// Check if short link already exists
	if code, exists := h.reverseMap[noteId]; exists {
		c.JSON(http.StatusOK, gin.H{
			"code":      code,
			"shortLink": "/s/" + code,
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

	h.links[code] = noteId
	h.reverseMap[noteId] = code

	go h.save()

	c.JSON(http.StatusOK, gin.H{
		"code":      code,
		"shortLink": "/s/" + code,
	})
}

// Redirect handles short link redirection
func (h *ShortLinkHandler) Redirect(c *gin.Context) {
	code := c.Param("code")
	if code == "" {
		c.Redirect(http.StatusFound, "/")
		return
	}

	h.mu.RLock()
	noteId, exists := h.links[code]
	h.mu.RUnlock()

	if !exists {
		c.Redirect(http.StatusFound, "/")
		return
	}

	// Redirect to main page with note ID as hash
	c.Redirect(http.StatusFound, "/#note="+noteId)
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
	h.mu.RUnlock()

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "No short link for this note"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":      code,
		"shortLink": "/s/" + code,
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
