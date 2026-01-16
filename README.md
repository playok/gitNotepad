**English** | [한국어](README.ko.md)

# Git Notepad

A web-based note application with integrated Git version control

## Key Features

- **Multiple Document Formats**: Markdown, AsciiDoc, TXT
- **CodeMirror Editor**: Syntax highlighting, line numbers, auto-completion
- **Editing Toolbar**: Markdown/AsciiDoc formatting buttons, table grid selector
- **AsciiDoc Table Editor**: Drag to select cells, merge/split, auto-generate span syntax
- **Real-time Preview**: Live rendering for Markdown/AsciiDoc
- **KaTeX Math Rendering**: LaTeX syntax support ($...$, $$...$$)
- **Editor/Preview Docking**: Horizontal/vertical layout, tab mode, popout preview
- **Git Version Control**: Auto-commit all changes, 3-way diff comparison
- **User Authentication**: SQLite-based multi-user support
- **Password Protection**: Individual note encryption
- **File Encryption**: AES-256-GCM encryption for stored files (optional)
- **File Attachments**: Image and file upload (original filename restoration)
- **4 Themes**: Light, Dark, Dark High Contrast, Dark Cyan
- **Multi-language Support**: English/Korean (changeable in Settings)
- **Offline Support**: All libraries included locally
- **Short URLs**: Generate short links for note sharing (public/private, expiration date)
- **Calendar View**: Sidebar mini calendar, date-based note management, auto Daily folder creation
- **Folder Management**: Drag & drop, expand/collapse, icon change, note move modal
- **New Note Location**: Folder selection modal when creating notes
- **Tablet Support**: Touch device optimization (44px minimum touch area)
- **Tag Feature**: YAML frontmatter storage, autocomplete, filter notes by tag
- **Data Management**: Note export/import, statistics view
- **Cross-platform**: Linux/macOS/Windows build without CGO
- **Nginx Proxy**: Operable on sub-paths
- **Single Binary**: Templates/static files embedded (go:embed)
- **Daemon Mode**: Background execution (start/stop/restart/status)
- **Log Rolling**: Daily log file creation (`gitnotepad.log.YYYY-MM-DD`)

## Screenshots

**List View (Default):**
```
┌─────────────────────────────────────────────────────────────┐
│  Git Notepad    [+] [?] [⚙] [☀]                            │
├─────────────┬───────────────────────────────────────────────┤
│ [☰][📅]     │  # Title                   │  # Title         │
│ 📄 Note 1   │                            │                  │
│ 📄 Note 2   │  Content...                │  Content...      │
│ 📁 Folder   │                            │                  │
│   📄 Sub    │  [Editor]                  │  [Preview]       │
└─────────────┴───────────────────────────────────────────────┘
```

**Calendar View:**
```
┌─────────────────────────────────────────────────────────────┐
│  Git Notepad    [+] [?] [⚙] [☀]                            │
├─────────────┬───────────────────────────────────────────────┤
│ [☰][📅]     │  ◀  January 2025  ▶  [Today]   │ Jan 15, 2025  │
│             │  Su Mo Tu We Th Fr Sa          │ [+ New Note]  │
│             │      1  2  3  4  5  6          │               │
│             │   7  8  9 10 11 12 13          │ 📄 Meeting    │
│             │  14 [15] 16 17 18 19 20        │ 📄 Diary      │
│             │  21 22 23 24 25 26 27          │               │
│             │  28 29 30 31                   │               │
└─────────────┴───────────────────────────────────────────────┘
```

## Requirements

- Go 1.21 or higher (CGO not required)
- Git (for version control feature)

## Installation & Running

### Build from Source

```bash
# Clone repository
git clone https://github.com/playok/gitNotepad.git
cd gitNotepad

# Install dependencies
make deps

# Build
make build

# Run
./gitnotepad
```

### Quick Run

```bash
make run
```

Access `http://localhost:8080` in browser

### CLI Options

```bash
gitnotepad                             # Auto mode (foreground if initial setup needed, else daemon)
gitnotepad --help                      # Show help
gitnotepad --nginx                     # Show nginx proxy setup guide
gitnotepad -config my.yaml             # Specify config file
gitnotepad --reset-password <username> # Reset user password
```

### Daemon Commands

```bash
gitnotepad start                       # Start background daemon
gitnotepad stop                        # Stop daemon
gitnotepad restart                     # Restart daemon
gitnotepad status                      # Check daemon status
gitnotepad run                         # Foreground execution (for debugging)
gitnotepad start -config my.yaml       # Start with specific config file
```

> **Default Behavior**: When run without arguments, it runs in foreground for initial setup (admin password), then starts as daemon once configured.

## Initial Setup

### Admin Password Setup

On first run, enter admin password in terminal:

```
╔════════════════════════════════════════════════════════════╗
║              Initial Admin Password Setup                  ║
╚════════════════════════════════════════════════════════════╝

Enter admin password:
Confirm admin password:
Admin password set successfully!
```

- **Username**: `admin` (changeable in config.yaml)
- **Password**: Enter directly in terminal (stored as SHA-512 hash in config.yaml)

