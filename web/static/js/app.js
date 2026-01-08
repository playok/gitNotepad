// Base path for nginx proxy support
const basePath = window.BASE_PATH || '';

// State
let currentNote = null;
let currentPassword = null;
let notes = [];
let folders = []; // Actual folders from API
let expandedFolders = JSON.parse(localStorage.getItem('expandedFolders') || '{}');
let draggedNoteId = null;
let currentAttachments = []; // Track attachments for current note
let isViewMode = true; // View mode by default (preview only)

// CodeMirror Editor
let cmEditor = null;
let cmEditorReady = false;

// Auto-save
let autoSaveTimer = null;
let hasUnsavedChanges = false;
const AUTO_SAVE_DELAY = 2000; // 2 seconds

// Original content tracking (to prevent unnecessary saves)
let originalContent = {
    title: '',
    content: '',
    type: 'markdown',
    private: false
};

// DOM Elements
const noteList = document.getElementById('noteList');
const searchInput = document.getElementById('searchInput');
const newNoteBtn = document.getElementById('newNoteBtn');
const emptyState = document.getElementById('emptyState');
const editor = document.getElementById('editor');
const noteTitle = document.getElementById('noteTitle');
const noteContent = document.getElementById('noteContent');
const codemirrorContainer = document.getElementById('codemirrorEditor');
const noteType = document.getElementById('noteType');
const notePrivate = document.getElementById('notePrivate');
const previewPane = document.getElementById('previewPane');
const previewContent = document.getElementById('previewContent');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const prettyJsonBtn = document.getElementById('prettyJsonBtn');
const historyBtn = document.getElementById('historyBtn');
const themeToggle = document.getElementById('themeToggle');

// Modals
const passwordModal = document.getElementById('passwordModal');
const passwordInput = document.getElementById('passwordInput');
const passwordSubmit = document.getElementById('passwordSubmit');
const passwordCancel = document.getElementById('passwordCancel');

const setPasswordModal = document.getElementById('setPasswordModal');
const setPasswordInput = document.getElementById('setPasswordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const setPasswordSubmit = document.getElementById('setPasswordSubmit');
const setPasswordCancel = document.getElementById('setPasswordCancel');

const historyModal = document.getElementById('historyModal');
const historyList = document.getElementById('historyList');
const historyClose = document.getElementById('historyClose');

const versionModal = document.getElementById('versionModal');
const versionHash = document.getElementById('versionHash');
const versionContent = document.getElementById('versionContent');
const versionRestore = document.getElementById('versionRestore');
const versionClose = document.getElementById('versionClose');

// Context Menu
let contextMenu = null;
let contextTarget = null;

// CodeMirror 5 helper functions
function getEditorContent() {
    if (cmEditor) {
        return cmEditor.getValue();
    }
    return noteContent.value || '';
}

function setEditorContent(content) {
    if (cmEditor) {
        cmEditor.setValue(content || '');
    } else {
        noteContent.value = content || '';
    }
}

function insertAtCursor(text) {
    if (cmEditor) {
        const cursor = cmEditor.getCursor();
        cmEditor.replaceRange(text, cursor);
        cmEditor.focus();
    }
}

function replaceInEditor(searchText, replaceText) {
    if (cmEditor) {
        const content = cmEditor.getValue();
        const newContent = content.replace(searchText, replaceText);
        if (content !== newContent) {
            const cursor = cmEditor.getCursor();
            cmEditor.setValue(newContent);
            cmEditor.setCursor(cursor);
        }
    }
}

function initCodeMirror() {
    if (typeof CodeMirror === 'undefined') {
        console.error('CodeMirror not loaded');
        return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lineNumbersEnabled = localStorage.getItem('lineNumbersEnabled') !== 'false';

    cmEditor = CodeMirror(codemirrorContainer, {
        value: '',
        mode: 'gfm', // GitHub Flavored Markdown
        theme: isDark ? 'dracula' : 'default',
        lineNumbers: lineNumbersEnabled,
        lineWrapping: true,
        extraKeys: {
            'Enter': 'newlineAndIndentContinueMarkdownList'
        }
    });

    // Handle content changes
    cmEditor.on('change', () => {
        updatePreview();
        triggerAutoSave();
    });

    // Handle paste for image uploads
    cmEditor.on('paste', (cm, event) => {
        if (noteType.value !== 'markdown') return;

        const items = event.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                event.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    uploadAndInsertImage(file);
                }
                break;
            }
        }
    });

    cmEditorReady = true;
    console.log('CodeMirror 5 initialized');

    // Refresh after initialization to fix gutter width calculation
    setTimeout(() => {
        cmEditor.refresh();
    }, 0);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMarked();
    initCodeMirror();
    initContextMenu();
    initFullscreenButtons();
    initRootDropZone();
    initShortLinkButton();
    initSidebarToggle();
    initKeyboardShortcuts();
    initFileUpload();
    initMiniCalendar();
    initLocaleSelector();
    loadNotes().then(() => {
        handleHashNavigation();
        renderMiniCalendar();
    });
    setupEventListeners();

    // Handle hash changes
    window.addEventListener('hashchange', handleHashNavigation);

    // Handle locale changes
    window.addEventListener('localeChanged', () => {
        renderMiniCalendar();
    });
});

// Sidebar Toggle
let sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

function initSidebarToggle() {
    const container = document.querySelector('.container');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');

    // Create expand button (shown when collapsed)
    const expandBtn = document.createElement('button');
    expandBtn.id = 'sidebarExpandBtn';
    expandBtn.className = 'sidebar-expand-btn';
    expandBtn.innerHTML = '&#9654;';
    expandBtn.title = 'Expand sidebar (Ctrl+B)';
    expandBtn.addEventListener('click', toggleSidebar);
    document.body.appendChild(expandBtn);

    // Collapse button click
    if (collapseBtn) {
        collapseBtn.addEventListener('click', toggleSidebar);
    }

    // Apply saved state
    if (sidebarCollapsed) {
        container.classList.add('sidebar-collapsed');
    }

    // Initialize sidebar splitter
    initSidebarSplitter();
}

function toggleSidebar() {
    const container = document.querySelector('.container');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');
    const collapseIcon = collapseBtn?.querySelector('.collapse-icon');

    sidebarCollapsed = !sidebarCollapsed;
    container.classList.toggle('sidebar-collapsed', sidebarCollapsed);

    if (collapseIcon) {
        collapseIcon.innerHTML = sidebarCollapsed ? '&#9654;' : '&#9664;';
    }

    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
}

// Sidebar Splitter
function initSidebarSplitter() {
    const splitter = document.getElementById('sidebarSplitter');
    const container = document.querySelector('.container');
    const sidebar = document.getElementById('sidebar');

    if (!splitter || !container || !sidebar) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // Load saved width from localStorage
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth && !sidebarCollapsed) {
        sidebar.style.width = savedWidth + 'px';
        sidebar.style.minWidth = savedWidth + 'px';
    }

    splitter.addEventListener('mousedown', (e) => {
        if (sidebarCollapsed) return;

        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.getBoundingClientRect().width;

        splitter.classList.add('dragging');
        container.classList.add('resizing');

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        let newWidth = startWidth + deltaX;

        // Min/max constraints
        const minWidth = 200;
        const maxWidth = window.innerWidth * 0.5; // Max 50% of viewport

        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        sidebar.style.width = newWidth + 'px';
        sidebar.style.minWidth = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;

        isResizing = false;
        splitter.classList.remove('dragging');
        container.classList.remove('resizing');

        // Save width to localStorage
        const width = sidebar.getBoundingClientRect().width;
        localStorage.setItem('sidebarWidth', Math.round(width).toString());
    });

    // Double click to reset to default width
    splitter.addEventListener('dblclick', () => {
        sidebar.style.width = '320px';
        sidebar.style.minWidth = '320px';
        localStorage.removeItem('sidebarWidth');
    });
}

// Keyboard Shortcuts
function initKeyboardShortcuts() {
    document.addEventListener('keydown', handleKeyboardShortcut);
    createHelpModal();
}

function handleKeyboardShortcut(e) {
    // Ctrl/Cmd + key combinations
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // F1 or Ctrl+/ for help
    if (e.key === 'F1' || (isCtrlOrCmd && e.key === '/')) {
        e.preventDefault();
        toggleHelpModal();
        return;
    }

    if (isCtrlOrCmd) {
        // Ctrl+Shift+F for Pretty JSON
        if (e.shiftKey && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            if (editor.style.display !== 'none') {
                prettyJson();
            }
            return;
        }

        switch (e.key.toLowerCase()) {
            case 's': // Save
                e.preventDefault();
                if (editor.style.display !== 'none') {
                    saveNote();
                }
                break;

            case 'b': // Toggle sidebar
                e.preventDefault();
                toggleSidebar();
                break;

            case 'n': // New note
                e.preventDefault();
                createNewNote();
                break;

            case 'f': // Focus search (without Shift)
                if (!e.shiftKey) {
                    e.preventDefault();
                    searchInput.focus();
                }
                break;

            case 'e': // Toggle editor fullscreen
                e.preventDefault();
                if (editor.style.display !== 'none') {
                    toggleEditorFullscreen();
                }
                break;

            case 'p': // Toggle preview fullscreen
                e.preventDefault();
                if (editor.style.display !== 'none' && noteType.value === 'markdown') {
                    togglePreviewFullscreen();
                }
                break;
        }
    }

    // Escape key
    if (e.key === 'Escape') {
        // Close modals
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (modal.style.display !== 'none') {
                modal.style.display = 'none';
            }
        });
    }
}

// Help Modal
function createHelpModal() {
    const modal = document.createElement('div');
    modal.id = 'helpModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content modal-help">
            <div class="help-header">
                <h3>Keyboard Shortcuts</h3>
                <button class="help-close-btn" onclick="toggleHelpModal()">&times;</button>
            </div>
            <div class="help-content">
                <div class="help-section">
                    <h4>General</h4>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>N</kbd></span>
                            <span class="shortcut-desc">New note</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>S</kbd></span>
                            <span class="shortcut-desc">Save note</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>F</kbd></span>
                            <span class="shortcut-desc">Search notes</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd></span>
                            <span class="shortcut-desc">Format JSON</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>F1</kbd> or <kbd>Ctrl</kbd> + <kbd>/</kbd></span>
                            <span class="shortcut-desc">Show this help</span>
                        </div>
                    </div>
                </div>
                <div class="help-section">
                    <h4>View</h4>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>B</kbd></span>
                            <span class="shortcut-desc">Toggle sidebar</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>E</kbd></span>
                            <span class="shortcut-desc">Editor fullscreen</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>P</kbd></span>
                            <span class="shortcut-desc">Preview fullscreen</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Esc</kbd></span>
                            <span class="shortcut-desc">Close modal / Exit fullscreen</span>
                        </div>
                    </div>
                </div>
                <div class="help-section">
                    <h4>Editor</h4>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-keys">Drag & Drop</span>
                            <span class="shortcut-desc">Move note to folder</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys">Right-click</span>
                            <span class="shortcut-desc">Context menu</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="help-footer">
                <span class="help-tip">Auto-save is enabled (2s delay)</span>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Attach help button event listener
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
        helpBtn.addEventListener('click', toggleHelpModal);
    }
}

function toggleHelpModal() {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
    }
}

// Handle URL hash navigation for short links
function handleHashNavigation() {
    const hash = window.location.hash;
    if (hash.startsWith('#note=')) {
        const noteId = decodeURIComponent(hash.substring(6));
        if (noteId && notes.find(n => n.id === noteId)) {
            loadNote(noteId);
        }
    }
}

// Short Link functionality
function initShortLinkButton() {
    const editorActions = document.querySelector('.editor-actions');
    if (!editorActions) return;

    const shareBtn = document.createElement('button');
    shareBtn.id = 'shareBtn';
    shareBtn.className = 'btn-icon';
    shareBtn.innerHTML = '&#128279;';
    shareBtn.title = 'Share link';
    shareBtn.addEventListener('click', showShareModal);

    // Insert before History button
    const historyBtn = document.getElementById('historyBtn');
    editorActions.insertBefore(shareBtn, historyBtn);

    // Create share modal
    createShareModal();
}

