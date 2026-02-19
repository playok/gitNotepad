package telegram

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
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

	// Media group handling
	mediaGroups      map[string]*MediaGroup
	mediaGroupsMutex sync.RWMutex
}

// MediaGroup represents a group of media messages (photos, videos, etc.)
type MediaGroup struct {
	Messages    []*tgbotapi.Message
	Attachments []model.Attachment
	Content     string
	Timer       *time.Timer
	CreatedAt   time.Time
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

	bot := &Bot{
		api:         api,
		config:      cfg,
		stopCh:      make(chan struct{}),
		mediaGroups: make(map[string]*MediaGroup),
	}

	// Start media group cleanup goroutine
	go bot.cleanupMediaGroups()

	return bot, nil
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
	// Handle commands first
	if msg.IsCommand() {
		b.handleCommand(msg)
		return
	}

	// Check if this message is part of a media group
	if msg.MediaGroupID != "" {
		b.handleMediaGroupMessage(msg)
		return
	}

	// Single message handling (not part of a group)
	var content string
	var attachments []model.Attachment
	username := b.config.Telegram.DefaultUsername

	// Handle different message types
	if msg.Text != "" {
		content = msg.Text
	} else if msg.Caption != "" {
		content = msg.Caption
	}

	// Process media attachments
	hasMedia := b.processMediaAttachments(msg, &content, &attachments, username)

	// If no content and no media, show unsupported message
	if content == "" && !hasMedia {
		b.sendMessage(msg.Chat.ID, "⚠️ Unsupported message type. Please send text messages, photos, videos, documents, or audio files.")
		return
	}

	// Build content with embedded attachments
	finalContent := b.buildContentWithAttachments(content, attachments)

	// Create note from message
	b.createAndConfirmNote(msg, finalContent, attachments)
}

