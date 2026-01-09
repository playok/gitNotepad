package handler

import (
	"encoding/base64"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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

// decodeNoteID base64-decodes the note ID from path parameter
func decodeNoteID(id string) string {
	decoded, err := base64.StdEncoding.DecodeString(id)
	if err != nil {
		return id // Return original if decode fails (for backwards compatibility)
	}
	return string(decoded)
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
	Created  time.Time `json:"created"`
	Modified time.Time `json:"modified"`
}

func (h *NoteHandler) List(c *gin.Context) {
	storagePath := h.getUserStoragePath(c)

	var notes []NoteListItem

	// Walk through all directories recursively
	err := filepath.WalkDir(storagePath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		// Skip directories
		if d.IsDir() {
			name := d.Name()
			// Skip hidden directories and special directories
			if strings.HasPrefix(name, ".") || name == "files" || name == "images" {
				return filepath.SkipDir
			}
			return nil
		}

		// Check file extension
		ext := filepath.Ext(path)
		if ext != ".md" && ext != ".txt" && ext != ".adoc" {
			return nil
		}

		note, err := model.ParseNoteFromFile(path)
		if err != nil {
			return nil
		}

		// Calculate relative path from storagePath for the ID
		relPath, err := filepath.Rel(storagePath, path)
		if err != nil {
			return nil
		}
		// Convert to forward slashes for consistency across platforms
		relPath = filepath.ToSlash(relPath)

		// Remove extension to get ID
		id := strings.TrimSuffix(relPath, ext)

		notes = append(notes, NoteListItem{
			ID:       id,
			Title:    note.Title,
			Type:     note.Type,
			Private:  note.Private,
			Created:  note.Created,
			Modified: note.Modified,
		})

		return nil
	})

	if err != nil {
		c.JSON(http.StatusOK, []NoteListItem{})
		return
	}

	c.JSON(http.StatusOK, notes)
}

func (h *NoteHandler) Get(c *gin.Context) {
	id := decodeNoteID(c.Param("id"))
	storagePath := h.getUserStoragePath(c)

	// Try both extensions
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath, _ = filepath.Abs(filepath.Join(storagePath, id+ext))
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
				"id":       note.ID,
				"title":    note.Title,
				"type":     note.Type,
				"private":  note.Private,
				"locked":   true,
				"created":  note.Created,
				"modified": note.Modified,
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

	storagePath := h.getUserStoragePath(c)

	// Parse folder path from title (e.g., "folder/subfolder/note title")
	var folderPath string
	if lastSlash := strings.LastIndex(req.Title, "/"); lastSlash != -1 {
		folderPath = req.Title[:lastSlash]

		// Validate folder path (prevent path traversal)
		if strings.Contains(folderPath, "..") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder path"})
			return
		}

		// Create folder if it doesn't exist
		fullFolderPath := filepath.Join(storagePath, folderPath)
		if err := os.MkdirAll(fullFolderPath, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
			return
		}
	}

	// Generate unique UUID for the note
	id := generateID()

	// Build the target directory (either storagePath or storagePath/folderPath)
	targetDir := storagePath
	if folderPath != "" {
		targetDir = filepath.Join(storagePath, folderPath)
	}

	// Build the full ID with folder path for consistency
	fullID := id
	if folderPath != "" {
		fullID = folderPath + "/" + id
	}

	now := time.Now()
	note := &model.Note{
		ID:          fullID,
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

	// Create file in the target directory (use absolute path for git)
	filePath, _ := filepath.Abs(filepath.Join(targetDir, id+note.GetExtension()))
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
	Created     *time.Time         `json:"created,omitempty"`
}

func (h *NoteHandler) Update(c *gin.Context) {
	id := decodeNoteID(c.Param("id"))
	storagePath := h.getUserStoragePath(c)

	// Find existing note
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath, _ = filepath.Abs(filepath.Join(storagePath, id+ext))
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

	// Update created date if provided (for calendar drag & drop)
	if req.Created != nil {
		note.Created = *req.Created
	}

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

	// Extract folder path from title (e.g., "folder/subfolder/notename" -> "folder/subfolder")
	var newFolderPath string
	// Normalize title path separators (handle both / and \)
	normalizedTitle := strings.ReplaceAll(note.Title, "\\", "/")
	if lastSlash := strings.LastIndex(normalizedTitle, "/"); lastSlash != -1 {
		newFolderPath = normalizedTitle[:lastSlash]
	}

	// Determine target folder
	targetFolder := storagePath
	if newFolderPath != "" {
		targetFolder = filepath.Join(storagePath, filepath.FromSlash(newFolderPath))
		// Create folder if it doesn't exist
		if err := os.MkdirAll(targetFolder, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
			return
		}
	}

	// Build new file path with folder (use base ID without old folder path)
	baseID := filepath.Base(note.ID)
	newFilePath, _ := filepath.Abs(filepath.Join(targetFolder, baseID+note.GetExtension()))

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
	id := decodeNoteID(c.Param("id"))
	storagePath := h.getUserStoragePath(c)

	// Find existing note
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath, _ = filepath.Abs(filepath.Join(storagePath, id+ext))
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

// Folder represents a directory in the note storage
type Folder struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	Created  time.Time `json:"created"`
	Modified time.Time `json:"modified"`
}