> Password is never stored in plaintext; SHA-512 hash is saved in config.yaml.

### User Management

After logging in as admin:

1. Click user icon in top right
2. Select "Manage Users"
3. Add new users or delete existing ones

## Usage

### Creating Notes

1. Click `+` button at top of sidebar
2. Enter note title
3. Select document format (MD/ADOC/TXT)
4. Write content

### Note Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| Markdown | `.md` | GitHub Flavored Markdown support |
| AsciiDoc | `.adoc` | Suitable for technical documentation |
| Text | `.txt` | Plain text (no preview) |

### Folder Structure

Use `/` in note titles to create folder structure:

```
Project/Design Document
Project/Meeting Notes/2024-01
Personal/Diary
```

**Moving Notes:**
1. Right-click note in list → "Move..."
2. Select target folder in modal
3. Move to root or existing folder

**Creating New Notes:**
1. Click `+` button to show location selection modal
2. Choose from root, existing folder, or new folder

### Private Notes

1. Click 🔒 icon at top of editor
2. Set password
3. Password required for next access

### File Attachments

**Pasting Images:**
- Paste images from clipboard with `Ctrl+V`

**File Upload:**
1. Click 📎 button at top of editor
2. Select file
3. Markdown link automatically inserted

### Version Control

**Viewing History:**
1. Click 🕐 button at top of editor
2. 3-panel view: Version list + Previous version + Current version
3. Color legend shows changes (red: deleted, green: added)
4. Select version to view diff comparison
5. Click "Restore" button to restore

### Note Sharing

**Creating Share Links:**
1. Click share button at top of editor
2. Set public/private
3. Set expiration date (Never or select date)
4. Copy generated link to share

**Share Options:**
- **Public**: Anyone can access without login
- **Private**: Login required

**Expiration Options:**
- `Never`: Valid indefinitely
- Select date: Valid until that date

> Expired links are automatically cleaned up daily at midnight (notes are preserved)

### Editor/Preview Docking

Use layout control buttons at top of editor area for various layouts:

**Layout Buttons:**
- **⇔ Layout Direction**: Toggle horizontal/vertical
- **⇉ Preview Position**: Swap editor/preview order
- **☷ Tab Mode**: Switch between editor and preview as tabs
- **⧉ Popout**: Separate preview into new window

**Popout Preview:**
- Display preview in separate browser window
- Real-time sync when typing in editor
- Useful for dual monitor setups

> Layout settings are saved in localStorage and persist across browser restarts.

### JSON Formatting

1. Select JSON text (or all)
2. Press `Ctrl+Shift+F` or click `{ }` button
3. Indentation automatically applied

### Language Settings

1. Click ⚙ (Settings) button in top right
2. Select Language in General tab
3. Choose English or 한국어

> Language setting applies immediately and is saved in localStorage.

### Calendar View

**Mini Calendar:**
- Mini calendar displayed at top of sidebar
- Dates with notes shown with dots

**Using Calendar:**
1. Navigate months: ◀ / ▶ buttons or "Today" button
2. Select date: Click desired date
3. View notes: Date notes panel shown in editor area
4. Open note: Click note item to go to editor

**Date Move (Drag & Drop):**
1. Drag note item from date panel
2. Drop on desired date cell
3. Note's creation date changes to that date

**Creating New Notes:**
1. Select date then click "+ New Note" button
2. Auto-saved in `Daily/YYYY.MM/` folder
3. Date automatically entered as title (YYYY-MM-DD format)

## Configuration

### config.yaml

```yaml
server:
  port: 8080          # Server port
  host: "0.0.0.0"     # Binding address
  base_path: ""       # Sub-path (for nginx proxy, e.g., "/note")

storage:
  path: "./data"      # Note storage path
  auto_init_git: true # Auto Git initialization

logging:
  encoding: ""        # "utf-8" (default) or "euc-kr"
  file: false         # Enable file logging
  dir: "./logs"       # Log directory (daily rolling: gitnotepad.log.YYYY-MM-DD)
  max_age: 30         # Log retention days

editor:
  default_type: "markdown"  # Default document format
  auto_save: true           # Auto save (after 2 seconds)

auth:
  enabled: true                # Enable authentication
  session_timeout: 168         # Session expiration (hours)
  admin_username: "admin"      # Initial admin ID
  admin_password_hash: ""      # SHA-512 hash (auto-set on first run)

database:
  path: "./data/gitnotepad.db" # SQLite DB path

encryption:
  enabled: false               # Enable file encryption
  salt: ""                     # Encryption salt (auto-generated on first run)

daemon:
  pid_file: "./gitnotepad.pid" # PID file path
```

### Environment-specific Settings

**Development:**
```yaml
server:
  port: 3000
auth:
  enabled: false  # Disable authentication
```

**Production:**
```yaml
server:
  host: "127.0.0.1"  # Allow localhost only
auth:
  enabled: true
encryption:
  enabled: true      # Enable file encryption
```

### Nginx Reverse Proxy

To operate on sub-path (`/note`):

**config.yaml:**
```yaml
server:
  port: 8080
  host: "127.0.0.1"
  base_path: "/note"  # Set sub-path
```

