package handler

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/middleware"
	"github.com/user/gitnotepad/internal/model"
)

type StatsHandler struct {
	config   *config.Config
	basePath string
}

func NewStatsHandler(cfg *config.Config) *StatsHandler {
	return &StatsHandler{
		config:   cfg,
		basePath: cfg.Storage.Path,
	}
}

type UsageStats struct {
	TotalNotes       int            `json:"totalNotes"`
	TotalAttachments int            `json:"totalAttachments"`
	PrivateNotes     int            `json:"privateNotes"`
	StorageUsed      int64          `json:"storageUsed"`
	NotesByType      map[string]int `json:"notesByType"`
	RecentActivity   []ActivityItem `json:"recentActivity"`
}

type ActivityItem struct {
	NoteTitle string    `json:"noteTitle"`
	Action    string    `json:"action"`
	Timestamp time.Time `json:"timestamp"`
}

func (h *StatsHandler) getUserStoragePath(c *gin.Context) string {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		return h.basePath
	}
	return filepath.Join(h.basePath, user.Username)
}

// getNotesPath returns the user's notes directory (userStoragePath/notes)
func (h *StatsHandler) getNotesPath(c *gin.Context) string {
	userPath := h.getUserStoragePath(c)
	notesPath := filepath.Join(userPath, "notes")
	os.MkdirAll(notesPath, 0755)
	return notesPath
}

func (h *StatsHandler) GetStats(c *gin.Context) {
	userStoragePath := h.getUserStoragePath(c)
	notesPath := h.getNotesPath(c)

	stats := UsageStats{
		NotesByType:    make(map[string]int),
		RecentActivity: []ActivityItem{},
	}

	type noteInfo struct {
		title    string
		modified time.Time
	}
	var recentNotes []noteInfo

	// Walk through notes directory for notes
	err := filepath.Walk(notesPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip files with errors
		}

		// Skip .git directory
		if info.IsDir() && info.Name() == ".git" {
			return filepath.SkipDir
		}

		// Handle directories
		if info.IsDir() {
			return nil
		}

		name := info.Name()
		ext := filepath.Ext(name)

		// Skip non-note files
		if ext != ".md" && ext != ".txt" && ext != ".adoc" {
			return nil
		}

		note, err := model.ParseNoteFromFile(path)
		if err != nil {
			return nil
		}

		stats.TotalNotes++

		if note.Private {
			stats.PrivateNotes++
		}

		// Count by type
		stats.NotesByType[note.Type]++

		// Count attachments in note
		stats.TotalAttachments += len(note.Attachments)

		// Add file size
		stats.StorageUsed += info.Size()

		// Track for recent activity
		recentNotes = append(recentNotes, noteInfo{
			title:    note.Title,
			modified: note.Modified,
		})

		return nil
	})

	// Walk through images/files directories for attachments storage size
	for _, dir := range []string{"images", "files"} {
		attachmentPath := filepath.Join(userStoragePath, dir)
		filepath.Walk(attachmentPath, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			stats.TotalAttachments++
			stats.StorageUsed += info.Size()
			return nil
		})
	}

	if err != nil {
		c.JSON(http.StatusOK, stats)
		return
	}

	// Sort and get recent activity (last 5)
	for i := 0; i < len(recentNotes)-1; i++ {
		for j := i + 1; j < len(recentNotes); j++ {
			if recentNotes[j].modified.After(recentNotes[i].modified) {
				recentNotes[i], recentNotes[j] = recentNotes[j], recentNotes[i]
			}
		}
	}

	limit := 5
	if len(recentNotes) < limit {
		limit = len(recentNotes)
	}

	for i := 0; i < limit; i++ {
		stats.RecentActivity = append(stats.RecentActivity, ActivityItem{
			NoteTitle: recentNotes[i].title,
			Action:    "updated",
			Timestamp: recentNotes[i].modified,
		})
	}

	c.JSON(http.StatusOK, stats)
}