function createShareModal() {
    const modal = document.createElement('div');
    modal.id = 'shareModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Share Note</h3>
            <p>Share this link with your team:</p>
            <div class="share-link-container">
                <input type="text" id="shareLinkInput" readonly>
                <button id="copyLinkBtn" class="btn btn-primary">Copy</button>
            </div>
            <div class="share-expiry-container" style="margin-top: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);">Link expiration:</label>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                        <input type="radio" name="expiryType" id="expiryNever" value="never" checked>
                        <span style="font-size: 0.875rem;">Never</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                        <input type="radio" name="expiryType" id="expiryDate" value="date">
                        <span style="font-size: 0.875rem;">Expires on:</span>
                    </label>
                    <input type="date" id="shareLinkExpiryDate" style="padding: 0.375rem 0.5rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--background); color: var(--foreground); font-size: 0.875rem;" disabled>
                </div>
            </div>
            <div id="shareLinkExpiryInfo" style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);"></div>
            <div id="shareLinkStatus" class="share-status"></div>
            <div class="modal-actions">
                <button id="regenerateLinkBtn" class="btn btn-secondary">Regenerate</button>
                <button id="shareCloseBtn" class="btn btn-secondary">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('copyLinkBtn').addEventListener('click', copyShortLink);
    document.getElementById('regenerateLinkBtn').addEventListener('click', regenerateShortLink);
    document.getElementById('shareCloseBtn').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Expiry type radio buttons
    const expiryNever = document.getElementById('expiryNever');
    const expiryDate = document.getElementById('expiryDate');
    const expiryDateInput = document.getElementById('shareLinkExpiryDate');

    expiryNever.addEventListener('change', () => {
        expiryDateInput.disabled = true;
        updateShareLinkExpiry();
    });

    expiryDate.addEventListener('change', () => {
        expiryDateInput.disabled = false;
        if (!expiryDateInput.value) {
            // Set default to 7 days from now
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 7);
            expiryDateInput.value = defaultDate.toISOString().split('T')[0];
        }
        updateShareLinkExpiry();
    });

    expiryDateInput.addEventListener('change', updateShareLinkExpiry);

    // Set min date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expiryDateInput.min = tomorrow.toISOString().split('T')[0];

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

async function showShareModal() {
    if (!currentNote) return;

    const modal = document.getElementById('shareModal');
    const input = document.getElementById('shareLinkInput');
    const status = document.getElementById('shareLinkStatus');
    const expiryNever = document.getElementById('expiryNever');
    const expiryDateRadio = document.getElementById('expiryDate');
    const expiryDateInput = document.getElementById('shareLinkExpiryDate');
    const expiryInfo = document.getElementById('shareLinkExpiryInfo');

    modal.style.display = 'flex';
    input.value = 'Generating...';
    status.textContent = '';
    expiryInfo.textContent = '';
    expiryNever.checked = true;
    expiryDateInput.disabled = true;
    expiryDateInput.value = '';

    try {
        // Try to get existing short link first
        let response = await fetch(`${basePath}/api/notes/${currentNote.id}/shortlink`);

        if (response.status === 404) {
            // Generate new short link
            response = await fetch(`${basePath}/api/notes/${currentNote.id}/shortlink`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expires_in: 0 })
            });
        }

        if (response.ok) {
            const data = await response.json();
            const fullUrl = `${window.location.origin}${data.shortLink}`;
            input.value = fullUrl;

            // Update expiry info and UI
            if (data.expiresAt) {
                const expiryDate = new Date(data.expiresAt);
                expiryInfo.textContent = `Expires: ${expiryDate.toLocaleDateString()}`;
                expiryDateRadio.checked = true;
                expiryDateInput.disabled = false;
                expiryDateInput.value = expiryDate.toISOString().split('T')[0];
            } else {
                expiryInfo.textContent = 'This link never expires';
                expiryNever.checked = true;
                expiryDateInput.disabled = true;
            }
        } else {
            input.value = '';
            status.textContent = 'Failed to generate link';
            status.className = 'share-status error';
        }
    } catch (error) {
        console.error('Failed to get short link:', error);
        input.value = '';
        status.textContent = 'Error generating link';
        status.className = 'share-status error';
    }
}

function getExpiryDays() {
    const expiryNever = document.getElementById('expiryNever');
    const expiryDateInput = document.getElementById('shareLinkExpiryDate');

    if (expiryNever.checked) {
        return 0; // Never expires
    }

    if (expiryDateInput.value) {
        const selectedDate = new Date(expiryDateInput.value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = selectedDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(1, diffDays);
    }

    return 7; // Default 7 days
}

async function updateShareLinkExpiry() {
    if (!currentNote) return;

    const input = document.getElementById('shareLinkInput');
    if (!input.value || input.value === 'Generating...') return;

    const expiryInfo = document.getElementById('shareLinkExpiryInfo');
    const status = document.getElementById('shareLinkStatus');
    const expiresIn = getExpiryDays();

    try {
        const response = await fetch(`${basePath}/api/notes/${currentNote.id}/shortlink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expires_in: expiresIn })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.expiresAt) {
                const expiryDate = new Date(data.expiresAt);
                expiryInfo.textContent = `Expires: ${expiryDate.toLocaleDateString()}`;
            } else {
                expiryInfo.textContent = 'This link never expires';
            }
            status.textContent = 'Expiry updated!';
            status.className = 'share-status success';
            setTimeout(() => { status.textContent = ''; }, 2000);
        }
    } catch (error) {
        console.error('Failed to update expiry:', error);
        status.textContent = 'Error updating expiry';
        status.className = 'share-status error';
    }
}

async function copyShortLink() {
    const input = document.getElementById('shareLinkInput');
    const status = document.getElementById('shareLinkStatus');

    if (!input.value || input.value === 'Generating...') return;

    try {
        await navigator.clipboard.writeText(input.value);
        status.textContent = 'Copied to clipboard!';
        status.className = 'share-status success';
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    } catch (error) {
        // Fallback for older browsers
        input.select();
        document.execCommand('copy');
        status.textContent = 'Copied!';
        status.className = 'share-status success';
    }
}

async function regenerateShortLink() {
    if (!currentNote) return;

    const input = document.getElementById('shareLinkInput');
    const status = document.getElementById('shareLinkStatus');
    const expiryInfo = document.getElementById('shareLinkExpiryInfo');
    const expiresIn = getExpiryDays();

    input.value = 'Regenerating...';
    status.textContent = '';

    try {
        // Delete existing
        await fetch(`${basePath}/api/notes/${currentNote.id}/shortlink`, {
            method: 'DELETE'
        });

        // Generate new with expiry
        const response = await fetch(`${basePath}/api/notes/${currentNote.id}/shortlink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expires_in: expiresIn })
        });

        if (response.ok) {
            const data = await response.json();
            const fullUrl = `${window.location.origin}${data.shortLink}`;
            input.value = fullUrl;
            status.textContent = 'New link generated!';
            status.className = 'share-status success';

            // Update expiry info
            if (data.expiresAt) {
                const expiryDate = new Date(data.expiresAt);
                expiryInfo.textContent = `Expires: ${expiryDate.toLocaleDateString()}`;
            } else {
                expiryInfo.textContent = 'This link never expires';
            }
        }
    } catch (error) {
        console.error('Failed to regenerate link:', error);
        status.textContent = 'Error regenerating link';
        status.className = 'share-status error';
    }
}

function initRootDropZone() {
    // Make root note list a drop target for moving notes to root
    noteList.addEventListener('dragover', handleDragOver);
    noteList.addEventListener('dragenter', handleDragEnter);
    noteList.addEventListener('dragleave', handleDragLeave);
    noteList.addEventListener('drop', (e) => handleDrop(e, ''));
}

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (prefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Recreate CodeMirror editor with new theme
    reinitCodeMirror();
}

function reinitCodeMirror() {
    if (!cmEditor) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    cmEditor.setOption('theme', isDark ? 'dracula' : 'default');
}

function updateLineNumbers(enabled) {
    if (cmEditor) {
        cmEditor.setOption('lineNumbers', enabled);
    }
}

