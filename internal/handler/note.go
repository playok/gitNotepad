package handler

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/git"
	"github.com/user/gitnotepad/internal/middleware"
	"github.com/user/gitnotepad/internal/model"
)

type NoteHandler struct {
	repo     *git.Repository
	config   *config.Config
	basePath string
}

func NewNoteHandler(repo *git.Repository, cfg *config.Config) *NoteHandler {
	return &NoteHandler{
		repo:     repo,
		config:   cfg,
		basePath: cfg.Storage.Path,
	}
}

// getUserStoragePath returns the user-specific storage directory
func (h *NoteHandler) getUserStoragePath(c *gin.Context) string {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return h.basePath // Fallback (shouldn't happen with auth middleware)
	}

	userPath := filepath.Join(h.basePath, user.Username)

	// Ensure directory exists
	os.MkdirAll(userPath, 0755)

	return userPath
}

// getUserRepo returns a git repository for the user's storage path
func (h *NoteHandler) getUserRepo(c *gin.Context) (*git.Repository, error) {
	storagePath := h.getUserStoragePath(c)
	repo, err := git.NewRepository(storagePath)
	if err != nil {
		return nil, err
	}
	// Initialize git repo if not exists
	if err := repo.Init(); err != nil {
		return nil, err
	}
	return repo, nil
}

type NoteListItem struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	Type     string    `json:"type"`
	Private  bool      `json:"private"`
	Modified time.Time `json:"modified"`
}

func (h *NoteHandler) List(c *gin.Context) {
	storagePath := h.getUserStoragePath(c)

	entries, err := os.ReadDir(storagePath)
	if err != nil {
		// Return empty list if directory doesn't exist yet
		c.JSON(http.StatusOK, []NoteListItem{})
		return
	}

	var notes []NoteListItem
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		ext := filepath.Ext(name)
		if ext != ".md" && ext != ".txt" && ext != ".adoc" {
			continue
		}

		filePath := filepath.Join(storagePath, name)
		note, err := model.ParseNoteFromFile(filePath)
		if err != nil {
			continue
		}

		notes = append(notes, NoteListItem{
			ID:       note.ID,
			Title:    note.Title,
			Type:     note.Type,
			Private:  note.Private,
			Modified: note.Modified,
		})
	}

	c.JSON(http.StatusOK, notes)
}

func (h *NoteHandler) Get(c *gin.Context) {
	id := c.Param("id")
	storagePath := h.getUserStoragePath(c)

	// Try both extensions
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath = filepath.Join(storagePath, id+ext)
		note, err = model.ParseNoteFromFile(filePath)
		if err == nil {
			break
		}
	}

	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Check if private and needs password
	if note.Private {
		// Return note without content for private notes
		// Client must verify password first
		password := c.GetHeader("X-Note-Password")
		if password == "" {
			c.JSON(http.StatusOK, gin.H{
				"id":          note.ID,
				"title":       note.Title,
				"type":        note.Type,
				"private":     note.Private,
				"locked":      true,
				"created":     note.Created,
				"modified":    note.Modified,
			})
			return
		}

		if !note.CheckPassword(password) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
			return
		}
	}

	c.JSON(http.StatusOK, note)
}

type CreateNoteRequest struct {
	Title       string             `json:"title" binding:"required"`
	Content     string             `json:"content"`
	Type        string             `json:"type"`
	Private     bool               `json:"private"`
	Password    string             `json:"password"`
	Attachments []model.Attachment `json:"attachments"`
}