// handleCommand processes bot commands
func (b *Bot) handleCommand(msg *tgbotapi.Message) {
	switch msg.Command() {
	case "start":
		b.sendMessage(msg.Chat.ID, "👋 Welcome to Git Notepad Bot!\n\nSend me text, photos, videos, audio, or documents and I'll save them as notes.\n\n📋 Commands:\n/start - Show this help\n/info - Show bot info\n\n📸 Supported media:\n• Photos (JPG, PNG, GIF, WebP)\n• Videos (MP4)\n• Audio (MP3, OGG, WAV)\n• Voice messages\n• Documents (PDF, etc.)")
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

// processMediaAttachments processes media attachments from a message
func (b *Bot) processMediaAttachments(msg *tgbotapi.Message, content *string, attachments *[]model.Attachment, username string) bool {
	hasMedia := false

	// Photo
	if msg.Photo != nil && len(msg.Photo) > 0 {
		hasMedia = true
		if *content == "" {
			*content = "📸 Photo from Telegram"
		}
		fileID := b.getPhotoFileID(msg.Photo)
		if fileID != "" {
			attachment, err := b.downloadTelegramMedia(fileID, "photo.jpg", "image/jpeg", username)
			if err != nil {
				encoding.Error("Telegram: Failed to download photo: %v", err)
				*content = fmt.Sprintf("⚠️ Failed to download photo: %v\n\n%s", err, *content)
			} else {
				*attachments = append(*attachments, *attachment)
			}
		}
	}

	// Video
	if msg.Video != nil {
		hasMedia = true
		if *content == "" {
			*content = "🎥 Video from Telegram"
		}
		fileName := msg.Video.FileName
		if fileName == "" {
			fileName = "video.mp4"
		}
		attachment, err := b.downloadTelegramMedia(msg.Video.FileID, fileName, "video/mp4", username)
		if err != nil {
			encoding.Error("Telegram: Failed to download video: %v", err)
			*content = fmt.Sprintf("⚠️ Failed to download video: %v\n\n%s", err, *content)
		} else {
			*attachments = append(*attachments, *attachment)
		}
	}

	// Audio (music files)
	if msg.Audio != nil {
		hasMedia = true
		if *content == "" {
			title := msg.Audio.Title
			performer := msg.Audio.Performer
			if title != "" && performer != "" {
				*content = fmt.Sprintf("🎵 %s - %s", performer, title)
			} else if title != "" {
				*content = fmt.Sprintf("🎵 %s", title)
			} else {
				*content = "🎵 Audio from Telegram"
			}
		}
		fileName := msg.Audio.FileName
		if fileName == "" {
			fileName = "audio.mp3"
		}
		mimeType := msg.Audio.MimeType
		if mimeType == "" {
			mimeType = "audio/mpeg"
		}
		attachment, err := b.downloadTelegramMedia(msg.Audio.FileID, fileName, mimeType, username)
		if err != nil {
			encoding.Error("Telegram: Failed to download audio: %v", err)
			*content = fmt.Sprintf("⚠️ Failed to download audio: %v\n\n%s", err, *content)
		} else {
			*attachments = append(*attachments, *attachment)
		}
	}

	// Voice message
	if msg.Voice != nil {
		hasMedia = true
		if *content == "" {
			*content = "🎤 Voice message from Telegram"
		}
		fileName := "voice.ogg"
		mimeType := msg.Voice.MimeType
		if mimeType == "" {
			mimeType = "audio/ogg"
		}
		attachment, err := b.downloadTelegramMedia(msg.Voice.FileID, fileName, mimeType, username)
		if err != nil {
			encoding.Error("Telegram: Failed to download voice: %v", err)
			*content = fmt.Sprintf("⚠️ Failed to download voice message: %v\n\n%s", err, *content)
		} else {
			*attachments = append(*attachments, *attachment)
		}
	}

	// Animation (GIF)
	if msg.Animation != nil {
		hasMedia = true
		if *content == "" {
			*content = "🎬 Animation from Telegram"
		}
		fileName := msg.Animation.FileName
		if fileName == "" {
			fileName = "animation.gif"
		}
		attachment, err := b.downloadTelegramMedia(msg.Animation.FileID, fileName, "image/gif", username)
		if err != nil {
			encoding.Error("Telegram: Failed to download animation: %v", err)
			*content = fmt.Sprintf("⚠️ Failed to download animation: %v\n\n%s", err, *content)
		} else {
			*attachments = append(*attachments, *attachment)
		}
	}

	// Document (PDF, files, etc.)
	if msg.Document != nil {
		hasMedia = true
		if *content == "" {
			*content = fmt.Sprintf("📄 Document: %s", msg.Document.FileName)
		}
		attachment, err := b.downloadTelegramMedia(
			msg.Document.FileID,
			msg.Document.FileName,
			msg.Document.MimeType,
			username,
		)
		if err != nil {
			encoding.Error("Telegram: Failed to download document: %v", err)
			*content = fmt.Sprintf("⚠️ Failed to download document: %v\n\n%s", err, *content)
		} else {
			*attachments = append(*attachments, *attachment)
		}
	}

	return hasMedia
}

// buildContentWithAttachments builds note content with embedded attachment links
func (b *Bot) buildContentWithAttachments(content string, attachments []model.Attachment) string {
	if len(attachments) == 0 {
		return content
	}

	var builder strings.Builder

	// Add original content if present (skip default placeholder texts)
	if content != "" && content != "📸 Photo from Telegram" &&
		content != "🎥 Video from Telegram" &&
		content != "🎬 Animation from Telegram" &&
		content != "🎵 Audio from Telegram" &&
		content != "🎤 Voice message from Telegram" &&
		!strings.HasPrefix(content, "📄 Document:") &&
		!strings.HasPrefix(content, "🎵 ") {
		builder.WriteString(content)
		builder.WriteString("\n\n")
	}

	// Add attachments using ![name](url) syntax for all media types
	// The custom marked.js renderer will handle video/audio rendering
	for i, att := range attachments {
		if i > 0 {
			builder.WriteString("\n")
		}

		if att.IsImage || strings.HasPrefix(att.Type, "video/") || strings.HasPrefix(att.Type, "audio/") {
			// Use image syntax for all media - custom renderer handles video/audio
			builder.WriteString(fmt.Sprintf("![%s](%s)", att.Name, att.URL))
		} else {
			// Other files use link syntax
			builder.WriteString(fmt.Sprintf("📎 [%s](%s)", att.Name, att.URL))
		}
	}

	return builder.String()
}

// handleMediaGroupMessage handles messages that are part of a media group
func (b *Bot) handleMediaGroupMessage(msg *tgbotapi.Message) {
	b.mediaGroupsMutex.Lock()
	defer b.mediaGroupsMutex.Unlock()

	groupID := msg.MediaGroupID

	group, exists := b.mediaGroups[groupID]
	if !exists {
		group = &MediaGroup{
			Messages:    []*tgbotapi.Message{msg},
			Attachments: []model.Attachment{},
			Content:     msg.Caption,
			CreatedAt:   time.Now(),
		}
		b.mediaGroups[groupID] = group

		group.Timer = time.AfterFunc(2*time.Second, func() {
			b.processMediaGroup(groupID)
		})

		encoding.Debug("Telegram: Created new media group %s", groupID)
		return
	}

	group.Messages = append(group.Messages, msg)

	if msg.Caption != "" && group.Content == "" {
		group.Content = msg.Caption
	}

	group.Timer.Stop()
	group.Timer = time.AfterFunc(2*time.Second, func() {
		b.processMediaGroup(groupID)
	})

	encoding.Debug("Telegram: Added message to media group %s (total: %d)", groupID, len(group.Messages))
}

// processMediaGroup processes a complete media group and creates a single note
func (b *Bot) processMediaGroup(groupID string) {
	b.mediaGroupsMutex.Lock()
	group, exists := b.mediaGroups[groupID]
	if !exists {
		b.mediaGroupsMutex.Unlock()
		return
	}
	delete(b.mediaGroups, groupID)
	b.mediaGroupsMutex.Unlock()

	if len(group.Messages) == 0 {
		return
	}

	firstMsg := group.Messages[0]
	username := b.config.Telegram.DefaultUsername

	for _, msg := range group.Messages {
		b.processMediaAttachments(msg, &group.Content, &group.Attachments, username)
	}

	content := b.buildContentWithAttachments(group.Content, group.Attachments)

	b.createAndConfirmNote(firstMsg, content, group.Attachments)
}

// createAndConfirmNote creates a note and sends confirmation message
func (b *Bot) createAndConfirmNote(msg *tgbotapi.Message, content string, attachments []model.Attachment) {
	title, err := b.createNoteFromMessage(content, msg, attachments)
	if err != nil {
		encoding.Error("Telegram: Failed to create note: %v", err)
		b.sendMessage(msg.Chat.ID, fmt.Sprintf("❌ Failed to save note: %v", err))
		return
	}

	folderDisplay := strings.ReplaceAll(b.config.Telegram.DefaultFolder, ":>:", "/")
	confirmMsg := fmt.Sprintf("✅ Note saved!\n📁 Folder: %s\n📝 Title: %s", folderDisplay, title)
	if len(attachments) > 0 {
		confirmMsg += fmt.Sprintf("\n📎 Attachments: %d", len(attachments))
		for i, att := range attachments {
			var icon string
			switch {
			case att.IsImage:
				icon = "📷"
			case strings.HasPrefix(att.Type, "video/"):
				icon = "🎥"
			case strings.HasPrefix(att.Type, "audio/"):
				icon = "🎵"
			default:
				icon = "📄"
			}
			confirmMsg += fmt.Sprintf("\n  %d. %s %s", i+1, icon, att.Name)
		}
	}
	b.sendMessage(msg.Chat.ID, confirmMsg)
}

// createNoteFromMessage creates a new note from a Telegram message
func (b *Bot) createNoteFromMessage(content string, msg *tgbotapi.Message, attachments []model.Attachment) (string, error) {
	now := time.Now()

	// Generate title from content or timestamp
	title := generateTitle(content, now)

	// Build paths
	username := b.config.Telegram.DefaultUsername
	userPath := filepath.Join(b.config.Storage.Path, username)
	notesPath := filepath.Join(userPath, "notes")

	if err := os.MkdirAll(notesPath, 0755); err != nil {
		return "", fmt.Errorf("failed to create notes directory: %w", err)
	}

	// Build folder path
	folder := b.config.Telegram.DefaultFolder
	var targetDir string
	if folder != "" {
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

	fullID := id
	if folder != "" {
		fullID = folder + "/" + id
	}

	fullTitle := title
	if folder != "" {
		fullTitle = folder + ":>:" + title
	}

	// Create note with attachments
	note := &model.Note{
		ID:          fullID,
		FolderPath:  folder,
		Title:       fullTitle,
		Content:     content,
		Type:        "markdown",
		Tags:        []string{"telegram"},
		Attachments: attachments,
		Created:     now,
		Modified:    now,
	}

	fileContent, err := note.ToFileContent()
	if err != nil {
		return "", fmt.Errorf("failed to generate file content: %w", err)
	}

	// Save file
	filePath := filepath.Join(targetDir, id+".md")
	if err := os.WriteFile(filePath, fileContent, 0644); err != nil {
		return "", fmt.Errorf("failed to save note: %w", err)
	}

	// Git commit (note + attachments in a single commit)
	repo, err := git.NewRepository(userPath)
	if err == nil {
		if err := repo.Init(); err != nil {
			encoding.Warn("Telegram: Failed to init git repo: %v", err)
		} else {
			commitMsg := fmt.Sprintf("Add note via Telegram: %s", title)
			if len(attachments) > 0 {
				commitMsg += fmt.Sprintf(" (%d attachment(s))", len(attachments))
			}

			// Collect all file paths for a single commit
			var commitPaths []string
			absFilePath, _ := filepath.Abs(filePath)
			commitPaths = append(commitPaths, absFilePath)

			// Add attachment files
			for _, att := range attachments {
				// URL format: /u/{username}/files/{filename}
				parts := strings.Split(att.URL, "/")
				if len(parts) >= 5 && parts[1] == "u" && parts[3] == "files" {
					attFilePath := filepath.Join(b.config.Storage.Path, parts[2], "files", parts[4])
					absAttFilePath, _ := filepath.Abs(attFilePath)
					commitPaths = append(commitPaths, absAttFilePath)

					// Also add metadata file
					metaPath := filepath.Join(b.config.Storage.Path, parts[2], "files", ".imagemeta.json")
					absMetaPath, _ := filepath.Abs(metaPath)
					commitPaths = append(commitPaths, absMetaPath)
				}
			}

			if err := repo.AddMultipleAndCommit(commitPaths, commitMsg); err != nil {
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

	encoding.Info("Telegram: Note saved - %s/%s (attachments: %d)", folder, title, len(attachments))

	return title, nil
}

// downloadTelegramMedia downloads a file from Telegram and saves it locally
func (b *Bot) downloadTelegramMedia(fileID, fileName, mimeType, username string) (*model.Attachment, error) {
	directURL, err := b.api.GetFileDirectURL(fileID)
	if err != nil {
		return nil, fmt.Errorf("failed to get file URL: %w", err)
	}

	detectedMimeType, ext := b.detectMimeTypeAndExtension(mimeType, fileName)

	filename := uuid.New().String() + ext
	userFilesPath := b.getUserFilesPath(username)
	filePath := filepath.Join(userFilesPath, filename)

	// Download the file
	resp, err := http.Get(directURL) // #nosec G107 -- URL from Telegram API
	if err != nil {
		return nil, fmt.Errorf("failed to download file: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to download file: HTTP %d", resp.StatusCode)
	}

	out, err := os.Create(filePath) // #nosec G304 -- path constructed from trusted config
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	size, err := io.Copy(out, resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to save file: %w", err)
	}

	// Determine original filename for metadata
	originalName := fileName
	if originalName == "" {
		originalName = strings.TrimSuffix(filename, ext) + ext
	}

	// Save metadata mapping (UUID -> original filename)
	metadata, err := b.loadImageMetadata(username)
	if err != nil {
		encoding.Warn("Telegram: Failed to load metadata: %v", err)
	}
	metadata[filename] = originalName
	if err := b.saveImageMetadata(username, metadata); err != nil {
		encoding.Warn("Telegram: Failed to save metadata: %v", err)
	}

	attachmentURL := fmt.Sprintf("/u/%s/files/%s", username, filename)

	isImage := strings.HasPrefix(detectedMimeType, "image/") ||
		strings.HasPrefix(mimeType, "image/")

	attachment := &model.Attachment{
		Name:    originalName,
		URL:     attachmentURL,
		Size:    size,
		Type:    detectedMimeType,
		IsImage: isImage,
	}

	encoding.Info("Telegram: Downloaded media %s -> %s (%d bytes)", originalName, filename, size)

	return attachment, nil
}

// detectMimeTypeAndExtension determines the file extension from MIME type and filename
func (b *Bot) detectMimeTypeAndExtension(mimeType, fileName string) (string, string) {
	switch mimeType {
	case "image/jpeg":
		return "image/jpeg", ".jpg"
	case "image/png":
		return "image/png", ".png"
	case "image/gif":
		return "image/gif", ".gif"
	case "image/webp":
		return "image/webp", ".webp"
	case "video/mp4":
		return "video/mp4", ".mp4"
	case "video/webm":
		return "video/webm", ".webm"
	case "audio/mpeg", "audio/mp3":
		return "audio/mpeg", ".mp3"
	case "audio/ogg":
		return "audio/ogg", ".ogg"
	case "audio/wav", "audio/x-wav":
		return "audio/wav", ".wav"
	case "audio/flac":
		return "audio/flac", ".flac"
	case "audio/mp4", "audio/m4a", "audio/x-m4a":
		return "audio/mp4", ".m4a"
	case "application/pdf":
		return "application/pdf", ".pdf"
	case "application/zip":
		return "application/zip", ".zip"
	}

	// Fallback: extract extension from filename
	if fileName != "" {
		ext := filepath.Ext(fileName)
		if ext != "" {
			return mimeType, ext
		}
	}

	return mimeType, ".bin"
}

// getUserFilesPath returns the user-specific files directory path
func (b *Bot) getUserFilesPath(username string) string {
	userFilesPath := filepath.Join(b.config.Storage.Path, username, "files")
	if err := os.MkdirAll(userFilesPath, 0755); err != nil {
		encoding.Warn("Telegram: Failed to create files directory: %v", err)
	}
	return userFilesPath
}

// getMetadataPath returns the path to the image metadata file for a user
func (b *Bot) getMetadataPath(username string) string {
	return filepath.Join(b.config.Storage.Path, username, "files", ".imagemeta.json")
}

// loadImageMetadata loads image metadata from disk for a user
func (b *Bot) loadImageMetadata(username string) (map[string]string, error) {
	metaPath := b.getMetadataPath(username)
	data := make(map[string]string)

	file, err := os.ReadFile(metaPath) // #nosec G304 -- path constructed from trusted config
	if err == nil {
		if err := json.Unmarshal(file, &data); err != nil {
			encoding.Warn("Telegram: Failed to parse metadata: %v", err)
		}
	}

	return data, nil
}

// saveImageMetadata saves image metadata to disk for a user
func (b *Bot) saveImageMetadata(username string, metadata map[string]string) error {
	metaPath := b.getMetadataPath(username)

	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(metaPath, data, 0644)
}

// getPhotoFileID returns the FileID of the largest photo from a PhotoSize array
func (b *Bot) getPhotoFileID(photos []tgbotapi.PhotoSize) string {
	if len(photos) == 0 {
		return ""
	}
	return photos[len(photos)-1].FileID
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
	lines := strings.Split(content, "\n")
	title := strings.TrimSpace(lines[0])

	if len(title) > 50 {
		title = title[:47] + "..."
	}

	if title == "" || strings.TrimSpace(title) == "" {
		title = t.Format("2006-01-02 15:04:05")
	}

	title = sanitizeTitle(title)

	return title
}

// sanitizeTitle removes characters that are problematic for filenames
func sanitizeTitle(title string) string {
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

// cleanupMediaGroups periodically cleans up stale media groups
func (b *Bot) cleanupMediaGroups() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-b.stopCh:
			return
		case <-ticker.C:
			b.mediaGroupsMutex.Lock()
			now := time.Now()
			for groupID, group := range b.mediaGroups {
				if now.Sub(group.CreatedAt) > time.Minute {
					encoding.Warn("Telegram: Cleaning up stale media group %s", groupID)
					if group.Timer != nil {
						group.Timer.Stop()
					}
					delete(b.mediaGroups, groupID)
				}
			}
			b.mediaGroupsMutex.Unlock()
		}
	}
}