// Copy code block to clipboard
function copyCodeBlock(btn) {
    // Decode escaped HTML entities
    let code = btn.getAttribute('data-code');
    code = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

    navigator.clipboard.writeText(code).then(() => {
        // Show check icon
        const copyIcon = btn.querySelector('.copy-icon');
        const checkIcon = btn.querySelector('.check-icon');

        copyIcon.style.display = 'none';
        checkIcon.style.display = 'inline';

        // Reset after 2 seconds
        setTimeout(() => {
            copyIcon.style.display = 'inline';
            checkIcon.style.display = 'none';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Initialize marked.js with GitHub Flavored Markdown
function initMarked() {
    // Configure marked options
    marked.setOptions({
        gfm: true,
        breaks: true
    });

    // Custom renderer for code blocks with syntax highlighting
    const renderer = new marked.Renderer();

    renderer.code = function(code, language) {
        // Handle object format (newer marked versions)
        if (typeof code === 'object') {
            language = code.lang;
            code = code.text;
        }

        const validLang = language && hljs.getLanguage(language);
        let highlighted;

        try {
            if (validLang) {
                highlighted = hljs.highlight(code, { language: language }).value;
            } else {
                highlighted = hljs.highlightAuto(code).value;
            }
        } catch (e) {
            highlighted = code;
        }

        const langClass = validLang ? `language-${language}` : '';
        const langLabel = language ? `<span class="code-lang-label">${language}</span>` : '';

        // Escape code for data attribute
        const escapedCode = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const copyBtn = `<button class="code-copy-btn" onclick="copyCodeBlock(this)" data-code="${escapedCode}" title="Copy code">
            <span class="copy-icon">&#128203;</span>
            <span class="check-icon" style="display:none">&#10003;</span>
        </button>`;

        // Add line numbers (remove trailing empty line)
        let lines = highlighted.split('\n');
        if (lines.length > 1 && lines[lines.length - 1] === '') {
            lines.pop();
        }
        const lineCount = lines.length;

        const numberedLines = lines.map((line, i) => {
            const lineNum = i + 1;
            return `<span class="code-line"><span class="line-number">${lineNum}</span><span class="line-content">${line || ' '}</span></span>`;
        }).join('');

        return `<pre>${langLabel}${copyBtn}<code class="hljs ${langClass}" data-line-count="${lineCount}">${numberedLines}</code></pre>`;
    };

    marked.setOptions({ renderer: renderer });
}

// Context Menu
let sidebarContextMenu = null;
let folderContextMenu = null;
let currentFolderPath = '';

function initContextMenu() {
    // Create note context menu element
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
        <div class="context-menu-item" data-action="open">
            <span class="context-icon">&#128196;</span> <span data-i18n="context.open">Open</span>
        </div>
        <div class="context-menu-item" data-action="edit">
            <span class="context-icon">&#9998;</span> <span data-i18n="context.edit">Edit</span>
        </div>
        <div class="context-menu-item" data-action="rename">
            <span class="context-icon">&#128393;</span> <span data-i18n="context.rename">Rename</span>
        </div>
        <div class="context-menu-item" data-action="duplicate">
            <span class="context-icon">&#128203;</span> <span data-i18n="context.duplicate">Duplicate</span>
        </div>
        <div class="context-menu-item" data-action="move">
            <span class="context-icon">&#128193;</span> <span data-i18n="context.move">Move to...</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="history">
            <span class="context-icon">&#128337;</span> <span data-i18n="context.history">History</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item context-menu-danger" data-action="delete">
            <span class="context-icon">&#128465;</span> <span data-i18n="context.delete">Delete</span>
        </div>
    `;
    contextMenu.style.display = 'none';
    document.body.appendChild(contextMenu);

    // Create sidebar context menu (for empty area)
    sidebarContextMenu = document.createElement('div');
    sidebarContextMenu.className = 'context-menu';
    sidebarContextMenu.innerHTML = `
        <div class="context-menu-item" data-action="new-note">
            <span class="context-icon">&#128196;</span> <span data-i18n="context.newNote">New Note</span>
        </div>
        <div class="context-menu-item" data-action="new-folder">
            <span class="context-icon">&#128193;</span> <span data-i18n="context.newFolder">New Folder</span>
        </div>
    `;
    sidebarContextMenu.style.display = 'none';
    document.body.appendChild(sidebarContextMenu);

    // Create folder context menu
    folderContextMenu = document.createElement('div');
    folderContextMenu.className = 'context-menu';
    folderContextMenu.innerHTML = `
        <div class="context-menu-item" data-action="new-note-in-folder">
            <span class="context-icon">&#128196;</span> <span data-i18n="context.newNoteInFolder">New Note Here</span>
        </div>
        <div class="context-menu-item" data-action="new-subfolder">
            <span class="context-icon">&#128193;</span> <span data-i18n="context.newSubfolder">New Subfolder</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item context-menu-danger" data-action="delete-folder">
            <span class="context-icon">&#128465;</span> <span data-i18n="context.deleteFolder">Delete Folder</span>
        </div>
    `;
    folderContextMenu.style.display = 'none';
    document.body.appendChild(folderContextMenu);

    // Context menu item click handlers
    contextMenu.addEventListener('click', handleContextMenuAction);
    sidebarContextMenu.addEventListener('click', handleSidebarContextMenuAction);
    folderContextMenu.addEventListener('click', handleFolderContextMenuAction);

    // Sidebar right-click handler
    noteList.addEventListener('contextmenu', (e) => {
        // Only show sidebar context menu if not clicking on a note item
        if (!e.target.closest('.note-list-item') && !e.target.closest('.tree-folder-header')) {
            e.preventDefault();
            e.stopPropagation();
            showSidebarContextMenu(e);
        }
    });

    // Hide all context menus on outside click
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
        sidebarContextMenu.style.display = 'none';
        folderContextMenu.style.display = 'none';
    });

    // Hide all context menus on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            contextMenu.style.display = 'none';
            sidebarContextMenu.style.display = 'none';
            folderContextMenu.style.display = 'none';
        }
    });
}

function showContextMenu(e, noteId) {
    e.preventDefault();
    contextTarget = noteId;

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    // Position context menu
    const x = e.clientX;
    const y = e.clientY;

    contextMenu.style.display = 'block';
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;

    // Adjust if menu goes off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = `${y - rect.height}px`;
    }
}

async function handleContextMenuAction(e) {
    const action = e.target.closest('.context-menu-item')?.dataset.action;
    if (!action || !contextTarget) return;

    contextMenu.style.display = 'none';

    const note = notes.find(n => n.id === contextTarget);
    if (!note) return;

    switch (action) {
        case 'open':
            loadNote(contextTarget);
            break;

        case 'edit':
            editNote(contextTarget);
            break;

        case 'rename':
            const newTitle = prompt('Enter new title:', note.title);
            if (newTitle && newTitle !== note.title) {
                await renameNote(contextTarget, newTitle);
            }
            break;

        case 'duplicate':
            await duplicateNote(contextTarget);
            break;

        case 'move':
            const newPath = prompt('Enter new path (use / for folders):', note.title);
            if (newPath && newPath !== note.title) {
                await renameNote(contextTarget, newPath);
            }
            break;

        case 'history':
            currentNote = note;
            showHistory();
            break;

        case 'delete':
            if (confirm(`Delete "${note.title}"?`)) {
                await deleteNoteById(contextTarget);
            }
            break;
    }
}

function showSidebarContextMenu(e) {
    e.preventDefault();
    currentFolderPath = '';

    const x = e.clientX;
    const y = e.clientY;

    sidebarContextMenu.style.display = 'block';
    sidebarContextMenu.style.left = `${x}px`;
    sidebarContextMenu.style.top = `${y}px`;

    // Adjust if menu goes off screen
    const rect = sidebarContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        sidebarContextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        sidebarContextMenu.style.top = `${y - rect.height}px`;
    }

    // Update i18n
    if (typeof i18n !== 'undefined') {
        i18n.updateUI();
    }
}

function showFolderContextMenu(e, folderPath) {
    e.preventDefault();
    e.stopPropagation();
    currentFolderPath = folderPath;

    const x = e.clientX;
    const y = e.clientY;

    folderContextMenu.style.display = 'block';
    folderContextMenu.style.left = `${x}px`;
    folderContextMenu.style.top = `${y}px`;

    // Adjust if menu goes off screen
    const rect = folderContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        folderContextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        folderContextMenu.style.top = `${y - rect.height}px`;
    }

    // Update i18n
    if (typeof i18n !== 'undefined') {
        i18n.updateUI();
    }
}

async function handleSidebarContextMenuAction(e) {
    const action = e.target.closest('.context-menu-item')?.dataset.action;
    if (!action) return;

    sidebarContextMenu.style.display = 'none';

    switch (action) {
        case 'new-note':
            createNewNote();
            break;

        case 'new-folder':
            const folderName = prompt(i18n ? i18n.t('prompt.enterFolderName') : 'Enter folder name:');
            if (folderName) {
                await createFolder(folderName, '');
            }
            break;
    }
}

async function handleFolderContextMenuAction(e) {
    const action = e.target.closest('.context-menu-item')?.dataset.action;
    if (!action) return;

    folderContextMenu.style.display = 'none';

    switch (action) {
        case 'new-note-in-folder':
            // Create new note with folder path prefix
            currentNote = null;
            currentPassword = null;
            isViewMode = false; // New notes are created in edit mode
            noteTitle.value = currentFolderPath + '/';
            setEditorContent('');
            noteType.value = 'markdown';
            notePrivate.checked = false;
            currentAttachments = [];
            renderAttachments();

            showEditorPane();
            noteTitle.focus();
            break;

        case 'new-subfolder':
            const subfolderName = prompt(i18n ? i18n.t('prompt.enterFolderName') : 'Enter folder name:');
            if (subfolderName) {
                await createFolder(subfolderName, currentFolderPath);
            }
            break;

        case 'delete-folder':
            const confirmMsg = i18n ? i18n.t('confirm.deleteFolder') : 'Delete this folder? (Must be empty)';
            if (confirm(confirmMsg)) {
                await deleteFolder(currentFolderPath);
            }
            break;
    }
}

async function createFolder(name, parentPath) {
    try {
        const response = await fetch(`${basePath}/api/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, path: parentPath })
        });

        if (response.ok) {
            await loadNotes();
            const msg = i18n ? i18n.t('msg.folderCreated') : 'Folder created';
            showToast(msg);
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to create folder');
        }
    } catch (error) {
        console.error('Failed to create folder:', error);
    }
}

async function deleteFolder(path) {
    try {
        const response = await fetch(`${basePath}/api/folders/${path}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadNotes();
            const msg = i18n ? i18n.t('msg.folderDeleted') : 'Folder deleted';
            showToast(msg);
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to delete folder');
        }
    } catch (error) {
        console.error('Failed to delete folder:', error);
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

async function renameNote(id, newTitle) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    try {
        const response = await fetch(`${basePath}/api/notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: newTitle,
                content: note.content || '',
                type: note.type,
                private: note.private
            })
        });

        if (response.ok) {
            await loadNotes();
        }
    } catch (error) {
        console.error('Failed to rename note:', error);
    }
}

async function duplicateNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    // Load full note content
    try {
        const response = await fetch(`${basePath}/api/notes/${id}`);
        const fullNote = await response.json();

        const newResponse = await fetch(basePath + '/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: fullNote.title + ' (Copy)',
                content: fullNote.content || '',
                type: fullNote.type,
                private: false
            })
        });

        if (newResponse.ok) {
            await loadNotes();
        }
    } catch (error) {
        console.error('Failed to duplicate note:', error);
    }
}

// Drag and Drop
function handleDragStart(e, noteId) {
    draggedNoteId = noteId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', noteId);
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    draggedNoteId = null;
    e.target.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.tree-folder-header, .note-list');
    if (dropTarget) {
        dropTarget.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const dropTarget = e.target.closest('.tree-folder-header, .note-list');
    if (dropTarget && !dropTarget.contains(e.relatedTarget)) {
        dropTarget.classList.remove('drag-over');
    }
}

async function handleDrop(e, targetPath) {
    e.preventDefault();
    e.stopPropagation();

    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

    if (!draggedNoteId) return;

    const note = notes.find(n => n.id === draggedNoteId);
    if (!note) return;

    // Get the note's current name (without path)
    const noteName = note.title.split('/').pop();

    // Build new title with target path
    const newTitle = targetPath ? `${targetPath}/${noteName}` : noteName;

    if (newTitle !== note.title) {
        await renameNote(draggedNoteId, newTitle);
    }

    draggedNoteId = null;
}

// Full screen toggle for editor panes
let editorFullscreen = false;
let previewFullscreen = false;

function toggleEditorFullscreen() {
    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.getElementById('previewPane');
    const editorBody = document.querySelector('.editor-body');

    editorFullscreen = !editorFullscreen;

    if (editorFullscreen) {
        editorPane.classList.add('fullscreen');
        previewPane.style.display = 'none';
        editorBody.classList.add('single-pane');
    } else {
        editorPane.classList.remove('fullscreen');
        previewPane.style.display = '';
        editorBody.classList.remove('single-pane');
    }

    updateFullscreenButtons();
}

function togglePreviewFullscreen() {
    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.getElementById('previewPane');
    const editorBody = document.querySelector('.editor-body');

    previewFullscreen = !previewFullscreen;

    if (previewFullscreen) {
        previewPane.classList.add('fullscreen');
        editorPane.style.display = 'none';
        editorBody.classList.add('single-pane');
    } else {
        previewPane.classList.remove('fullscreen');
        editorPane.style.display = '';
        editorBody.classList.remove('single-pane');
    }

    updateFullscreenButtons();
}

function updateFullscreenButtons() {
    const editorBtn = document.getElementById('editorFullscreenBtn');
    const previewBtn = document.getElementById('previewFullscreenBtn');

    if (editorBtn) {
        editorBtn.innerHTML = editorFullscreen ? '&#9724;' : '&#9723;';
        editorBtn.title = editorFullscreen ? 'Exit fullscreen' : 'Fullscreen';
    }
    if (previewBtn) {
        previewBtn.innerHTML = previewFullscreen ? '&#9724;' : '&#9723;';
        previewBtn.title = previewFullscreen ? 'Exit fullscreen' : 'Fullscreen';
    }
}

function initFullscreenButtons() {
    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.getElementById('previewPane');

    // Add fullscreen button to editor pane
    const editorHeader = document.createElement('div');
    editorHeader.className = 'pane-header';
    editorHeader.innerHTML = `
        <span class="pane-title">Editor</span>
        <button id="editorFullscreenBtn" class="pane-fullscreen-btn" title="Fullscreen">&#9723;</button>
    `;
    editorPane.insertBefore(editorHeader, editorPane.firstChild);

    // Add fullscreen button to preview pane
    const previewHeader = document.createElement('div');
    previewHeader.className = 'pane-header';
    previewHeader.innerHTML = `
        <span class="pane-title">Preview</span>
        <button id="previewFullscreenBtn" class="pane-fullscreen-btn" title="Fullscreen">&#9723;</button>
    `;
    previewPane.insertBefore(previewHeader, previewPane.firstChild);

    // Add event listeners
    document.getElementById('editorFullscreenBtn').addEventListener('click', toggleEditorFullscreen);
    document.getElementById('previewFullscreenBtn').addEventListener('click', togglePreviewFullscreen);

    // ESC key to exit fullscreen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (editorFullscreen) toggleEditorFullscreen();
            if (previewFullscreen) togglePreviewFullscreen();
        }
    });
}

// Auto-save functions
function isContentChanged() {
    return noteTitle.value !== originalContent.title ||
           getEditorContent() !== originalContent.content ||
           noteType.value !== originalContent.type ||
           notePrivate.checked !== originalContent.private;
}

