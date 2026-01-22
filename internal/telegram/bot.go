package telegram

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/user/gitnotepad/internal/config"
	"github.com/user/gitnotepad/internal/encoding"
	"github.com/user/gitnotepad/internal/git"
	"github.com/user/gitnotepad/internal/model"
	"github.com/user/gitnotepad/internal/websocket"
)

// Bot represents a Telegram bot instance
type Bot struct {
	api    *tgbotapi.BotAPI
	config *config.Config
	stopCh chan struct{}
	wsHub  *websocket.Hub
}

// New creates a new Telegram bot instance
func New(cfg *config.Config) (*Bot, error) {
	if !cfg.Telegram.Enabled || cfg.Telegram.Token == "" {
		return nil, nil
	}

	api, err := tgbotapi.NewBotAPI(cfg.Telegram.Token)
	if err != nil {
		return nil, fmt.Errorf("failed to create Telegram bot: %w", err)
	}

	// Delete any existing webhook to use Long Polling
	deleteWebhook := tgbotapi.DeleteWebhookConfig{
		DropPendingUpdates: false,
	}
	if _, err := api.Request(deleteWebhook); err != nil {
		encoding.Warn("Telegram: Failed to delete webhook: %v", err)
	} else {
		encoding.Debug("Telegram: Webhook deleted, using Long Polling")
	}

	encoding.Info("Telegram bot authorized as @%s", api.Self.UserName)

	return &Bot{
		api:    api,
		config: cfg,
		stopCh: make(chan struct{}),
	}, nil
}

// Start starts the bot and listens for updates
func (b *Bot) Start() {
	if b == nil || b.api == nil {
		return
	}

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60

	updates := b.api.GetUpdatesChan(u)

	encoding.Info("Telegram bot started, listening for messages...")

	for {
		select {
		case <-b.stopCh:
			encoding.Info("Telegram bot stopping...")
			return
		case update := <-updates:
			if update.Message == nil {
				continue
			}

			// Check if user is allowed
			if !b.isUserAllowed(update.Message.From.ID) {
				encoding.Debug("Telegram: Unauthorized user %d (%s)", update.Message.From.ID, update.Message.From.UserName)
				b.sendMessage(update.Message.Chat.ID, "⛔ You are not authorized to use this bot.")
				continue
			}

			// Handle message
			b.handleMessage(update.Message)
		}
	}
}

// Stop stops the bot
func (b *Bot) Stop() {
	if b == nil || b.api == nil {
		return
	}
	close(b.stopCh)
	b.api.StopReceivingUpdates()
	encoding.Info("Telegram bot stopped")
}

// SetHub sets the WebSocket hub for broadcasting note updates
func (b *Bot) SetHub(hub *websocket.Hub) {
	if b != nil {
		b.wsHub = hub
	}
}

// isUserAllowed checks if the user is in the allowed list
func (b *Bot) isUserAllowed(userID int64) bool {
	// If no allowed users configured, deny all
	if len(b.config.Telegram.AllowedUsers) == 0 {
		return false
	}

	for _, id := range b.config.Telegram.AllowedUsers {
		if id == userID {
			return true
		}
	}
	return false
}

// handleMessage processes incoming messages
func (b *Bot) handleMessage(msg *tgbotapi.Message) {
	var content string

	// Handle different message types
	if msg.Text != "" {
		content = msg.Text
	} else if msg.Caption != "" {
		// Photo or document with caption
		content = msg.Caption
	} else if msg.Photo != nil {
		// Photo without caption
		content = "[Photo received]"
	} else if msg.Document != nil {
		// Document without caption
		content = fmt.Sprintf("[Document: %s]", msg.Document.FileName)
	} else {
		// Unsupported message type
		b.sendMessage(msg.Chat.ID, "⚠️ Unsupported message type. Please send text messages.")
		return
	}

	// Handle commands
	if msg.IsCommand() {
		b.handleCommand(msg)
		return
	}

	// Create note from message
	title, err := b.createNoteFromMessage(content, msg)
	if err != nil {
		encoding.Error("Telegram: Failed to create note: %v", err)
		b.sendMessage(msg.Chat.ID, fmt.Sprintf("❌ Failed to save note: %v", err))
		return
	}

	// Send confirmation
	folderDisplay := strings.ReplaceAll(b.config.Telegram.DefaultFolder, ":>:", "/")
	b.sendMessage(msg.Chat.ID, fmt.Sprintf("✅ Note saved!\n📁 Folder: %s\n📝 Title: %s", folderDisplay, title))
}

