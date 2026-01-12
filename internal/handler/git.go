package handler

import (
	"encoding/base64"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/git"
	"github.com/user/gitnotepad/internal/middleware"
	"github.com/user/gitnotepad/internal/model"
)

// decodeGitNoteID base64-decodes the note ID from path parameter
// Supports both standard and URL-safe base64 encoding
func decodeGitNoteID(id string) string {
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

type GitHandler struct {
	repo     *git.Repository
	basePath string
}

func NewGitHandler(repo *git.Repository) *GitHandler {
	return &GitHandler{
		repo:     repo,
		basePath: repo.GetPath(),
	}
}

// getUserStoragePath returns the user-specific storage directory
func (h *GitHandler) getUserStoragePath(c *gin.Context) string {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return h.basePath // Fallback (shouldn't happen with auth middleware)
	}

	userPath := filepath.Join(h.basePath, user.Username)

	// Ensure directory exists
	os.MkdirAll(userPath, 0755)

	return userPath
}

// getNotesPath returns the user-specific notes directory
func (h *GitHandler) getNotesPath(c *gin.Context) string {
	userPath := h.getUserStoragePath(c)
	notesPath := filepath.Join(userPath, "notes")
	os.MkdirAll(notesPath, 0755)
	return notesPath
}

// getUserRepo returns a git repository for the user's storage path
func (h *GitHandler) getUserRepo(c *gin.Context) (*git.Repository, error) {
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

func (h *GitHandler) History(c *gin.Context) {
	id := decodeGitNoteID(c.Param("id"))
	notesPath := h.getNotesPath(c)

	// Find the note file
	var filePath string
	var note *model.Note
	var err error

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath = filepath.Join(notesPath, id+ext)
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

	// Get user-specific repo
	userRepo, err := h.getUserRepo(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to access repository"})
		return
	}

	commits, err := userRepo.GetHistory(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, commits)
}

func (h *GitHandler) Version(c *gin.Context) {
	id := decodeGitNoteID(c.Param("id"))
	commit := c.Param("commit")
	notesPath := h.getNotesPath(c)

	// Get user-specific repo
	userRepo, err := h.getUserRepo(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to access repository"})
		return
	}

	// Find the note file
	var filePath string
	var note *model.Note

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath = filepath.Join(notesPath, id+ext)
		note, err = model.ParseNoteFromFile(filePath)
		if err == nil {
			break
		}
	}

	if note == nil {
		// Try to find by checking if file exists in git history
		for _, ext := range []string{".md", ".txt", ".adoc"} {
			testPath := filepath.Join(notesPath, id+ext)
			content, err := userRepo.GetFileAtCommit(testPath, commit)
			if err == nil && len(content) > 0 {
				filePath = testPath
				break
			}
		}
		if filePath == "" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Note not found"})
			return
		}
	}

	// Check password for private notes
	if note != nil && note.Private {
		password := c.GetHeader("X-Note-Password")
		if !note.CheckPassword(password) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
			return
		}
	}

	content, err := userRepo.GetFileAtCommit(filePath, commit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Parse the content to extract note data
	parsedContent := parseVersionContent(string(content))

	c.JSON(http.StatusOK, gin.H{
		"commit":  commit,
		"content": parsedContent,
	})
}

func parseVersionContent(content string) string {
	// Remove front matter and return content
	lines := strings.Split(content, "\n")
	inFrontMatter := false
	frontMatterDone := false
	var contentLines []string

	for _, line := range lines {
		if !frontMatterDone {
			if line == "---" {
				if !inFrontMatter {
					inFrontMatter = true
					continue
				} else {
					frontMatterDone = true
					continue
				}
			}
			if inFrontMatter {
				continue
			}
		}
		contentLines = append(contentLines, line)
	}

	return strings.TrimLeft(strings.Join(contentLines, "\n"), "\n")
}

// GetFilePath returns the full path to a note file
func (h *GitHandler) GetFilePath(c *gin.Context, id string) string {
	notesPath := h.getNotesPath(c)

	for _, ext := range []string{".md", ".txt", ".adoc"} {
		filePath := filepath.Join(notesPath, id+ext)
		if _, err := os.Stat(filePath); err == nil {
			return filePath
		}
	}

	return ""
}