function triggerAutoSave() {
    if (!currentNote && !noteTitle.value.trim()) return;

    // Check if content actually changed
    if (!isContentChanged()) {
        hasUnsavedChanges = false;
        updateSaveStatus('');
        return;
    }

    hasUnsavedChanges = true;
    updateSaveStatus('unsaved');

    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }

    autoSaveTimer = setTimeout(async () => {
        await performAutoSave();
    }, AUTO_SAVE_DELAY);
}

async function performAutoSave() {
    if (!hasUnsavedChanges) return;

    const title = noteTitle.value.trim();
    if (!title) return;

    // Double-check if content actually changed
    if (!isContentChanged()) {
        hasUnsavedChanges = false;
        updateSaveStatus('');
        return;
    }

    updateSaveStatus('saving');

    try {
        const noteData = {
            title: title,
            content: getEditorContent(),
            type: noteType.value,
            private: notePrivate.checked
        };

        let response;
        if (currentNote) {
            response = await fetch(`${basePath}/api/notes/${currentNote.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(noteData)
            });
        } else {
            response = await fetch(basePath + '/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(noteData)
            });
        }

        if (response.ok) {
            const savedNote = await response.json();
            if (!currentNote) {
                currentNote = savedNote;
            }
            // Update original content after successful save
            originalContent = {
                title: noteTitle.value,
                content: getEditorContent(),
                type: noteType.value,
                private: notePrivate.checked
            };
            hasUnsavedChanges = false;
            updateSaveStatus('saved');
            await loadNotes();
        } else {
            updateSaveStatus('error');
        }
    } catch (error) {
        console.error('Auto-save failed:', error);
        updateSaveStatus('error');
    }
}

function updateSaveStatus(status) {
    const statusEl = document.getElementById('saveStatus');
    if (!statusEl) return;

    switch (status) {
        case 'saving':
            statusEl.innerHTML = '<span class="status-saving">Saving...</span>';
            break;
        case 'saved':
            statusEl.innerHTML = '<span class="status-saved">Saved</span>';
            setTimeout(() => {
                if (statusEl.querySelector('.status-saved')) {
                    statusEl.innerHTML = '';
                }
            }, 2000);
            break;
        case 'unsaved':
            statusEl.innerHTML = '<span class="status-unsaved">●</span>';
            break;
        case 'error':
            statusEl.innerHTML = '<span class="status-error">Save failed</span>';
            break;
        default:
            statusEl.innerHTML = '';
    }
}

// Pretty JSON function
function prettyJson() {
    const content = getEditorContent();
    let textToFormat = content;
    let isSelection = false;

    // Check if there's a selection in CodeMirror 5
    if (cmEditor) {
        const selectedText = cmEditor.getSelection();
        if (selectedText) {
            textToFormat = selectedText;
            isSelection = true;
        }
    }

    try {
        // Try to parse and format JSON
        const parsed = JSON.parse(textToFormat);
        const formatted = JSON.stringify(parsed, null, 2);

        if (isSelection && cmEditor) {
            // Replace only the selected text
            cmEditor.replaceSelection(formatted);
        } else {
            // Replace entire content
            setEditorContent(formatted);
        }

        updatePreview();
        triggerAutoSave();
    } catch (e) {
        // Try to find and format JSON blocks in markdown
        if (!isSelection && noteType.value === 'markdown') {
            const jsonBlockRegex = /```json\n([\s\S]*?)```/g;
            let hasChanges = false;

            const newContent = content.replace(jsonBlockRegex, (match, jsonContent) => {
                try {
                    const parsed = JSON.parse(jsonContent.trim());
                    hasChanges = true;
                    return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
                } catch {
                    return match;
                }
            });

            if (hasChanges) {
                setEditorContent(newContent);
                updatePreview();
                triggerAutoSave();
                return;
            }
        }

        alert('Invalid JSON: ' + e.message);
    }
}

async function deleteNoteById(id) {
    try {
        const response = await fetch(`${basePath}/api/notes/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            if (currentNote && currentNote.id === id) {
                currentNote = null;
                hideEditor();
            }
            await loadNotes();
        }
    } catch (error) {
        console.error('Failed to delete note:', error);
    }
}

function setupEventListeners() {
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);

    // New note
    newNoteBtn.addEventListener('click', createNewNote);

    // Search
    searchInput.addEventListener('input', filterNotes);

    // Save
    saveBtn.addEventListener('click', saveNote);

    // Delete
    deleteBtn.addEventListener('click', deleteNote);

    // History
    historyBtn.addEventListener('click', showHistory);

    // Pretty JSON
    prettyJsonBtn.addEventListener('click', prettyJson);

    // Note: Content change is now handled by CodeMirror's updateListener

    // Title change - trigger auto-save
    noteTitle.addEventListener('input', triggerAutoSave);

    // Type change - toggle preview and trigger auto-save
    noteType.addEventListener('change', () => {
        updatePreview();
        togglePreview();
        triggerAutoSave();
    });

    // Private toggle
    notePrivate.addEventListener('change', handlePrivateToggle);

    // Password modal
    passwordSubmit.addEventListener('click', verifyPassword);
    passwordCancel.addEventListener('click', () => {
        passwordModal.style.display = 'none';
        passwordInput.value = '';
    });
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verifyPassword();
    });

    // Set password modal
    setPasswordSubmit.addEventListener('click', setPassword);
    setPasswordCancel.addEventListener('click', () => {
        setPasswordModal.style.display = 'none';
        setPasswordInput.value = '';
        confirmPasswordInput.value = '';
        notePrivate.checked = false;
    });

    // History modal
    historyClose.addEventListener('click', () => {
        historyModal.style.display = 'none';
    });

    // Version modal
    versionClose.addEventListener('click', () => {
        versionModal.style.display = 'none';
    });
    versionRestore.addEventListener('click', restoreVersion);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveNote();
        }
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
}

// Image Paste Handler
async function handleImagePaste(e) {
    // Only handle in markdown mode
    if (noteType.value !== 'markdown') return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();

            const file = item.getAsFile();
            if (!file) continue;

            await uploadAndInsertImage(file);
            break;
        }
    }
}

async function uploadAndInsertImage(file) {
    // Show uploading indicator
    const placeholder = `![Uploading image...]()`;
    insertAtCursor(placeholder);
    updatePreview();

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(basePath + '/api/images', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            const imageMarkdown = `![image](${data.url})`;

            // Replace placeholder with actual image
            replaceInEditor(placeholder, imageMarkdown);
            updatePreview();
            triggerAutoSave();
        } else {
            // Remove placeholder on error
            replaceInEditor(placeholder, '');
            updatePreview();
            alert('Failed to upload image');
        }
    } catch (error) {
        console.error('Image upload failed:', error);
        replaceInEditor(placeholder, '');
        updatePreview();
        alert('Failed to upload image');
    }
}

// File Upload Handler
function initFileUpload() {
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');

    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            await uploadAndAttachFile(file);
        }

        // Reset file input
        fileInput.value = '';
    });

    // Initialize attachments section toggle
    initAttachmentsSection();

    // Initialize drag and drop
    initDragAndDrop();
}

// Drag and Drop File Upload
function initDragAndDrop() {
    const editorElement = document.getElementById('editor');
    const dropOverlay = createDropOverlay();

    if (!editorElement) return;

    // Prevent default drag behaviors on the whole document
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Track drag enter/leave for the editor
    let dragCounter = 0;

    editorElement.addEventListener('dragenter', (e) => {
        preventDefaults(e);
        dragCounter++;
        if (dragCounter === 1) {
            showDropOverlay(editorElement, dropOverlay);
        }
    });

    editorElement.addEventListener('dragleave', (e) => {
        preventDefaults(e);
        dragCounter--;
        if (dragCounter === 0) {
            hideDropOverlay(dropOverlay);
        }
    });

    editorElement.addEventListener('dragover', (e) => {
        preventDefaults(e);
    });

    editorElement.addEventListener('drop', async (e) => {
        preventDefaults(e);
        dragCounter = 0;
        hideDropOverlay(dropOverlay);

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            await uploadAndAttachFile(file);
        }
    });
}

function createDropOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'drop-overlay';
    overlay.innerHTML = `
        <div class="drop-overlay-content">
            <span class="drop-overlay-icon">&#128206;</span>
            <span class="drop-overlay-text">Drop files here to attach</span>
        </div>
    `;
    return overlay;
}

function showDropOverlay(parent, overlay) {
    if (!overlay.parentNode) {
        parent.style.position = 'relative';
        parent.appendChild(overlay);
    }
    overlay.classList.add('visible');
}

function hideDropOverlay(overlay) {
    overlay.classList.remove('visible');
}

async function uploadAndAttachFile(file) {
    const isImage = file.type.startsWith('image/');
    const fileName = file.name;
    const fileSize = file.size;

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(basePath + '/api/files', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();

            // Add to attachments list
            const attachment = {
                name: fileName,
                url: data.url,
                size: fileSize,
                type: file.type,
                isImage: isImage
            };

            currentAttachments.push(attachment);
            renderAttachments();
            triggerAutoSave();

            // For images, also insert into content
            if (isImage) {
                insertAttachmentToContent(attachment);
            }
        } else {
            alert('Failed to upload file');
        }
    } catch (error) {
        console.error('File upload failed:', error);
        alert('Failed to upload file');
    }
}

// Legacy function for backward compatibility (drag & drop images)
async function uploadAndInsertFile(file) {
    const isImage = file.type.startsWith('image/');
    const fileName = file.name;
    const placeholder = isImage
        ? `![Uploading ${fileName}...]()`
        : `[Uploading ${fileName}...]()`;

    insertAtCursor(placeholder);
    updatePreview();

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(basePath + '/api/files', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            const markdown = isImage
                ? `![${fileName}](${data.url})`
                : `[${fileName}](${data.url})`;

            replaceInEditor(placeholder, markdown);

            // Also add to attachments
            currentAttachments.push({
                name: fileName,
                url: data.url,
                size: file.size,
                type: file.type,
                isImage: isImage
            });
            renderAttachments();

            updatePreview();
            triggerAutoSave();
        } else {
            replaceInEditor(placeholder, '');
            updatePreview();
            alert('Failed to upload file');
        }
    } catch (error) {
        console.error('File upload failed:', error);
        replaceInEditor(placeholder, '');
        updatePreview();
        alert('Failed to upload file');
    }
}

// ============================================
// Attachments Section
// ============================================

function initAttachmentsSection() {
    const attachmentsHeader = document.querySelector('.attachments-header');
    const attachmentsSection = document.getElementById('attachmentsSection');
    const attachmentsToggle = document.getElementById('attachmentsToggle');

    if (attachmentsHeader) {
        attachmentsHeader.addEventListener('click', () => {
            attachmentsSection.classList.toggle('collapsed');
        });
    }
}

function renderAttachments() {
    const attachmentsSection = document.getElementById('attachmentsSection');
    const attachmentsList = document.getElementById('attachmentsList');
    const attachmentsCount = document.getElementById('attachmentsCount');

    if (!attachmentsSection || !attachmentsList) return;

    if (currentAttachments.length === 0) {
        attachmentsSection.style.display = 'none';
        return;
    }

    attachmentsSection.style.display = 'block';
    attachmentsCount.textContent = currentAttachments.length;

    attachmentsList.innerHTML = currentAttachments.map((att, index) => `
        <div class="attachment-item" data-index="${index}">
            <span class="attachment-icon ${getFileTypeClass(att.type)}">${getFileIcon(att.type)}</span>
            <div class="attachment-info">
                <span class="attachment-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
                <span class="attachment-size">${formatFileSize(att.size)}</span>
            </div>
            <div class="attachment-actions">
                <button class="attachment-btn" title="Insert into content" onclick="insertAttachmentToContent(currentAttachments[${index}])">
                    &#8629;
                </button>
                <a href="${att.url}" download="${escapeHtml(att.name)}" class="attachment-btn" title="Download">
                    &#8681;
                </a>
                <button class="attachment-btn btn-danger" title="Remove" onclick="removeAttachment(${index})">
                    &#10005;
                </button>
            </div>
        </div>
    `).join('');
}