// handleCommand processes bot commands
func (b *Bot) handleCommand(msg *tgbotapi.Message) {
	switch msg.Command() {
	case "start":
		b.sendMessage(msg.Chat.ID, "👋 Welcome to Git Notepad Bot!\n\nSend me any text message and I'll save it as a note.\n\n📋 Commands:\n/start - Show this help\n/info - Show bot info")
	case "info":
		folderDisplay := strings.ReplaceAll(b.config.Telegram.DefaultFolder, ":>:", "/")
		info := fmt.Sprintf("ℹ️ Bot Info\n\n📁 Default folder: %s\n👤 Saving as user: %s\n🆔 Your Telegram ID: %d",
			folderDisplay,
			b.config.Telegram.DefaultUsername,
			msg.From.ID)
		b.sendMessage(msg.Chat.ID, info)
	default:
		b.sendMessage(msg.Chat.ID, "❓ Unknown command. Use /start for help.")
	}
}

// createNoteFromMessage creates a new note from a Telegram message
func (b *Bot) createNoteFromMessage(content string, msg *tgbotapi.Message) (string, error) {
	now := time.Now()

	// Generate title from content or timestamp
	title := generateTitle(content, now)

	// Build paths
	username := b.config.Telegram.DefaultUsername
	userPath := filepath.Join(b.config.Storage.Path, username)
	notesPath := filepath.Join(userPath, "notes")

	// Ensure notes directory exists
	if err := os.MkdirAll(notesPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create notes directory: %w", err)
	}

	// Build folder path
	folder := b.config.Telegram.DefaultFolder
	var targetDir string
	if folder != "" {
		// Convert :>: separator to path separator if present
		folderPath := strings.ReplaceAll(folder, ":>:", string(filepath.Separator))
		targetDir = filepath.Join(notesPath, folderPath)
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			return "", fmt.Errorf("failed to create folder: %w", err)
		}
	} else {
		targetDir = notesPath
	}

	// Generate unique ID
	id := uuid.New().String()

	// Build full ID with folder path for the note
	fullID := id
	if folder != "" {
		fullID = folder + "/" + id
	}

	// Create note
	note := &model.Note{
		ID:         fullID,
		FolderPath: folder,
		Title:      title,
		Content:    content,
		Type:       "markdown",
		Tags:       []string{"telegram"},
		Created:    now,
		Modified:   now,
	}

	// Generate file content
	fileContent, err := note.ToFileContent()
	if err != nil {
		return "", fmt.Errorf("failed to generate file content: %w", err)
	}

	// Save file
	filePath := filepath.Join(targetDir, id+".md")
	if err := os.WriteFile(filePath, fileContent, 0644); err != nil {
		return "", fmt.Errorf("failed to save note: %w", err)
	}

	// Git commit
	repo, err := git.NewRepository(userPath)
	if err == nil {
		if err := repo.Init(); err != nil {
			encoding.Warn("Telegram: Failed to init git repo: %v", err)
		} else {
			absFilePath, _ := filepath.Abs(filePath)
			commitMsg := fmt.Sprintf("Add note via Telegram: %s", title)
			if err := repo.AddAndCommit(absFilePath, commitMsg); err != nil {
				encoding.Warn("Telegram: Failed to commit: %v", err)
			}
		}
	}

	// Broadcast note creation via WebSocket
	if b.wsHub != nil {
		b.wsHub.BroadcastToUser(username, websocket.Message{
			Type:   websocket.MsgTypeNoteCreated,
			NoteID: fullID,
		})
		encoding.Debug("Telegram: Broadcasted note creation to user %s", username)
	}

	encoding.Info("Telegram: Note saved - %s/%s", folder, title)

	return title, nil
}

// sendMessage sends a message to a chat
func (b *Bot) sendMessage(chatID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)
	if _, err := b.api.Send(msg); err != nil {
		encoding.Error("Telegram: Failed to send message: %v", err)
	}
}

// generateTitle generates a note title from content or timestamp
func generateTitle(content string, t time.Time) string {
	// Use first line or first 50 chars as title
	lines := strings.Split(content, "\n")
	title := strings.TrimSpace(lines[0])

	// Limit title length
	if len(title) > 50 {
		title = title[:47] + "..."
	}

	// If title is empty or just whitespace, use timestamp
	if title == "" || strings.TrimSpace(title) == "" {
		title = t.Format("2006-01-02 15:04:05")
	}

	// Remove characters that are problematic for filenames
	title = sanitizeTitle(title)

	return title
}

// sanitizeTitle removes characters that are problematic for filenames
func sanitizeTitle(title string) string {
	// Replace problematic characters
	replacer := strings.NewReplacer(
		"/", "_",
		"\\", "_",
		":", "_",
		"*", "_",
		"?", "_",
		"\"", "_",
		"<", "_",
		">", "_",
		"|", "_",
	)
	return replacer.Replace(title)
}
