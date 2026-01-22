# Changelog

All notable changes to this project will be documented in this file.

## [v0.13.0](https://github.com/playok/gitNotepad/releases/tag/v0.13.0) - Telegram Bot Integration

**New Features:**
- Telegram bot integration for note creation
  - Send messages to bot → auto-save as notes
  - Long Polling mode (no port forwarding required)
  - Auto-delete webhook on startup
  - Allowed users whitelist for security
  - Configurable default folder and username
  - `/start` and `/info` bot commands
- Real-time note list sync via WebSocket
  - Browser auto-refreshes when note created via Telegram
- Config auto-migration for telegram settings

**Configuration:**
```yaml
telegram:
  enabled: true
  token: "YOUR_BOT_TOKEN"
  allowed_users:
    - 123456789
  default_folder: "Telegram"
  default_username: "admin"
```

## [v0.11.0](https://github.com/playok/gitNotepad/releases/tag/v0.11.0) - Tablet Responsive Improvements

**New Features:**
- Note list / Calendar resizable splitter (drag to resize)
- Editor header swipe scroll with momentum effect
- Screen size display in Settings > About

**Tablet Improvements:**
- Sidebar splitter touch event support
- All splitters support touch drag
- Editor header horizontal swipe for narrow screens
- Scroll indicators (gradient fade) for editor header

**Bug Fixes:**
- Calendar last week not visible on tablets (#35)
- Editor toolbar buttons not visible on narrow screens (#35)
- Calendar i18n initialization on first load
- Unified Ctrl+S and save button behavior - both now show toast and status (#21)

## [v0.10.0](https://github.com/playok/gitNotepad/releases/tag/v0.10.0) - Tag Feature

**New Features:**
- Note tag feature (stored in YAML frontmatter)
- Tag autocomplete (suggest existing tags)
- Show notes list popup when clicking tag
- Auto-save on tag add/remove

**Bug Fixes:**
- Hide markdown toolbar in preview mode
- Fix editor and preview panel alignment (#33)
- Fix tag autocomplete dropdown opacity

## [v0.9.0](https://github.com/playok/gitNotepad/releases/tag/v0.9.0) - Full i18n & Search Improvements

**New Features:**
- Full note content search (title + content search in searchInput)
- Ctrl+F area-specific search (Editor: CodeMirror search, Preview: browser search)

**Full i18n:**
- User menu (Admin, Manage Users, Logout)
- Settings modal (Notes by Type, Recent Activity)
- Table editor (Size, Selected dynamic text)
- All alert/confirm messages translated
- Folder errors, Import/Export messages translated

**Bug Fixes:**
- Fix Korean layout in user dropdown

## [v0.8.0](https://github.com/playok/gitNotepad/releases/tag/v0.8.0) - Performance Optimization

**Performance Improvements:**
- GZip compression (HTML, JS, CSS, JSON) - ~75% transfer size reduction
- Static file caching (JS/CSS 7 days, fonts 1 year, images 30 days)
- Remove duplicate file reads - List API 2x faster
- Search input debouncing (300ms) - ~70% fewer renders
- Optimistic updates - 3 → 0 API calls after save/delete

**Bug Fixes:**
- Note folder path mismatch causing save failure (#30)
- Show title and UUID together in note move modal

## [v0.7.0](https://github.com/playok/gitNotepad/releases/tag/v0.7.0)

- Git version control 3-way diff comparison
- Folder selection modal when moving notes
- Location selection modal when creating new notes
- Folder separator display improvement (`:>:` → `/`)
- Tablet touch support improvement (44px minimum touch area)

## [v0.6.0](https://github.com/playok/gitNotepad/releases/tag/v0.6.0)

- Calendar view with mini calendar in sidebar
- Date-based note management
- Daily folder auto-creation
- Drag & drop notes to different dates

## [v0.5.0](https://github.com/playok/gitNotepad/releases/tag/v0.5.0)

- Daemon mode (start/stop/restart/status)
- Log rolling (daily log files)
- AES-256-GCM file encryption
- Multi-user authentication with SQLite