function insertAttachmentToContent(attachment) {
    const markdown = attachment.isImage
        ? `![${attachment.name}](${attachment.url})`
        : `[${attachment.name}](${attachment.url})`;

    insertAtCursor(markdown);
    updatePreview();
    triggerAutoSave();
}

function removeAttachment(index) {
    if (confirm('Remove this attachment?')) {
        currentAttachments.splice(index, 1);
        renderAttachments();
        triggerAutoSave();
    }
}

function getFileIcon(mimeType) {
    if (!mimeType) return '&#128196;'; // Default file

    if (mimeType.startsWith('image/')) return '&#128444;'; // Image
    if (mimeType === 'application/pdf') return '&#128195;'; // PDF
    if (mimeType.includes('word') || mimeType.includes('document')) return '&#128196;'; // Doc
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '&#128202;'; // Spreadsheet
    if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return '&#128230;'; // Archive
    if (mimeType.includes('video')) return '&#127909;'; // Video
    if (mimeType.includes('audio')) return '&#127925;'; // Audio
    if (mimeType.includes('text') || mimeType.includes('javascript') || mimeType.includes('json')) return '&#128221;'; // Code

    return '&#128196;'; // Default file
}

function getFileTypeClass(mimeType) {
    if (!mimeType) return 'default';

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'spreadsheet';
    if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return 'archive';
    if (mimeType.includes('video')) return 'video';
    if (mimeType.includes('audio')) return 'audio';
    if (mimeType.includes('text') || mimeType.includes('javascript') || mimeType.includes('json')) return 'code';

    return 'default';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + ' ' + units[i];
}

function parseAttachmentsFromContent(content) {
    // Parse existing attachments from markdown links/images
    const attachments = [];
    const regex = /!?\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const isImage = match[0].startsWith('!');
        const name = match[1];
        const url = match[2];

        // Only include uploaded files (from /files/ or /images/ paths)
        const filesPath = basePath + '/files/';
        const imagesPath = basePath + '/images/';
        if (url.startsWith(filesPath) || url.startsWith(imagesPath) ||
            url.startsWith('/files/') || url.startsWith('/images/')) {
            attachments.push({
                name: name,
                url: url,
                size: 0, // Unknown for existing files
                type: isImage ? 'image/*' : 'application/octet-stream',
                isImage: isImage
            });
        }
    }

    return attachments;
}

function loadAttachmentsFromNote(note) {
    // Load attachments from note metadata or parse from content
    if (note.attachments && Array.isArray(note.attachments)) {
        currentAttachments = [...note.attachments];
    } else {
        // Parse from content for backward compatibility
        currentAttachments = parseAttachmentsFromContent(note.content || '');
    }
    renderAttachments();
}

// API Functions
async function loadNotes() {
    try {
        // Fetch notes and folders in parallel
        const [notesResponse, foldersResponse] = await Promise.all([
            fetch(basePath + '/api/notes'),
            fetch(basePath + '/api/folders')
        ]);

        notes = await notesResponse.json();
        if (!notes) notes = [];

        folders = await foldersResponse.json();
        if (!folders) folders = [];

        renderNoteTree();
        updateCalendarIfVisible();
    } catch (error) {
        console.error('Failed to load notes:', error);
        notes = [];
        folders = [];
        renderNoteTree();
        updateCalendarIfVisible();
    }
}

async function loadNote(id) {
    try {
        const headers = {};
        if (currentPassword) {
            headers['X-Note-Password'] = currentPassword;
        }

        const response = await fetch(`${basePath}/api/notes/${id}`, { headers });
        const note = await response.json();

        if (note.locked) {
            pendingNoteId = id;
            passwordModal.style.display = 'flex';
            passwordInput.focus();
            return;
        }

        if (response.status === 401) {
            alert('Invalid password');
            return;
        }

        currentNote = note;
        showPreviewOnly(note);
        updateNoteListSelection(id);
    } catch (error) {
        console.error('Failed to load note:', error);
    }
}

// Edit note - loads note in edit mode instead of preview mode
async function editNote(id) {
    try {
        const headers = {};
        if (currentPassword) {
            headers['X-Note-Password'] = currentPassword;
        }

        const response = await fetch(`${basePath}/api/notes/${id}`, { headers });
        const note = await response.json();

        if (note.locked) {
            pendingNoteId = id;
            passwordModal.style.display = 'flex';
            passwordInput.focus();
            return;
        }

        if (response.status === 401) {
            alert('Invalid password');
            return;
        }

        currentNote = note;
        showEditor(note);
        updateNoteListSelection(id);
    } catch (error) {
        console.error('Failed to load note:', error);
    }
}

function updateNoteListSelection(noteId) {
    // Remove active and editing class from all items
    document.querySelectorAll('.note-list-item.active').forEach(item => {
        item.classList.remove('active');
        item.classList.remove('editing');
    });
    // Add active class to selected item
    const selectedItem = document.querySelector(`.note-list-item[data-note-id="${noteId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('active');
        if (!isViewMode) {
            selectedItem.classList.add('editing');
        }
    }
}

let pendingNoteId = null;

async function verifyPassword() {
    const password = passwordInput.value;
    if (!password) return;

    try {
        const response = await fetch(basePath + '/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                note_id: pendingNoteId,
                password: password
            })
        });

        const result = await response.json();

        if (result.valid) {
            currentPassword = password;
            passwordModal.style.display = 'none';
            passwordInput.value = '';
            loadNote(pendingNoteId);
        } else {
            alert('Invalid password');
        }
    } catch (error) {
        console.error('Failed to verify password:', error);
    }
}

async function saveNote() {
    const title = noteTitle.value.trim();
    const content = getEditorContent();
    const type = noteType.value;
    const isPrivate = notePrivate.checked;

    if (!title) {
        alert(i18n.t('msg.enterTitle'));
        return;
    }

    // Check if content actually changed (skip if setting new password)
    if (!pendingPassword && !isContentChanged()) {
        updateSaveStatus('saved');
        setTimeout(() => updateSaveStatus(''), 1000);
        return;
    }

    const headers = {
        'Content-Type': 'application/json'
    };
    if (currentPassword) {
        headers['X-Note-Password'] = currentPassword;
    }

    const data = {
        title,
        content,
        type,
        private: isPrivate,
        attachments: currentAttachments
    };

    if (pendingPassword) {
        data.password = pendingPassword;
        pendingPassword = null;
    }

    try {
        let response;
        if (currentNote && currentNote.id) {
            response = await fetch(`${basePath}/api/notes/${currentNote.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(data)
            });
        } else {
            response = await fetch(basePath + '/api/notes', {
                method: 'POST',
                headers,
                body: JSON.stringify(data)
            });
        }

        if (response.ok) {
            const savedNote = await response.json();
            currentNote = savedNote;
            // Update original content after successful save
            originalContent = {
                title: noteTitle.value,
                content: getEditorContent(),
                type: noteType.value,
                private: notePrivate.checked
            };
            hasUnsavedChanges = false;
            updateSaveStatus('saved');
            await loadNotes();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to save note');
        }
    } catch (error) {
        console.error('Failed to save note:', error);
    }
}

async function deleteNote() {
    if (!currentNote || !currentNote.id) return;

    if (!confirm(i18n.t('msg.confirmDelete'))) return;

    const headers = {};
    if (currentPassword) {
        headers['X-Note-Password'] = currentPassword;
    }

    try {
        const response = await fetch(`${basePath}/api/notes/${currentNote.id}`, {
            method: 'DELETE',
            headers
        });

        if (response.ok) {
            currentNote = null;
            currentPassword = null;
            hideEditor();
            await loadNotes();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to delete note');
        }
    } catch (error) {
        console.error('Failed to delete note:', error);
    }
}

async function showHistory() {
    if (!currentNote || !currentNote.id) return;

    const headers = {};
    if (currentPassword) {
        headers['X-Note-Password'] = currentPassword;
    }

    try {
        const response = await fetch(`${basePath}/api/notes/${currentNote.id}/history`, { headers });
        const data = await response.json();

        if (!response.ok) {
            console.error('History API error:', data.error);
            historyList.innerHTML = `<p style="padding: 20px; color: var(--text-secondary);">${data.error || 'Failed to load history'}</p>`;
            historyModal.style.display = 'flex';
            return;
        }

        const commits = Array.isArray(data) ? data : [];
        historyList.innerHTML = '';

        if (commits.length === 0) {
            historyList.innerHTML = '<p style="padding: 20px; color: var(--text-secondary);">No history available</p>';
        } else {
            commits.forEach(commit => {
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `
                    <div class="commit-hash">${commit.hash.substring(0, 8)}</div>
                    <div class="commit-message">${escapeHtml(commit.message)}</div>
                    <div class="commit-date">${formatDate(commit.date)}</div>
                `;
                item.addEventListener('click', () => showVersion(commit.hash));
                historyList.appendChild(item);
            });
        }

        historyModal.style.display = 'flex';
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

let currentVersionHash = null;

async function showVersion(hash) {
    if (!currentNote || !currentNote.id) return;

    const headers = {};
    if (currentPassword) {
        headers['X-Note-Password'] = currentPassword;
    }

    try {
        const response = await fetch(`${basePath}/api/notes/${currentNote.id}/version/${hash}`, { headers });
        const data = await response.json();

        currentVersionHash = hash;
        versionHash.textContent = hash.substring(0, 8);
        versionContent.textContent = data.content;

        historyModal.style.display = 'none';
        versionModal.style.display = 'flex';
    } catch (error) {
        console.error('Failed to load version:', error);
    }
}

function restoreVersion() {
    const content = versionContent.textContent;
    setEditorContent(content);
    updatePreview();
    versionModal.style.display = 'none';
    triggerAutoSave();
}

// Tree Structure Functions
function buildNoteTree(notesList) {
    const tree = {};
    const searchTerm = searchInput.value.toLowerCase();

    // First, add actual folders from API
    folders.forEach(folder => {
        if (searchTerm && !folder.name.toLowerCase().includes(searchTerm)) {
            return; // Skip if doesn't match search
        }

        const parts = folder.path.split('/').map(p => p.trim()).filter(p => p);
        let current = tree;

        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = {
                    _children: {},
                    _notes: [],
                    _isRealFolder: true
                };
            }
            if (index < parts.length - 1) {
                current = current[part]._children;
            }
        });
    });

    // Filter notes
    const filteredNotes = notesList.filter(note =>
        note.title.toLowerCase().includes(searchTerm)
    );

    filteredNotes.forEach(note => {
        const parts = note.title.split('/').map(p => p.trim()).filter(p => p);
        let current = tree;

        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = {
                    _children: {},
                    _notes: []
                };
            }

            if (index === parts.length - 1) {
                // This is a note
                current[part]._notes.push(note);
            } else {
                // This is a folder
                current = current[part]._children;
            }
        });
    });

    return tree;
}

function renderNoteTree() {
    noteList.innerHTML = '';
    const tree = buildNoteTree(notes);
    renderTreeLevel(tree, noteList, 0, '');
}