func (h *StatsHandler) ExportNotes(c *gin.Context) {
	storagePath := h.getUserStoragePath(c)
	notesPath := h.getNotesPath(c)
	folderPath := c.Query("folder") // Optional folder filter

	// Create ZIP buffer
	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)

	// Track which attachment UUIDs are referenced by exported notes
	referencedAttachments := make(map[string]bool)

	// If folder is specified, only export notes from that folder
	if folderPath != "" {
		// Export only notes from the specified folder
		folderPrefix := folderPath + ":>:"

		err := filepath.Walk(notesPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			// Skip .git directory
			if info.IsDir() && info.Name() == ".git" {
				return filepath.SkipDir
			}

			if info.IsDir() {
				return nil
			}

			// Only process note files
			ext := filepath.Ext(info.Name())
			if ext != ".md" && ext != ".txt" && ext != ".adoc" {
				return nil
			}

			// Parse the note to check its title/path
			note, parseErr := model.ParseNoteFromFile(path)
			if parseErr != nil {
				return nil
			}

			// Check if note belongs to the folder
			noteID := strings.TrimSuffix(info.Name(), ext)
			if !strings.HasPrefix(note.Title, folderPrefix) && note.Title != folderPath && !strings.HasPrefix(noteID, folderPrefix) && noteID != folderPath {
				return nil
			}

			// Get relative path from notes directory
			relPath, err := filepath.Rel(notesPath, path)
			if err != nil {
				return err
			}

			// Create header
			header, err := zip.FileInfoHeader(info)
			if err != nil {
				return err
			}

			header.Name = "notes/" + relPath
			header.Method = zip.Deflate

			writer, err := zipWriter.CreateHeader(header)
			if err != nil {
				return err
			}

			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()
			_, err = io.Copy(writer, file)
			if err != nil {
				return err
			}

			// Track attachments referenced in this note
			for _, att := range note.Attachments {
				if att.URL != "" {
					// Extract filename from URL (e.g., /u/user/images/uuid.ext or /images/uuid.ext)
					parts := strings.Split(att.URL, "/")
					if len(parts) > 0 {
						filename := parts[len(parts)-1]
						referencedAttachments[filename] = true
						// Also track without extension
						baseName := strings.TrimSuffix(filename, filepath.Ext(filename))
						referencedAttachments[baseName] = true
					}
				}
			}

			return nil
		})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create export"})
			return
		}

		// Export referenced attachments
		for _, dir := range []string{"images", "files"} {
			attachmentPath := filepath.Join(storagePath, dir)
			filepath.Walk(attachmentPath, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() {
					return nil
				}

				// Check if this attachment is referenced
				baseName := strings.TrimSuffix(info.Name(), filepath.Ext(info.Name()))
				if !referencedAttachments[baseName] && !referencedAttachments[info.Name()] {
					return nil
				}

				relPath, err := filepath.Rel(storagePath, path)
				if err != nil {
					return nil
				}

				header, err := zip.FileInfoHeader(info)
				if err != nil {
					return nil
				}

				header.Name = relPath
				header.Method = zip.Deflate

				writer, err := zipWriter.CreateHeader(header)
				if err != nil {
					return nil
				}

				file, err := os.Open(path)
				if err != nil {
					return nil
				}
				defer file.Close()
				io.Copy(writer, file)

				return nil
			})
		}

		// Also export metadata files for the folder
		for _, metaFile := range []string{".filemeta.json", ".imagemeta.json"} {
			metaPath := filepath.Join(storagePath, metaFile)
			if info, err := os.Stat(metaPath); err == nil && !info.IsDir() {
				header, _ := zip.FileInfoHeader(info)
				header.Name = metaFile
				header.Method = zip.Deflate
				if writer, err := zipWriter.CreateHeader(header); err == nil {
					if file, err := os.Open(metaPath); err == nil {
						io.Copy(writer, file)
						file.Close()
					}
				}
			}
		}

	} else {
		// Export all notes (original behavior)
		err := filepath.Walk(storagePath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			// Skip .git directory
			if info.IsDir() && info.Name() == ".git" {
				return filepath.SkipDir
			}

			// Get relative path
			relPath, err := filepath.Rel(storagePath, path)
			if err != nil {
				return err
			}

			// Skip root directory
			if relPath == "." {
				return nil
			}

			// Create header
			header, err := zip.FileInfoHeader(info)
			if err != nil {
				return err
			}

			header.Name = relPath
			if info.IsDir() {
				header.Name += "/"
			} else {
				header.Method = zip.Deflate
			}

			writer, err := zipWriter.CreateHeader(header)
			if err != nil {
				return err
			}

			if !info.IsDir() {
				file, err := os.Open(path)
				if err != nil {
					return err
				}
				defer file.Close()
				_, err = io.Copy(writer, file)
				if err != nil {
					return err
				}
			}

			return nil
		})

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create export"})
			return
		}
	}

	zipWriter.Close()

	// Generate filename
	filename := "notes-export"
	if folderPath != "" {
		// Use folder name for filename
		folderName := folderPath
		if idx := strings.LastIndex(folderPath, ":>:"); idx != -1 {
			folderName = folderPath[idx+3:]
		}
		// Sanitize folder name for filename
		folderName = strings.ReplaceAll(folderName, "/", "-")
		folderName = strings.ReplaceAll(folderName, "\\", "-")
		folderName = strings.ReplaceAll(folderName, ":", "-")
		filename = fmt.Sprintf("folder-%s-export", folderName)
	}

	// Send ZIP file
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s-%s.zip", filename, time.Now().Format("2006-01-02")))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

