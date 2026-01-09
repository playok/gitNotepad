package model

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gopkg.in/yaml.v3"
)

// Attachment represents an attached file
type Attachment struct {
	Name    string `json:"name" yaml:"name"`
	URL     string `json:"url" yaml:"url"`
	Size    int64  `json:"size" yaml:"size"`
	Type    string `json:"type" yaml:"type"`
	IsImage bool   `json:"isImage" yaml:"is_image"`
}

type Note struct {
	ID          string       `json:"id" yaml:"-"`
	Title       string       `json:"title" yaml:"title"`
	Content     string       `json:"content" yaml:"-"`
	Type        string       `json:"type" yaml:"type"`
	Private     bool         `json:"private" yaml:"private"`
	Password    string       `json:"-" yaml:"password,omitempty"`
	Attachments []Attachment `json:"attachments" yaml:"attachments,omitempty"`
	Created     time.Time    `json:"created" yaml:"created"`
	Modified    time.Time    `json:"modified" yaml:"modified"`
}

type NoteMetadata struct {
	Title       string       `yaml:"title"`
	Type        string       `yaml:"type"`
	Private     bool         `yaml:"private"`
	Password    string       `yaml:"password,omitempty"`
	Attachments []Attachment `yaml:"attachments,omitempty"`
	Created     time.Time    `yaml:"created"`
	Modified    time.Time    `yaml:"modified"`
}

func (n *Note) SetPassword(password string) error {
	if password == "" {
		n.Password = ""
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	n.Password = string(hash)
	return nil
}

func (n *Note) CheckPassword(password string) bool {
	if n.Password == "" {
		return true
	}
	err := bcrypt.CompareHashAndPassword([]byte(n.Password), []byte(password))
	return err == nil
}

func (n *Note) GetExtension() string {
	switch n.Type {
	case "txt":
		return ".txt"
	case "asciidoc":
		return ".adoc"
	default:
		return ".md"
	}
}

func (n *Note) GetFilename() string {
	return n.ID + n.GetExtension()
}

func (n *Note) ToFileContent() ([]byte, error) {
	meta := NoteMetadata{
		Title:       n.Title,
		Type:        n.Type,
		Private:     n.Private,
		Password:    n.Password,
		Attachments: n.Attachments,
		Created:     n.Created,
		Modified:    n.Modified,
	}

	metaBytes, err := yaml.Marshal(meta)
	if err != nil {
		return nil, err
	}

	content := fmt.Sprintf("---\n%s---\n\n%s", string(metaBytes), n.Content)
	return []byte(content), nil
}

func ParseNoteFromFile(path string) (*Note, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ParseNoteFromBytes(data, path)
}

// ParseNoteFromBytes parses a note from byte data (useful for encoding conversion)
func ParseNoteFromBytes(data []byte, path string) (*Note, error) {
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	var lines []string
	inFrontMatter := false
	frontMatterDone := false
	var frontMatterLines []string
	var contentLines []string

	for scanner.Scan() {
		line := scanner.Text()
		lines = append(lines, line)

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
				frontMatterLines = append(frontMatterLines, line)
			}
		} else {
			contentLines = append(contentLines, line)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	var meta NoteMetadata
	if len(frontMatterLines) > 0 {
		if err := yaml.Unmarshal([]byte(strings.Join(frontMatterLines, "\n")), &meta); err != nil {
			return nil, err
		}
	}

	// Extract ID from filename
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	id := strings.TrimSuffix(base, ext)

	// Remove leading empty lines from content
	content := strings.TrimLeft(strings.Join(contentLines, "\n"), "\n")

	note := &Note{
		ID:          id,
		Title:       meta.Title,
		Content:     content,
		Type:        meta.Type,
		Private:     meta.Private,
		Password:    meta.Password,
		Attachments: meta.Attachments,
		Created:     meta.Created,
		Modified:    meta.Modified,
	}

	if note.Type == "" {
		switch ext {
		case ".txt":
			note.Type = "txt"
		case ".adoc":
			note.Type = "asciidoc"
		default:
			note.Type = "markdown"
		}
	}

	return note, nil
}
