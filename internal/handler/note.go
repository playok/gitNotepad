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
	"github.com/user/gitnotepad/internal/encryption"
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

// getUserStoragePath returns the user-specific storage directory (root)
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

// getNotesPath returns the user's notes directory (userStoragePath/notes)
func (h *NoteHandler) getNotesPath(c *gin.Context) string {
	userPath := h.getUserStoragePath(c)
	notesPath := filepath.Join(userPath, "notes")

	// Ensure notes directory exists
	os.MkdirAll(notesPath, 0755)

	// Migrate existing notes if needed (first run)
	h.migrateExistingNotes(userPath, notesPath)

	return notesPath
}

// migrateExistingNotes moves existing notes from user root to notes/ folder
func (h *NoteHandler) migrateExistingNotes(userPath, notesPath string) {
	// Check if migration is needed (look for .md/.txt/.adoc files in root)
	entries, err := os.ReadDir(userPath)
	if err != nil {
		return
	}

	for _, entry := range entries {
		name := entry.Name()

		// Skip directories that should stay in root
		if entry.IsDir() {
			// Skip special directories
			if name == "notes" || name == "files" || name == "images" || strings.HasPrefix(name, ".") {
				continue
			}
			// Move user folders to notes/
			srcPath := filepath.Join(userPath, name)
			dstPath := filepath.Join(notesPath, name)
			if _, err := os.Stat(dstPath); os.IsNotExist(err) {
				os.Rename(srcPath, dstPath)
			}
			continue
		}

		// Check for note files
		ext := filepath.Ext(name)
		if ext == ".md" || ext == ".txt" || ext == ".adoc" {
			srcPath := filepath.Join(userPath, name)
			dstPath := filepath.Join(notesPath, name)
			if _, err := os.Stat(dstPath); os.IsNotExist(err) {
				os.Rename(srcPath, dstPath)
			}
		}
	}
}

// loadNoteFromFile loads a note from file, decrypting if necessary
func (h *NoteHandler) loadNoteFromFile(path string, encryptionKey []byte) (*model.Note, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// Check if file is encrypted
	content := string(data)
	if encryption.IsEncrypted(content) {
		if encryptionKey == nil {
			return nil, fmt.Errorf("file is encrypted but no key available")
		}
		decrypted, err := encryption.Decrypt(content, encryptionKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt file: %w", err)
		}
		data = decrypted
	}

	return model.ParseNoteFromBytes(data, path)
}

// saveNoteToFile saves a note to file, encrypting if enabled
func (h *NoteHandler) saveNoteToFile(note *model.Note, path string, encryptionKey []byte) error {
	content, err := note.ToFileContent()
	if err != nil {
		return err
	}

	// Encrypt if encryption is enabled and key is available
	if h.config.Encryption.Enabled && encryptionKey != nil {
		encrypted, err := encryption.Encrypt(content, encryptionKey)
		if err != nil {
			return fmt.Errorf("failed to encrypt file: %w", err)
		}
		content = []byte(encrypted)
	}

	return os.WriteFile(path, content, 0644)
}