function renderTreeLevel(tree, container, level, path) {
    const entries = Object.entries(tree).sort((a, b) => {
        // Folders first, then notes
        const aHasChildren = Object.keys(a[1]._children).length > 0;
        const bHasChildren = Object.keys(b[1]._children).length > 0;
        if (aHasChildren && !bHasChildren) return -1;
        if (!aHasChildren && bHasChildren) return 1;
        return a[0].localeCompare(b[0]);
    });

    entries.forEach(([name, data]) => {
        const hasChildren = Object.keys(data._children).length > 0;
        const hasNotes = data._notes.length > 0;
        const isRealFolder = data._isRealFolder === true;
        const currentPath = path ? `${path}/${name}` : name;
        const isExpanded = expandedFolders[currentPath] !== false;

        // Show as folder if: has children, has multiple notes, or is a real folder from API
        if (hasChildren || (hasNotes && data._notes.length > 1) || isRealFolder) {
            // Render as folder
            const folder = document.createElement('li');
            folder.className = 'tree-folder';

            const folderHeader = document.createElement('div');
            folderHeader.className = `tree-folder-header ${isExpanded ? 'expanded' : ''}`;
            folderHeader.style.paddingLeft = `${12 + level * 16}px`;
            folderHeader.innerHTML = `
                <span class="tree-toggle">${isExpanded ? '&#9660;' : '&#9654;'}</span>
                <span class="tree-folder-icon">&#128193;</span>
                <span class="tree-folder-name">${escapeHtml(name)}</span>
                <span class="tree-count">${countNotesInTree(data)}</span>
            `;

            folderHeader.addEventListener('click', () => {
                const newExpanded = !expandedFolders[currentPath];
                expandedFolders[currentPath] = newExpanded;
                localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
                renderNoteTree();
            });

            // Right-click context menu for folder
            folderHeader.addEventListener('contextmenu', (e) => {
                showFolderContextMenu(e, currentPath);
            });

            // Drag and drop - folder as drop target
            folderHeader.addEventListener('dragover', handleDragOver);
            folderHeader.addEventListener('dragenter', handleDragEnter);
            folderHeader.addEventListener('dragleave', handleDragLeave);
            folderHeader.addEventListener('drop', (e) => handleDrop(e, currentPath));

            folder.appendChild(folderHeader);

            if (isExpanded) {
                const folderContent = document.createElement('ul');
                folderContent.className = 'tree-folder-content';

                // Render children folders
                renderTreeLevel(data._children, folderContent, level + 1, currentPath);

                // Render notes in this folder
                data._notes.forEach(note => {
                    renderNoteItem(note, folderContent, level + 1, true);
                });

                folder.appendChild(folderContent);
            }

            container.appendChild(folder);
        } else if (hasNotes) {
            // Render single note directly
            renderNoteItem(data._notes[0], container, level, false);
        }
    });
}

function renderNoteItem(note, container, level, isChild) {
    const li = document.createElement('li');
    li.className = 'note-list-item';
    li.draggable = true;
    li.dataset.noteId = note.id;

    if (currentNote && currentNote.id === note.id) {
        li.classList.add('active');
        if (!isViewMode) {
            li.classList.add('editing');
        }
    }

    const displayName = isChild ? note.title.split('/').pop() : note.title;
    const lockIcon = note.private ? '<span class="lock-icon">&#128274;</span>' : '';
    const typeIcon = note.type === 'markdown' ? '&#128196;' : (note.type === 'asciidoc' ? '&#128221;' : '&#128195;');
    const typeLabel = note.type === 'markdown' ? 'MD' : (note.type === 'asciidoc' ? 'ADOC' : 'TXT');
    const editBtnTitle = (typeof i18n !== 'undefined') ? i18n.t('btn.edit') : 'Edit';

    li.style.paddingLeft = `${12 + level * 16}px`;
    li.innerHTML = `
        <span class="drag-handle">&#8942;&#8942;</span>
        <span class="tree-note-icon">${typeIcon}</span>
        <div class="note-info">
            <div class="note-title">${escapeHtml(displayName)} ${lockIcon}</div>
            <div class="note-meta"><span class="note-type-badge">${typeLabel}</span> ${formatDate(note.modified)}</div>
        </div>
        <button class="note-edit-btn" title="${editBtnTitle}" data-note-id="${note.id}">&#9998;</button>
    `;

    // Click on note item to view (preview only)
    li.addEventListener('click', (e) => {
        // Don't trigger if clicking on edit button
        if (e.target.closest('.note-edit-btn')) return;
        e.stopPropagation();
        currentPassword = null;
        loadNote(note.id);
    });

    // Click on edit button to switch to edit mode
    const editBtn = li.querySelector('.note-edit-btn');
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentPassword = null;
        editNote(note.id);
    });

    // Right-click context menu
    li.addEventListener('contextmenu', (e) => {
        e.stopPropagation();
        showContextMenu(e, note.id);
    });

    // Drag events
    li.addEventListener('dragstart', (e) => handleDragStart(e, note.id));
    li.addEventListener('dragend', handleDragEnd);

    container.appendChild(li);
}

function countNotesInTree(data) {
    let count = data._notes.length;
    Object.values(data._children).forEach(child => {
        count += countNotesInTree(child);
    });
    return count;
}

function filterNotes() {
    renderNoteTree();
}

function createNewNote() {
    currentNote = null;
    currentPassword = null;
    isViewMode = false; // New notes are created in edit mode

    // If there's a search term that looks like a path, use it as prefix
    const searchTerm = searchInput.value.trim();
    if (searchTerm.includes('/')) {
        noteTitle.value = searchTerm.endsWith('/') ? searchTerm : searchTerm + '/';
    } else {
        noteTitle.value = '';
    }

    setEditorContent('');
    noteType.value = 'markdown';
    notePrivate.checked = false;
    previewContent.innerHTML = '';

    // Clear attachments for new note
    currentAttachments = [];
    renderAttachments();

    // Reset original content for new note
    originalContent = {
        title: '',
        content: '',
        type: 'markdown',
        private: false
    };
    hasUnsavedChanges = false;
    updateSaveStatus('');

    showEditorPane();
    noteTitle.focus();
}

// Show note in preview-only mode (view mode)
function showPreviewOnly(note) {
    isViewMode = true;
    noteTitle.value = note.title || '';
    setEditorContent(note.content || '');
    noteType.value = note.type || 'markdown';
    notePrivate.checked = note.private || false;

    // Load attachments from note
    loadAttachmentsFromNote(note);

    // Track original content
    originalContent = {
        title: note.title || '',
        content: note.content || '',
        type: note.type || 'markdown',
        private: note.private || false
    };

    hasUnsavedChanges = false;
    updateSaveStatus('');
    updatePreview();
    showPreviewPane();
}

// Switch to edit mode for current note
function showEditMode() {
    if (!currentNote) return;
    isViewMode = false;
    showEditorPane();
    if (cmEditor) {
        setTimeout(() => cmEditor.refresh(), 0);
        cmEditor.focus();
    }
    updateNoteListSelection(currentNote.id);
}

function showEditor(note) {
    isViewMode = false;
    noteTitle.value = note.title || '';
    setEditorContent(note.content || '');
    noteType.value = note.type || 'markdown';
    notePrivate.checked = note.private || false;

    // Load attachments from note
    loadAttachmentsFromNote(note);

    // Track original content
    originalContent = {
        title: note.title || '',
        content: note.content || '',
        type: note.type || 'markdown',
        private: note.private || false
    };

    hasUnsavedChanges = false;
    updateSaveStatus('');
    updatePreview();
    showEditorPane();
}

function showEditorPane() {
    emptyState.style.display = 'none';
    editor.style.display = 'flex';

    const editorBody = document.querySelector('.editor-body');
    const editorPane = document.querySelector('.editor-pane');

    editorBody.classList.remove('view-mode');

    // Show editor pane (may have been hidden in view mode)
    editorPane.style.display = 'flex';

    togglePreview();

    // Refresh CodeMirror after editor becomes visible to fix gutter width
    if (cmEditor) {
        setTimeout(() => cmEditor.refresh(), 0);
    }
}

// Show preview only (view mode - hide editor pane)
function showPreviewPane() {
    emptyState.style.display = 'none';
    editor.style.display = 'flex';

    const splitter = document.getElementById('editorSplitter');
    const editorBody = document.querySelector('.editor-body');
    const editorPane = document.querySelector('.editor-pane');

    // Add view-mode class to hide editor pane
    editorBody.classList.add('view-mode');
    editorBody.classList.remove('txt-mode');

    // Hide editor pane and splitter
    editorPane.style.display = 'none';
    if (splitter) splitter.style.display = 'none';

    // Show preview pane at full width
    previewPane.style.display = 'flex';
    previewPane.style.flex = '1 1 100%';
}

function hideEditor() {
    emptyState.style.display = 'flex';
    editor.style.display = 'none';
}

function togglePreview() {
    const splitter = document.getElementById('editorSplitter');
    const editorBody = document.querySelector('.editor-body');
    const editorPane = document.querySelector('.editor-pane');

    if (noteType.value === 'markdown' || noteType.value === 'asciidoc') {
        previewPane.style.display = 'flex';
        if (splitter) splitter.style.display = 'flex';
        editorBody.classList.remove('txt-mode');
        // Restore saved split ratio
        const savedRatio = localStorage.getItem('editorSplitRatio');
        if (savedRatio) {
            const ratio = parseFloat(savedRatio);
            editorPane.style.flex = `0 0 ${ratio}%`;
            previewPane.style.flex = `0 0 ${100 - ratio}%`;
        } else {
            editorPane.style.flex = '1';
            previewPane.style.flex = '1';
        }
    } else {
        // TXT mode - hide preview and splitter, expand editor to full width
        previewPane.style.display = 'none';
        if (splitter) splitter.style.display = 'none';
        editorBody.classList.add('txt-mode');
        // Reset editor flex to take full width
        editorPane.style.flex = '1 1 100%';
    }
}

// AsciiDoctor instance (lazy initialized)
let asciidoctor = null;

function getAsciidoctor() {
    if (asciidoctor === null) {
        // Try different ways to access Asciidoctor
        try {
            // Method 1: Global Asciidoctor function (set by our inline script)
            if (typeof Asciidoctor !== 'undefined') {
                if (typeof Asciidoctor === 'function') {
                    asciidoctor = Asciidoctor();
                } else {
                    asciidoctor = Asciidoctor;
                }
                console.log('AsciiDoctor initialized via Asciidoctor global');
            }
            // Method 2: Direct Opal.Asciidoctor access
            else if (typeof Opal !== 'undefined' && Opal.Asciidoctor) {
                // Opal.Asciidoctor has a convert method directly
                asciidoctor = Opal.Asciidoctor;
                console.log('AsciiDoctor initialized via Opal.Asciidoctor');
            }

            // Verify asciidoctor has convert method
            if (asciidoctor && typeof asciidoctor.convert !== 'function') {
                // Try to get a proper instance
                if (typeof asciidoctor.$new === 'function') {
                    asciidoctor = asciidoctor.$new();
                } else if (typeof asciidoctor.create === 'function') {
                    asciidoctor = asciidoctor.create();
                }
            }
        } catch (e) {
            console.error('Error initializing Asciidoctor:', e);
            asciidoctor = undefined;
        }

        if (!asciidoctor) {
            console.warn('AsciiDoctor library not available');
        }
    }
    return asciidoctor;
}

function updatePreview() {
    const type = noteType.value;
    const content = getEditorContent();

    if (type === 'markdown') {
        previewContent.innerHTML = marked.parse(content);
    } else if (type === 'asciidoc') {
        const adoc = getAsciidoctor();
        if (adoc) {
            try {
                previewContent.innerHTML = adoc.convert(content, {
                    safe: 'safe',
                    attributes: {
                        'showtitle': true,
                        'icons': 'font'
                    }
                });
                // Apply syntax highlighting to code blocks
                // AsciiDoctor generates: <pre class="highlight"><code class="language-xxx" data-lang="xxx">
                previewContent.querySelectorAll('pre code, pre.highlight code, .listingblock pre code').forEach((block) => {
                    if (typeof hljs !== 'undefined') {
                        // Get language from data-lang or class
                        const lang = block.getAttribute('data-lang') ||
                                     (block.className.match(/language-(\w+)/) || [])[1];
                        if (lang && hljs.getLanguage(lang)) {
                            block.classList.add('hljs');
                            block.innerHTML = hljs.highlight(block.textContent, { language: lang }).value;
                        } else {
                            hljs.highlightElement(block);
                        }
                    }
                });
            } catch (e) {
                console.error('AsciiDoc rendering error:', e);
                previewContent.innerHTML = '<pre>' + escapeHtml(content) + '</pre>';
            }
        } else {
            // AsciiDoctor not available, show plain text
            previewContent.innerHTML = '<pre>' + escapeHtml(content) + '</pre>';
            console.warn('AsciiDoctor library not loaded');
        }
    }
}

let pendingPassword = null;

function handlePrivateToggle() {
    if (notePrivate.checked) {
        setPasswordModal.style.display = 'flex';
        setPasswordInput.focus();
    } else {
        pendingPassword = '';
    }
}

