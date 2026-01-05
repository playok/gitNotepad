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

type ImageHandler struct {
	storagePath string
	basePath    string
}

func NewImageHandler(storagePath string, basePath string) *ImageHandler {
	imgPath := filepath.Join(storagePath, "images")
	os.MkdirAll(imgPath, 0755)
	return &ImageHandler{
		storagePath: imgPath,
		basePath:    basePath,
	}
}

func (h *ImageHandler) Upload(c *gin.Context) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No image provided"})
		return
	}
	defer file.Close()

	// Validate content type
	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type"})
		return
	}

	// Determine file extension
	ext := ".png"
	switch contentType {
	case "image/jpeg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "image/svg+xml":
		ext = ".svg"
	}

	// Generate UUID filename
	filename := uuid.New().String() + ext
	filepath := filepath.Join(h.storagePath, filename)

	// Create file
	dst, err := os.Create(filepath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save image"})
		return
	}
	defer dst.Close()

	// Copy file content
	if _, err := io.Copy(dst, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save image"})
		return
	}

	// Return URL for the image (with base path for nginx proxy support)
	imageURL := fmt.Sprintf("%s/images/%s", h.basePath, filename)
	c.JSON(http.StatusOK, gin.H{
		"url":      imageURL,
		"filename": filename,
	})
}

func (h *ImageHandler) Serve(c *gin.Context) {
	filename := c.Param("filename")

	// Security: prevent path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid filename"})
		return
	}

	filepath := filepath.Join(h.storagePath, filename)

	// Check if file exists
	if _, err := os.Stat(filepath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Image not found"})
		return
	}

	c.File(filepath)
}