// decodeNoteID base64-decodes the note ID from path parameter
// Supports both standard and URL-safe base64 encoding
func decodeNoteID(id string) string {
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

// FolderSeparator is the delimiter used in note titles to indicate folder paths
// e.g., "folder:>:subfolder:>:note title" creates folder/subfolder/note
const FolderSeparator = ":>:"

// extractFolderPath extracts the folder path from a note title
// Returns folder path (with / for filesystem) and the note name
// e.g., "folder:>:subfolder:>:note" -> ("folder/subfolder", "note")
func extractFolderPath(title string) (folderPath string, noteName string) {
	lastSep := strings.LastIndex(title, FolderSeparator)
	if lastSep == -1 {
		return "", title // No folder path
	}
	folderPart := title[:lastSep]
	noteName = title[lastSep+len(FolderSeparator):]
	// Convert folder separator to filesystem path separator
	folderPath = strings.ReplaceAll(folderPart, FolderSeparator, "/")
	return folderPath, noteName
}

// MigrateFolderSeparator migrates notes to use separate folder_path field
// Converts old formats:
// 1. title with "/" separator -> folder_path + title
// 2. title with ":>:" separator -> folder_path + title
// This should be called once at server startup with -migrate-paths flag
func MigrateFolderSeparator(storagePath string, encryptionEnabled bool, encryptionSalt string) error {
	// Walk through all user directories in storage path
	entries, err := os.ReadDir(storagePath)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Println("No data directory found, skipping migration.")
			return nil // No data directory yet
		}
		return err
	}

	migratedCount := 0
	scannedCount := 0
	skippedCount := 0

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		// Skip special directories
		if entry.Name() == ".git" || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		userDir := filepath.Join(storagePath, entry.Name())
		fmt.Printf("Scanning user directory: %s\n", entry.Name())

		// Walk through all note files in user directory
		err := filepath.WalkDir(userDir, func(path string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}

			if d.IsDir() {
				// Skip .git directories
				if d.Name() == ".git" {
					return filepath.SkipDir
				}
				return nil
			}

			// Only process markdown, text, and asciidoc files
			ext := filepath.Ext(path)
			if ext != ".md" && ext != ".txt" && ext != ".adoc" {
				return nil
			}

			scannedCount++

			// Get relative path from user directory
			relPath, err := filepath.Rel(userDir, path)
			if err != nil {
				fmt.Printf("  Skip (rel path error): %s\n", path)
				skippedCount++
				return nil
			}
			relPath = filepath.ToSlash(relPath)

			// Load the note
			note, err := model.ParseNoteFromFile(path)
			if err != nil {
				fmt.Printf("  Skip (parse error): %s - %v\n", relPath, err)
				skippedCount++
				return nil
			}

			// Check if the note needs migration:
			// 1. Title contains "/" (very old format)
			// 2. Title contains ":>:" but folder_path is empty (old format needing conversion)
			needsMigration := false
			oldTitle := note.Title
			oldFolderPath := note.FolderPath

			// Case 1: Title has "/" separator (very old format)
			if strings.Contains(note.Title, "/") {
				// Replace "/" with ":>:" in title first
				note.Title = strings.ReplaceAll(note.Title, "/", FolderSeparator)
				needsMigration = true
			}

			// Case 2: Title still has ":>:" separator (needs extraction to folder_path)
			if strings.Contains(note.Title, FolderSeparator) {
				// Extract folder_path from title
				lastSep := strings.LastIndex(note.Title, FolderSeparator)
				if lastSep != -1 {
					folderPart := note.Title[:lastSep]
					noteName := note.Title[lastSep+len(FolderSeparator):]
					note.FolderPath = strings.ReplaceAll(folderPart, FolderSeparator, "/")
					note.Title = noteName
					needsMigration = true
				}
			}

			// Case 3: Already has folder_path but check consistency
			if note.FolderPath != "" && !strings.Contains(note.Title, FolderSeparator) && !strings.Contains(note.Title, "/") {
				// Already in new format - check if file needs re-saving
				// Read raw content to check if it has folder_path field
				rawContent, err := os.ReadFile(path)
				if err == nil && !strings.Contains(string(rawContent), "folder_path:") {
					needsMigration = true // Need to save with folder_path field
				}
			}

			if !needsMigration {
				return nil
			}

			// Save the note with new format
			content, err := note.ToFileContent()
			if err != nil {
				fmt.Printf("  Warning (serialize): %s - %v\n", relPath, err)
				skippedCount++
				return nil
			}
			if err := os.WriteFile(path, content, 0644); err != nil {
				fmt.Printf("  Warning (save): %s - %v\n", relPath, err)
				skippedCount++
				return nil
			}

			migratedCount++
			if oldFolderPath != note.FolderPath || oldTitle != note.Title {
				fmt.Printf("  Migrated: title='%s' -> folder_path='%s', title='%s'\n", oldTitle, note.FolderPath, note.Title)
			} else {
				fmt.Printf("  Migrated: %s (added folder_path field)\n", relPath)
			}
			return nil
		})

		if err != nil {
			fmt.Printf("Warning: error walking %s: %v\n", userDir, err)
		}
	}

	fmt.Printf("\nMigration summary:\n")
	fmt.Printf("  Scanned: %d files\n", scannedCount)
	fmt.Printf("  Migrated: %d files\n", migratedCount)
	fmt.Printf("  Skipped: %d files\n", skippedCount)

	return nil
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
	ID         string    `json:"id"`
	FolderPath string    `json:"folder_path"`
	Title      string    `json:"title"`
	Type       string    `json:"type"`
	Icon       string    `json:"icon,omitempty"`
	Private    bool      `json:"private"`
	Encrypted  bool      `json:"encrypted"`
	Created    time.Time `json:"created"`
	Modified   time.Time `json:"modified"`
}