**nginx.conf:**
```nginx
location /note {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Keyboard Shortcuts

### Global

| Shortcut | Function |
|----------|----------|
| `Ctrl+N` | Create new note |
| `Ctrl+S` | Save |
| `Ctrl+F` | Focus search box |
| `Ctrl+B` | Toggle sidebar |
| `F1` or `Ctrl+/` | Help |
| `Esc` | Close modal |

### Editor

| Shortcut | Function |
|----------|----------|
| `Ctrl+E` | Editor fullscreen |
| `Ctrl+P` | Preview fullscreen |
| `Ctrl+Shift+F` | JSON formatting |
| `Enter` | Auto-continue markdown list |

## Make Commands

| Command | Description |
|---------|-------------|
| `make` | Build for current OS |
| `make build` | Build for current OS |
| `make run` | Quick run |
| `make dev` | Run with config.yaml |
| `make clean` | Delete build artifacts |
| `make test` | Run tests |
| `make deps` | Install dependencies |
| `make tidy` | Clean go.mod |
| `make linux` | Linux build (amd64, arm64) |
| `make windows` | Windows build |
| `make darwin` | macOS build (amd64, arm64) |
| `make release` | Build all platforms |

### Windows (without make)

On Windows, you can use `build.cmd`:

```cmd
build          :: Build for current OS
build run      :: Quick run
build dev      :: Run with config.yaml
build clean    :: Delete build artifacts
build test     :: Run tests
build deps     :: Install dependencies
build tidy     :: Clean go.mod
build linux    :: Linux build
build windows  :: Windows build
build darwin   :: macOS build
build release  :: Build all platforms
build help     :: Help
```

## Directory Structure

```
gitNotepad/
├── main.go                 # Entry point
├── config.yaml             # Config file
├── internal/
│   ├── config/             # Config loading
│   ├── daemon/             # Daemon management, log rolling
│   ├── database/           # SQLite initialization
│   ├── encryption/         # AES-256 encryption
│   ├── git/                # Git integration
│   ├── handler/            # HTTP handlers
│   ├── middleware/         # Auth middleware
│   ├── model/              # Data models
│   ├── repository/         # DB repositories
│   └── server/             # Server setup
├── web/
│   ├── static/
│   │   ├── css/            # Stylesheets
│   │   ├── js/             # JavaScript
│   │   └── lib/            # External libraries (for offline)
│   └── templates/          # HTML templates
└── data/                   # Note storage (gitignore)
    ├── gitnotepad.db       # SQLite DB
    └── {username}/         # Per-user notes
        ├── .git/
        ├── note1.md
        └── images/
```

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user info |

### Notes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes` | List notes |
| GET | `/api/notes/:id` | Get note |
| POST | `/api/notes` | Create note |
| PUT | `/api/notes/:id` | Update note |
| DELETE | `/api/notes/:id` | Delete note |

### Files

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/images` | Upload image |
| POST | `/api/files` | Upload file |
| GET | `/api/git/history/:id` | Version history |
| GET | `/api/git/version/:id/:hash` | Get specific version |

### Short Links

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/notes/:id/shortlink` | Create short URL |
| GET | `/api/notes/:id/shortlink` | Get short URL |
| DELETE | `/api/notes/:id/shortlink` | Delete short URL |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags` | List all tags |

### Data Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | Get statistics |
| GET | `/api/notes/export` | Export notes |
| POST | `/api/notes/import` | Import notes |
| DELETE | `/api/notes` | Delete all notes |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List users |
| POST | `/api/admin/users` | Create user |
| DELETE | `/api/admin/users/:id` | Delete user |
| PUT | `/api/admin/users/:id/password` | Change password |

## File Encryption

### Overview

Encrypts note files with AES-256-GCM. Derives PBKDF2 key from user password.

### Enabling

Enable encryption in `config.yaml`:

```yaml
encryption:
  enabled: true
  salt: ""  # Auto-generated on first run
```

### How It Works

1. **Key Derivation**: Generate PBKDF2 key from password and salt on login (100,000 iterations, SHA-256)
2. **Encryption**: Encrypt with AES-256-GCM when saving notes
3. **Storage Format**: Saved as `ENC:base64_encoded_ciphertext` in file
4. **Decryption**: Decrypt with session key when loading notes

### Features

- **Session-based Key**: Encryption key kept in memory only during login session
- **Backward Compatibility**: Existing unencrypted files still readable
- **Auto Salt Generation**: Security random salt auto-generated on first run

### Cautions

- Data unrecoverable if password lost after enabling encryption
- Existing encrypted files unreadable if salt changes
- Same password required for multiple users to access same encrypted notes

## Troubleshooting

### Port Conflict

```bash
# Run on different port
./gitnotepad -port 3000
```

Or change port in `config.yaml`

### Git Errors

```bash
# Check if Git is installed
git --version

# Initialize data directory
rm -rf data/
./gitnotepad
```

### Database Reset

```bash
# Delete SQLite DB and restart
rm data/gitnotepad.db
./gitnotepad
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT License

## Contributing

Bug reports and feature suggestions welcome at [GitHub Issues](https://github.com/playok/gitNotepad/issues).