func (h *StatsHandler) ImportNotes(c *gin.Context) {
	userStoragePath := h.getUserStoragePath(c)
	notesPath := h.getNotesPath(c)
	targetFolder := c.PostForm("folder") // Optional target folder

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}
	defer file.Close()

	// Read file into buffer
	buf := new(bytes.Buffer)
	size, err := io.Copy(buf, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}

	// Open ZIP reader
	zipReader, err := zip.NewReader(bytes.NewReader(buf.Bytes()), size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ZIP file"})
		return
	}

	imported := 0

	// Extract files
	for _, zipFile := range zipReader.File {
		// Security check - prevent directory traversal
		if strings.Contains(zipFile.Name, "..") {
			continue
		}

		// Skip .git files
		if strings.Contains(zipFile.Name, ".git") {
			continue
		}

		// Determine destination path based on file type
		var destPath string
		if strings.HasPrefix(zipFile.Name, "images/") || strings.HasPrefix(zipFile.Name, "files/") {
			// Attachments go to user storage root
			destPath = filepath.Join(userStoragePath, zipFile.Name)
		} else if strings.HasPrefix(zipFile.Name, "notes/") {
			// Notes already in notes/ folder
			noteName := strings.TrimPrefix(zipFile.Name, "notes/")

			// If target folder is specified and this is a note file, prefix the filename
			if targetFolder != "" && !zipFile.FileInfo().IsDir() {
				ext := filepath.Ext(noteName)
				if ext == ".md" || ext == ".txt" || ext == ".adoc" {
					// Read the note content to update the title
					srcFile, err := zipFile.Open()
					if err != nil {
						continue
					}
					noteData, err := io.ReadAll(srcFile)
					srcFile.Close()
					if err != nil {
						continue
					}

					// Parse and update note title
					note, err := model.ParseNoteFromBytes(noteData, zipFile.Name)
					if err == nil {
						// Prepend target folder to title if not already there
						if !strings.HasPrefix(note.Title, targetFolder+":>:") {
							note.Title = targetFolder + ":>:" + note.Title
						}
						// Generate new filename based on updated title
						newFileName := note.Title + ext
						destPath = filepath.Join(notesPath, newFileName)

						// Create parent directory
						os.MkdirAll(filepath.Dir(destPath), 0755)

						// Write updated note using ToFileContent
						if content, err := note.ToFileContent(); err == nil {
							if err := os.WriteFile(destPath, content, 0644); err == nil {
								imported++
							}
						}
						continue
					}
				}
			}

			destPath = filepath.Join(userStoragePath, zipFile.Name)
		} else {
			// Legacy format or note files - go to notes/ folder
			ext := filepath.Ext(zipFile.Name)
			if ext == ".md" || ext == ".txt" || ext == ".adoc" || zipFile.FileInfo().IsDir() {
				// If target folder specified, prefix the filename
				if targetFolder != "" && !zipFile.FileInfo().IsDir() {
					// Read the note content to update the title
					srcFile, err := zipFile.Open()
					if err != nil {
						continue
					}
					noteData, err := io.ReadAll(srcFile)
					srcFile.Close()
					if err != nil {
						continue
					}

					// Parse and update note title
					note, err := model.ParseNoteFromBytes(noteData, zipFile.Name)
					if err == nil {
						// Prepend target folder to title if not already there
						if !strings.HasPrefix(note.Title, targetFolder+":>:") {
							note.Title = targetFolder + ":>:" + note.Title
						}
						// Generate new filename based on updated title
						newFileName := note.Title + ext
						destPath = filepath.Join(notesPath, newFileName)

						// Create parent directory
						os.MkdirAll(filepath.Dir(destPath), 0755)

						// Write updated note using ToFileContent
						if content, err := note.ToFileContent(); err == nil {
							if err := os.WriteFile(destPath, content, 0644); err == nil {
								imported++
							}
						}
						continue
					}
				}
				destPath = filepath.Join(notesPath, zipFile.Name)
			} else {
				// Other files go to user storage root
				destPath = filepath.Join(userStoragePath, zipFile.Name)
			}
		}

		if zipFile.FileInfo().IsDir() {
			os.MkdirAll(destPath, 0755)
			continue
		}

		// Create parent directory
		os.MkdirAll(filepath.Dir(destPath), 0755)

		// Extract file
		srcFile, err := zipFile.Open()
		if err != nil {
			continue
		}

		destFile, err := os.Create(destPath)
		if err != nil {
			srcFile.Close()
			continue
		}

		_, err = io.Copy(destFile, srcFile)
		srcFile.Close()
		destFile.Close()

		if err == nil {
			// Count only note files
			ext := filepath.Ext(zipFile.Name)
			if ext == ".md" || ext == ".txt" || ext == ".adoc" {
				imported++
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"imported": imported})
}

func (h *StatsHandler) DeleteAllNotes(c *gin.Context) {
	notesPath := h.getNotesPath(c)

	deleted := 0

	// Recursively delete all note files from notes/ directory
	filepath.Walk(notesPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}

		ext := filepath.Ext(info.Name())
		if ext != ".md" && ext != ".txt" && ext != ".adoc" {
			return nil
		}

		if err := os.Remove(path); err == nil {
			deleted++
		}
		return nil
	})

	// Clean up empty directories
	filepath.Walk(notesPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || !info.IsDir() || path == notesPath {
			return nil
		}
		// Try to remove directory (will fail if not empty)
		os.Remove(path)
		return nil
	})

	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
}