func (h *NoteHandler) List(c *gin.Context) {
	notesPath := h.getNotesPath(c)
	encryptionKey := middleware.GetEncryptionKey(c)

	var notes []NoteListItem

	// Walk through all directories recursively
	err := filepath.WalkDir(notesPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		// Skip directories
		if d.IsDir() {
			name := d.Name()
			// Skip hidden directories
			if strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}

		// Check file extension
		ext := filepath.Ext(path)
		if ext != ".md" && ext != ".txt" && ext != ".adoc" {
			return nil
		}

		// Check if file is encrypted before loading
		rawContent, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		isEncrypted := encryption.IsEncrypted(string(rawContent))

		note, err := h.loadNoteFromFile(path, encryptionKey)
		if err != nil {
			return nil
		}

		// Calculate relative path from notesPath for the ID
		relPath, err := filepath.Rel(notesPath, path)
		if err != nil {
			return nil
		}
		// Convert to forward slashes for consistency across platforms
		relPath = filepath.ToSlash(relPath)

		// Remove extension to get ID
		id := strings.TrimSuffix(relPath, ext)

		notes = append(notes, NoteListItem{
			ID:         id,
			FolderPath: note.FolderPath,
			Title:      note.Title,
			Type:       note.Type,
			Icon:       note.Icon,
			Private:    note.Private,
			Encrypted:  isEncrypted,
			Created:    note.Created,
			Modified:   note.Modified,
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
	notesPath := h.getNotesPath(c)
	encryptionKey := middleware.GetEncryptionKey(c)

	// Try both extensions
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath, _ = filepath.Abs(filepath.Join(notesPath, id+ext))
		note, err = h.loadNoteFromFile(filePath, encryptionKey)
		if err == nil {
			break
		}
	}

	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Set the correct ID with folder path (the decoded id from URL parameter)
	note.ID = id

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
	FolderPath  string             `json:"folder_path"`
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

	notesPath := h.getNotesPath(c)
	encryptionKey := middleware.GetEncryptionKey(c)

	// Use folder path from request directly
	folderPath := req.FolderPath

	if folderPath != "" {
		// Validate folder path (prevent path traversal)
		if strings.Contains(folderPath, "..") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder path"})
			return
		}

		// Create folder if it doesn't exist
		fullFolderPath := filepath.Join(notesPath, folderPath)
		if err := os.MkdirAll(fullFolderPath, 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
			return
		}
	}

	// Generate unique UUID for the note
	id := generateID()

	// Build the target directory (either notesPath or notesPath/folderPath)
	targetDir := notesPath
	if folderPath != "" {
		targetDir = filepath.Join(notesPath, folderPath)
	}

	// Build the full ID with folder path for consistency
	fullID := id
	if folderPath != "" {
		fullID = folderPath + "/" + id
	}

	now := time.Now()
	note := &model.Note{
		ID:          fullID,
		FolderPath:  folderPath,
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

	// Create file in the target directory (use absolute path for git)
	filePath, _ := filepath.Abs(filepath.Join(targetDir, id+note.GetExtension()))
	if err := h.saveNoteToFile(note, filePath, encryptionKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Git commit - use user-specific repo
	if userRepo, err := h.getUserRepo(c); err == nil {
		userRepo.AddAndCommit(filePath, fmt.Sprintf("Create note: %s", note.Title))
	}

	c.JSON(http.StatusCreated, note)
}

type UpdateNoteRequest struct {
	FolderPath  string             `json:"folder_path"`
	Title       string             `json:"title"`
	Content     string             `json:"content"`
	Type        string             `json:"type"`
	Icon        *string            `json:"icon,omitempty"`
	Private     bool               `json:"private"`
	Password    *string            `json:"password"`
	Attachments []model.Attachment `json:"attachments"`
	Created     *time.Time         `json:"created,omitempty"`
}

func (h *NoteHandler) Update(c *gin.Context) {
	id := decodeNoteID(c.Param("id"))
	notesPath := h.getNotesPath(c)
	encryptionKey := middleware.GetEncryptionKey(c)

	// Find existing note
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath, _ = filepath.Abs(filepath.Join(notesPath, id+ext))
		note, err = h.loadNoteFromFile(filePath, encryptionKey)
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
	note.FolderPath = req.FolderPath
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

	// Update icon if provided
	if req.Icon != nil {
		note.Icon = *req.Icon
	}

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

	// Determine target folder from folder_path field
	targetFolder := notesPath
	if req.FolderPath != "" {
		targetFolder = filepath.Join(notesPath, filepath.FromSlash(req.FolderPath))
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

	if err := h.saveNoteToFile(note, newFilePath, encryptionKey); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Git commit
	if repoErr == nil {
		if err := userRepo.AddAndCommit(newFilePath, fmt.Sprintf("Update note: %s", note.Title)); err != nil {
			fmt.Printf("Git commit error: %v\n", err)
		}
	}

	// Calculate relative path from notesPath for the ID (consistent with List handler)
	absNotesPath, _ := filepath.Abs(notesPath)
	relPath, err := filepath.Rel(absNotesPath, newFilePath)
	if err == nil {
		// Convert to forward slashes for consistency across platforms
		relPath = filepath.ToSlash(relPath)
		// Remove extension to get ID
		note.ID = strings.TrimSuffix(relPath, note.GetExtension())
	}

	c.JSON(http.StatusOK, note)
}

func (h *NoteHandler) Delete(c *gin.Context) {
	id := decodeNoteID(c.Param("id"))
	notesPath := h.getNotesPath(c)
	encryptionKey := middleware.GetEncryptionKey(c)

	// Find existing note
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath, _ = filepath.Abs(filepath.Join(notesPath, id+ext))
		note, err = h.loadNoteFromFile(filePath, encryptionKey)
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

// DecryptNote removes encryption from a note file
func (h *NoteHandler) DecryptNote(c *gin.Context) {
	id := c.Param("id")
	notesPath := h.getNotesPath(c)

	// Get encryption key from context
	encryptionKey := middleware.GetEncryptionKey(c)

	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath, _ = filepath.Abs(filepath.Join(notesPath, id+ext))
		note, err = h.loadNoteFromFile(filePath, encryptionKey)
		if err == nil {
			break
		}
	}

	if note == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
		return
	}

	// Check if file is encrypted
	content, err := os.ReadFile(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if !encryption.IsEncrypted(string(content)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Note is not encrypted"})
		return
	}

	// Save without encryption (pass nil key)
	if err := h.saveNoteToFile(note, filePath, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Git commit
	if userRepo, err := h.getUserRepo(c); err == nil {
		if err := userRepo.AddAndCommit(filePath, fmt.Sprintf("Decrypt note: %s", note.Title)); err != nil {
			fmt.Printf("Git commit error: %v\n", err)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Note decrypted successfully"})
}

// Folder represents a directory in the note storage
type Folder struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	Created  time.Time `json:"created"`
	Modified time.Time `json:"modified"`
}

// ListFolders returns all folders in the user's notes directory (recursively)
func (h *NoteHandler) ListFolders(c *gin.Context) {
	notesPath := h.getNotesPath(c)

	var folders []Folder

	err := filepath.WalkDir(notesPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		// Only process directories
		if !d.IsDir() {
			return nil
		}

		// Skip the root notes path itself
		if path == notesPath {
			return nil
		}

		name := d.Name()
		// Skip hidden directories
		if strings.HasPrefix(name, ".") {
			return filepath.SkipDir
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		// Calculate relative path from notesPath
		relPath, err := filepath.Rel(notesPath, path)
		if err != nil {
			return nil
		}

		// Normalize path separators to forward slashes for cross-platform compatibility
		relPath = filepath.ToSlash(relPath)

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

	notesPath := h.getNotesPath(c)

	// Build full path
	var folderPath string
	if req.Path != "" {
		// Validate parent path
		parentPath := filepath.Join(notesPath, req.Path)
		if _, err := os.Stat(parentPath); os.IsNotExist(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent folder does not exist"})
			return
		}
		folderPath = filepath.Join(notesPath, req.Path, folderName)
	} else {
		folderPath = filepath.Join(notesPath, folderName)
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

// DeleteFolder deletes a folder from the user's notes directory
func (h *NoteHandler) DeleteFolder(c *gin.Context) {
	folderPath := c.Param("path")

	// Prevent path traversal
	if strings.Contains(folderPath, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder path"})
		return
	}

	notesPath := h.getNotesPath(c)
	fullPath := filepath.Join(notesPath, folderPath)

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
