package handler

import (
	"os"
	"path/filepath"
	"strings"
)

// validatePathContainment checks that the resolved path stays within the base directory.
// It prevents path traversal attacks by cleaning the path and verifying it doesn't escape.
func validatePathContainment(basePath, userPath string) bool {
	absBase, err := filepath.Abs(basePath)
	if err != nil {
		return false
	}

	// Clean and resolve the full path
	fullPath := filepath.Join(absBase, filepath.Clean("/"+userPath))
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		return false
	}

	// Check containment
	if !strings.HasPrefix(absPath, absBase+string(os.PathSeparator)) && absPath != absBase {
		return false
	}

	return true
}

// validateSimpleName checks that a name does not contain path traversal characters.
// Suitable for filenames and usernames.
func validateSimpleName(name string) bool {
	if name == "" {
		return false
	}
	cleaned := filepath.Clean(name)
	if cleaned != name {
		return false
	}
	if strings.ContainsAny(name, `/\`) || strings.Contains(name, "..") {
		return false
	}
	return true
}