func (h *NoteHandler) Create(c *gin.Context) {
	var req CreateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Type == "" {
		req.Type = h.config.Editor.DefaultType
	}

	// Generate ID from title
	id := generateID(req.Title)
	storagePath := h.getUserStoragePath(c)

	// Check if note already exists
	for _, ext := range []string{".md", ".txt", ".adoc"} {
		if _, err := os.Stat(filepath.Join(storagePath, id+ext)); err == nil {
			// Add timestamp to make unique
			id = fmt.Sprintf("%s-%d", id, time.Now().Unix())
			break
		}
	}

	now := time.Now()
	note := &model.Note{
		ID:          id,
		Title:       req.Title,
		Content:     req.Content,
		Type:        req.Type,
		Private:     req.Private,
		Attachments: req.Attachments,
		Created:     now,
		Modified:    now,
	}

	if req.Private && req.Password != "" {
		if err := note.SetPassword(req.Password); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set password"})
			return
		}
	}

	content, err := note.ToFileContent()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filePath := filepath.Join(storagePath, note.GetFilename())
	if err := os.WriteFile(filePath, content, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Git commit - use user-specific repo
	if userRepo, err := h.getUserRepo(c); err == nil {
		if err := userRepo.AddAndCommit(filePath, fmt.Sprintf("Create note: %s", note.Title)); err != nil {
			fmt.Printf("Git commit error: %v\n", err)
		}
	}

	c.JSON(http.StatusCreated, note)
}

type UpdateNoteRequest struct {
	Title       string             `json:"title"`
	Content     string             `json:"content"`
	Type        string             `json:"type"`
	Private     bool               `json:"private"`
	Password    *string            `json:"password"`
	Attachments []model.Attachment `json:"attachments"`
}

func (h *NoteHandler) Update(c *gin.Context) {
	id := c.Param("id")
	storagePath := h.getUserStoragePath(c)

	// Find existing note
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath = filepath.Join(storagePath, id+ext)
		note, err = model.ParseNoteFromFile(filePath)
		if err == nil {
			break
		}
	}

	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Check password for private notes
	if note.Private {
		password := c.GetHeader("X-Note-Password")
		if !note.CheckPassword(password) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
			return
		}
	}

	var req UpdateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields
	if req.Title != "" {
		note.Title = req.Title
	}
	note.Content = req.Content
	if req.Type != "" {
		note.Type = req.Type
	}
	note.Private = req.Private
	note.Attachments = req.Attachments
	note.Modified = time.Now()

	// Handle password change
	if req.Password != nil {
		if err := note.SetPassword(*req.Password); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set password"})
			return
		}
	}

	content, err := note.ToFileContent()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Handle type change (extension change)
	newFilePath := filepath.Join(storagePath, note.GetFilename())

	// Git operations with user repo
	userRepo, repoErr := h.getUserRepo(c)

	if filePath != newFilePath {
		os.Remove(filePath)
		if repoErr == nil {
			userRepo.RemoveAndCommit(filePath, fmt.Sprintf("Remove old file for: %s", note.Title))
		}
	}

	if err := os.WriteFile(newFilePath, content, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Git commit
	if repoErr == nil {
		if err := userRepo.AddAndCommit(newFilePath, fmt.Sprintf("Update note: %s", note.Title)); err != nil {
			fmt.Printf("Git commit error: %v\n", err)
		}
	}

	c.JSON(http.StatusOK, note)
}

func (h *NoteHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	storagePath := h.getUserStoragePath(c)

	// Find existing note
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath = filepath.Join(storagePath, id+ext)
		note, err = model.ParseNoteFromFile(filePath)
		if err == nil {
			break
		}
	}

	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Check password for private notes
	if note.Private {
		password := c.GetHeader("X-Note-Password")
		if !note.CheckPassword(password) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
			return
		}
	}

	if err := os.Remove(filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Git commit - use user-specific repo
	if userRepo, err := h.getUserRepo(c); err == nil {
		if err := userRepo.RemoveAndCommit(filePath, fmt.Sprintf("Delete note: %s", note.Title)); err != nil {
			fmt.Printf("Git commit error: %v\n", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Note deleted"})
}

func generateID(title string) string {
	// Simple slug generation
	id := strings.ToLower(title)
	id = strings.ReplaceAll(id, " ", "-")
	// Remove special characters
	var result strings.Builder
	for _, r := range id {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r >= 0xAC00 {
			result.WriteRune(r)
		}
	}
	id = result.String()
	if id == "" {
		id = fmt.Sprintf("note-%d", time.Now().Unix())
	}
	return id
}
