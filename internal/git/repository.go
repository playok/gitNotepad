package git

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

type Repository struct {
	path string
	repo *git.Repository
}

type Commit struct {
	Hash    string    `json:"hash"`
	Message string    `json:"message"`
	Author  string    `json:"author"`
	Date    time.Time `json:"date"`
}

func NewRepository(path string) (*Repository, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}

	return &Repository{
		path: absPath,
	}, nil
}

func (r *Repository) Init() error {
	// Create directory if not exists
	if err := os.MkdirAll(r.path, 0755); err != nil {
		return err
	}

	// Check if already a git repo
	repo, err := git.PlainOpen(r.path)
	if err == nil {
		r.repo = repo
		return nil
	}

	// Initialize new repo
	repo, err = git.PlainInit(r.path, false)
	if err != nil {
		return err
	}
	r.repo = repo

	// Create initial commit with .gitkeep
	gitkeepPath := filepath.Join(r.path, ".gitkeep")
	if err := os.WriteFile(gitkeepPath, []byte(""), 0644); err != nil {
		return err
	}

	w, err := repo.Worktree()
	if err != nil {
		return err
	}

	if _, err := w.Add(".gitkeep"); err != nil {
		return err
	}

	_, err = w.Commit("Initial commit", &git.CommitOptions{
		Author: &object.Signature{
			Name:  "GitNotepad",
			Email: "gitnotepad@local",
			When:  time.Now(),
		},
	})

	return err
}

func (r *Repository) Open() error {
	repo, err := git.PlainOpen(r.path)
	if err != nil {
		return err
	}
	r.repo = repo
	return nil
}

func (r *Repository) AddAndCommit(filePath, message string) error {
	if r.repo == nil {
		if err := r.Open(); err != nil {
			return err
		}
	}

	w, err := r.repo.Worktree()
	if err != nil {
		return err
	}

	// Get relative path
	relPath, err := filepath.Rel(r.path, filePath)
	if err != nil {
		relPath = filepath.Base(filePath)
	}
	// Convert to forward slashes for git (git uses forward slashes on all platforms)
	relPath = filepath.ToSlash(relPath)


	// Add file to staging
	if _, err := w.Add(relPath); err != nil {
		return fmt.Errorf("failed to add file: %w", err)
	}

	// Check if there are changes to commit
	status, err := w.Status()
	if err != nil {
		return fmt.Errorf("failed to get status: %w", err)
	}

	// Only commit if there are actual staged changes (not just untracked files)
	hasChanges := false
	for _, s := range status {
		// Check for actual staged changes: Added, Modified, Deleted, Renamed, Copied
		if s.Staging == git.Added || s.Staging == git.Modified || s.Staging == git.Deleted ||
			s.Staging == git.Renamed || s.Staging == git.Copied {
			hasChanges = true
			break
		}
	}

	if !hasChanges {
		return nil // No changes to commit
	}

	_, err = w.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  "GitNotepad",
			Email: "gitnotepad@local",
			When:  time.Now(),
		},
	})

	// Handle EOF error (occurs when commit would be empty)
	if err != nil {
		if errors.Is(err, io.EOF) {
			return nil // Treat as no changes to commit
		}
		return fmt.Errorf("failed to commit: %w", err)
	}

	return nil
}

func (r *Repository) RemoveAndCommit(filePath, message string) error {
	if r.repo == nil {
		if err := r.Open(); err != nil {
			return err
		}
	}

	w, err := r.repo.Worktree()
	if err != nil {
		return err
	}

	relPath, err := filepath.Rel(r.path, filePath)
	if err != nil {
		relPath = filepath.Base(filePath)
	}
	// Convert to forward slashes for git
	relPath = filepath.ToSlash(relPath)

	if _, err := w.Remove(relPath); err != nil {
		return fmt.Errorf("failed to remove file: %w", err)
	}

	// Check if there are changes to commit
	status, err := w.Status()
	if err != nil {
		return fmt.Errorf("failed to get status: %w", err)
	}

	// Only commit if there are actual staged changes (not just untracked files)
	hasChanges := false
	for _, s := range status {
		// Check for actual staged changes: Added, Modified, Deleted, Renamed, Copied
		if s.Staging == git.Added || s.Staging == git.Modified || s.Staging == git.Deleted ||
			s.Staging == git.Renamed || s.Staging == git.Copied {
			hasChanges = true
			break
		}
	}

	if !hasChanges {
		return nil // No changes to commit
	}

	_, err = w.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  "GitNotepad",
			Email: "gitnotepad@local",
			When:  time.Now(),
		},
	})

	// Handle EOF error (occurs when commit would be empty)
	if err != nil {
		if errors.Is(err, io.EOF) {
			return nil // Treat as no changes to commit
		}
		return fmt.Errorf("failed to commit: %w", err)
	}

	return nil
}

func (r *Repository) GetHistory(filePath string) ([]Commit, error) {

	if r.repo == nil {
		if err := r.Open(); err != nil {
			return []Commit{}, nil // Return empty array instead of error
		}
	}

	relPath, err := filepath.Rel(r.path, filePath)
	if err != nil {
		relPath = filepath.Base(filePath)
	}
	// Convert to forward slashes for git
	relPath = filepath.ToSlash(relPath)


	iter, err := r.repo.Log(&git.LogOptions{
		FileName: &relPath,
	})
	if err != nil {
		return []Commit{}, nil // Return empty array for files with no history
	}

	commits := []Commit{} // Initialize as empty slice, not nil
	err = iter.ForEach(func(c *object.Commit) error {
		commits = append(commits, Commit{
			Hash:    c.Hash.String(),
			Message: c.Message,
			Author:  c.Author.Name,
			Date:    c.Author.When,
		})
		return nil
	})

	if err != nil {
		return []Commit{}, nil
	}

	return commits, nil
}

func (r *Repository) GetFileAtCommit(filePath, commitHash string) ([]byte, error) {
	if r.repo == nil {
		if err := r.Open(); err != nil {
			return nil, err
		}
	}

	hash := plumbing.NewHash(commitHash)
	commit, err := r.repo.CommitObject(hash)
	if err != nil {
		return nil, err
	}

	tree, err := commit.Tree()
	if err != nil {
		return nil, err
	}

	relPath, err := filepath.Rel(r.path, filePath)
	if err != nil {
		relPath = filepath.Base(filePath)
	}
	// Convert to forward slashes for git
	relPath = filepath.ToSlash(relPath)

	file, err := tree.File(relPath)
	if err != nil {
		return nil, err
	}

	content, err := file.Contents()
	if err != nil {
		return nil, err
	}

	return []byte(content), nil
}

func (r *Repository) GetPath() string {
	return r.path
}

func (r *Repository) Status() (string, error) {
	if r.repo == nil {
		if err := r.Open(); err != nil {
			return "", err
		}
	}

	w, err := r.repo.Worktree()
	if err != nil {
		return "", err
	}

	status, err := w.Status()
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("%v", status), nil
}
