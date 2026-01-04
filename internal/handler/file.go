package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type FileHandler struct {
	storagePath string
}

func NewFileHandler(storagePath string) *FileHandler {
	filePath := filepath.Join(storagePath, "files")
	os.MkdirAll(filePath, 0755)
	return &FileHandler{
		storagePath: filePath,
	}
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

	// Generate UUID filename with original extension
	filename := uuid.New().String() + ext
	filePath := filepath.Join(h.storagePath, filename)

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

	// Return URL for the file
	fileURL := fmt.Sprintf("/files/%s", filename)
	c.JSON(http.StatusOK, gin.H{
		"url":          fileURL,
		"filename":     filename,
		"originalName": originalName,
	})
}

func (h *FileHandler) Serve(c *gin.Context) {
	filename := c.Param("filename")

	// Security: prevent path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filename"})
		return
	}

	filePath := filepath.Join(h.storagePath, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	c.File(filePath)
}