function setPassword() {
    const password = setPasswordInput.value;
    const confirm = confirmPasswordInput.value;

    if (!password) {
        alert('Please enter a password');
        return;
    }

    if (password !== confirm) {
        alert('Passwords do not match');
        return;
    }

    pendingPassword = password;
    setPasswordModal.style.display = 'none';
    setPasswordInput.value = '';
    confirmPasswordInput.value = '';
}

// Utility Functions
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Splitter functionality
function initSplitter() {
    const splitter = document.getElementById('editorSplitter');
    const editorBody = document.querySelector('.editor-body');
    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.getElementById('previewPane');

    if (!splitter || !editorBody || !editorPane || !previewPane) return;

    let isResizing = false;
    let startX = 0;
    let startEditorWidth = 0;

    // Load saved ratio from localStorage
    const savedRatio = localStorage.getItem('editorSplitRatio');
    if (savedRatio) {
        const ratio = parseFloat(savedRatio);
        editorPane.style.flex = `0 0 ${ratio}%`;
        previewPane.style.flex = `0 0 ${100 - ratio}%`;
    }

    splitter.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startEditorWidth = editorPane.getBoundingClientRect().width;

        splitter.classList.add('dragging');
        editorBody.classList.add('resizing');

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const containerWidth = editorBody.getBoundingClientRect().width - splitter.getBoundingClientRect().width;
        const deltaX = e.clientX - startX;
        let newEditorWidth = startEditorWidth + deltaX;

        // Calculate percentage
        const minWidth = 200;
        const maxWidth = containerWidth - minWidth;

        newEditorWidth = Math.max(minWidth, Math.min(maxWidth, newEditorWidth));

        const editorPercent = (newEditorWidth / containerWidth) * 100;
        const previewPercent = 100 - editorPercent;

        editorPane.style.flex = `0 0 ${editorPercent}%`;
        previewPane.style.flex = `0 0 ${previewPercent}%`;
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;

        isResizing = false;
        splitter.classList.remove('dragging');
        editorBody.classList.remove('resizing');

        // Save ratio to localStorage
        const containerWidth = editorBody.getBoundingClientRect().width - splitter.getBoundingClientRect().width;
        const editorWidth = editorPane.getBoundingClientRect().width;
        const ratio = (editorWidth / containerWidth) * 100;
        localStorage.setItem('editorSplitRatio', ratio.toString());
    });

    // Double click to reset to 50/50
    splitter.addEventListener('dblclick', () => {
        editorPane.style.flex = '1';
        previewPane.style.flex = '1';
        localStorage.removeItem('editorSplitRatio');
    });
}

// Initialize splitter on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initSplitter);

// ============================================
// Authentication Handling
// ============================================

// Wrapper for fetch that handles 401 responses
async function authFetch(url, options = {}) {
    const response = await fetch(url, options);

    if (response.status === 401) {
        // Redirect to login page on authentication failure
        window.location.href = basePath + '/login';
        throw new Error('Authentication required');
    }

    return response;
}

// Initialize user menu
function initUserMenu() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    const userDropdown = document.getElementById('userDropdown');

    if (!userMenuBtn || !userMenu) return;

    // Toggle dropdown on button click
    userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (userMenu && !userMenu.contains(e.target)) {
            userMenu.classList.remove('open');
        }
    });

    // Logout handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch(basePath + '/api/auth/logout', { method: 'POST' });
            } catch (err) {
                console.error('Logout error:', err);
            }
            window.location.href = basePath + '/login';
        });
    }

    // Admin users modal
    const adminUsersBtn = document.getElementById('adminUsersBtn');
    if (adminUsersBtn) {
        adminUsersBtn.addEventListener('click', (e) => {
            e.preventDefault();
            userMenu.classList.remove('open');
            openAdminUsersModal();
        });
    }
}

// Admin Users Modal
async function openAdminUsersModal() {
    const modal = document.getElementById('adminUsersModal');
    if (!modal) return;

    modal.style.display = 'flex';
    await loadUsersList();
}

async function loadUsersList() {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    try {
        const response = await authFetch('/api/admin/users');
        if (!response.ok) throw new Error('Failed to load users');

        const users = await response.json();

        usersList.innerHTML = users.map(user => `
            <div class="user-item" data-user-id="${user.id}">
                <div class="user-item-info">
                    <div class="user-item-avatar">&#128100;</div>
                    <div class="user-item-details">
                        <span class="user-item-name">
                            ${escapeHtml(user.username)}
                            ${user.is_admin ? '<span class="user-item-badge">Admin</span>' : ''}
                        </span>
                        <span class="user-item-meta">Created: ${new Date(user.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="user-item-actions">
                    <button class="btn-icon-sm" title="Change Password" onclick="changeUserPassword(${user.id}, '${escapeHtml(user.username)}')">
                        &#128273;
                    </button>
                    <button class="btn-icon-sm btn-danger" title="Delete User" onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')">
                        &#128465;
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading users:', err);
        usersList.innerHTML = '<div class="user-item">Failed to load users</div>';
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
        return;
    }

    try {
        const response = await authFetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            alert(data.error || 'Failed to delete user');
            return;
        }

        await loadUsersList();
    } catch (err) {
        console.error('Error deleting user:', err);
        alert('Failed to delete user');
    }
}

async function changeUserPassword(userId, username) {
    const newPassword = prompt(`Enter new password for "${username}" (min 6 characters):`);
    if (!newPassword) return;

    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }

    try {
        const response = await authFetch(`/api/admin/users/${userId}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });

        if (!response.ok) {
            const data = await response.json();
            alert(data.error || 'Failed to update password');
            return;
        }

        alert('Password updated successfully');
    } catch (err) {
        console.error('Error updating password:', err);
        alert('Failed to update password');
    }
}

// Add User Modal
function initAddUserModal() {
    const addUserBtn = document.getElementById('addUserBtn');
    const addUserModal = document.getElementById('addUserModal');
    const addUserForm = document.getElementById('addUserForm');
    const addUserCancel = document.getElementById('addUserCancel');

    if (!addUserBtn || !addUserModal) return;

    addUserBtn.addEventListener('click', () => {
        addUserModal.style.display = 'flex';
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newIsAdmin').checked = false;
        document.getElementById('newUsername').focus();
    });

    addUserCancel.addEventListener('click', () => {
        addUserModal.style.display = 'none';
    });

    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value;
        const isAdmin = document.getElementById('newIsAdmin').checked;

        if (!username || !password) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            const response = await authFetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    is_admin: isAdmin
                })
            });

            if (!response.ok) {
                const data = await response.json();
                alert(data.error || 'Failed to create user');
                return;
            }

            addUserModal.style.display = 'none';
            await loadUsersList();
        } catch (err) {
            console.error('Error creating user:', err);
            alert('Failed to create user');
        }
    });
}

// Close admin modals
function initAdminModals() {
    const adminUsersModal = document.getElementById('adminUsersModal');
    const adminUsersClose = document.getElementById('adminUsersClose');
    const addUserModal = document.getElementById('addUserModal');

    if (adminUsersClose) {
        adminUsersClose.addEventListener('click', () => {
            adminUsersModal.style.display = 'none';
        });
    }

    // Close on backdrop click
    [adminUsersModal, addUserModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
    });
}

// Escape HTML for XSS prevention
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize auth-related features
document.addEventListener('DOMContentLoaded', () => {
    initUserMenu();
    initAddUserModal();
    initAdminModals();
    initSettingsModal();
});

// ============================================
// Settings Modal
// ============================================

function initSettingsModal() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsClose = document.getElementById('settingsClose');

    if (!settingsBtn || !settingsModal) return;

    // Open settings modal
    settingsBtn.addEventListener('click', () => {
        openSettingsModal();
    });

    // Close settings modal
    if (settingsClose) {
        settingsClose.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }

    // Close on backdrop click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // Tab switching
    initSettingsTabs();

    // General settings
    initGeneralSettings();

    // Data management
    initDataManagement();

    // Users management in settings (for admin)
    initSettingsUsers();
}

function openSettingsModal() {
    const settingsModal = document.getElementById('settingsModal');
    if (!settingsModal) return;

    settingsModal.style.display = 'flex';

    // Load settings values
    loadGeneralSettings();

    // Check active tab and load relevant data
    const activeTab = document.querySelector('.settings-tab.active');
    if (activeTab) {
        const tabName = activeTab.dataset.tab;
        if (tabName === 'users') {
            loadSettingsUsersList();
        } else if (tabName === 'stats') {
            loadUsageStats();
        }
    }
}

function initSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const panels = document.querySelectorAll('.settings-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active panel
            panels.forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`settings${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
            if (panel) {
                panel.classList.add('active');
            }

            // Load data for specific tabs
            if (tabName === 'users') {
                loadSettingsUsersList();
            } else if (tabName === 'stats') {
                loadUsageStats();
            }
        });
    });
}

// General Settings
function initGeneralSettings() {
    const themeSelect = document.getElementById('settingsTheme');
    const defaultTypeSelect = document.getElementById('settingsDefaultType');
    const autoSaveToggle = document.getElementById('settingsAutoSave');
    const lineNumbersToggle = document.getElementById('settingsLineNumbers');

    if (themeSelect) {
        themeSelect.addEventListener('change', () => {
            const theme = themeSelect.value;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        });
    }

    if (defaultTypeSelect) {
        defaultTypeSelect.addEventListener('change', () => {
            localStorage.setItem('defaultNoteType', defaultTypeSelect.value);
        });
    }

    if (autoSaveToggle) {
        autoSaveToggle.addEventListener('change', () => {
            localStorage.setItem('autoSaveEnabled', autoSaveToggle.checked);
        });
    }

    if (lineNumbersToggle) {
        lineNumbersToggle.addEventListener('change', () => {
            localStorage.setItem('lineNumbersEnabled', lineNumbersToggle.checked);
            applyLineNumbersSetting(lineNumbersToggle.checked);
        });
    }
}

function applyLineNumbersSetting(enabled) {
    if (cmEditor) {
        cmEditor.setOption('lineNumbers', enabled);
    }
}

function loadGeneralSettings() {
    const themeSelect = document.getElementById('settingsTheme');
    const defaultTypeSelect = document.getElementById('settingsDefaultType');
    const autoSaveToggle = document.getElementById('settingsAutoSave');
    const lineNumbersToggle = document.getElementById('settingsLineNumbers');

    if (themeSelect) {
        themeSelect.value = localStorage.getItem('theme') || 'light';
    }

    if (defaultTypeSelect) {
        defaultTypeSelect.value = localStorage.getItem('defaultNoteType') || 'markdown';
    }

    if (autoSaveToggle) {
        const autoSaveEnabled = localStorage.getItem('autoSaveEnabled');
        autoSaveToggle.checked = autoSaveEnabled !== 'false'; // Default to true
    }

    if (lineNumbersToggle) {
        const lineNumbersEnabled = localStorage.getItem('lineNumbersEnabled');
        lineNumbersToggle.checked = lineNumbersEnabled !== 'false'; // Default to true
        applyLineNumbersSetting(lineNumbersToggle.checked);
    }
}

// Settings Users (Admin only)
function initSettingsUsers() {
    const addUserBtn = document.getElementById('settingsAddUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            const addUserModal = document.getElementById('addUserModal');
            if (addUserModal) {
                addUserModal.style.display = 'flex';
                document.getElementById('newUsername').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('newIsAdmin').checked = false;
                document.getElementById('newUsername').focus();
            }
        });
    }
}

async function loadSettingsUsersList() {
    const usersList = document.getElementById('settingsUsersList');
    if (!usersList) return;

    usersList.innerHTML = '<div class="loading-spinner">Loading users...</div>';

    try {
        const response = await authFetch('/api/admin/users');
        if (!response.ok) throw new Error('Failed to load users');

        const users = await response.json();

        usersList.innerHTML = users.map(user => `
            <div class="user-item" data-user-id="${user.id}">
                <div class="user-item-info">
                    <div class="user-item-avatar">&#128100;</div>
                    <div class="user-item-details">
                        <span class="user-item-name">
                            ${escapeHtml(user.username)}
                            ${user.is_admin ? '<span class="user-item-badge">Admin</span>' : ''}
                        </span>
                        <span class="user-item-meta">Created: ${new Date(user.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="user-item-actions">
                    <button class="btn-icon-sm" title="Change Password" onclick="changeUserPassword(${user.id}, '${escapeHtml(user.username)}')">
                        &#128273;
                    </button>
                    <button class="btn-icon-sm btn-danger" title="Delete User" onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')">
                        &#128465;
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading users:', err);
        usersList.innerHTML = '<div class="error-message">Failed to load users</div>';
    }
}

// Data Management
function initDataManagement() {
    const exportBtn = document.getElementById('exportNotesBtn');
    const importBtn = document.getElementById('importNotesBtn');
    const importFileInput = document.getElementById('importFileInput');
    const deleteAllBtn = document.getElementById('deleteAllNotesBtn');

    if (exportBtn) {
        exportBtn.addEventListener('click', exportNotes);
    }

    if (importBtn) {
        importBtn.addEventListener('click', () => {
            importFileInput.click();
        });
    }

    if (importFileInput) {
        importFileInput.addEventListener('change', handleImportFile);
    }

    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', deleteAllNotes);
    }
}