// ListFolders returns all folders in the user's storage (recursively)
func (h *NoteHandler) ListFolders(c *gin.Context) {
	storagePath := h.getUserStoragePath(c)

	var folders []Folder

	err := filepath.WalkDir(storagePath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		// Only process directories
		if !d.IsDir() {
			return nil
		}

		// Skip the root storage path itself
		if path == storagePath {
			return nil
		}

		name := d.Name()
		// Skip hidden directories and special directories
		if strings.HasPrefix(name, ".") || name == "files" || name == "images" {
			return filepath.SkipDir
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		// Calculate relative path from storagePath
		relPath, err := filepath.Rel(storagePath, path)
		if err != nil {
			return nil
		}

		folders = append(folders, Folder{
			Name:     name,
			Path:     relPath,
			Created:  info.ModTime(),
			Modified: info.ModTime(),
		})

		return nil
	})

	if err != nil {
		c.JSON(http.StatusOK, []Folder{})
		return
	}

	c.JSON(http.StatusOK, folders)
}

type CreateFolderRequest struct {
	Name string `json:"name" binding:"required"`
	Path string `json:"path"` // Parent path (empty for root)
}

// CreateFolder creates a new folder in the user's storage
func (h *NoteHandler) CreateFolder(c *gin.Context) {
	var req CreateFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Sanitize folder name
	folderName := strings.TrimSpace(req.Name)
	if folderName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Folder name is required"})
		return
	}

	// Prevent path traversal
	if strings.Contains(folderName, "..") || strings.Contains(folderName, "/") || strings.Contains(folderName, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder name"})
		return
	}

	storagePath := h.getUserStoragePath(c)

	// Build full path
	var folderPath string
	if req.Path != "" {
		// Validate parent path
		parentPath := filepath.Join(storagePath, req.Path)
		if _, err := os.Stat(parentPath); os.IsNotExist(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent folder does not exist"})
			return
		}
		folderPath = filepath.Join(storagePath, req.Path, folderName)
	} else {
		folderPath = filepath.Join(storagePath, folderName)
	}

	// Check if folder already exists
	if _, err := os.Stat(folderPath); err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Folder already exists"})
		return
	}

	// Create folder
	if err := os.MkdirAll(folderPath, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}

	// Create .gitkeep file to track empty folder
	gitkeepPath := filepath.Join(folderPath, ".gitkeep")
	if err := os.WriteFile(gitkeepPath, []byte(""), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}

	// Git commit
	if userRepo, err := h.getUserRepo(c); err == nil {
		if err := userRepo.AddAndCommit(gitkeepPath, fmt.Sprintf("Create folder: %s", folderName)); err != nil {
			fmt.Printf("Git commit error: %v\n", err)
		}
	}

	relativePath := folderName
	if req.Path != "" {
		relativePath = req.Path + "/" + folderName
	}

	c.JSON(http.StatusCreated, Folder{
		Name:     folderName,
		Path:     relativePath,
		Created:  time.Now(),
		Modified: time.Now(),
	})
}

// DeleteFolder deletes a folder from the user's storage
func (h *NoteHandler) DeleteFolder(c *gin.Context) {
	folderPath := c.Param("path")

	// Prevent path traversal
	if strings.Contains(folderPath, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder path"})
		return
	}

	storagePath := h.getUserStoragePath(c)
	fullPath := filepath.Join(storagePath, folderPath)

	// Check if folder exists
	info, err := os.Stat(fullPath)
	if os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}

	if !info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Not a folder"})
		return
	}

	// Check if folder is empty (except .gitkeep)
	entries, err := os.ReadDir(fullPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read folder"})
		return
	}

	for _, entry := range entries {
		if entry.Name() != ".gitkeep" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Folder is not empty"})
			return
		}
	}

	// Remove folder
	if err := os.RemoveAll(fullPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder"})
		return
	}

	// Git commit
	if userRepo, err := h.getUserRepo(c); err == nil {
		gitkeepPath := filepath.Join(fullPath, ".gitkeep")
		if err := userRepo.RemoveAndCommit(gitkeepPath, fmt.Sprintf("Delete folder: %s", folderPath)); err != nil {
			fmt.Printf("Git commit error: %v\n", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Folder deleted"})
}

func generateID() string {
	return uuid.New().String()
}