async function exportNotes() {
    const exportBtn = document.getElementById('exportNotesBtn');
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Exporting...';
    }

    try {
        const response = await authFetch('/api/notes/export');
        if (!response.ok) throw new Error('Export failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notes-export-${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Export error:', err);
        alert('Failed to export notes');
    } finally {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Export';
        }
    }
}

async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
        alert('Please select a ZIP file');
        e.target.value = '';
        return;
    }

    if (!confirm('This will import notes from the ZIP file. Continue?')) {
        e.target.value = '';
        return;
    }

    const importBtn = document.getElementById('importNotesBtn');
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.textContent = 'Importing...';
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await authFetch('/api/notes/import', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Import failed');
        }

        const result = await response.json();
        alert(`Successfully imported ${result.imported} notes`);

        // Reload notes list
        await loadNotes();
    } catch (err) {
        console.error('Import error:', err);
        alert('Failed to import notes: ' + err.message);
    } finally {
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.textContent = 'Import';
        }
        e.target.value = '';
    }
}

async function deleteAllNotes() {
    const confirmText = prompt('This will permanently delete ALL your notes. Type "DELETE" to confirm:');
    if (confirmText !== 'DELETE') {
        return;
    }

    const deleteBtn = document.getElementById('deleteAllNotesBtn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
    }

    try {
        const response = await authFetch('/api/notes', {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Delete failed');

        alert('All notes have been deleted');

        // Reload notes list and hide editor
        await loadNotes();
        currentNote = null;
        hideEditor();

        // Update stats
        loadUsageStats();
    } catch (err) {
        console.error('Delete all error:', err);
        alert('Failed to delete notes');
    } finally {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete All';
        }
    }
}

// Usage Statistics
async function loadUsageStats() {
    try {
        const response = await authFetch('/api/stats');
        if (!response.ok) throw new Error('Failed to load stats');

        const stats = await response.json();

        // Update stat cards
        document.getElementById('statTotalNotes').textContent = stats.totalNotes || 0;
        document.getElementById('statTotalAttachments').textContent = stats.totalAttachments || 0;
        document.getElementById('statPrivateNotes').textContent = stats.privateNotes || 0;
        document.getElementById('statStorageUsed').textContent = formatStorageSize(stats.storageUsed || 0);

        // Render notes by type chart
        renderNotesByTypeChart(stats.notesByType || {});

        // Render recent activity
        renderRecentActivity(stats.recentActivity || []);
    } catch (err) {
        console.error('Error loading stats:', err);
        // Show placeholder values
        document.getElementById('statTotalNotes').textContent = notes.length || 0;
        document.getElementById('statTotalAttachments').textContent = '-';
        document.getElementById('statPrivateNotes').textContent = notes.filter(n => n.private).length || 0;
        document.getElementById('statStorageUsed').textContent = '-';
    }
}

function formatStorageSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
}

function renderNotesByTypeChart(notesByType) {
    const container = document.getElementById('notesByType');
    if (!container) return;

    const total = Object.values(notesByType).reduce((sum, count) => sum + count, 0) || 1;

    const entries = Object.entries(notesByType);
    if (entries.length === 0) {
        container.innerHTML = '<div class="no-data">No data available</div>';
        return;
    }

    container.innerHTML = entries.map(([type, count]) => {
        const percent = Math.round((count / total) * 100);
        const label = type === 'markdown' ? 'Markdown' : 'Plain Text';
        return `
            <div class="stats-bar-item">
                <div class="stats-bar-label">
                    <span>${label}</span>
                    <span>${count} (${percent}%)</span>
                </div>
                <div class="stats-bar-track">
                    <div class="stats-bar-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecentActivity(activities) {
    const container = document.getElementById('recentActivity');
    if (!container) return;

    if (activities.length === 0) {
        container.innerHTML = '<div class="no-data">No recent activity</div>';
        return;
    }

    container.innerHTML = activities.map(activity => {
        const icon = activity.action === 'created' ? '&#10133;' :
                    activity.action === 'updated' ? '&#9998;' :
                    activity.action === 'deleted' ? '&#128465;' : '&#128196;';
        return `
            <div class="activity-item">
                <span class="activity-icon">${icon}</span>
                <div class="activity-info">
                    <span class="activity-title">${escapeHtml(activity.noteTitle || 'Unknown')}</span>
                    <span class="activity-meta">${activity.action} - ${formatDate(activity.timestamp)}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Calendar View
// ============================================

// Mini Calendar State
let miniCalCurrentDate = new Date();
let miniCalSelectedDate = null;

function initMiniCalendar() {
    const miniCalPrev = document.getElementById('miniCalPrev');
    const miniCalNext = document.getElementById('miniCalNext');

    if (miniCalPrev) {
        miniCalPrev.addEventListener('click', () => {
            miniCalCurrentDate.setMonth(miniCalCurrentDate.getMonth() - 1);
            renderMiniCalendar();
        });
    }

    if (miniCalNext) {
        miniCalNext.addEventListener('click', () => {
            miniCalCurrentDate.setMonth(miniCalCurrentDate.getMonth() + 1);
            renderMiniCalendar();
        });
    }

    // Initial render
    renderMiniCalendar();
}

function renderMiniCalendar() {
    const miniCalGrid = document.getElementById('miniCalGrid');
    const miniCalTitle = document.getElementById('miniCalTitle');

    if (!miniCalGrid || !miniCalTitle) return;

    const year = miniCalCurrentDate.getFullYear();
    const month = miniCalCurrentDate.getMonth();

    // Update title
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    miniCalTitle.textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    // Get days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    // Build notes map by date
    const notesMap = buildNotesMapByDate();

    // Today's date for comparison
    const today = new Date();
    const todayStr = formatDateKey(today);

    // Generate calendar days
    let html = '';
    let dayCount = 1;
    let nextMonthDay = 1;

    const totalCells = 42; // 6 rows x 7 days

    for (let i = 0; i < totalCells; i++) {
        let dayNumber;
        let dateObj;
        let isOtherMonth = false;

        if (i < startDayOfWeek) {
            // Previous month days
            dayNumber = prevMonthLastDay - startDayOfWeek + i + 1;
            dateObj = new Date(year, month - 1, dayNumber);
            isOtherMonth = true;
        } else if (dayCount <= daysInMonth) {
            // Current month days
            dayNumber = dayCount;
            dateObj = new Date(year, month, dayNumber);
            dayCount++;
        } else {
            // Next month days
            dayNumber = nextMonthDay;
            dateObj = new Date(year, month + 1, dayNumber);
            nextMonthDay++;
            isOtherMonth = true;
        }

        const dateKey = formatDateKey(dateObj);
        const notesForDay = notesMap[dateKey] || [];
        const isToday = dateKey === todayStr;
        const isSelected = miniCalSelectedDate && dateKey === formatDateKey(miniCalSelectedDate);

        let classes = 'mini-cal-day';
        if (isOtherMonth) classes += ' other-month';
        if (isToday) classes += ' today';
        if (isSelected) classes += ' selected';
        if (notesForDay.length > 0) classes += ' has-notes';

        // Add weekend classes
        const dayOfWeek = i % 7;
        if (dayOfWeek === 0) classes += ' sunday';
        if (dayOfWeek === 6) classes += ' saturday';

        html += `<div class="${classes}" data-date="${dateKey}" onclick="selectMiniCalDate('${dateKey}')">${dayNumber}</div>`;
    }

    miniCalGrid.innerHTML = html;
}

function selectMiniCalDate(dateKey) {
    if (miniCalSelectedDate && formatDateKey(miniCalSelectedDate) === dateKey) {
        // Deselect if clicking the same date
        miniCalSelectedDate = null;
        searchInput.value = '';
    } else {
        miniCalSelectedDate = new Date(dateKey + 'T00:00:00');
        // Filter notes by selected date
        searchInput.value = dateKey;
    }
    renderMiniCalendar();
    renderNoteTree();
}

function buildNotesMapByDate() {
    const map = {};

    notes.forEach(note => {
        // Use created date for mapping
        const dateStr = note.created || note.modified;
        if (dateStr) {
            const date = new Date(dateStr);
            const dateKey = formatDateKey(date);
            if (!map[dateKey]) {
                map[dateKey] = [];
            }
            map[dateKey].push(note);
        }
    });

    return map;
}

function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Update mini calendar when notes change
function updateMiniCalendar() {
    renderMiniCalendar();
}

// Clear date selection when search is cleared
function clearMiniCalSelection() {
    if (miniCalSelectedDate && searchInput.value === '') {
        miniCalSelectedDate = null;
        renderMiniCalendar();
    }
}

function createNoteForDate(date) {
    // Format date for the title (YYYY-MM-DD format)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Reset all fields (same as createNewNote)
    currentNote = null;
    currentPassword = null;
    isViewMode = false; // New notes are created in edit mode
    noteTitle.value = `${dateStr} `;
    setEditorContent('');
    noteType.value = localStorage.getItem('defaultNoteType') || 'markdown';
    notePrivate.checked = false;
    previewContent.innerHTML = '';

    // Clear attachments
    currentAttachments = [];
    renderAttachments();

    // Reset original content
    originalContent = {
        title: '',
        content: '',
        type: noteType.value,
        private: false
    };
    hasUnsavedChanges = false;
    updateSaveStatus('');

    // Show editor pane (edit mode)
    showEditorPane();

    // Focus on title and position cursor at end
    setTimeout(() => {
        noteTitle.focus();
        noteTitle.setSelectionRange(noteTitle.value.length, noteTitle.value.length);
    }, 100);
}

// Update mini calendar when notes are loaded
function updateCalendarIfVisible() {
    renderMiniCalendar();
}

// ============================================
// Locale Selector
// ============================================

function initLocaleSelector() {
    const localeSelector = document.getElementById('localeSelector');
    const localeSelectorBtn = document.getElementById('localeSelectorBtn');
    const localeDropdown = document.getElementById('localeDropdown');
    const localeOptions = document.querySelectorAll('.locale-option');
    const localeFlag = localeSelectorBtn?.querySelector('.locale-flag');

    if (!localeSelector || !localeSelectorBtn) return;

    // Update flag display based on current locale
    function updateLocaleDisplay() {
        const locale = i18n.getLocale();
        if (localeFlag) {
            localeFlag.textContent = locale.toUpperCase();
        }
        // Update active state
        localeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.locale === locale);
        });
    }

    // Toggle dropdown
    localeSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        localeSelector.classList.toggle('open');
    });

    // Handle locale selection
    localeOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const locale = option.dataset.locale;
            i18n.setLocale(locale);
            updateLocaleDisplay();
            localeSelector.classList.remove('open');
        });
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!localeSelector.contains(e.target)) {
            localeSelector.classList.remove('open');
        }
    });

    // Initialize display
    updateLocaleDisplay();
}
