// Base path for nginx proxy support
const basePath = window.BASE_PATH || '';

// Debounce utility function for performance optimization
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Helper to encode note IDs for URLs (handles folder paths with slashes)
// Uses URL-safe base64 encoding (+ → -, / → _) to avoid issues with slashes in URLs
function encodeNoteId(id) {
    const base64 = btoa(unescape(encodeURIComponent(id)));
    // Convert to URL-safe base64
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Folder separator used in note titles to indicate folder paths
// e.g., "folder:>:subfolder:>:note title" creates folder/subfolder/note
const FOLDER_SEPARATOR = ':>:';

// Helper to extract note name from title (part after last folder separator)
// e.g., "folder:>:subfolder:>:note title" -> "note title"
function extractNoteName(title) {
    if (!title) return title;
    const lastSep = title.lastIndexOf(FOLDER_SEPARATOR);
    if (lastSep === -1) {
        return title; // No folder path, return whole title
    }
    return title.substring(lastSep + FOLDER_SEPARATOR.length);
}

// Helper to extract folder path from title (converts :>: to / for display)
// e.g., "folder:>:subfolder:>:note title" -> "folder/subfolder"
function extractFolderPath(title) {
    if (!title) return '';
    const lastSep = title.lastIndexOf(FOLDER_SEPARATOR);
    if (lastSep === -1) {
        return ''; // No folder path
    }
    const folderPart = title.substring(0, lastSep);
    return folderPart.split(FOLDER_SEPARATOR).join('/');
}

// Helper to build title with folder path
// e.g., ("folder/subfolder", "note title") -> "folder:>:subfolder:>:note title"
function buildTitleWithFolder(folderPath, noteName) {
    if (!folderPath) return noteName;
    const folderParts = folderPath.split('/').filter(p => p);
    return folderParts.join(FOLDER_SEPARATOR) + FOLDER_SEPARATOR + noteName;
}

// Helper to format folder path for display
// e.g., "folder/subfolder" -> "folder/subfolder"
function formatFolderPathForDisplay(folderPath) {
    if (!folderPath) return '';
    return folderPath;
}

// State
let currentNote = null;
let currentPassword = null;
let currentNoteFolderPath = ''; // Folder path for current note
let notes = [];
let folders = []; // Actual folders from API
let expandedFolders = JSON.parse(localStorage.getItem('expandedFolders') || '{}');
let folderIcons = {}; // { folderPath: emoji } - loaded from API
let draggedNoteId = null;
let currentAttachments = []; // Track attachments for current note
let isViewMode = true; // View mode by default (preview only)

// CodeMirror Editor
let cmEditor = null;
let cmEditorReady = false;

// Auto-save
let autoSaveTimer = null;
let hasUnsavedChanges = false;
let isSaving = false; // Prevent duplicate saves
let autoSaveEnabled = localStorage.getItem('autoSaveEnabled') === 'true'; // Default: disabled
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
const noteFolderPath = document.getElementById('noteFolderPath');
const noteContent = document.getElementById('noteContent');
const codemirrorContainer = document.getElementById('codemirrorEditor');
const noteType = document.getElementById('noteType');
const notePrivate = document.getElementById('notePrivate');
const previewPane = document.getElementById('previewPane');
const previewContent = document.getElementById('previewContent');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const closeNoteBtn = document.getElementById('closeNoteBtn');
const prettyJsonBtn = document.getElementById('prettyJsonBtn');
const syntaxHelpBtn = document.getElementById('syntaxHelpBtn');
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
const versionRestore = document.getElementById('versionRestore');
const versionClose = document.getElementById('versionClose');

const newNoteLocationModal = document.getElementById('newNoteLocationModal');
const folderSelectionArea = document.getElementById('folderSelectionArea');
const folderSelectionList = document.getElementById('folderSelectionList');
const newFolderArea = document.getElementById('newFolderArea');
const newFolderInput = document.getElementById('newFolderInput');
const newNoteLocationCancel = document.getElementById('newNoteLocationCancel');
const newNoteLocationConfirm = document.getElementById('newNoteLocationConfirm');

const moveNoteModal = document.getElementById('moveNoteModal');
const moveNoteInfo = document.getElementById('moveNoteInfo');
const moveFolderList = document.getElementById('moveFolderList');
const moveNoteCancel = document.getElementById('moveNoteCancel');
const moveNoteConfirm = document.getElementById('moveNoteConfirm');

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
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initMarked();
    initCodeMirror();
    initContextMenu();
    initFullscreenButtons();
    initLayoutControls();
    initRootDropZone();
    initShortLinkButton();
    initSidebarToggle();
    initKeyboardShortcuts();
    initFileUpload();
    initMiniCalendar();
    initMarkdownToolbar();
    initLocaleSelector();
    initFontSize();
    await loadFolderOrder();
    // Load notes (includes folder icons)
    loadNotes().then(() => {
        handleHashNavigation();
        renderMiniCalendar();
        // Re-apply i18n after dynamic content is loaded
        if (typeof i18n !== 'undefined') {
            i18n.updateUI();
        }
    });
    setupEventListeners();

    // Handle hash changes
    window.addEventListener('hashchange', handleHashNavigation);

    // Handle locale changes
    window.addEventListener('localeChanged', () => {
        renderMiniCalendar();
    });

    // Ensure i18n is applied after all initialization
    if (typeof i18n !== 'undefined') {
        i18n.updateUI();
    }
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
            case 's': // Save - only in editor area
                {
                    const hasCmFocus = cmEditor && cmEditor.hasFocus();
                    const isTitleFocused = document.activeElement === noteTitle;
                    if (hasCmFocus || isTitleFocused) {
                        e.preventDefault();
                        saveNote();
                    }
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
                // If closing setPasswordModal without setting password, uncheck private toggle
                if (modal.id === 'setPasswordModal') {
                    console.log('[Escape] Unchecking notePrivate because setPasswordModal was open');
                    notePrivate.checked = false;
                    setPasswordInput.value = '';
                    confirmPasswordInput.value = '';
                }
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
                <h3>${i18n.t('help.title')}</h3>
                <button class="help-close-btn" onclick="toggleHelpModal()">&times;</button>
            </div>
            <div class="help-content">
                <div class="help-section">
                    <h4>${i18n.t('help.general')}</h4>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>N</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.newNote')}</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>S</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.save')}</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>F</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.search')}</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.formatJson')}</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>F1</kbd> or <kbd>Ctrl</kbd> + <kbd>/</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.help')}</span>
                        </div>
                    </div>
                </div>
                <div class="help-section">
                    <h4>${i18n.t('help.view')}</h4>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>B</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.toggleSidebar')}</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>E</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.editorFullscreen')}</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Ctrl</kbd> + <kbd>P</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.previewFullscreen')}</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys"><kbd>Esc</kbd></span>
                            <span class="shortcut-desc">${i18n.t('help.closeModal')}</span>
                        </div>
                    </div>
                </div>
                <div class="help-section">
                    <h4>${i18n.t('help.editor')}</h4>
                    <div class="shortcut-list">
                        <div class="shortcut-item">
                            <span class="shortcut-keys">Drag & Drop</span>
                            <span class="shortcut-desc">${i18n.t('help.dragDrop')}</span>
                        </div>
                        <div class="shortcut-item">
                            <span class="shortcut-keys">Right-click</span>
                            <span class="shortcut-desc">${i18n.t('help.contextMenu')}</span>
                        </div>
                    </div>
                </div>
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
    shareBtn.setAttribute('data-i18n-title', 'editor.share');
    shareBtn.title = i18n.t('editor.share');
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
            <h3 data-i18n="share.title">Share Note</h3>
            <p data-i18n="share.description">Share this link with your team:</p>
            <div class="share-link-container">
                <input type="text" id="shareLinkInput" readonly>
                <button id="copyLinkBtn" class="btn btn-primary" data-i18n="share.copy">Copy</button>
            </div>
            <div class="share-expiry-container" style="margin-top: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);" data-i18n="share.expiration">Link expiration:</label>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                        <input type="radio" name="expiryType" id="expiryNever" value="never" checked>
                        <span style="font-size: 0.875rem;" data-i18n="share.never">Never</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                        <input type="radio" name="expiryType" id="expiryDate" value="date">
                        <span style="font-size: 0.875rem;" data-i18n="share.expiresOn">Expires on:</span>
                    </label>
                    <input type="date" id="shareLinkExpiryDate" style="padding: 0.375rem 0.5rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--background); color: var(--foreground); font-size: 0.875rem;" disabled>
                </div>
            </div>
            <div id="shareLinkExpiryInfo" style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);"></div>
            <div class="share-visibility-container" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: var(--text-secondary);" data-i18n="share.visibility">Link visibility:</label>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                        <input type="radio" name="visibilityType" id="visibilityPrivate" value="private" checked>
                        <span style="font-size: 0.875rem;" data-i18n="share.private">Private</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer;">
                        <input type="radio" name="visibilityType" id="visibilityPublic" value="public">
                        <span style="font-size: 0.875rem;" data-i18n="share.public">Public</span>
                    </label>
                </div>
                <div id="shareLinkVisibilityInfo" style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);"></div>
            </div>
            <div id="shareLinkStatus" class="share-status"></div>
            <div class="modal-actions">
                <button id="regenerateLinkBtn" class="btn btn-secondary" data-i18n="share.regenerate">Regenerate</button>
                <button id="shareCloseBtn" class="btn btn-secondary" data-i18n="common.close">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Apply i18n to the modal
    if (typeof i18n !== 'undefined') {
        i18n.updateUI();
    }

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

    // Visibility radio buttons
    const visibilityPrivate = document.getElementById('visibilityPrivate');
    const visibilityPublic = document.getElementById('visibilityPublic');

    visibilityPrivate.addEventListener('change', updateShareLinkVisibility);
    visibilityPublic.addEventListener('change', updateShareLinkVisibility);

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
    const visibilityPrivate = document.getElementById('visibilityPrivate');
    const visibilityPublic = document.getElementById('visibilityPublic');
    const visibilityInfo = document.getElementById('shareLinkVisibilityInfo');

    modal.style.display = 'flex';
    input.value = i18n.t('share.generating');
    status.textContent = '';
    expiryInfo.textContent = '';
    visibilityInfo.textContent = '';
    expiryNever.checked = true;
    expiryDateInput.disabled = true;
    expiryDateInput.value = '';
    visibilityPrivate.checked = true;

    try {
        // Try to get existing short link first
        let response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}/shortlink`);

        if (response.status === 404) {
            // Generate new short link
            response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}/shortlink`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expires_in: 0, is_public: false })
            });
        }

        if (response.ok) {
            const data = await response.json();
            const fullUrl = `${window.location.origin}${data.shortLink}`;
            input.value = fullUrl;

            // Update expiry info and UI
            if (data.expiresAt) {
                const expiryDate = new Date(data.expiresAt);
                expiryInfo.textContent = i18n.t('share.expires', { date: expiryDate.toLocaleDateString() });
                expiryDateRadio.checked = true;
                expiryDateInput.disabled = false;
                expiryDateInput.value = expiryDate.toISOString().split('T')[0];
            } else {
                expiryInfo.textContent = i18n.t('share.neverExpires');
                expiryNever.checked = true;
                expiryDateInput.disabled = true;
            }

            // Update visibility info and UI
            if (data.isPublic) {
                visibilityPublic.checked = true;
                visibilityInfo.textContent = i18n.t('share.publicInfo');
            } else {
                visibilityPrivate.checked = true;
                visibilityInfo.textContent = i18n.t('share.privateInfo');
            }
        } else {
            input.value = '';
            status.textContent = i18n.t('share.failedToGenerate');
            status.className = 'share-status error';
        }
    } catch (error) {
        console.error('Failed to get short link:', error);
        input.value = '';
        status.textContent = i18n.t('share.errorGenerating');
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

function getIsPublic() {
    const visibilityPublic = document.getElementById('visibilityPublic');
    return visibilityPublic.checked;
}

async function updateShareLinkExpiry() {
    if (!currentNote) return;

    const input = document.getElementById('shareLinkInput');
    if (!input.value || input.value === i18n.t('share.generating')) return;

    const expiryInfo = document.getElementById('shareLinkExpiryInfo');
    const status = document.getElementById('shareLinkStatus');
    const expiresIn = getExpiryDays();
    const isPublic = getIsPublic();

    try {
        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}/shortlink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expires_in: expiresIn, is_public: isPublic })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.expiresAt) {
                const expiryDate = new Date(data.expiresAt);
                expiryInfo.textContent = i18n.t('share.expires', { date: expiryDate.toLocaleDateString() });
            } else {
                expiryInfo.textContent = i18n.t('share.neverExpires');
            }
            status.textContent = i18n.t('share.expiryUpdated');
            status.className = 'share-status success';
            setTimeout(() => { status.textContent = ''; }, 2000);
        }
    } catch (error) {
        console.error('Failed to update expiry:', error);
        status.textContent = i18n.t('share.errorUpdating');
        status.className = 'share-status error';
    }
}

async function updateShareLinkVisibility() {
    if (!currentNote) return;

    const input = document.getElementById('shareLinkInput');
    if (!input.value || input.value === i18n.t('share.generating')) return;

    const visibilityInfo = document.getElementById('shareLinkVisibilityInfo');
    const status = document.getElementById('shareLinkStatus');
    const expiresIn = getExpiryDays();
    const isPublic = getIsPublic();

    try {
        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}/shortlink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expires_in: expiresIn, is_public: isPublic })
        });

        if (response.ok) {
            if (isPublic) {
                visibilityInfo.textContent = i18n.t('share.publicInfo');
            } else {
                visibilityInfo.textContent = i18n.t('share.privateInfo');
            }
            status.textContent = i18n.t('share.visibilityUpdated');
            status.className = 'share-status success';
            setTimeout(() => { status.textContent = ''; }, 2000);
        }
    } catch (error) {
        console.error('Failed to update visibility:', error);
        status.textContent = i18n.t('share.errorUpdating');
        status.className = 'share-status error';
    }
}

async function copyShortLink() {
    const input = document.getElementById('shareLinkInput');
    const status = document.getElementById('shareLinkStatus');

    if (!input.value || input.value === i18n.t('share.generating')) return;

    try {
        await navigator.clipboard.writeText(input.value);
        status.textContent = i18n.t('share.copySuccess');
        status.className = 'share-status success';
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    } catch (error) {
        // Fallback for older browsers
        input.select();
        document.execCommand('copy');
        status.textContent = i18n.t('share.copied');
        status.className = 'share-status success';
    }
}

async function regenerateShortLink() {
    if (!currentNote) return;

    const input = document.getElementById('shareLinkInput');
    const status = document.getElementById('shareLinkStatus');
    const expiryInfo = document.getElementById('shareLinkExpiryInfo');
    const visibilityInfo = document.getElementById('shareLinkVisibilityInfo');
    const expiresIn = getExpiryDays();
    const isPublic = getIsPublic();

    input.value = i18n.t('share.regenerating');
    status.textContent = '';

    try {
        // Delete existing
        await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}/shortlink`, {
            method: 'DELETE'
        });

        // Generate new with expiry and visibility
        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}/shortlink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expires_in: expiresIn, is_public: isPublic })
        });

        if (response.ok) {
            const data = await response.json();
            const fullUrl = `${window.location.origin}${data.shortLink}`;
            input.value = fullUrl;
            status.textContent = i18n.t('share.newLinkGenerated');
            status.className = 'share-status success';

            // Update expiry info
            if (data.expiresAt) {
                const expiryDate = new Date(data.expiresAt);
                expiryInfo.textContent = i18n.t('share.expires', { date: expiryDate.toLocaleDateString() });
            } else {
                expiryInfo.textContent = i18n.t('share.neverExpires');
            }

            // Update visibility info
            if (isPublic) {
                visibilityInfo.textContent = i18n.t('share.publicInfo');
            } else {
                visibilityInfo.textContent = i18n.t('share.privateInfo');
            }
        }
    } catch (error) {
        console.error('Failed to regenerate link:', error);
        status.textContent = i18n.t('share.errorRegenerating');
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

// Available themes
const themes = ['light', 'dark', 'dark-high-contrast', 'dark-cyan'];

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const newTheme = themes[nextIndex];

    setTheme(newTheme);
}

function setTheme(theme) {
    if (!themes.includes(theme)) {
        theme = 'light';
    }

    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Update Settings dialog select if it exists
    const themeSelect = document.getElementById('settingsTheme');
    if (themeSelect && themeSelect.value !== theme) {
        themeSelect.value = theme;
    }

    // Recreate CodeMirror editor with new theme
    reinitCodeMirror();
}

function isDarkTheme() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme && theme !== 'light';
}

function reinitCodeMirror() {
    if (!cmEditor) return;

    cmEditor.setOption('theme', isDarkTheme() ? 'dracula' : 'default');
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

        // Show toast message
        showToast(i18n ? i18n.t('toast.codeCopied') || 'Code copied!' : 'Code copied!');

        // Reset after 2 seconds
        setTimeout(() => {
            copyIcon.style.display = 'inline';
            checkIcon.style.display = 'none';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast(i18n ? i18n.t('toast.copyFailed') || 'Failed to copy' : 'Failed to copy');
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

    // Custom renderer for links - open in new tab
    renderer.link = function(href, title, text) {
        // Handle object format (newer marked versions)
        if (typeof href === 'object') {
            title = href.title;
            text = href.text;
            href = href.href;
        }
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
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
        <div class="context-menu-item" data-action="change-icon">
            <span class="context-icon">&#127912;</span> <span data-i18n="context.changeIcon">Change Icon</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="history">
            <span class="context-icon">&#128337;</span> <span data-i18n="context.history">History</span>
        </div>
        <div class="context-menu-item" data-action="decrypt" id="context-decrypt-item" style="display: none;">
            <span class="context-icon">&#128275;</span> <span data-i18n="context.decrypt">Remove Encryption</span>
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
        <div class="context-menu-item" data-action="rename-folder">
            <span class="context-icon">&#9998;</span> <span data-i18n="context.renameFolder">Rename Folder</span>
        </div>
        <div class="context-menu-item" data-action="change-folder-icon">
            <span class="context-icon">&#127912;</span> <span data-i18n="context.changeIcon">Change Icon</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="move-folder-up">
            <span class="context-icon">&#9650;</span> <span data-i18n="context.moveFolderUp">Move Up</span>
        </div>
        <div class="context-menu-item" data-action="move-folder-down">
            <span class="context-icon">&#9660;</span> <span data-i18n="context.moveFolderDown">Move Down</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="expand-folder">
            <span class="context-icon">&#9654;</span> <span data-i18n="context.expand">Expand</span>
        </div>
        <div class="context-menu-item" data-action="expand-all">
            <span class="context-icon">&#9660;</span> <span data-i18n="context.expandAll">Expand All</span>
        </div>
        <div class="context-menu-item" data-action="collapse-folder">
            <span class="context-icon">&#9664;</span> <span data-i18n="context.collapse">Collapse</span>
        </div>
        <div class="context-menu-item" data-action="collapse-all">
            <span class="context-icon">&#9650;</span> <span data-i18n="context.collapseAll">Collapse All</span>
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

    // Folder action buttons (expand all / collapse all)
    const expandAllBtn = document.getElementById('expandAllBtn');
    const collapseAllBtn = document.getElementById('collapseAllBtn');

    if (expandAllBtn) {
        expandAllBtn.addEventListener('click', expandAllFolders);
    }

    if (collapseAllBtn) {
        collapseAllBtn.addEventListener('click', collapseAllFolders);
    }
}

function showContextMenu(e, noteId) {
    e.preventDefault();
    contextTarget = noteId;

    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    // Show/hide decrypt menu item based on encryption status
    const decryptItem = document.getElementById('context-decrypt-item');
    if (decryptItem) {
        decryptItem.style.display = note.encrypted ? 'flex' : 'none';
    }

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
            showMoveNoteModal(note);
            break;

        case 'change-icon':
            showIconPicker('note', contextTarget);
            break;

        case 'history':
            currentNote = note;
            showHistory();
            break;

        case 'delete':
            if (confirm(`Delete "${extractNoteName(note.title)}"?`)) {
                await deleteNoteById(contextTarget);
            }
            break;

        case 'decrypt':
            if (confirm(i18n.t('confirm.decryptNote') || `Remove encryption from "${extractNoteName(note.title)}"?`)) {
                await decryptNote(contextTarget);
            }
            break;
    }
}

async function decryptNote(noteId) {
    try {
        const response = await fetch(`${basePath}/api/notes/${encodeURIComponent(btoa(noteId))}/decrypt`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            showToast(i18n.t('toast.noteDecrypted') || 'Note decrypted successfully');
            await loadNotes();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to decrypt note', 'error');
        }
    } catch (error) {
        console.error('Error decrypting note:', error);
        showToast('Error decrypting note', 'error');
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
            // Create new note in folder
            currentNote = null;
            currentPassword = null;
            isViewMode = false; // New notes are created in edit mode
            currentNoteFolderPath = currentFolderPath;
            noteFolderPath.textContent = formatFolderPathForDisplay(currentFolderPath);
            noteTitle.value = '';
            setEditorContent('');
            noteType.value = 'markdown';
            notePrivate.checked = false;
            currentAttachments = [];
            renderAttachments();

            // Reset original content
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
            break;

        case 'new-subfolder':
            const subfolderName = prompt(i18n ? i18n.t('prompt.enterFolderName') : 'Enter folder name:');
            if (subfolderName) {
                await createFolder(subfolderName, currentFolderPath);
            }
            break;

        case 'change-folder-icon':
            showIconPicker('folder', currentFolderPath);
            break;

        case 'expand-folder':
            expandFolder(currentFolderPath);
            break;

        case 'expand-all':
            expandFolderAll(currentFolderPath);
            break;

        case 'collapse-folder':
            collapseFolder(currentFolderPath);
            break;

        case 'collapse-all':
            collapseFolderAll(currentFolderPath);
            break;

        case 'rename-folder':
            const renamePrompt = i18n ? i18n.t('prompt.enterNewFolderName') : 'Enter new folder name:';
            const currentFolderName = currentFolderPath.split('/').pop();
            const newFolderName = prompt(renamePrompt, currentFolderName);
            if (newFolderName && newFolderName !== currentFolderName) {
                await renameFolder(currentFolderPath, newFolderName);
            }
            break;

        case 'move-folder-up':
            await moveFolderOrder(currentFolderPath, -1);
            break;

        case 'move-folder-down':
            await moveFolderOrder(currentFolderPath, 1);
            break;

        case 'delete-folder':
            const confirmMsg = i18n ? i18n.t('confirm.deleteFolder') : 'Delete this folder? (Must be empty)';
            if (confirm(confirmMsg)) {
                await deleteFolder(currentFolderPath);
            }
            break;
    }
}

// Folder expand/collapse functions
function expandFolder(folderPath) {
    expandedFolders[folderPath] = true;
    localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
    renderNoteTree();
}

function collapseFolder(folderPath) {
    expandedFolders[folderPath] = false;
    localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
    renderNoteTree();
}

function expandFolderAll(folderPath) {
    // Expand the target folder
    expandedFolders[folderPath] = true;

    // Expand all subfolders
    folders.forEach(folder => {
        if (folder.path === folderPath || folder.path.startsWith(folderPath + '/')) {
            expandedFolders[folder.path] = true;
        }
    });

    localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
    renderNoteTree();
}

function collapseFolderAll(folderPath) {
    // Collapse the target folder
    expandedFolders[folderPath] = false;

    // Collapse all subfolders
    folders.forEach(folder => {
        if (folder.path.startsWith(folderPath + '/')) {
            expandedFolders[folder.path] = false;
        }
    });

    localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
    renderNoteTree();
}

function expandAllFolders() {
    folders.forEach(folder => {
        expandedFolders[folder.path] = true;
    });
    localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
    renderNoteTree();
}

function collapseAllFolders() {
    folders.forEach(folder => {
        expandedFolders[folder.path] = false;
    });
    localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
    renderNoteTree();
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

async function renameFolder(oldPath, newName) {
    try {
        // Get all notes in this folder and subfolders
        const notesInFolder = notes.filter(note => {
            const notePath = note.folder_path || extractFolderPath(note.title);
            return notePath === oldPath || notePath.startsWith(oldPath + '/');
        });

        if (notesInFolder.length === 0) {
            // Empty folder - just update folderOrder if exists
            const parentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
            const oldName = oldPath.split('/').pop();
            const newPath = parentPath ? `${parentPath}/${newName}` : newName;

            // Update folder order
            if (folderOrder[parentPath]) {
                const idx = folderOrder[parentPath].indexOf(oldName);
                if (idx !== -1) {
                    folderOrder[parentPath][idx] = newName;
                    await saveFolderOrderForParent(parentPath, folderOrder[parentPath]);
                }
            }

            // Update expanded folders
            if (expandedFolders[oldPath] !== undefined) {
                expandedFolders[newPath] = expandedFolders[oldPath];
                delete expandedFolders[oldPath];
                localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
            }

            await loadNotes();
            const msg = i18n ? i18n.t('msg.folderRenamed') : 'Folder renamed';
            showToast(msg);
            return;
        }

        // Calculate new path
        const parentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;

        // Update all notes with new folder path
        for (const note of notesInFolder) {
            const noteFolderPath = note.folder_path || extractFolderPath(note.title);
            let newFolderPath;

            if (noteFolderPath === oldPath) {
                newFolderPath = newPath;
            } else {
                // Subfolder - replace the old path prefix with new path
                newFolderPath = newPath + noteFolderPath.substring(oldPath.length);
            }

            // Get full note to preserve content
            const getResponse = await authFetch(`/api/notes/${encodeNoteId(note.id)}`);
            if (!getResponse.ok) continue;
            const fullNote = await getResponse.json();

            // Update note with new folder path
            await authFetch(`/api/notes/${encodeNoteId(note.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder_path: newFolderPath,
                    title: fullNote.title,
                    content: fullNote.content,
                    type: fullNote.type,
                    private: fullNote.private
                })
            });
        }

        // Update folder order
        const oldName = oldPath.split('/').pop();
        if (folderOrder[parentPath]) {
            const idx = folderOrder[parentPath].indexOf(oldName);
            if (idx !== -1) {
                folderOrder[parentPath][idx] = newName;
                await saveFolderOrderForParent(parentPath, folderOrder[parentPath]);
            }
        }

        // Update expanded folders
        const newExpandedFolders = {};
        for (const [path, expanded] of Object.entries(expandedFolders)) {
            if (path === oldPath) {
                newExpandedFolders[newPath] = expanded;
            } else if (path.startsWith(oldPath + '/')) {
                newExpandedFolders[newPath + path.substring(oldPath.length)] = expanded;
            } else {
                newExpandedFolders[path] = expanded;
            }
        }
        expandedFolders = newExpandedFolders;
        localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));

        await loadNotes();
        const msg = i18n ? i18n.t('msg.folderRenamed') : 'Folder renamed';
        showToast(msg);
    } catch (error) {
        console.error('Failed to rename folder:', error);
        alert('Failed to rename folder');
    }
}

// Folder order management
let folderOrder = {};

async function loadFolderOrder() {
    try {
        const response = await authFetch('/api/folder-order');
        if (response.ok) {
            folderOrder = await response.json();
        } else {
            folderOrder = {};
        }
    } catch (error) {
        console.error('Failed to load folder order:', error);
        folderOrder = {};
    }
}

async function saveFolderOrder() {
    try {
        await authFetch('/api/folder-order/all', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: folderOrder })
        });
    } catch (error) {
        console.error('Failed to save folder order:', error);
    }
}

async function saveFolderOrderForParent(parentPath, order) {
    try {
        await authFetch('/api/folder-order', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parent_path: parentPath, order: order })
        });
    } catch (error) {
        console.error('Failed to save folder order for parent:', error);
    }
}

function getSiblingsAtSameLevel(folderPath) {
    const parentPath = folderPath.includes('/') ? folderPath.substring(0, folderPath.lastIndexOf('/')) : '';
    const folderName = folderPath.split('/').pop();

    // Get all folders at the same level (same parent)
    const siblings = folders.filter(f => {
        const fParent = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : '';
        return fParent === parentPath;
    }).map(f => f.path.split('/').pop());

    return { parentPath, folderName, siblings };
}

async function moveFolderOrder(folderPath, direction) {
    const { parentPath, folderName, siblings } = getSiblingsAtSameLevel(folderPath);

    if (siblings.length <= 1) return; // Nothing to reorder

    // Initialize order for this parent if not exists
    if (!folderOrder[parentPath]) {
        // Use current order from folders array
        folderOrder[parentPath] = [...siblings].sort();
    }

    // Ensure all siblings are in the order array
    siblings.forEach(s => {
        if (!folderOrder[parentPath].includes(s)) {
            folderOrder[parentPath].push(s);
        }
    });

    const currentIndex = folderOrder[parentPath].indexOf(folderName);
    if (currentIndex === -1) return;

    const newIndex = currentIndex + direction;
    if (newIndex < 0 || newIndex >= folderOrder[parentPath].length) return;

    // Swap positions
    [folderOrder[parentPath][currentIndex], folderOrder[parentPath][newIndex]] =
    [folderOrder[parentPath][newIndex], folderOrder[parentPath][currentIndex]];

    await saveFolderOrderForParent(parentPath, folderOrder[parentPath]);
    renderNoteTree();

    const msg = i18n ? i18n.t('msg.folderMoved') : 'Folder order changed';
    showToast(msg);
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
    try {
        // First, get the full note to preserve content
        const getResponse = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`);
        if (!getResponse.ok) return;
        const fullNote = await getResponse.json();

        // Preserve folder_path when renaming (only change title)
        const folderPath = fullNote.folder_path !== undefined ? fullNote.folder_path : extractFolderPath(fullNote.title);

        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder_path: folderPath,
                title: newTitle,
                content: fullNote.content,
                type: fullNote.type,
                private: fullNote.private
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
        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`);
        const fullNote = await response.json();

        // Preserve folder_path when duplicating
        const folderPath = fullNote.folder_path !== undefined ? fullNote.folder_path : extractFolderPath(fullNote.title);
        const noteName = fullNote.folder_path !== undefined ? fullNote.title : extractNoteName(fullNote.title);

        const newResponse = await fetch(basePath + '/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder_path: folderPath,
                title: noteName + ' (Copy)',
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

    // Get folder path from note.id (actual file location)
    const idParts = (note.id || '').split('/');
    const noteFileName = idParts.pop() || ''; // Always pop to get correct folder path
    const noteName = note.title || noteFileName;
    const currentFolderPath = idParts.join('/');

    // Only update if folder changed
    if (targetPath !== currentFolderPath) {
        await moveNoteToFolder(draggedNoteId, targetPath, noteName, note);
    }

    draggedNoteId = null;
}

async function moveNoteToFolder(id, folderPath, noteName, note) {
    try {
        // Get the full note to preserve content
        const getResponse = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`);
        if (!getResponse.ok) return;
        const fullNote = await getResponse.json();

        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder_path: folderPath,
                title: noteName,
                content: fullNote.content,
                type: fullNote.type,
                private: fullNote.private
            })
        });

        if (response.ok) {
            await loadNotes();
        }
    } catch (error) {
        console.error('Failed to move note:', error);
    }
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

// ============================================
// Layout Controls & Docking System
// ============================================

let layoutState = {
    direction: 'horizontal',  // 'horizontal' | 'vertical'
    previewFirst: false,
    tabMode: false,
    activeTab: 'editor',
    popoutWindow: null
};

function initLayoutControls() {
    // Load saved layout state
    loadLayoutState();

    const editorBody = document.querySelector('.editor-body');
    const layoutDirectionBtn = document.getElementById('layoutDirectionBtn');
    const layoutPositionBtn = document.getElementById('layoutPositionBtn');
    const tabModeBtn = document.getElementById('tabModeBtn');
    const popoutPreviewBtn = document.getElementById('popoutPreviewBtn');
    const tabBar = document.getElementById('layoutTabBar');

    // Apply initial state
    applyLayoutState();

    // Direction toggle (horizontal/vertical)
    if (layoutDirectionBtn) {
        layoutDirectionBtn.addEventListener('click', toggleLayoutDirection);
    }

    // Position toggle (preview first/last)
    if (layoutPositionBtn) {
        layoutPositionBtn.addEventListener('click', togglePreviewPosition);
    }

    // Tab mode toggle
    if (tabModeBtn) {
        tabModeBtn.addEventListener('click', toggleTabMode);
    }

    // Popout preview
    if (popoutPreviewBtn) {
        popoutPreviewBtn.addEventListener('click', popoutPreview);
    }

    // Tab bar click handlers
    if (tabBar) {
        tabBar.querySelectorAll('.layout-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.dataset.tab);
            });
        });
    }

    // Listen for popout window close
    window.addEventListener('message', (e) => {
        if (e.data === 'popout-closed') {
            onPopoutClosed();
        }
    });
}

function loadLayoutState() {
    const saved = localStorage.getItem('layoutState');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            layoutState = { ...layoutState, ...parsed };
            // Reset popout window reference on page load
            layoutState.popoutWindow = null;
        } catch (e) {
            console.error('Failed to load layout state:', e);
        }
    }
}

function saveLayoutState() {
    const toSave = {
        direction: layoutState.direction,
        previewFirst: layoutState.previewFirst,
        tabMode: layoutState.tabMode,
        activeTab: layoutState.activeTab
    };
    localStorage.setItem('layoutState', JSON.stringify(toSave));
}

function applyLayoutState() {
    const editorBody = document.querySelector('.editor-body');
    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.getElementById('previewPane');
    const tabBar = document.getElementById('layoutTabBar');
    const layoutDirectionBtn = document.getElementById('layoutDirectionBtn');
    const layoutPositionBtn = document.getElementById('layoutPositionBtn');
    const tabModeBtn = document.getElementById('tabModeBtn');

    if (!editorBody) return;

    // Apply direction
    editorBody.classList.toggle('layout-vertical', layoutState.direction === 'vertical');

    // Apply preview position
    editorBody.classList.toggle('preview-first', layoutState.previewFirst);

    // Apply tab mode
    editorBody.classList.toggle('tab-mode', layoutState.tabMode);
    if (tabBar) {
        tabBar.style.display = layoutState.tabMode ? 'flex' : 'none';
    }

    // Apply active tab
    if (layoutState.tabMode) {
        // Clear active class from both first
        editorPane.classList.remove('active');
        previewPane.classList.remove('active');

        // Add active class to the selected tab
        if (layoutState.activeTab === 'editor') {
            editorPane.classList.add('active');
        } else if (layoutState.activeTab === 'preview') {
            previewPane.classList.add('active');
        } else {
            // Default to editor
            layoutState.activeTab = 'editor';
            editorPane.classList.add('active');
        }
        updateTabBarState();
    } else {
        // When exiting tab mode, remove active classes
        editorPane.classList.remove('active');
        previewPane.classList.remove('active');
    }

    // Update button states
    if (layoutDirectionBtn) {
        layoutDirectionBtn.classList.toggle('active', layoutState.direction === 'vertical');
        layoutDirectionBtn.innerHTML = layoutState.direction === 'vertical' ? '&#8645;' : '&#8644;';
    }

    if (layoutPositionBtn) {
        layoutPositionBtn.classList.toggle('active', layoutState.previewFirst);
    }

    if (tabModeBtn) {
        tabModeBtn.classList.toggle('active', layoutState.tabMode);
    }
}

function toggleLayoutDirection() {
    layoutState.direction = layoutState.direction === 'horizontal' ? 'vertical' : 'horizontal';
    applyLayoutState();
    saveLayoutState();

    // Refresh CodeMirror after layout change
    if (cmEditor) {
        setTimeout(() => cmEditor.refresh(), 100);
    }
}

function togglePreviewPosition() {
    layoutState.previewFirst = !layoutState.previewFirst;
    applyLayoutState();
    saveLayoutState();
}

function toggleTabMode() {
    layoutState.tabMode = !layoutState.tabMode;

    // If entering tab mode, ensure editor is active
    if (layoutState.tabMode && !layoutState.activeTab) {
        layoutState.activeTab = 'editor';
    }

    applyLayoutState();
    saveLayoutState();

    // Refresh CodeMirror after layout change
    if (cmEditor) {
        setTimeout(() => cmEditor.refresh(), 100);
    }
}

function switchTab(tabName) {
    if (!layoutState.tabMode) return;

    layoutState.activeTab = tabName;

    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.getElementById('previewPane');

    if (!editorPane || !previewPane) return;

    // Remove active from both first
    editorPane.classList.remove('active');
    previewPane.classList.remove('active');

    // Add active to the selected tab
    if (tabName === 'editor') {
        editorPane.classList.add('active');
    } else if (tabName === 'preview') {
        previewPane.classList.add('active');
    }

    updateTabBarState();
    saveLayoutState();

    // Update preview when switching to preview tab
    if (tabName === 'preview') {
        updatePreview();
    }

    // Refresh CodeMirror when switching to editor tab
    if (tabName === 'editor' && cmEditor) {
        // Use requestAnimationFrame for smoother refresh
        requestAnimationFrame(() => {
            cmEditor.refresh();
        });
    }
}

function updateTabBarState() {
    const tabBar = document.getElementById('layoutTabBar');
    if (!tabBar) return;

    tabBar.querySelectorAll('.layout-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === layoutState.activeTab);
    });
}

function popoutPreview() {
    // Close existing popout window if any
    if (layoutState.popoutWindow && !layoutState.popoutWindow.closed) {
        layoutState.popoutWindow.focus();
        return;
    }

    // Get current preview content
    const previewContent = document.getElementById('previewContent');
    const noteTypeValue = document.getElementById('noteType').value;
    const content = getEditorContent();
    const title = noteTitle.value || 'Preview';

    // Open new window
    const width = 800;
    const height = 600;
    const left = window.screenX + window.outerWidth - width - 50;
    const top = window.screenY + 50;

    layoutState.popoutWindow = window.open(
        `${basePath}/popout-preview`,
        'preview-popout',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (layoutState.popoutWindow) {
        // Apply popout mode to main window
        const editorBody = document.querySelector('.editor-body');
        editorBody.classList.add('popout-mode');

        const popoutBtn = document.getElementById('popoutPreviewBtn');
        if (popoutBtn) popoutBtn.classList.add('active');

        // Send initial content to popout window
        layoutState.popoutWindow.addEventListener('load', () => {
            sendContentToPopout();
        });

        // Monitor popout window close
        const checkClosed = setInterval(() => {
            if (layoutState.popoutWindow && layoutState.popoutWindow.closed) {
                clearInterval(checkClosed);
                onPopoutClosed();
            }
        }, 500);
    }
}

function sendContentToPopout() {
    if (!layoutState.popoutWindow || layoutState.popoutWindow.closed) return;

    const noteTypeValue = document.getElementById('noteType').value;
    const content = getEditorContent();
    const title = noteTitle.value || 'Preview';

    layoutState.popoutWindow.postMessage({
        type: 'preview-update',
        content: content,
        noteType: noteTypeValue,
        title: title
    }, '*');
}

function onPopoutClosed() {
    layoutState.popoutWindow = null;

    const editorBody = document.querySelector('.editor-body');
    editorBody.classList.remove('popout-mode');

    const popoutBtn = document.getElementById('popoutPreviewBtn');
    if (popoutBtn) popoutBtn.classList.remove('active');
}

// Update popout preview when editor content changes
function updatePopoutPreview() {
    if (layoutState.popoutWindow && !layoutState.popoutWindow.closed) {
        sendContentToPopout();
    }
}

// Auto-save functions
function isContentChanged() {
    return getFullNoteTitle() !== originalContent.title ||
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

    // Only auto-save if enabled
    if (!autoSaveEnabled) return;

    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }

    autoSaveTimer = setTimeout(async () => {
        await performAutoSave();
    }, AUTO_SAVE_DELAY);
}

async function performAutoSave() {
    // Prevent duplicate saves
    if (isSaving) return;
    if (!hasUnsavedChanges) return;

    const title = getFullNoteTitle();
    if (!noteTitle.value.trim()) return;

    // Double-check if content actually changed
    if (!isContentChanged()) {
        hasUnsavedChanges = false;
        updateSaveStatus('');
        return;
    }

    isSaving = true;
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
            response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}`, {
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
                title: getFullNoteTitle(),
                content: getEditorContent(),
                type: noteType.value,
                private: notePrivate.checked
            };
            hasUnsavedChanges = false;
            updateSaveStatus('saved');
            // Optimistic update: update local list instead of full reload
            updateNoteInList(savedNote);
        } else {
            updateSaveStatus('error');
        }
    } catch (error) {
        console.error('Auto-save failed:', error);
        updateSaveStatus('error');
    } finally {
        isSaving = false;
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
        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`, {
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

    // Search with debouncing (300ms delay for better performance)
    const debouncedFilterNotes = debounce(() => {
        filterNotes();
    }, 300);
    searchInput.addEventListener('input', () => {
        updateSearchClearButton();
        debouncedFilterNotes();
    });

    // Search clear button
    const searchClear = document.getElementById('searchClear');
    if (searchClear) {
        searchClear.addEventListener('click', clearSearch);
    }
    updateSearchClearButton();

    // Save - add both click and touchend for better tablet support
    saveBtn.addEventListener('click', saveNote);
    saveBtn.addEventListener('touchend', (e) => {
        e.preventDefault(); // Prevent ghost click
        saveNote();
    });

    // Delete
    deleteBtn.addEventListener('click', deleteNote);

    // Close note
    if (closeNoteBtn) {
        closeNoteBtn.addEventListener('click', closeNote);
    }

    // History
    historyBtn.addEventListener('click', showHistory);

    // Pretty JSON
    prettyJsonBtn.addEventListener('click', prettyJson);

    // Syntax Help
    if (syntaxHelpBtn) {
        syntaxHelpBtn.addEventListener('click', showSyntaxHelp);
    }

    // Note: Content change is now handled by CodeMirror's updateListener

    // Title change - trigger auto-save
    noteTitle.addEventListener('input', triggerAutoSave);

    // Auto-replace / with :>: in title for folder separator
    noteTitle.addEventListener('keydown', (e) => {
        if (e.key === '/') {
            e.preventDefault();
            const input = e.target;
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const value = input.value;
            input.value = value.substring(0, start) + FOLDER_SEPARATOR + value.substring(end);
            input.selectionStart = input.selectionEnd = start + FOLDER_SEPARATOR.length;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // Type change - toggle preview and trigger auto-save
    noteType.addEventListener('change', () => {
        updatePreview();
        togglePreview();
        updateMarkdownToolbarVisibility();
        triggerAutoSave();
    });

    // Private toggle
    notePrivate.addEventListener('change', handlePrivateToggle);

    // Auto-save toggle
    const autoSaveCheckbox = document.getElementById('autoSaveEnabled');
    if (autoSaveCheckbox) {
        autoSaveCheckbox.checked = autoSaveEnabled;
        autoSaveCheckbox.addEventListener('change', (e) => {
            autoSaveEnabled = e.target.checked;
            localStorage.setItem('autoSaveEnabled', autoSaveEnabled);
            // Sync with settings checkbox
            const settingsAutoSave = document.getElementById('settingsAutoSave');
            if (settingsAutoSave) {
                settingsAutoSave.checked = autoSaveEnabled;
            }
        });
    }

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

    // Check if drag contains external files (not internal page elements)
    function isExternalFileDrag(e) {
        const types = e.dataTransfer.types;
        // Must have Files type
        if (!types || !types.includes('Files')) {
            return false;
        }
        // If it has text/html or text/uri-list, it's likely an internal drag (image from page)
        if (types.includes('text/html') || types.includes('text/uri-list')) {
            return false;
        }
        return true;
    }

    editorElement.addEventListener('dragenter', (e) => {
        preventDefaults(e);
        // Only show overlay for external file drops
        if (!isExternalFileDrag(e)) {
            return;
        }
        dragCounter++;
        if (dragCounter === 1) {
            showDropOverlay(editorElement, dropOverlay);
        }
    });

    editorElement.addEventListener('dragleave', (e) => {
        preventDefaults(e);
        // Only track external file drags
        if (!isExternalFileDrag(e)) {
            return;
        }
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
        // Reset counter and hide overlay
        dragCounter = 0;
        hideDropOverlay(dropOverlay);

        // Only process external file drops
        if (!isExternalFileDrag(e)) {
            return;
        }

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

// Check if file is a text/code file that can be inserted as content
function isTextOrCodeFile(fileName, mimeType) {
    const textExtensions = [
        // Data formats
        'json', 'yaml', 'yml', 'xml', 'csv', 'tsv', 'toml', 'ini', 'conf', 'cfg',
        // Web
        'html', 'htm', 'css', 'scss', 'sass', 'less', 'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
        // Programming languages
        'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'cs', 'go', 'rs', 'swift', 'kt', 'kts',
        'py', 'rb', 'php', 'pl', 'pm', 'lua', 'r', 'scala', 'groovy', 'clj', 'cljs',
        'hs', 'ml', 'fs', 'fsx', 'ex', 'exs', 'erl', 'hrl',
        // Shell/Script
        'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd',
        // Config/Build
        'dockerfile', 'makefile', 'cmake', 'gradle', 'sbt',
        // Markup/Doc
        'md', 'markdown', 'rst', 'adoc', 'asciidoc', 'tex', 'latex',
        // SQL
        'sql', 'mysql', 'pgsql', 'sqlite',
        // Other
        'txt', 'log', 'diff', 'patch', 'env', 'gitignore', 'editorconfig'
    ];

    const ext = fileName.split('.').pop().toLowerCase();

    // Check by extension
    if (textExtensions.includes(ext)) {
        return true;
    }

    // Check by MIME type
    if (mimeType) {
        if (mimeType.startsWith('text/') ||
            mimeType === 'application/json' ||
            mimeType === 'application/xml' ||
            mimeType === 'application/javascript' ||
            mimeType === 'application/x-yaml' ||
            mimeType === 'application/x-sh') {
            return true;
        }
    }

    return false;
}

// Get code language identifier from file extension
function getCodeLanguage(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();

    const languageMap = {
        // Data formats
        'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'xml': 'xml',
        'csv': 'csv', 'toml': 'toml', 'ini': 'ini',
        // Web
        'html': 'html', 'htm': 'html', 'css': 'css', 'scss': 'scss',
        'sass': 'sass', 'less': 'less', 'js': 'javascript', 'jsx': 'jsx',
        'ts': 'typescript', 'tsx': 'tsx', 'vue': 'vue', 'svelte': 'svelte',
        // Programming
        'java': 'java', 'c': 'c', 'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp',
        'h': 'c', 'hpp': 'cpp', 'cs': 'csharp', 'go': 'go', 'rs': 'rust',
        'swift': 'swift', 'kt': 'kotlin', 'kts': 'kotlin',
        'py': 'python', 'rb': 'ruby', 'php': 'php', 'pl': 'perl',
        'lua': 'lua', 'r': 'r', 'scala': 'scala', 'groovy': 'groovy',
        'clj': 'clojure', 'cljs': 'clojure', 'hs': 'haskell',
        'ml': 'ocaml', 'fs': 'fsharp', 'ex': 'elixir', 'exs': 'elixir',
        'erl': 'erlang',
        // Shell
        'sh': 'bash', 'bash': 'bash', 'zsh': 'zsh', 'fish': 'fish',
        'ps1': 'powershell', 'psm1': 'powershell', 'bat': 'batch', 'cmd': 'batch',
        // Config
        'dockerfile': 'dockerfile', 'makefile': 'makefile',
        // Markup
        'md': 'markdown', 'markdown': 'markdown', 'rst': 'rst',
        'adoc': 'asciidoc', 'asciidoc': 'asciidoc', 'tex': 'latex',
        // SQL
        'sql': 'sql', 'mysql': 'sql', 'pgsql': 'sql',
        // Other
        'diff': 'diff', 'patch': 'diff'
    };

    return languageMap[ext] || '';
}

// Read file content as text
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

// Insert file content as code block
function insertFileContentAsCodeBlock(fileName, content, noteType) {
    const lang = getCodeLanguage(fileName);
    let codeBlock;

    if (noteType === 'asciidoc') {
        // AsciiDoc format
        codeBlock = `[source,${lang || 'text'}]\n----\n${content}\n----\n`;
    } else {
        // Markdown format (default)
        codeBlock = '```' + lang + '\n' + content + '\n```\n';
    }

    insertAtCursor(codeBlock);
    updatePreview();
    triggerAutoSave();
}

async function uploadAndAttachFile(file) {
    const isImage = file.type.startsWith('image/');
    const fileName = file.name;
    const fileSize = file.size;
    const isTextFile = isTextOrCodeFile(fileName, file.type);

    // For text/code files, read content before upload for potential insertion
    let fileContent = null;
    if (isTextFile && !isImage) {
        try {
            fileContent = await readFileAsText(file);
        } catch (e) {
            console.error('Failed to read file content:', e);
        }
    }

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
            // For text/code files, ask if user wants to insert content
            else if (isTextFile && fileContent !== null) {
                const confirmMsg = i18n
                    ? i18n.t('msg.insertFileContent') || 'Would you like to insert the file content into the note?'
                    : 'Would you like to insert the file content into the note?';

                if (confirm(confirmMsg)) {
                    insertFileContentAsCodeBlock(fileName, fileContent, noteType.value);
                }
            }
        } else {
            const errorMsg = i18n ? i18n.t('msg.uploadFailed') || 'Failed to upload file' : 'Failed to upload file';
            alert(errorMsg);
        }
    } catch (error) {
        console.error('File upload failed:', error);
        const errorMsg = i18n ? i18n.t('msg.uploadFailed') || 'Failed to upload file' : 'Failed to upload file';
        alert(errorMsg);
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
                <a href="${att.url}?download=true" download="${escapeHtml(att.name)}" class="attachment-btn" title="Download">
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
    // For non-image files, add ?download=true to enable original filename on download
    const downloadUrl = attachment.isImage
        ? attachment.url
        : `${attachment.url}?download=true`;

    const markdown = attachment.isImage
        ? `![${attachment.name}](${attachment.url})`
        : `[${attachment.name}](${downloadUrl})`;

    insertAtCursor(markdown);
    updatePreview();
    triggerAutoSave();
}

function removeAttachment(index) {
    const attachment = currentAttachments[index];
    if (!attachment) return;

    // Check if attachment URL is referenced in content
    const content = getEditorContent();
    const escapedUrl = attachment.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars

    // Build patterns for both Markdown and AsciiDoc formats
    // Markdown: ![...](url) or [...](url) or [...](url?download=true)
    const mdImagePattern = `!\\[[^\\]]*\\]\\(${escapedUrl}\\)`;
    const mdLinkPattern = `\\[[^\\]]*\\]\\(${escapedUrl}(\\?download=true)?\\)`;
    // AsciiDoc: image::url[...] or link:url[...]
    const adocImagePattern = `image::${escapedUrl}\\[[^\\]]*\\]`;
    const adocLinkPattern = `link:${escapedUrl}(\\?download=true)?\\[[^\\]]*\\]`;

    const allPatterns = `(${mdImagePattern}|${mdLinkPattern}|${adocImagePattern}|${adocLinkPattern})`;
    const refRegex = new RegExp(allPatterns, 'g');
    const matches = content.match(refRegex);
    const hasRefInContent = matches && matches.length > 0;

    let confirmMessage = i18n.t('attachment.removeConfirm') || 'Remove this attachment?';

    if (hasRefInContent) {
        const refCount = matches.length;
        const warningMsg = i18n.t('attachment.linkInContentWarning', { count: refCount }) ||
            `\n\nThis attachment is referenced ${refCount} time(s) in the note. Remove references too?`;
        confirmMessage += warningMsg;
    }

    if (confirm(confirmMessage)) {
        // Remove references from content if any exist
        if (hasRefInContent) {
            let newContent = content.replace(refRegex, '');
            // Clean up empty lines left by removal (optional: keep single empty line)
            newContent = newContent.replace(/\n{3,}/g, '\n\n');
            setEditorContent(newContent);
        }

        // Delete file from server
        deleteAttachmentFile(attachment.url);

        currentAttachments.splice(index, 1);
        renderAttachments();
        updatePreview();
        triggerAutoSave();
    }
}

async function deleteAttachmentFile(url) {
    try {
        // Extract filename from URL (format: /u/{username}/files/{filename} or /u/{username}/images/{filename})
        const urlParts = url.split('/');
        const filename = urlParts[urlParts.length - 1];
        const type = urlParts[urlParts.length - 2]; // 'files' or 'images'

        if (!filename || (type !== 'files' && type !== 'images')) {
            console.warn('Cannot delete attachment: invalid URL format', url);
            return;
        }

        // Determine the correct endpoint
        const endpoint = type === 'images' ? `/api/images/${filename}` : `/api/files/${filename}`;

        const response = await authFetch(endpoint, { method: 'DELETE' });
        if (!response.ok) {
            console.warn('Failed to delete attachment file:', await response.text());
        }
    } catch (error) {
        console.error('Error deleting attachment file:', error);
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
        // Fetch notes, folders, and folder icons in parallel
        const [notesResponse, foldersResponse, iconsResponse] = await Promise.all([
            fetch(basePath + '/api/notes'),
            fetch(basePath + '/api/folders'),
            fetch(basePath + '/api/folder-icons')
        ]);

        notes = await notesResponse.json();
        if (!notes) notes = [];

        folders = await foldersResponse.json();
        if (!folders) folders = [];

        // Load folder icons if authenticated
        if (iconsResponse.ok) {
            folderIcons = await iconsResponse.json();
        }

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

// Optimistic update: Update or add a note in the local list without full reload
function updateNoteInList(savedNote) {
    const index = notes.findIndex(n => n.id === savedNote.id);

    // Build note list item from saved note
    const noteItem = {
        id: savedNote.id,
        folder_path: savedNote.folder_path || '',
        title: savedNote.title,
        type: savedNote.type,
        icon: savedNote.icon || '',
        private: savedNote.private,
        encrypted: savedNote.encrypted || false,
        created: savedNote.created,
        modified: savedNote.modified
    };

    if (index >= 0) {
        // Update existing note
        notes[index] = noteItem;
    } else {
        // Add new note
        notes.unshift(noteItem);
    }

    // Check if a new folder was created and update folders list
    const folderPath = savedNote.folder_path || '';
    if (folderPath && !folders.some(f => f.path === folderPath)) {
        // New folder detected - add to folders list
        folders.push({ path: folderPath });
        // Sort folders alphabetically
        folders.sort((a, b) => a.path.localeCompare(b.path));
    }

    renderNoteTree();
    updateCalendarIfVisible();
}

// Optimistic update: Remove a note from the local list
function removeNoteFromList(noteId) {
    const index = notes.findIndex(n => n.id === noteId);
    if (index >= 0) {
        notes.splice(index, 1);
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

        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`, { headers });

        // Check response status before parsing JSON
        if (!response.ok) {
            if (response.status === 401) {
                // Try to parse response to check if locked
                try {
                    const data = await response.json();
                    if (data.locked) {
                        pendingNoteId = id;
                        passwordModal.style.display = 'flex';
                        passwordInput.focus();
                        return;
                    }
                } catch (e) {
                    // JSON parse failed, show generic error
                }
                alert(i18n ? i18n.t('msg.invalidPassword') || 'Invalid password' : 'Invalid password');
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const note = await response.json();

        if (note.locked) {
            pendingNoteId = id;
            passwordModal.style.display = 'flex';
            passwordInput.focus();
            return;
        }

        currentNote = note;
        showPreviewOnly(note);
        updateNoteListSelection(id);

        // In tab mode, switch to preview tab when loading a note
        if (layoutState.tabMode) {
            switchTab('preview');
        }
    } catch (error) {
        console.error('Failed to load note:', error);
        const errorMsg = i18n ? i18n.t('msg.loadFailed') || 'Failed to load note' : 'Failed to load note';
        alert(errorMsg);
    }
}

// Edit note - loads note in edit mode instead of preview mode
async function editNote(id) {
    try {
        const headers = {};
        if (currentPassword) {
            headers['X-Note-Password'] = currentPassword;
        }

        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`, { headers });

        // Check response status before parsing JSON
        if (!response.ok) {
            if (response.status === 401) {
                // Try to parse response to check if locked
                try {
                    const data = await response.json();
                    if (data.locked) {
                        pendingNoteId = id;
                        passwordModal.style.display = 'flex';
                        passwordInput.focus();
                        return;
                    }
                } catch (e) {
                    // JSON parse failed, show generic error
                }
                alert(i18n ? i18n.t('msg.invalidPassword') || 'Invalid password' : 'Invalid password');
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const note = await response.json();

        if (note.locked) {
            pendingNoteId = id;
            passwordModal.style.display = 'flex';
            passwordInput.focus();
            return;
        }

        currentNote = note;
        showEditor(note);
        updateNoteListSelection(id);

        // In tab mode, switch to editor tab when editing a note
        if (layoutState.tabMode) {
            switchTab('editor');
        }
    } catch (error) {
        console.error('Failed to load note:', error);
        const errorMsg = i18n ? i18n.t('msg.loadFailed') || 'Failed to load note' : 'Failed to load note';
        alert(errorMsg);
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
    // Prevent duplicate saves
    if (isSaving) return;

    const title = getFullNoteTitle();
    const content = getEditorContent();
    const type = noteType.value;
    const isPrivate = notePrivate.checked;

    if (!noteTitle.value.trim()) {
        alert(i18n.t('msg.enterTitle'));
        return;
    }

    // Check if content actually changed (skip if setting new password)
    if (!pendingPassword && !isContentChanged()) {
        updateSaveStatus('saved');
        setTimeout(() => updateSaveStatus(''), 1000);
        return;
    }

    // Clear any pending auto-save
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }

    isSaving = true;

    const headers = {
        'Content-Type': 'application/json'
    };
    if (currentPassword) {
        headers['X-Note-Password'] = currentPassword;
    }

    const data = {
        folder_path: currentNoteFolderPath,
        title: noteTitle.value.trim(),
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
            response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}`, {
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
                title: getFullNoteTitle(),
                content: getEditorContent(),
                type: noteType.value,
                private: notePrivate.checked
            };
            hasUnsavedChanges = false;
            updateSaveStatus('saved');
            // Optimistic update: update local list instead of full reload
            updateNoteInList(savedNote);
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to save note');
        }
    } catch (error) {
        console.error('Failed to save note:', error);
    } finally {
        isSaving = false;
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
        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}`, {
            method: 'DELETE',
            headers
        });

        if (response.ok) {
            const deletedNoteId = currentNote.id;
            currentNote = null;
            currentPassword = null;
            hideEditor();
            // Optimistic update: remove from local list instead of full reload
            removeNoteFromList(deletedNoteId);
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to delete note');
        }
    } catch (error) {
        console.error('Failed to delete note:', error);
    }
}

let currentHistoryCommits = [];

async function showHistory() {
    if (!currentNote || !currentNote.id) return;

    const headers = {};
    if (currentPassword) {
        headers['X-Note-Password'] = currentPassword;
    }

    const versionHistoryList = document.getElementById('versionHistoryList');

    try {
        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}/history`, { headers });
        const data = await response.json();

        if (!response.ok) {
            console.error('History API error:', data.error);
            if (versionHistoryList) {
                versionHistoryList.innerHTML = `<p style="padding: 20px; color: var(--text-secondary);">${data.error || i18n.t('history.loadFailed')}</p>`;
            }
            versionModal.style.display = 'flex';
            return;
        }

        currentHistoryCommits = Array.isArray(data) ? data : [];

        if (versionHistoryList) {
            versionHistoryList.innerHTML = '';

            if (currentHistoryCommits.length === 0) {
                versionHistoryList.innerHTML = `<p style="padding: 20px; color: var(--text-secondary);">${i18n.t('history.noHistory')}</p>`;
            } else {
                currentHistoryCommits.forEach((commit, index) => {
                    const item = document.createElement('div');
                    item.className = 'version-history-item';
                    item.dataset.hash = commit.hash;
                    item.innerHTML = `
                        <div class="version-item-hash">${commit.hash.substring(0, 8)}</div>
                        <div class="version-item-message">${escapeHtml(commit.message)}</div>
                        <div class="version-item-date">${formatDate(commit.date)}</div>
                    `;
                    item.addEventListener('click', () => selectVersion(commit.hash));
                    versionHistoryList.appendChild(item);
                });

                // Auto-select first version
                if (currentHistoryCommits.length > 0) {
                    selectVersion(currentHistoryCommits[0].hash);
                }
            }
        }

        versionModal.style.display = 'flex';
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

async function selectVersion(hash) {
    const versionHistoryList = document.getElementById('versionHistoryList');
    if (versionHistoryList) {
        // Update active state in list
        versionHistoryList.querySelectorAll('.version-history-item').forEach(item => {
            item.classList.toggle('active', item.dataset.hash === hash);
        });
    }

    // Load version content and update diff
    await loadVersionDiff(hash);
}

async function loadVersionDiff(hash) {
    if (!currentNote || !currentNote.id) return;

    const headers = {};
    if (currentPassword) {
        headers['X-Note-Password'] = currentPassword;
    }

    try {
        const response = await fetch(`${basePath}/api/notes/${encodeNoteId(currentNote.id)}/version/${hash}`, { headers });
        const data = await response.json();

        currentVersionHash = hash;
        currentVersionContent = data.content;
        versionHash.textContent = hash.substring(0, 8);

        // Calculate and render diff
        renderVersionDiff(data.content, getEditorContent());
    } catch (error) {
        console.error('Failed to load version:', error);
    }
}

// Syntax Help Modal
function showSyntaxHelp() {
    const modal = document.getElementById('syntaxHelpModal');
    if (!modal) return;

    // Set active tab based on current note type
    const currentType = noteType.value;
    const tabs = modal.querySelectorAll('.syntax-tab');
    const panels = modal.querySelectorAll('.syntax-panel');

    tabs.forEach(tab => {
        const syntax = tab.dataset.syntax;
        if ((currentType === 'markdown' && syntax === 'markdown') ||
            (currentType === 'asciidoc' && syntax === 'asciidoc')) {
            tab.classList.add('active');
        } else if (currentType === 'txt') {
            // Default to markdown for txt
            tab.classList.toggle('active', syntax === 'markdown');
        } else {
            tab.classList.remove('active');
        }
    });

    panels.forEach(panel => {
        const id = panel.id;
        if ((currentType === 'markdown' && id === 'syntaxMarkdown') ||
            (currentType === 'asciidoc' && id === 'syntaxAsciidoc')) {
            panel.classList.add('active');
        } else if (currentType === 'txt') {
            panel.classList.toggle('active', id === 'syntaxMarkdown');
        } else {
            panel.classList.remove('active');
        }
    });

    modal.style.display = 'flex';
}

function initSyntaxHelpModal() {
    const modal = document.getElementById('syntaxHelpModal');
    const closeBtn = document.getElementById('syntaxHelpClose');
    if (!modal) return;

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Tab switching
    const tabs = modal.querySelectorAll('.syntax-tab');
    const panels = modal.querySelectorAll('.syntax-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const syntax = tab.dataset.syntax;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            panels.forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById(`syntax${syntax.charAt(0).toUpperCase() + syntax.slice(1)}`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

let currentVersionHash = null;
let currentVersionContent = null;

function renderVersionDiff(oldContent, newContent) {
    const diffOldEl = document.getElementById('diffOldContent');
    const diffNewEl = document.getElementById('diffNewContent');
    if (!diffOldEl || !diffNewEl) return;

    // Use jsdiff library if available
    if (typeof Diff !== 'undefined') {
        const diff = Diff.diffLines(oldContent, newContent);
        let oldHtml = '';
        let newHtml = '';
        let oldLineNum = 1;
        let newLineNum = 1;

        diff.forEach(part => {
            const lines = part.value.split('\n');
            // Remove last empty line from split
            if (lines[lines.length - 1] === '') {
                lines.pop();
            }

            lines.forEach(line => {
                const escapedLine = escapeHtml(line) || ' ';
                if (part.added) {
                    // Added line - show in new panel only, empty in old panel
                    oldHtml += `<div class="diff-line empty"><span class="diff-line-number"></span><span class="diff-line-content"></span></div>`;
                    newHtml += `<div class="diff-line added"><span class="diff-line-number">${newLineNum}</span><span class="diff-line-content">${escapedLine}</span></div>`;
                    newLineNum++;
                } else if (part.removed) {
                    // Removed line - show in old panel only, empty in new panel
                    oldHtml += `<div class="diff-line removed"><span class="diff-line-number">${oldLineNum}</span><span class="diff-line-content">${escapedLine}</span></div>`;
                    newHtml += `<div class="diff-line empty"><span class="diff-line-number"></span><span class="diff-line-content"></span></div>`;
                    oldLineNum++;
                } else {
                    // Unchanged line - show in both panels
                    oldHtml += `<div class="diff-line"><span class="diff-line-number">${oldLineNum}</span><span class="diff-line-content">${escapedLine}</span></div>`;
                    newHtml += `<div class="diff-line"><span class="diff-line-number">${newLineNum}</span><span class="diff-line-content">${escapedLine}</span></div>`;
                    oldLineNum++;
                    newLineNum++;
                }
            });
        });

        diffOldEl.innerHTML = oldHtml || '<div class="diff-line">No content</div>';
        diffNewEl.innerHTML = newHtml || '<div class="diff-line">No content</div>';

        // Sync scroll between panels
        syncDiffScroll(diffOldEl, diffNewEl);
    } else {
        diffOldEl.textContent = 'Diff library not loaded';
        diffNewEl.textContent = 'Diff library not loaded';
    }
}

function syncDiffScroll(el1, el2) {
    let isSyncing = false;

    el1.addEventListener('scroll', () => {
        if (isSyncing) return;
        isSyncing = true;
        el2.scrollTop = el1.scrollTop;
        isSyncing = false;
    });

    el2.addEventListener('scroll', () => {
        if (isSyncing) return;
        isSyncing = true;
        el1.scrollTop = el2.scrollTop;
        isSyncing = false;
    });
}

function restoreVersion() {
    if (!currentVersionContent) {
        console.error('No version content to restore');
        return;
    }
    setEditorContent(currentVersionContent);
    updatePreview();
    versionModal.style.display = 'none';
    triggerAutoSave();
}

// Tree Structure Functions
function buildNoteTree(notesList) {
    const tree = {};
    const searchTerm = searchInput.value.toLowerCase();

    // Add folders from API first (so empty folders are also displayed)
    // Always show all folders unless text search filters them out
    folders.forEach(folder => {
        // For text search: hide folders that don't match the search term
        if (searchTerm && !folder.path.toLowerCase().includes(searchTerm)) {
            return;
        }

        const parts = folder.path.split('/').map(p => p.trim()).filter(p => p);
        if (parts.length === 0) return; // Skip invalid folder paths

        let current = tree;

        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = {
                    _children: {},
                    _notes: [],
                    _isFolder: true
                };
            }
            current[part]._isFolder = true;
            if (index < parts.length - 1) {
                current = current[part]._children;
            }
        });
    });

    // Filter notes by text search only (date filtering removed - handled by panel)
    const filteredNotes = notesList.filter(note => {
        // No search term - show all notes
        if (!searchTerm) return true;
        // Check title match
        return note.title.toLowerCase().includes(searchTerm);
    });

    // Build tree structure from note IDs (which include folder paths)
    filteredNotes.forEach(note => {
        // Use note.id for path structure (e.g., "folder/subfolder/note-name")
        const parts = note.id.split('/').map(p => p.trim()).filter(p => p);
        let current = tree;

        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = {
                    _children: {},
                    _notes: []
                };
            }

            if (index === parts.length - 1) {
                // This is a note - use title for display, id for identification
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
    const parentPath = path || '';
    const order = folderOrder[parentPath] || [];

    const entries = Object.entries(tree).sort((a, b) => {
        // Folders first, then notes
        const aIsFolder = a[1]._isFolder || Object.keys(a[1]._children).length > 0;
        const bIsFolder = b[1]._isFolder || Object.keys(b[1]._children).length > 0;
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;

        // If both are folders and have custom order, use it
        if (aIsFolder && bIsFolder && order.length > 0) {
            const aIdx = order.indexOf(a[0]);
            const bIdx = order.indexOf(b[0]);
            if (aIdx !== -1 && bIdx !== -1) {
                return aIdx - bIdx;
            }
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
        }

        return a[0].localeCompare(b[0]);
    });

    entries.forEach(([name, data]) => {
        const hasChildren = Object.keys(data._children).length > 0;
        const hasNotes = data._notes.length > 0;
        const isFolder = data._isFolder === true;
        const currentPath = path ? `${path}/${name}` : name;
        const isExpanded = expandedFolders[currentPath] !== false;

        // Show as folder if: is a real folder, has children, or has multiple notes
        if (isFolder || hasChildren || (hasNotes && data._notes.length > 1)) {
            // Render as folder
            const folder = document.createElement('li');
            folder.className = 'tree-folder';

            const folderHeader = document.createElement('div');
            folderHeader.className = `tree-folder-header ${isExpanded ? 'expanded' : ''}`;
            folderHeader.style.paddingLeft = `${12 + level * 16}px`;
            const folderIcon = getCustomIcon('folder', currentPath) || '📁';
            folderHeader.innerHTML = `
                <span class="tree-toggle">${isExpanded ? '&#9660;' : '&#9654;'}</span>
                <span class="tree-folder-icon">${folderIcon}</span>
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
            // If we're inside a folder (path is not empty), it's a child note
            const isChildNote = path !== '';
            renderNoteItem(data._notes[0], container, level, isChildNote);
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

    // Use title directly when folder_path is separate, otherwise extract for backward compatibility
    const displayName = note.folder_path !== undefined ? note.title : (isChild ? extractNoteName(note.title) : note.title);
    const lockIcon = note.private ? '<span class="lock-icon">&#128274;</span>' : '';
    const defaultTypeIcon = note.type === 'markdown' ? '📄' : (note.type === 'asciidoc' ? '📝' : '📃');
    const noteIcon = getCustomIcon('note', note.id) || defaultTypeIcon;
    const typeLabel = note.type === 'markdown' ? 'MD' : (note.type === 'asciidoc' ? 'ADOC' : 'TXT');
    const editBtnTitle = (typeof i18n !== 'undefined') ? i18n.t('btn.edit') : 'Edit';

    li.style.paddingLeft = `${12 + level * 16}px`;
    li.innerHTML = `
        <span class="drag-handle">&#8942;&#8942;</span>
        <span class="tree-note-icon">${noteIcon}</span>
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

        // If already editing this note with unsaved changes, ask before reloading
        if (currentNote && currentNote.id === note.id && hasUnsavedChanges) {
            const msg = i18n ? i18n.t('confirm.discardChanges') : 'You have unsaved changes. Do you want to discard them?';
            if (!confirm(msg)) {
                return; // Stay with current unsaved changes
            }
        }

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

function clearSearch() {
    searchInput.value = '';
    updateSearchClearButton();
    renderNoteTree();
}

function updateSearchClearButton() {
    const searchBox = searchInput.closest('.search-box');
    if (searchBox) {
        if (searchInput.value) {
            searchBox.classList.add('has-value');
        } else {
            searchBox.classList.remove('has-value');
        }
    }
}

// State for new note location selection
let selectedNewNoteLocation = 'root';
let selectedFolderPath = '';

function createNewNote() {
    // Show location selection modal
    showNewNoteLocationModal();
}

function showNewNoteLocationModal() {
    // Reset state
    selectedNewNoteLocation = 'root';
    selectedFolderPath = '';

    // Reset UI
    const options = newNoteLocationModal.querySelectorAll('.location-option');
    options.forEach(opt => opt.classList.remove('selected'));
    options[0].classList.add('selected'); // Select "root" by default

    folderSelectionArea.style.display = 'none';
    newFolderArea.style.display = 'none';
    newFolderInput.value = '';

    // Populate folder list
    populateFolderSelectionList();

    newNoteLocationModal.style.display = 'flex';
}

function populateFolderSelectionList() {
    folderSelectionList.innerHTML = '';

    if (folders.length === 0) {
        folderSelectionList.innerHTML = `<div style="padding: 12px; color: var(--text-muted); text-align: center;">${i18n.t('newNote.noFolders')}</div>`;
        return;
    }

    folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'folder-selection-item';
        item.dataset.path = folder.path;
        item.innerHTML = `<span>📁</span><span>${escapeHtml(folder.path)}</span>`;
        item.addEventListener('click', () => {
            folderSelectionList.querySelectorAll('.folder-selection-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedFolderPath = folder.path;
        });
        folderSelectionList.appendChild(item);
    });
}

function initNewNoteLocationModal() {
    // Option click handlers
    const options = newNoteLocationModal.querySelectorAll('.location-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedNewNoteLocation = opt.dataset.location;

            // Show/hide relevant areas
            folderSelectionArea.style.display = selectedNewNoteLocation === 'existing' ? 'block' : 'none';
            newFolderArea.style.display = selectedNewNoteLocation === 'new' ? 'block' : 'none';

            if (selectedNewNoteLocation === 'new') {
                newFolderInput.focus();
            }
        });
    });

    // Cancel button
    newNoteLocationCancel.addEventListener('click', () => {
        newNoteLocationModal.style.display = 'none';
    });

    // Confirm button
    newNoteLocationConfirm.addEventListener('click', () => {
        let folderPath = '';

        if (selectedNewNoteLocation === 'existing') {
            folderPath = selectedFolderPath;
            if (!folderPath) {
                alert(i18n.t('newNote.pleaseSelectFolder'));
                return;
            }
        } else if (selectedNewNoteLocation === 'new') {
            folderPath = newFolderInput.value.trim();
            if (!folderPath) {
                alert(i18n.t('newNote.pleaseEnterFolderName'));
                return;
            }
        }

        newNoteLocationModal.style.display = 'none';
        createNewNoteInFolder(folderPath);
    });

    // Close on backdrop click
    newNoteLocationModal.addEventListener('click', (e) => {
        if (e.target === newNoteLocationModal) {
            newNoteLocationModal.style.display = 'none';
        }
    });

    // Enter key on new folder input
    newFolderInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            newNoteLocationConfirm.click();
        }
    });
}

// Move Note Modal
let moveTargetNote = null;
let selectedMoveFolder = '';

function showMoveNoteModal(note) {
    moveTargetNote = note;
    selectedMoveFolder = '';

    // Get folder path from note.id (actual file location) rather than folder_path field
    // This ensures consistency with tree rendering which also uses note.id
    const idParts = (note.id || '').split('/');
    const noteId = idParts.pop() || '';
    const currentFolderPath = idParts.join('/');

    // Display title with UUID for clarity
    const noteTitle = note.title || noteId;
    const displayName = noteTitle !== noteId ? `${noteTitle} (${noteId})` : noteId;

    // Show note info
    moveNoteInfo.textContent = i18n.t('move.movingNote', { name: displayName }) || `Moving: ${displayName}`;

    // Populate folder list
    populateMoveFolderList(currentFolderPath);

    moveNoteModal.style.display = 'flex';
}

function populateMoveFolderList(currentFolderPath) {
    moveFolderList.innerHTML = '';

    // Reset root selection
    const rootItem = moveNoteModal.querySelector('.move-folder-item[data-path=""]');
    if (rootItem) {
        rootItem.classList.remove('selected', 'current');
        if (currentFolderPath === '') {
            rootItem.classList.add('current');
        }
    }

    // Add folders
    folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'move-folder-item';
        item.dataset.path = folder.path;

        // Mark current folder
        if (folder.path === currentFolderPath) {
            item.classList.add('current');
        }

        const icon = getCustomIcon('folder', folder.path) || '📁';
        item.innerHTML = `
            <span class="folder-icon">${icon}</span>
            <span class="folder-path">${escapeHtml(folder.path)}</span>
        `;

        item.addEventListener('click', () => {
            if (item.classList.contains('current')) return;
            selectMoveFolder(folder.path);
        });

        moveFolderList.appendChild(item);
    });

    // Also make root item clickable
    if (rootItem) {
        rootItem.onclick = () => {
            if (rootItem.classList.contains('current')) return;
            selectMoveFolder('');
        };
    }
}

function selectMoveFolder(folderPath) {
    selectedMoveFolder = folderPath;

    // Update selection UI
    moveNoteModal.querySelectorAll('.move-folder-item').forEach(item => {
        item.classList.remove('selected');
        if (item.dataset.path === folderPath) {
            item.classList.add('selected');
        }
    });
}

function initMoveNoteModal() {
    // Cancel button
    moveNoteCancel.addEventListener('click', () => {
        moveNoteModal.style.display = 'none';
        moveTargetNote = null;
    });

    // Confirm button
    moveNoteConfirm.addEventListener('click', async () => {
        if (!moveTargetNote) return;

        // Get folder path from note.id (actual file location)
        const idParts = (moveTargetNote.id || '').split('/');
        idParts.pop(); // Remove note name
        const currentFolderPath = idParts.join('/');

        // Check if a folder was selected and it's different from current
        if (selectedMoveFolder === '' && currentFolderPath === '') {
            // No change - already at root
            moveNoteModal.style.display = 'none';
            return;
        }

        if (selectedMoveFolder === currentFolderPath) {
            // No change - same folder
            moveNoteModal.style.display = 'none';
            return;
        }

        // Need to select a folder first
        if (selectedMoveFolder === '' && currentFolderPath !== '') {
            // Moving to root
        } else if (selectedMoveFolder === '') {
            alert(i18n.t('move.pleaseSelectFolder') || 'Please select a folder');
            return;
        }

        try {
            // Get full note data
            const getResponse = await fetch(`${basePath}/api/notes/${encodeNoteId(moveTargetNote.id)}`);
            if (!getResponse.ok) {
                throw new Error('Failed to get note');
            }
            const fullNote = await getResponse.json();

            // Get note name from the ID (last part of the path) - use title as display name
            const noteName = fullNote.title || moveTargetNote.id.split('/').pop() || '';

            // Update note with new folder path
            const response = await authFetch(`/api/notes/${encodeNoteId(moveTargetNote.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder_path: selectedMoveFolder,
                    title: noteName,
                    content: fullNote.content,
                    type: fullNote.type,
                    private: fullNote.private
                })
            });

            if (response.ok) {
                await loadNotes();
                showToast(i18n.t('move.moved') || 'Note moved');
            }
        } catch (error) {
            console.error('Failed to move note:', error);
            alert(i18n.t('move.failed') || 'Failed to move note');
        }

        moveNoteModal.style.display = 'none';
        moveTargetNote = null;
    });

    // Close on backdrop click
    moveNoteModal.addEventListener('click', (e) => {
        if (e.target === moveNoteModal) {
            moveNoteModal.style.display = 'none';
            moveTargetNote = null;
        }
    });
}

function createNewNoteInFolder(folderPath) {
    currentNote = null;
    currentPassword = null;
    isViewMode = false; // New notes are created in edit mode

    // Set folder path
    currentNoteFolderPath = folderPath;
    noteFolderPath.textContent = formatFolderPathForDisplay(folderPath);
    noteTitle.value = '';

    setEditorContent('');
    noteType.value = 'markdown';
    notePrivate.checked = false;
    previewContent.innerHTML = '';
    updateMarkdownToolbarVisibility();

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

function closeNote() {
    // Check for unsaved changes
    if (hasUnsavedChanges) {
        const msg = i18n ? i18n.t('confirm.unsavedChanges') : 'You have unsaved changes. Are you sure you want to close?';
        if (!confirm(msg)) {
            return;
        }
    }

    // Reset state
    currentNote = null;
    currentPassword = null;
    isViewMode = false;
    currentNoteFolderPath = '';
    noteFolderPath.textContent = '';
    noteTitle.value = '';
    setEditorContent('');
    noteType.value = 'markdown';
    notePrivate.checked = false;
    previewContent.innerHTML = '';
    currentAttachments = [];
    renderAttachments();
    hasUnsavedChanges = false;
    updateSaveStatus('');

    // Clear URL hash
    if (window.location.hash) {
        history.pushState('', document.title, window.location.pathname + window.location.search);
    }

    // Hide editor and show empty state
    hideEditor();
}

// Helper functions for folder path and title parsing
// Parses title with :>: separator into folder path (with /) and note name
function parseNoteTitle(fullTitle) {
    const folderPath = extractFolderPath(fullTitle);
    const title = extractNoteName(fullTitle);
    return { folderPath, title };
}

function getFullNoteTitle() {
    const title = noteTitle.value.trim();
    // Use :>: separator to build full title with folder path
    return buildTitleWithFolder(currentNoteFolderPath, title);
}

function setNoteTitleAndPath(fullTitle) {
    const { folderPath, title } = parseNoteTitle(fullTitle || '');
    currentNoteFolderPath = folderPath;
    noteFolderPath.textContent = formatFolderPathForDisplay(folderPath);
    noteTitle.value = title;
}

// Show note in preview-only mode (view mode)
function showPreviewOnly(note) {
    isViewMode = true;
    // Use separate folder_path field from API (with fallback to extracting from title for backward compatibility)
    currentNoteFolderPath = note.folder_path || extractFolderPath(note.title || '');
    noteFolderPath.textContent = formatFolderPathForDisplay(currentNoteFolderPath);
    noteTitle.value = note.folder_path !== undefined ? (note.title || '') : extractNoteName(note.title || '');
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

    // Scroll to top on mobile/tablet to ensure toolbar is visible
    scrollEditorToTop();
}

function showEditor(note) {
    isViewMode = false;
    // Use separate folder_path field from API (with fallback to extracting from title for backward compatibility)
    currentNoteFolderPath = note.folder_path || extractFolderPath(note.title || '');
    noteFolderPath.textContent = formatFolderPathForDisplay(currentNoteFolderPath);
    noteTitle.value = note.folder_path !== undefined ? (note.title || '') : extractNoteName(note.title || '');
    setEditorContent(note.content || '');
    noteType.value = note.type || 'markdown';
    notePrivate.checked = note.private || false;
    updateMarkdownToolbarVisibility();

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

    // Scroll to top on mobile/tablet to ensure toolbar is visible
    scrollEditorToTop();
}

function showEditorPane() {
    emptyState.style.display = 'none';
    editor.style.display = 'flex';

    // Hide date notes panel if open
    const dateNotesPanel = document.getElementById('dateNotesPanel');
    if (dateNotesPanel) {
        dateNotesPanel.style.display = 'none';
    }

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

    // Hide date notes panel if open
    const dateNotesPanel = document.getElementById('dateNotesPanel');
    if (dateNotesPanel) {
        dateNotesPanel.style.display = 'none';
    }

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

// Scroll editor container to top - fixes mobile/tablet issue where toolbar is hidden after switching to edit mode
function scrollEditorToTop() {
    // Scroll the editor element to top
    if (editor) {
        editor.scrollTop = 0;
    }

    // Also scroll the main content area
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.scrollTop = 0;
    }

    // Scroll window to top for full page scroll
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Ensure editor header is visible
    const editorHeader = document.querySelector('.editor-header');
    if (editorHeader) {
        editorHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

// Asciidoctor memory logger to suppress console warnings
let asciidoctorLogger = null;

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

            // Set up MemoryLogger to suppress console warnings
            if (asciidoctor && typeof asciidoctor.MemoryLogger !== 'undefined') {
                asciidoctorLogger = asciidoctor.MemoryLogger.create();
                asciidoctor.LoggerManager.setLogger(asciidoctorLogger);
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

// Markdown Toolbar Functions
function initMarkdownToolbar() {
    const toolbar = document.getElementById('markdownToolbar');
    if (!toolbar) return;

    // Initialize table grid selector
    initTableGridSelector();

    // Initialize code language selector
    initCodeLangSelector();

    toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('.toolbar-btn');
        if (!btn) return;

        const action = btn.dataset.action;
        if (action) {
            // Table action is handled by the grid selector
            if (action === 'table') {
                toggleTableGridSelector();
                return;
            }
            // Code block action is handled by the language selector
            if (action === 'codeblock') {
                toggleCodeLangSelector();
                return;
            }
            applyMarkdownFormat(action);
        }
    });

    // Close selectors when clicking outside
    document.addEventListener('click', (e) => {
        // Close table grid selector
        const gridSelector = document.getElementById('tableGridSelector');
        const tableBtn = document.getElementById('tableToolbarBtn');
        if (gridSelector && !gridSelector.contains(e.target) && e.target !== tableBtn) {
            gridSelector.classList.remove('visible');
        }

        // Close code language selector
        const langSelector = document.getElementById('codeLangSelector');
        const codeBtn = document.getElementById('codeblockToolbarBtn');
        if (langSelector && !langSelector.contains(e.target) && e.target !== codeBtn) {
            langSelector.classList.remove('visible');
        }
    });

    // Initial visibility
    updateMarkdownToolbarVisibility();
}

// Table Grid Selector
const TABLE_GRID_ROWS = 8;
const TABLE_GRID_COLS = 8;

function initTableGridSelector() {
    const container = document.getElementById('tableGridContainer');
    if (!container) return;

    // Create grid cells
    for (let row = 0; row < TABLE_GRID_ROWS; row++) {
        for (let col = 0; col < TABLE_GRID_COLS; col++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.row = row;
            cell.dataset.col = col;
            container.appendChild(cell);
        }
    }

    // Handle mouse events
    container.addEventListener('mouseover', handleGridMouseOver);
    container.addEventListener('mouseleave', handleGridMouseLeave);
    container.addEventListener('click', handleGridClick);
}

function toggleTableGridSelector() {
    const gridSelector = document.getElementById('tableGridSelector');
    if (!gridSelector) return;

    gridSelector.classList.toggle('visible');
    if (gridSelector.classList.contains('visible')) {
        // Reset highlighting
        updateGridHighlight(-1, -1);
    }
}

function handleGridMouseOver(e) {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    updateGridHighlight(row, col);
}

function handleGridMouseLeave() {
    updateGridHighlight(-1, -1);
}

function updateGridHighlight(targetRow, targetCol) {
    const container = document.getElementById('tableGridContainer');
    const label = document.getElementById('tableGridLabel');
    if (!container) return;

    const cells = container.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        if (row <= targetRow && col <= targetCol) {
            cell.classList.add('highlighted');
        } else {
            cell.classList.remove('highlighted');
        }
    });

    // Update label
    if (label) {
        if (targetRow >= 0 && targetCol >= 0) {
            label.textContent = `${targetCol + 1} x ${targetRow + 1}`;
        } else {
            label.textContent = '';
        }
    }
}

function handleGridClick(e) {
    const cell = e.target.closest('.grid-cell');
    if (!cell) return;

    const rows = parseInt(cell.dataset.row) + 1;
    const cols = parseInt(cell.dataset.col) + 1;

    // Generate and insert table based on note type
    const type = noteType.value;
    if (type === 'asciidoc') {
        insertAsciiDocTable(cols, rows);
    } else {
        insertMarkdownTable(cols, rows);
    }

    // Hide grid selector
    const gridSelector = document.getElementById('tableGridSelector');
    if (gridSelector) {
        gridSelector.classList.remove('visible');
    }
}

function insertMarkdownTable(cols, rows) {
    if (!cmEditor) return;

    // Generate header row
    let table = '|';
    for (let c = 0; c < cols; c++) {
        table += ` Header ${c + 1} |`;
    }
    table += '\n|';

    // Generate separator row
    for (let c = 0; c < cols; c++) {
        table += '----------|';
    }
    table += '\n';

    // Generate data rows
    for (let r = 0; r < rows; r++) {
        table += '|';
        for (let c = 0; c < cols; c++) {
            table += ` Cell ${r + 1}-${c + 1} |`;
        }
        table += '\n';
    }

    // Insert table
    cmEditor.replaceSelection(table);
    cmEditor.focus();
    triggerAutoSave();
}

function updateMarkdownToolbarVisibility() {
    const toolbar = document.getElementById('markdownToolbar');
    if (!toolbar) return;

    const type = noteType.value;
    // Show toolbar for both markdown and asciidoc
    if (type === 'markdown' || type === 'asciidoc') {
        toolbar.classList.remove('hidden');
    } else {
        toolbar.classList.add('hidden');
    }
}

// Code Language Selector
const CODE_LANGUAGES = [
    // Popular languages (first row)
    { id: 'javascript', name: 'JavaScript', popular: true },
    { id: 'typescript', name: 'TypeScript', popular: true },
    { id: 'python', name: 'Python', popular: true },
    { id: 'java', name: 'Java', popular: true },
    // Second row
    { id: 'c', name: 'C', popular: true },
    { id: 'cpp', name: 'C++', popular: true },
    { id: 'csharp', name: 'C#', popular: true },
    { id: 'go', name: 'Go', popular: true },
    // Third row
    { id: 'rust', name: 'Rust', popular: false },
    { id: 'swift', name: 'Swift', popular: false },
    { id: 'kotlin', name: 'Kotlin', popular: false },
    { id: 'php', name: 'PHP', popular: false },
    // Fourth row
    { id: 'ruby', name: 'Ruby', popular: false },
    { id: 'scala', name: 'Scala', popular: false },
    { id: 'r', name: 'R', popular: false },
    { id: 'perl', name: 'Perl', popular: false },
    // Web/Markup
    { id: 'html', name: 'HTML', popular: false },
    { id: 'css', name: 'CSS', popular: false },
    { id: 'xml', name: 'XML', popular: false },
    { id: 'json', name: 'JSON', popular: false },
    // Shell/Script
    { id: 'bash', name: 'Bash', popular: false },
    { id: 'powershell', name: 'PowerShell', popular: false },
    { id: 'sql', name: 'SQL', popular: false },
    { id: 'yaml', name: 'YAML', popular: false },
    // Other
    { id: 'markdown', name: 'Markdown', popular: false },
    { id: 'dockerfile', name: 'Dockerfile', popular: false },
    { id: 'plaintext', name: 'Plain Text', popular: false },
    { id: '', name: '(None)', popular: false }
];

function initCodeLangSelector() {
    const container = document.getElementById('codeLangContainer');
    if (!container) return;

    // Create language cells
    CODE_LANGUAGES.forEach(lang => {
        const cell = document.createElement('div');
        cell.className = 'lang-cell' + (lang.popular ? ' popular' : '');
        cell.dataset.lang = lang.id;
        cell.textContent = lang.name;
        cell.addEventListener('click', () => handleLangClick(lang.id));
        container.appendChild(cell);
    });
}

function toggleCodeLangSelector() {
    const langSelector = document.getElementById('codeLangSelector');
    if (!langSelector) return;

    // Close table grid selector if open
    const gridSelector = document.getElementById('tableGridSelector');
    if (gridSelector) {
        gridSelector.classList.remove('visible');
    }

    langSelector.classList.toggle('visible');
}

function handleLangClick(lang) {
    if (!cmEditor) return;

    const selectedText = cmEditor.getSelection();
    const type = noteType.value;
    let replacement;

    if (type === 'asciidoc') {
        // AsciiDoc format: [source,lang]\n----\ncode\n----
        const sourceAttr = lang ? `[source,${lang}]` : '[source]';
        if (selectedText) {
            replacement = `${sourceAttr}\n----\n${selectedText}\n----`;
        } else {
            replacement = `${sourceAttr}\n----\ncode\n----`;
        }
    } else {
        // Markdown format: ```lang\ncode\n```
        if (selectedText) {
            replacement = '```' + lang + '\n' + selectedText + '\n```';
        } else {
            replacement = '```' + lang + '\ncode\n```';
        }
    }

    cmEditor.replaceSelection(replacement);

    // Position cursor inside the code block if no text was selected
    if (!selectedText) {
        const cursor = cmEditor.getCursor();
        cmEditor.setSelection(
            { line: cursor.line - 1, ch: 0 },
            { line: cursor.line - 1, ch: 4 }
        );
    }

    cmEditor.focus();
    triggerAutoSave();

    // Hide language selector
    const langSelector = document.getElementById('codeLangSelector');
    if (langSelector) {
        langSelector.classList.remove('visible');
    }
}

function applyMarkdownFormat(action) {
    if (!cmEditor) return;

    const type = noteType.value;

    // Use AsciiDoc formatting if note type is asciidoc
    if (type === 'asciidoc') {
        applyAsciiDocFormat(action);
        return;
    }

    const selectedText = cmEditor.getSelection();
    let replacement = '';
    let selectStart = 0;
    let selectEnd = 0;

    switch (action) {
        case 'bold':
            if (selectedText) {
                replacement = `**${selectedText}**`;
            } else {
                replacement = '**bold**';
                selectStart = 2;
                selectEnd = 6;
            }
            break;
        case 'italic':
            if (selectedText) {
                replacement = `*${selectedText}*`;
            } else {
                replacement = '*italic*';
                selectStart = 1;
                selectEnd = 7;
            }
            break;
        case 'strikethrough':
            if (selectedText) {
                replacement = `~~${selectedText}~~`;
            } else {
                replacement = '~~strikethrough~~';
                selectStart = 2;
                selectEnd = 15;
            }
            break;
        case 'code':
            if (selectedText) {
                replacement = `\`${selectedText}\``;
            } else {
                replacement = '`code`';
                selectStart = 1;
                selectEnd = 5;
            }
            break;
        case 'h1':
            replacement = selectedText ? `# ${selectedText}` : '# Heading 1';
            if (!selectedText) { selectStart = 2; selectEnd = 11; }
            break;
        case 'h2':
            replacement = selectedText ? `## ${selectedText}` : '## Heading 2';
            if (!selectedText) { selectStart = 3; selectEnd = 12; }
            break;
        case 'h3':
            replacement = selectedText ? `### ${selectedText}` : '### Heading 3';
            if (!selectedText) { selectStart = 4; selectEnd = 13; }
            break;
        case 'link':
            if (selectedText) {
                replacement = `[${selectedText}](url)`;
                selectStart = selectedText.length + 3;
                selectEnd = selectedText.length + 6;
            } else {
                replacement = '[link text](url)';
                selectStart = 1;
                selectEnd = 10;
            }
            break;
        case 'image':
            if (selectedText) {
                replacement = `![${selectedText}](url)`;
                selectStart = selectedText.length + 4;
                selectEnd = selectedText.length + 7;
            } else {
                replacement = '![alt text](url)';
                selectStart = 2;
                selectEnd = 10;
            }
            break;
        case 'quote':
            if (selectedText) {
                replacement = selectedText.split('\n').map(line => `> ${line}`).join('\n');
            } else {
                replacement = '> quote';
                selectStart = 2;
                selectEnd = 7;
            }
            break;
        case 'ul':
            if (selectedText) {
                replacement = selectedText.split('\n').map(line => `- ${line}`).join('\n');
            } else {
                replacement = '- list item';
                selectStart = 2;
                selectEnd = 11;
            }
            break;
        case 'ol':
            if (selectedText) {
                replacement = selectedText.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');
            } else {
                replacement = '1. list item';
                selectStart = 3;
                selectEnd = 12;
            }
            break;
        case 'tasklist':
            if (selectedText) {
                replacement = selectedText.split('\n').map(line => `- [ ] ${line}`).join('\n');
            } else {
                replacement = '- [ ] task item';
                selectStart = 6;
                selectEnd = 15;
            }
            break;
        case 'codeblock':
            if (selectedText) {
                replacement = `\`\`\`\n${selectedText}\n\`\`\``;
            } else {
                replacement = '```\ncode\n```';
                selectStart = 4;
                selectEnd = 8;
            }
            break;
        // Note: 'table' is handled by the grid selector in initMarkdownToolbar
        case 'hr':
            replacement = '\n---\n';
            break;
        default:
            return;
    }

    // Get cursor position before replacement
    const cursor = cmEditor.getCursor();

    // Replace selection
    cmEditor.replaceSelection(replacement);

    // Select placeholder text if no text was selected
    if (!selectedText && selectEnd > selectStart) {
        const newCursor = cmEditor.getCursor();
        const line = newCursor.line;
        const ch = newCursor.ch - replacement.length + selectStart;
        cmEditor.setSelection(
            { line: line, ch: ch },
            { line: line, ch: ch + (selectEnd - selectStart) }
        );
    }

    cmEditor.focus();
    triggerAutoSave();
}

// AsciiDoc formatting function
function applyAsciiDocFormat(action) {
    if (!cmEditor) return;

    const selectedText = cmEditor.getSelection();
    let replacement = '';
    let selectStart = 0;
    let selectEnd = 0;

    switch (action) {
        case 'bold':
            if (selectedText) {
                replacement = `*${selectedText}*`;
            } else {
                replacement = '*bold*';
                selectStart = 1;
                selectEnd = 5;
            }
            break;
        case 'italic':
            if (selectedText) {
                replacement = `_${selectedText}_`;
            } else {
                replacement = '_italic_';
                selectStart = 1;
                selectEnd = 7;
            }
            break;
        case 'strikethrough':
            // AsciiDoc uses [line-through]#text# for strikethrough
            if (selectedText) {
                replacement = `[line-through]#${selectedText}#`;
            } else {
                replacement = '[line-through]#strikethrough#';
                selectStart = 15;
                selectEnd = 28;
            }
            break;
        case 'code':
            if (selectedText) {
                replacement = `\`${selectedText}\``;
            } else {
                replacement = '`code`';
                selectStart = 1;
                selectEnd = 5;
            }
            break;
        case 'h1':
            replacement = selectedText ? `= ${selectedText}` : '= Heading 1';
            if (!selectedText) { selectStart = 2; selectEnd = 11; }
            break;
        case 'h2':
            replacement = selectedText ? `== ${selectedText}` : '== Heading 2';
            if (!selectedText) { selectStart = 3; selectEnd = 12; }
            break;
        case 'h3':
            replacement = selectedText ? `=== ${selectedText}` : '=== Heading 3';
            if (!selectedText) { selectStart = 4; selectEnd = 13; }
            break;
        case 'link':
            if (selectedText) {
                replacement = `link:url[${selectedText}]`;
                selectStart = 5;
                selectEnd = 8;
            } else {
                replacement = 'link:url[link text]';
                selectStart = 5;
                selectEnd = 8;
            }
            break;
        case 'image':
            if (selectedText) {
                replacement = `image::url[${selectedText}]`;
                selectStart = 7;
                selectEnd = 10;
            } else {
                replacement = 'image::url[alt text]';
                selectStart = 7;
                selectEnd = 10;
            }
            break;
        case 'quote':
            if (selectedText) {
                replacement = `[quote]\n____\n${selectedText}\n____`;
            } else {
                replacement = '[quote]\n____\nquote text\n____';
                selectStart = 15;
                selectEnd = 25;
            }
            break;
        case 'ul':
            if (selectedText) {
                replacement = selectedText.split('\n').map(line => `* ${line}`).join('\n');
            } else {
                replacement = '* list item';
                selectStart = 2;
                selectEnd = 11;
            }
            break;
        case 'ol':
            if (selectedText) {
                replacement = selectedText.split('\n').map(line => `. ${line}`).join('\n');
            } else {
                replacement = '. list item';
                selectStart = 2;
                selectEnd = 11;
            }
            break;
        case 'tasklist':
            if (selectedText) {
                replacement = selectedText.split('\n').map(line => `* [ ] ${line}`).join('\n');
            } else {
                replacement = '* [ ] task item';
                selectStart = 6;
                selectEnd = 15;
            }
            break;
        case 'codeblock':
            if (selectedText) {
                replacement = `[source]\n----\n${selectedText}\n----`;
            } else {
                replacement = '[source]\n----\ncode\n----';
                selectStart = 15;
                selectEnd = 19;
            }
            break;
        case 'hr':
            replacement = "\n'''\n";
            break;
        default:
            return;
    }

    // Replace selection
    cmEditor.replaceSelection(replacement);

    // Select placeholder text if no text was selected
    if (!selectedText && selectEnd > selectStart) {
        const newCursor = cmEditor.getCursor();
        const line = newCursor.line;
        const ch = newCursor.ch - replacement.length + selectStart;
        cmEditor.setSelection(
            { line: line, ch: ch },
            { line: line, ch: ch + (selectEnd - selectStart) }
        );
    }

    cmEditor.focus();
    triggerAutoSave();
}

// AsciiDoc table insertion (simple version without merging)
function insertAsciiDocTable(cols, rows) {
    if (!cmEditor) return;

    // Open table editor for AsciiDoc
    openTableEditor(cols, rows);
}

// ==================== AsciiDoc Table Editor ====================

const tableEditor = {
    cols: 0,
    rows: 0,
    cells: [], // 2D array of cell data
    selectedCells: [], // Array of {row, col} for selected cells
    isSelecting: false,
    selectionStart: null
};

function openTableEditor(cols, rows) {
    tableEditor.cols = cols;
    tableEditor.rows = rows;
    tableEditor.selectedCells = [];
    tableEditor.isSelecting = false;

    // Initialize cells data (row 0 is header)
    tableEditor.cells = [];
    for (let r = 0; r <= rows; r++) {
        tableEditor.cells[r] = [];
        for (let c = 0; c < cols; c++) {
            tableEditor.cells[r][c] = {
                content: r === 0 ? `Header ${c + 1}` : `Cell ${r}-${c + 1}`,
                colspan: 1,
                rowspan: 1,
                hidden: false,
                mergeParent: null // {row, col} of the cell this is merged into
            };
        }
    }

    renderTableEditor();

    const modal = document.getElementById('tableEditorModal');
    if (modal) {
        modal.classList.add('visible');
        // Apply i18n to modal
        if (typeof i18n !== 'undefined') {
            i18n.updateUI();
        }
    }

    updateTableEditorInfo();
    initTableEditorEvents();
}

function closeTableEditor() {
    const modal = document.getElementById('tableEditorModal');
    if (modal) {
        modal.classList.remove('visible');
    }
    tableEditor.selectedCells = [];
}

function renderTableEditor() {
    const table = document.getElementById('tableEditorTable');
    if (!table) return;

    table.innerHTML = '';

    for (let r = 0; r <= tableEditor.rows; r++) {
        const tr = document.createElement('tr');

        for (let c = 0; c < tableEditor.cols; c++) {
            const cellData = tableEditor.cells[r][c];

            if (cellData.hidden) continue;

            const td = document.createElement('td');
            td.dataset.row = r;
            td.dataset.col = c;

            if (cellData.colspan > 1) td.colSpan = cellData.colspan;
            if (cellData.rowspan > 1) td.rowSpan = cellData.rowspan;

            if (r === 0) {
                td.classList.add('header-cell');
            }

            if (cellData.colspan > 1 || cellData.rowspan > 1) {
                td.classList.add('merged');
            }

            // Create editable content
            const input = document.createElement('input');
            input.type = 'text';
            input.value = cellData.content;
            input.addEventListener('input', (e) => {
                cellData.content = e.target.value;
            });
            input.addEventListener('click', (e) => e.stopPropagation());

            td.appendChild(input);
            tr.appendChild(td);
        }

        table.appendChild(tr);
    }
}

function initTableEditorEvents() {
    const table = document.getElementById('tableEditorTable');
    const modal = document.getElementById('tableEditorModal');
    const closeBtn = document.getElementById('tableEditorClose');
    const cancelBtn = document.getElementById('tableEditorCancel');
    const mergeBtn = document.getElementById('tableEditorMerge');
    const unmergeBtn = document.getElementById('tableEditorUnmerge');
    const insertBtn = document.getElementById('tableEditorInsert');

    // Remove old listeners by cloning
    if (table) {
        const newTable = table.cloneNode(true);
        table.parentNode.replaceChild(newTable, table);

        newTable.addEventListener('mousedown', handleTableMouseDown);
        newTable.addEventListener('mouseover', handleTableMouseOver);
        newTable.addEventListener('mouseup', handleTableMouseUp);
        newTable.addEventListener('dblclick', handleTableDblClick);

        // Re-add input listeners
        newTable.querySelectorAll('input').forEach(input => {
            const td = input.parentElement;
            const row = parseInt(td.dataset.row);
            const col = parseInt(td.dataset.col);
            input.addEventListener('input', (e) => {
                tableEditor.cells[row][col].content = e.target.value;
            });
            input.addEventListener('click', (e) => e.stopPropagation());
        });
    }

    if (closeBtn) {
        closeBtn.onclick = closeTableEditor;
    }

    if (cancelBtn) {
        cancelBtn.onclick = closeTableEditor;
    }

    if (mergeBtn) {
        mergeBtn.onclick = mergeCells;
    }

    if (unmergeBtn) {
        unmergeBtn.onclick = unmergeCells;
    }

    if (insertBtn) {
        insertBtn.onclick = insertTableFromEditor;
    }

    // Close on background click
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeTableEditor();
            }
        };

        // Handle mouseup outside table to end selection
        modal.addEventListener('mouseup', handleTableMouseUp);
    }
}

function handleTableMouseDown(e) {
    const td = e.target.closest('td');
    if (!td) return;

    // Prevent default to avoid input focus on single click
    e.preventDefault();

    // If clicking on input that's already focused (editing mode), allow it
    if (e.target.tagName === 'INPUT' && document.activeElement === e.target) {
        return;
    }

    tableEditor.isSelecting = true;
    tableEditor.selectionStart = {
        row: parseInt(td.dataset.row),
        col: parseInt(td.dataset.col)
    };

    // Clear previous selection
    tableEditor.selectedCells = [{ ...tableEditor.selectionStart }];
    updateCellSelection();
}

function handleTableMouseOver(e) {
    if (!tableEditor.isSelecting) return;

    const td = e.target.closest('td');
    if (!td) return;

    const endRow = parseInt(td.dataset.row);
    const endCol = parseInt(td.dataset.col);
    const startRow = tableEditor.selectionStart.row;
    const startCol = tableEditor.selectionStart.col;

    // Calculate selection rectangle
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    // Select all cells in rectangle
    tableEditor.selectedCells = [];
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            if (!tableEditor.cells[r][c].hidden) {
                tableEditor.selectedCells.push({ row: r, col: c });
            }
        }
    }

    updateCellSelection();
}

function handleTableMouseUp() {
    tableEditor.isSelecting = false;
    updateTableEditorInfo();
}

function handleTableDblClick(e) {
    const td = e.target.closest('td');
    if (!td) return;

    // Find and focus the input in this cell
    const input = td.querySelector('input');
    if (input) {
        input.focus();
        input.select();
    }
}

function updateCellSelection() {
    const table = document.getElementById('tableEditorTable');
    if (!table) return;

    // Remove all selection classes
    table.querySelectorAll('td').forEach(td => {
        td.classList.remove('selected');
    });

    // Add selection class to selected cells
    tableEditor.selectedCells.forEach(({ row, col }) => {
        const td = table.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        if (td) {
            td.classList.add('selected');
        }
    });

    updateTableEditorInfo();
}

function updateTableEditorInfo() {
    const sizeEl = document.getElementById('tableEditorSize');
    const selectionEl = document.getElementById('tableEditorSelection');
    const mergeBtn = document.getElementById('tableEditorMerge');
    const unmergeBtn = document.getElementById('tableEditorUnmerge');

    if (sizeEl) {
        sizeEl.textContent = `Size: ${tableEditor.cols} x ${tableEditor.rows + 1}`;
    }

    if (selectionEl) {
        selectionEl.textContent = `Selected: ${tableEditor.selectedCells.length} cells`;
    }

    // Enable/disable merge button
    const canMerge = tableEditor.selectedCells.length > 1 && isSelectionRectangle();
    if (mergeBtn) {
        mergeBtn.disabled = !canMerge;
    }

    // Enable/disable unmerge button
    const canUnmerge = tableEditor.selectedCells.length === 1 &&
        tableEditor.selectedCells[0] &&
        (tableEditor.cells[tableEditor.selectedCells[0].row][tableEditor.selectedCells[0].col].colspan > 1 ||
         tableEditor.cells[tableEditor.selectedCells[0].row][tableEditor.selectedCells[0].col].rowspan > 1);
    if (unmergeBtn) {
        unmergeBtn.disabled = !canUnmerge;
    }
}

function isSelectionRectangle() {
    if (tableEditor.selectedCells.length < 2) return false;

    // Get bounds
    const rows = tableEditor.selectedCells.map(c => c.row);
    const cols = tableEditor.selectedCells.map(c => c.col);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);

    // Check if all cells in the rectangle are selected and none are already part of a merge
    const expectedCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);

    // Count visible cells in rectangle
    let visibleCount = 0;
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            if (!tableEditor.cells[r][c].hidden) {
                visibleCount++;
            }
        }
    }

    return tableEditor.selectedCells.length === visibleCount;
}

function mergeCells() {
    if (tableEditor.selectedCells.length < 2) return;

    // Get bounds
    const rows = tableEditor.selectedCells.map(c => c.row);
    const cols = tableEditor.selectedCells.map(c => c.col);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);

    // Check for existing merged cells - unmerge them first
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            const cell = tableEditor.cells[r][c];
            if (cell.colspan > 1 || cell.rowspan > 1) {
                // Unmerge this cell first
                unmergeCell(r, c);
            }
        }
    }

    // Set the top-left cell as the merged cell
    const mergedCell = tableEditor.cells[minRow][minCol];
    mergedCell.colspan = maxCol - minCol + 1;
    mergedCell.rowspan = maxRow - minRow + 1;
    mergedCell.hidden = false;

    // Hide all other cells in the merge
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            if (r !== minRow || c !== minCol) {
                tableEditor.cells[r][c].hidden = true;
                tableEditor.cells[r][c].mergeParent = { row: minRow, col: minCol };
            }
        }
    }

    tableEditor.selectedCells = [{ row: minRow, col: minCol }];
    renderTableEditor();
    initTableEditorEvents();
    updateTableEditorInfo();
}

function unmergeCells() {
    if (tableEditor.selectedCells.length !== 1) return;

    const { row, col } = tableEditor.selectedCells[0];
    unmergeCell(row, col);

    renderTableEditor();
    initTableEditorEvents();
    updateTableEditorInfo();
}

function unmergeCell(row, col) {
    const cell = tableEditor.cells[row][col];
    if (cell.colspan <= 1 && cell.rowspan <= 1) return;

    const colspan = cell.colspan;
    const rowspan = cell.rowspan;

    // Unhide all cells
    for (let r = row; r < row + rowspan; r++) {
        for (let c = col; c < col + colspan; c++) {
            tableEditor.cells[r][c].hidden = false;
            tableEditor.cells[r][c].mergeParent = null;
            tableEditor.cells[r][c].colspan = 1;
            tableEditor.cells[r][c].rowspan = 1;
            if (r !== row || c !== col) {
                tableEditor.cells[r][c].content = `Cell ${r}-${c + 1}`;
            }
        }
    }
}

function insertTableFromEditor() {
    if (!cmEditor) return;

    // Generate AsciiDoc table with spans
    let table = '[cols="';
    for (let c = 0; c < tableEditor.cols; c++) {
        table += '1';
        if (c < tableEditor.cols - 1) table += ',';
    }
    table += '"]\n|===\n';

    // Generate rows
    for (let r = 0; r <= tableEditor.rows; r++) {
        for (let c = 0; c < tableEditor.cols; c++) {
            const cell = tableEditor.cells[r][c];

            if (cell.hidden) continue;

            // Build span prefix
            let prefix = '';
            if (cell.colspan > 1 && cell.rowspan > 1) {
                prefix = `${cell.colspan}.${cell.rowspan}+`;
            } else if (cell.colspan > 1) {
                prefix = `${cell.colspan}+`;
            } else if (cell.rowspan > 1) {
                prefix = `.${cell.rowspan}+`;
            }

            table += `${prefix}| ${cell.content} `;
        }
        table += '\n';

        // Add empty line after header row
        if (r === 0) {
            table += '\n';
        }
    }

    table += '|===\n';

    // Insert table
    cmEditor.replaceSelection(table);
    cmEditor.focus();
    triggerAutoSave();

    closeTableEditor();
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
                // Open links in new tab
                previewContent.querySelectorAll('a[href]').forEach((link) => {
                    link.setAttribute('target', '_blank');
                    link.setAttribute('rel', 'noopener noreferrer');
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

    // Render LaTeX math with KaTeX
    renderMathInPreview();

    // Update popout preview if open
    updatePopoutPreview();
}

// Render LaTeX math expressions using KaTeX
function renderMathInPreview() {
    if (typeof renderMathInElement !== 'undefined') {
        try {
            renderMathInElement(previewContent, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false,
                errorColor: '#cc0000',
                strict: false
            });
        } catch (e) {
            console.error('KaTeX rendering error:', e);
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
        alert(i18n.t('password.required'));
        return;
    }

    if (password !== confirm) {
        alert(i18n.t('password.mismatch'));
        return;
    }

    pendingPassword = password;
    setPasswordModal.style.display = 'none';
    setPasswordInput.value = '';
    confirmPasswordInput.value = '';

    // Auto-save after setting password
    saveNote();
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
// Automatically prepends basePath for relative API paths
async function authFetch(url, options = {}) {
    // Auto-prepend basePath for relative paths starting with /api
    const fullUrl = url.startsWith('/api') ? basePath + url : url;
    const response = await fetch(fullUrl, options);

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
        const response = await authFetch(basePath + '/api/admin/users');
        if (!response.ok) throw new Error('Failed to load users');

        const users = await response.json();

        usersList.innerHTML = users.map(user => `
            <div class="user-item-wrapper" data-user-id="${user.id}">
                <div class="user-item">
                    <div class="user-item-info">
                        <div class="user-item-avatar">&#128100;</div>
                        <div class="user-item-details">
                            <span class="user-item-name">
                                ${escapeHtml(user.username)}
                                ${user.is_admin ? `<span class="user-item-badge">${i18n.t('admin.admin')}</span>` : ''}
                            </span>
                            <span class="user-item-meta">${i18n.t('admin.created')}: ${new Date(user.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="user-item-actions">
                        <button class="btn-icon-sm" title="${i18n.t('admin.changePassword')}" onclick="togglePasswordForm(${user.id}, 'admin')">
                            &#128273;
                        </button>
                        <button class="btn-icon-sm btn-danger" title="${i18n.t('admin.deleteUser')}" onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')">
                            &#128465;
                        </button>
                    </div>
                </div>
                <div class="user-password-form" id="passwordForm-admin-${user.id}" style="display: none;">
                    <div class="password-form-row">
                        <input type="password" id="newPassword-admin-${user.id}" placeholder="${i18n.t('admin.newPassword')}" class="password-input">
                    </div>
                    <div class="password-form-row">
                        <input type="password" id="confirmPassword-admin-${user.id}" placeholder="${i18n.t('admin.retypePassword')}" class="password-input">
                    </div>
                    <div class="password-form-row password-form-actions">
                        <button class="btn-sm btn-primary" onclick="submitPasswordChange(${user.id}, 'admin')">${i18n.t('common.save')}</button>
                        <button class="btn-sm" onclick="togglePasswordForm(${user.id}, 'admin')">${i18n.t('common.cancel')}</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading users:', err);
        usersList.innerHTML = `<div class="user-item">${i18n.t('admin.failedToLoadUsers')}</div>`;
    }
}

async function deleteUser(userId, username) {
    if (!confirm(i18n.t('admin.confirmDeleteUser', { username }))) {
        return;
    }

    try {
        const response = await authFetch(`${basePath}/api/admin/users/${userId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            alert(data.error || i18n.t('admin.failedToDeleteUser'));
            return;
        }

        await loadUsersList();
        await loadSettingsUsersList();
    } catch (err) {
        console.error('Error deleting user:', err);
        alert(i18n.t('admin.failedToDeleteUser'));
    }
}

function togglePasswordForm(userId, context = 'admin') {
    const form = document.getElementById(`passwordForm-${context}-${userId}`);
    if (!form) return;

    const isVisible = form.style.display !== 'none';

    // Hide all other password forms first
    document.querySelectorAll('.user-password-form').forEach(f => {
        f.style.display = 'none';
    });

    if (!isVisible) {
        form.style.display = 'block';
        // Clear inputs
        const newPwdInput = document.getElementById(`newPassword-${context}-${userId}`);
        const confirmPwdInput = document.getElementById(`confirmPassword-${context}-${userId}`);
        if (newPwdInput) newPwdInput.value = '';
        if (confirmPwdInput) confirmPwdInput.value = '';
        if (newPwdInput) newPwdInput.focus();
    }
}

async function submitPasswordChange(userId, context = 'admin') {
    const newPasswordInput = document.getElementById(`newPassword-${context}-${userId}`);
    const confirmPasswordInput = document.getElementById(`confirmPassword-${context}-${userId}`);

    if (!newPasswordInput || !confirmPasswordInput) return;

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!newPassword) {
        alert(i18n.t('admin.enterNewPassword'));
        newPasswordInput.focus();
        return;
    }

    if (newPassword.length < 6) {
        alert(i18n.t('admin.passwordMinLength'));
        newPasswordInput.focus();
        return;
    }

    if (newPassword !== confirmPassword) {
        alert(i18n.t('admin.passwordMismatch'));
        confirmPasswordInput.focus();
        return;
    }

    try {
        const response = await authFetch(`${basePath}/api/admin/users/${userId}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });

        if (!response.ok) {
            const data = await response.json();
            alert(data.error || i18n.t('admin.failedToUpdatePassword'));
            return;
        }

        alert(i18n.t('admin.passwordUpdated'));
        togglePasswordForm(userId, context);
    } catch (err) {
        console.error('Error updating password:', err);
        alert(i18n.t('admin.failedToUpdatePassword'));
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
            alert(i18n.t('admin.fillRequiredFields'));
            return;
        }

        try {
            const response = await authFetch(basePath + '/api/admin/users', {
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
                alert(data.error || i18n.t('admin.failedToCreateUser'));
                return;
            }

            addUserModal.style.display = 'none';
            await loadUsersList();
            await loadSettingsUsersList();
        } catch (err) {
            console.error('Error creating user:', err);
            alert(i18n.t('admin.failedToCreateUser'));
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
    initSyntaxHelpModal();
    initNewNoteLocationModal();
    initMoveNoteModal();

    // Ensure i18n is applied after modal initialization
    if (typeof i18n !== 'undefined') {
        i18n.updateUI();
    }
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

    // Shared links management
    initSharedLinksSettings();
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
            } else if (tabName === 'links') {
                loadSharedLinks();
            } else if (tabName === 'stats') {
                loadUsageStats();
            } else if (tabName === 'about') {
                loadAboutInfo();
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
    const fontSizeSelect = document.getElementById('settingsFontSize');

    if (themeSelect) {
        themeSelect.addEventListener('change', () => {
            setTheme(themeSelect.value);
        });
    }

    if (defaultTypeSelect) {
        defaultTypeSelect.addEventListener('change', () => {
            localStorage.setItem('defaultNoteType', defaultTypeSelect.value);
        });
    }

    if (autoSaveToggle) {
        autoSaveToggle.addEventListener('change', () => {
            autoSaveEnabled = autoSaveToggle.checked;
            localStorage.setItem('autoSaveEnabled', autoSaveEnabled);
            // Sync with editor checkbox
            const editorAutoSave = document.getElementById('autoSaveEnabled');
            if (editorAutoSave) {
                editorAutoSave.checked = autoSaveEnabled;
            }
        });
    }

    if (lineNumbersToggle) {
        lineNumbersToggle.addEventListener('change', () => {
            localStorage.setItem('lineNumbersEnabled', lineNumbersToggle.checked);
            applyLineNumbersSetting(lineNumbersToggle.checked);
        });
    }

    if (fontSizeSelect) {
        fontSizeSelect.addEventListener('change', () => {
            const fontSize = fontSizeSelect.value;
            localStorage.setItem('editorFontSize', fontSize);
            applyFontSize(fontSize);
        });
    }
}

function applyLineNumbersSetting(enabled) {
    if (cmEditor) {
        cmEditor.setOption('lineNumbers', enabled);
    }
}

function applyFontSize(size) {
    const fontSize = size + 'px';

    // Apply to CodeMirror editor
    const cmWrapper = document.querySelector('.CodeMirror');
    if (cmWrapper) {
        cmWrapper.style.fontSize = fontSize;
    }

    // Apply to preview pane
    const previewContent = document.getElementById('previewContent');
    if (previewContent) {
        previewContent.style.fontSize = fontSize;
    }

    // Refresh CodeMirror to recalculate line heights
    if (cmEditor) {
        cmEditor.refresh();
    }
}

function initFontSize() {
    const savedFontSize = localStorage.getItem('editorFontSize') || '14';
    applyFontSize(savedFontSize);
}

function loadGeneralSettings() {
    const themeSelect = document.getElementById('settingsTheme');
    const defaultTypeSelect = document.getElementById('settingsDefaultType');
    const autoSaveToggle = document.getElementById('settingsAutoSave');
    const lineNumbersToggle = document.getElementById('settingsLineNumbers');
    const fontSizeSelect = document.getElementById('settingsFontSize');

    if (themeSelect) {
        themeSelect.value = localStorage.getItem('theme') || 'light';
    }

    if (defaultTypeSelect) {
        defaultTypeSelect.value = localStorage.getItem('defaultNoteType') || 'markdown';
    }

    if (autoSaveToggle) {
        autoSaveToggle.checked = autoSaveEnabled; // Use global variable (default: false)
    }

    if (lineNumbersToggle) {
        const lineNumbersEnabled = localStorage.getItem('lineNumbersEnabled');
        lineNumbersToggle.checked = lineNumbersEnabled !== 'false'; // Default to true
        applyLineNumbersSetting(lineNumbersToggle.checked);
    }

    if (fontSizeSelect) {
        const savedFontSize = localStorage.getItem('editorFontSize') || '14';
        fontSizeSelect.value = savedFontSize;
        applyFontSize(savedFontSize);
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

    usersList.innerHTML = `<div class="loading-spinner">${i18n.t('common.loading')}</div>`;

    try {
        const response = await authFetch(basePath + '/api/admin/users');
        if (!response.ok) throw new Error('Failed to load users');

        const users = await response.json();

        usersList.innerHTML = users.map(user => `
            <div class="user-item-wrapper" data-user-id="${user.id}">
                <div class="user-item">
                    <div class="user-item-info">
                        <div class="user-item-avatar">&#128100;</div>
                        <div class="user-item-details">
                            <span class="user-item-name">
                                ${escapeHtml(user.username)}
                                ${user.is_admin ? `<span class="user-item-badge">${i18n.t('admin.admin')}</span>` : ''}
                            </span>
                            <span class="user-item-meta">${i18n.t('admin.created')}: ${new Date(user.created_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="user-item-actions">
                        <button class="btn-icon-sm" title="${i18n.t('admin.changePassword')}" onclick="togglePasswordForm(${user.id}, 'settings')">
                            &#128273;
                        </button>
                        <button class="btn-icon-sm btn-danger" title="${i18n.t('admin.deleteUser')}" onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')">
                            &#128465;
                        </button>
                    </div>
                </div>
                <div class="user-password-form" id="passwordForm-settings-${user.id}" style="display: none;">
                    <div class="password-form-row">
                        <input type="password" id="newPassword-settings-${user.id}" placeholder="${i18n.t('admin.newPassword')}" class="password-input">
                    </div>
                    <div class="password-form-row">
                        <input type="password" id="confirmPassword-settings-${user.id}" placeholder="${i18n.t('admin.retypePassword')}" class="password-input">
                    </div>
                    <div class="password-form-row password-form-actions">
                        <button class="btn-sm btn-primary" onclick="submitPasswordChange(${user.id}, 'settings')">${i18n.t('common.save')}</button>
                        <button class="btn-sm" onclick="togglePasswordForm(${user.id}, 'settings')">${i18n.t('common.cancel')}</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading users:', err);
        usersList.innerHTML = `<div class="error-message">${i18n.t('admin.failedToLoadUsers')}</div>`;
    }
}

// Shared Links Management
function initSharedLinksSettings() {
    const deleteAllBtn = document.getElementById('deleteAllSharedLinksBtn');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', deleteAllSharedLinks);
    }
}

async function loadSharedLinks() {
    const linksList = document.getElementById('sharedLinksList');
    const emptyState = document.getElementById('sharedLinksEmpty');
    const deleteAllBtn = document.getElementById('deleteAllSharedLinksBtn');
    if (!linksList) return;

    linksList.innerHTML = '<div class="loading-spinner">Loading...</div>';
    if (emptyState) emptyState.style.display = 'none';
    if (deleteAllBtn) deleteAllBtn.style.display = 'none';

    try {
        const response = await fetch(basePath + '/api/shortlinks');
        if (!response.ok) throw new Error('Failed to load shared links');

        const links = await response.json();

        if (!links || links.length === 0) {
            linksList.innerHTML = '';
            if (emptyState) emptyState.style.display = 'flex';
            if (deleteAllBtn) deleteAllBtn.style.display = 'none';
            return;
        }

        // Show delete all button when there are links
        if (deleteAllBtn) deleteAllBtn.style.display = 'inline-flex';

        // Get note titles from notes list
        const noteTitles = {};
        notes.forEach(note => {
            noteTitles[note.id] = note.title;
        });

        linksList.innerHTML = links.map(link => {
            const noteTitle = noteTitles[link.note_id] || link.note_id;
            const expiryInfo = formatExpiryInfo(link.expires_at);
            const createdDate = formatDateYMD(new Date(link.created_at));
            const expiryDateValue = link.expires_at ? formatDateISO(new Date(link.expires_at)) : '';

            return `
                <div class="shared-link-item" data-code="${escapeHtml(link.code)}">
                    <div class="shared-link-info">
                        <span class="shared-link-title">${escapeHtml(noteTitle)}</span>
                        <span class="shared-link-url" onclick="copyToClipboard('${escapeHtml(link.short_link)}')" title="${i18n.t('settings.clickToCopy') || 'Click to copy'}">${escapeHtml(link.short_link)}</span>
                        <div class="shared-link-meta">
                            <span>${i18n.t('settings.created') || 'Created'}: ${createdDate}</span>
                            <span class="shared-link-expiry ${expiryInfo.class}">
                                ${expiryInfo.icon} ${expiryInfo.text}
                            </span>
                        </div>
                    </div>
                    <div class="shared-link-actions">
                        <div class="expiry-date-wrapper" onclick="this.querySelector('input').showPicker()">
                            <span class="expiry-date-display">${expiryDateValue ? formatDateYMD(new Date(link.expires_at)) : '----/--/--'}</span>
                            <input type="date" class="expiry-date-input" value="${expiryDateValue}"
                                onchange="updateSharedLinkExpiryDate('${escapeHtml(link.code)}', this.value)"
                                title="${i18n.t('settings.selectExpiryDate') || 'Select expiry date'}">
                        </div>
                        <button class="btn-icon-sm" title="${i18n.t('settings.neverExpires') || 'Never expires'}" onclick="updateSharedLinkExpiry('${escapeHtml(link.code)}', 0)">
                            &#8734;
                        </button>
                        <button class="btn-icon-sm btn-danger" title="${i18n.t('settings.delete') || 'Delete'}" onclick="deleteSharedLink('${escapeHtml(link.code)}')">
                            &#128465;
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading shared links:', err);
        linksList.innerHTML = '<div class="error-message">Failed to load shared links</div>';
    }
}

function formatExpiryInfo(expiresAt) {
    if (!expiresAt) {
        return {
            text: i18n.t('settings.neverExpires') || 'Never expires',
            class: '',
            icon: '&#9734;'
        };
    }

    const expiry = new Date(expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
        return {
            text: i18n.t('settings.expired') || 'Expired',
            class: 'expired',
            icon: '&#9888;'
        };
    } else if (daysLeft <= 7) {
        return {
            text: `${i18n.t('settings.expiresIn') || 'Expires in'} ${daysLeft} ${i18n.t('settings.days') || 'days'}`,
            class: 'expiring-soon',
            icon: '&#9888;'
        };
    } else {
        return {
            text: `${i18n.t('settings.expiresOn') || 'Expires'}: ${formatDateYMD(expiry)}`,
            class: '',
            icon: '&#128197;'
        };
    }
}

function formatDateYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function updateSharedLinkExpiry(code, expiresIn) {
    try {
        const response = await fetch(basePath + `/api/shortlinks/${code}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expires_in: parseInt(expiresIn) })
        });

        if (!response.ok) throw new Error('Failed to update expiry');

        // Reload the list
        await loadSharedLinks();
    } catch (err) {
        console.error('Error updating shared link:', err);
        alert(i18n.t('settings.updateFailed') || 'Failed to update expiry');
    }
}

async function updateSharedLinkExpiryDate(code, dateStr) {
    if (!dateStr) return;

    // Calculate days from today to selected date
    const selectedDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);

    const diffTime = selectedDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 1) {
        alert(i18n.t('settings.selectFutureDate') || 'Please select a future date');
        return;
    }

    await updateSharedLinkExpiry(code, diffDays);
}

async function deleteSharedLink(code) {
    if (!confirm(i18n.t('settings.deleteSharedLinkConfirm') || 'Are you sure you want to delete this shared link?')) {
        return;
    }

    try {
        const response = await fetch(basePath + `/api/shortlinks/${code}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete shared link');

        // Reload the list
        await loadSharedLinks();
    } catch (err) {
        console.error('Error deleting shared link:', err);
        alert(i18n.t('settings.deleteFailed') || 'Failed to delete shared link');
    }
}

async function deleteAllSharedLinks() {
    if (!confirm(i18n.t('settings.deleteAllSharedLinksConfirm') || 'Are you sure you want to delete ALL shared links?')) {
        return;
    }

    const deleteAllBtn = document.getElementById('deleteAllSharedLinksBtn');
    if (deleteAllBtn) {
        deleteAllBtn.disabled = true;
        deleteAllBtn.textContent = '...';
    }

    try {
        // Get all links first
        const response = await fetch(basePath + '/api/shortlinks');
        if (!response.ok) throw new Error('Failed to load shared links');

        const links = await response.json();

        // Delete each link
        for (const link of links) {
            await fetch(basePath + `/api/shortlinks/${link.code}`, {
                method: 'DELETE'
            });
        }

        // Reload the list
        await loadSharedLinks();
    } catch (err) {
        console.error('Error deleting all shared links:', err);
        alert(i18n.t('settings.deleteFailed') || 'Failed to delete shared links');
    } finally {
        if (deleteAllBtn) {
            deleteAllBtn.disabled = false;
            deleteAllBtn.innerHTML = `<span data-i18n="settings.deleteAll">${i18n.t('settings.deleteAll') || 'Delete All'}</span>`;
        }
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Show brief feedback
        const tooltip = document.createElement('div');
        tooltip.className = 'copy-tooltip';
        tooltip.textContent = i18n.t('settings.copied') || 'Copied!';
        tooltip.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg-tertiary); color: var(--text-primary); padding: 0.5rem 1rem; border-radius: var(--radius); z-index: 10000; animation: fadeOut 1s forwards;';
        document.body.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), 1000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Data Management
function initDataManagement() {
    const exportBtn = document.getElementById('exportNotesBtn');
    const importBtn = document.getElementById('importNotesBtn');
    const importFileInput = document.getElementById('importFileInput');
    const deleteAllBtn = document.getElementById('deleteAllNotesBtn');
    const refreshStatsBtn = document.getElementById('refreshStatsBtn');

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

    if (refreshStatsBtn) {
        refreshStatsBtn.addEventListener('click', refreshStats);
    }
}

async function refreshStats() {
    const btn = document.getElementById('refreshStatsBtn');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }

    await loadUsageStats();

    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
    }
}

async function exportNotes() {
    const exportBtn = document.getElementById('exportNotesBtn');
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Exporting...';
    }

    try {
        const response = await authFetch(basePath + '/api/notes/export');
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

        const response = await authFetch(basePath + '/api/notes/import', {
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
        const response = await authFetch(basePath + '/api/notes', {
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
        const response = await authFetch(basePath + '/api/stats');
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

// About Info
async function loadAboutInfo() {
    try {
        const response = await fetch(basePath + '/api/config');
        if (!response.ok) throw new Error('Failed to load config');

        const config = await response.json();
        const version = config.version || {};

        // Update version info
        const versionEl = document.getElementById('aboutVersion');
        const commitEl = document.getElementById('aboutCommit');
        const buildDateEl = document.getElementById('aboutBuildDate');

        if (versionEl) versionEl.textContent = version.Version || 'dev';
        if (commitEl) commitEl.textContent = version.Commit ? version.Commit.substring(0, 7) : 'unknown';
        if (buildDateEl) buildDateEl.textContent = version.Date || 'unknown';
    } catch (err) {
        console.error('Error loading about info:', err);
        // Show placeholder values
        const versionEl = document.getElementById('aboutVersion');
        const commitEl = document.getElementById('aboutCommit');
        const buildDateEl = document.getElementById('aboutBuildDate');

        if (versionEl) versionEl.textContent = 'dev';
        if (commitEl) commitEl.textContent = 'unknown';
        if (buildDateEl) buildDateEl.textContent = 'unknown';
    }
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
    const miniCalToggle = document.getElementById('miniCalToggle');
    const miniCalendar = document.getElementById('miniCalendar');

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

    // Toggle button for collapse/expand
    if (miniCalToggle && miniCalendar) {
        // Restore collapsed state from localStorage
        const isCollapsed = localStorage.getItem('miniCalendarCollapsed') === 'true';
        if (isCollapsed) {
            miniCalendar.classList.add('collapsed');
        }

        miniCalToggle.addEventListener('click', () => {
            miniCalendar.classList.toggle('collapsed');
            const collapsed = miniCalendar.classList.contains('collapsed');
            localStorage.setItem('miniCalendarCollapsed', collapsed);
        });
    }

    // Date Notes Panel event listeners
    const dateNotesPanelClose = document.getElementById('dateNotesPanelClose');
    const dateNotesNewBtn = document.getElementById('dateNotesNewBtn');

    if (dateNotesPanelClose) {
        dateNotesPanelClose.addEventListener('click', () => {
            miniCalSelectedDate = null;
            hideDateNotesPanel();
            renderMiniCalendar();
        });
    }

    if (dateNotesNewBtn) {
        dateNotesNewBtn.addEventListener('click', () => {
            if (miniCalSelectedDate) {
                createNoteForDate(miniCalSelectedDate);
                // Note: hideDateNotesPanel() not needed - showEditorPane() handles it
                miniCalSelectedDate = null;
                renderMiniCalendar();
            }
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

    // Update title with i18n
    const locale = localStorage.getItem('locale') || 'en';
    const dateLocale = locale === 'ko' ? 'ko-KR' : 'en-US';
    miniCalTitle.textContent = miniCalCurrentDate.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short' });

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

        html += `<div class="${classes}" data-date="${dateKey}" onclick="selectMiniCalDate('${dateKey}')" ondblclick="createNoteForMiniCalDate('${dateKey}')">${dayNumber}</div>`;
    }

    miniCalGrid.innerHTML = html;
}

function createNoteForMiniCalDate(dateKey) {
    // Create new note with the date as title prefix
    currentNote = null;
    currentPassword = null;
    isViewMode = false;
    currentNoteFolderPath = '';
    noteFolderPath.textContent = '';
    noteTitle.value = `${dateKey} `;
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

    // Show editor
    showEditorPane();

    // Focus on title and position cursor at end
    setTimeout(() => {
        noteTitle.focus();
        noteTitle.setSelectionRange(noteTitle.value.length, noteTitle.value.length);
    }, 100);
}

function selectMiniCalDate(dateKey) {
    if (miniCalSelectedDate && formatDateKey(miniCalSelectedDate) === dateKey) {
        // Deselect if clicking the same date - close panel
        miniCalSelectedDate = null;
        hideDateNotesPanel();
    } else {
        miniCalSelectedDate = new Date(dateKey + 'T00:00:00');
        // Show date notes panel instead of filtering
        showDateNotesPanel(dateKey);
    }
    renderMiniCalendar();
}

// Date Notes Panel Functions
function showDateNotesPanel(dateKey) {
    const panel = document.getElementById('dateNotesPanel');
    const title = document.getElementById('dateNotesPanelTitle');
    const list = document.getElementById('dateNotesList');

    // Format date for display
    const date = new Date(dateKey + 'T00:00:00');
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    const locale = localStorage.getItem('locale') || 'en';
    title.textContent = date.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', options);

    // Get notes for this date
    const notesMap = buildNotesMapByDate();
    const dateNotes = notesMap[dateKey] || [];

    // Render notes list
    renderDateNotesList(list, dateNotes);

    // Show panel, hide other views
    panel.style.display = 'flex';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('editor').style.display = 'none';
}

function hideDateNotesPanel(restoreView = true) {
    const panel = document.getElementById('dateNotesPanel');
    panel.style.display = 'none';

    // Only restore previous view if requested (not when loading a note)
    if (restoreView) {
        if (currentNote) {
            document.getElementById('editor').style.display = 'flex';
        } else {
            document.getElementById('emptyState').style.display = 'flex';
        }
    }
}

function renderDateNotesList(container, dateNotes) {
    container.innerHTML = '';

    if (dateNotes.length === 0) {
        const emptyMsg = i18n ? i18n.t('datePanel.empty') || 'No notes for this date' : 'No notes for this date';
        container.innerHTML = `
            <div class="date-notes-empty">
                <span class="date-notes-empty-icon">&#128196;</span>
                <span>${emptyMsg}</span>
            </div>
        `;
        return;
    }

    dateNotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'date-note-item';
        item.dataset.noteId = note.id;

        const icon = note.type === 'markdown' ? '📄' : (note.type === 'asciidoc' ? '📝' : '📃');
        const typeLabel = note.type === 'markdown' ? 'MD' : (note.type === 'asciidoc' ? 'ADOC' : 'TXT');
        const lockIcon = note.private ? ' &#128274;' : '';

        // Use folder_path from API (with fallback for backward compatibility)
        const folderPath = note.folder_path !== undefined ? note.folder_path : extractFolderPath(note.title);
        const noteName = note.folder_path !== undefined ? note.title : extractNoteName(note.title);

        item.innerHTML = `
            <span class="date-note-item-icon">${icon}</span>
            <div class="date-note-item-content">
                <div class="date-note-item-title">${escapeHtml(noteName)}${lockIcon}</div>
                ${folderPath ? `<div class="date-note-item-path">📁 ${escapeHtml(folderPath)}</div>` : ''}
            </div>
            <span class="date-note-item-type">${typeLabel}</span>
        `;

        item.addEventListener('click', () => {
            hideDateNotesPanel(false); // Don't restore view, loadNote will handle it
            miniCalSelectedDate = null;
            renderMiniCalendar();
            loadNote(note.id);
        });

        container.appendChild(item);
    });
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

async function createNoteForDate(date) {
    // Format date for the title (YYYY-MM-DD format)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Create folder path: Daily/YYYY.MM
    const folderPath = `Daily/${year}.${month}`;

    // Ensure Daily folder and year.month subfolder exist
    await ensureDailyFolderExists(year, month);

    // Reset all fields (same as createNewNote)
    currentNote = null;
    currentPassword = null;
    isViewMode = false; // New notes are created in edit mode
    currentNoteFolderPath = folderPath;
    noteFolderPath.textContent = formatFolderPathForDisplay(folderPath);
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

// Ensure Daily/YYYY.MM folder structure exists
async function ensureDailyFolderExists(year, month) {
    const monthStr = String(month).padStart(2, '0');
    const yearMonthFolder = `${year}.${monthStr}`;

    // Check if Daily folder exists
    const dailyExists = folders.some(f => f.path === 'Daily');
    if (!dailyExists) {
        await createFolderSilent('Daily', '');
        // Set Daily folder to be collapsed by default
        if (expandedFolders['Daily'] === undefined) {
            expandedFolders['Daily'] = false;
            localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
        }
    }

    // Check if Daily/YYYY.MM folder exists
    const monthFolderPath = `Daily/${yearMonthFolder}`;
    const monthExists = folders.some(f => f.path === monthFolderPath);
    if (!monthExists) {
        await createFolderSilent(yearMonthFolder, 'Daily');
        // Set year.month folder to be collapsed by default
        if (expandedFolders[monthFolderPath] === undefined) {
            expandedFolders[monthFolderPath] = false;
            localStorage.setItem('expandedFolders', JSON.stringify(expandedFolders));
        }
    }
}

// Create folder without showing toast (for auto-creation)
async function createFolderSilent(name, parentPath) {
    try {
        const response = await fetch(`${basePath}/api/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, path: parentPath })
        });

        if (response.ok) {
            // Reload folders list
            const foldersResponse = await fetch(basePath + '/api/folders');
            folders = await foldersResponse.json();
            if (!folders) folders = [];
        }
    } catch (error) {
        console.error('Failed to create folder:', error);
    }
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

// ============================================
// Icon Picker
// ============================================

const AVAILABLE_ICONS = [
    // Documents & Files
    '📄', '📝', '📋', '📑', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙',
    // Folders
    '📁', '📂', '🗂️', '🗃️', '🗄️',
    // Objects
    '💼', '🎒', '🧳', '📦', '🗑️',
    // Tech
    '💻', '🖥️', '⌨️', '🖱️', '💾', '💿', '📀', '🔧', '⚙️', '🔩',
    // Communication
    '📧', '✉️', '📨', '📩', '📤', '📥', '📫', '📬',
    // Nature
    '🌳', '🌲', '🌴', '🌵', '🌿', '🍀', '🌸', '🌺', '🌻', '🌹',
    // Weather
    '☀️', '🌙', '⭐', '🌟', '⚡', '🔥', '💧', '❄️', '🌈',
    // Symbols
    '❤️', '💛', '💚', '💙', '💜', '🖤', '🤍', '🧡',
    '⭕', '❌', '✅', '❎', '⚠️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣',
    // Activities
    '🎮', '🎯', '🎨', '🎭', '🎪', '🎬', '🎵', '🎶', '🎤', '🎧',
    // Food
    '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🥝', '🍕', '🍔', '☕',
    // Animals
    '🐶', '🐱', '🐼', '🐨', '🦊', '🦁', '🐯', '🦄', '🐝', '🦋',
    // Misc
    '💡', '🔑', '🔒', '🔓', '🏠', '🏢', '🚀', '✨', '💎', '🎁'
];

let iconPickerModal = null;
let iconPickerTarget = null; // { type: 'note'|'folder', id: noteId|folderPath }

function createIconPickerModal() {
    if (iconPickerModal) return;

    iconPickerModal = document.createElement('div');
    iconPickerModal.id = 'iconPickerModal';
    iconPickerModal.className = 'modal';
    iconPickerModal.style.display = 'none';

    const iconsHtml = AVAILABLE_ICONS.map(icon =>
        `<button class="icon-picker-item" data-icon="${icon}">${icon}</button>`
    ).join('');

    iconPickerModal.innerHTML = `
        <div class="modal-content icon-picker-modal">
            <div class="icon-picker-header">
                <h3>${i18n.t('iconPicker.title')}</h3>
                <button class="modal-close-btn" id="iconPickerClose">&times;</button>
            </div>
            <div class="icon-picker-grid">
                ${iconsHtml}
            </div>
            <div class="icon-picker-footer">
                <button class="btn btn-secondary" id="iconPickerReset">${i18n.t('iconPicker.reset')}</button>
            </div>
        </div>
    `;

    document.body.appendChild(iconPickerModal);

    // Close button
    document.getElementById('iconPickerClose').addEventListener('click', () => {
        iconPickerModal.style.display = 'none';
    });

    // Backdrop click
    iconPickerModal.addEventListener('click', (e) => {
        if (e.target === iconPickerModal) {
            iconPickerModal.style.display = 'none';
        }
    });

    // Icon selection
    iconPickerModal.querySelectorAll('.icon-picker-item').forEach(btn => {
        btn.addEventListener('click', () => {
            if (iconPickerTarget) {
                setCustomIcon(iconPickerTarget.type, iconPickerTarget.id, btn.dataset.icon);
            }
            iconPickerModal.style.display = 'none';
        });
    });

    // Reset button
    document.getElementById('iconPickerReset').addEventListener('click', () => {
        if (iconPickerTarget) {
            removeCustomIcon(iconPickerTarget.type, iconPickerTarget.id);
        }
        iconPickerModal.style.display = 'none';
    });
}

function showIconPicker(type, id) {
    if (!iconPickerModal) {
        createIconPickerModal();
    }
    iconPickerTarget = { type, id };
    iconPickerModal.style.display = 'flex';
}

async function setCustomIcon(type, id, icon) {
    if (type === 'folder') {
        // Save folder icon via API
        try {
            const response = await fetch(basePath + '/api/folder-icons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_path: id, icon: icon })
            });
            if (response.ok) {
                folderIcons[id] = icon;
                renderNoteTree();
            }
        } catch (err) {
            console.error('Failed to save folder icon:', err);
        }
    } else {
        // Save note icon via note update API
        const note = notes.find(n => n.id === id);
        if (note) {
            try {
                const response = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ icon: icon })
                });
                if (response.ok) {
                    note.icon = icon;
                    renderNoteTree();
                }
            } catch (err) {
                console.error('Failed to save note icon:', err);
            }
        }
    }
}

async function removeCustomIcon(type, id) {
    if (type === 'folder') {
        // Delete folder icon via API
        try {
            const response = await fetch(basePath + '/api/folder-icons?folder_path=' + encodeURIComponent(id), {
                method: 'DELETE'
            });
            if (response.ok) {
                delete folderIcons[id];
                renderNoteTree();
            }
        } catch (err) {
            console.error('Failed to delete folder icon:', err);
        }
    } else {
        // Remove note icon via note update API
        const note = notes.find(n => n.id === id);
        if (note) {
            try {
                const response = await fetch(`${basePath}/api/notes/${encodeNoteId(id)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ icon: '' })
                });
                if (response.ok) {
                    note.icon = '';
                    renderNoteTree();
                }
            } catch (err) {
                console.error('Failed to remove note icon:', err);
            }
        }
    }
}

function getCustomIcon(type, id) {
    if (type === 'folder') {
        return folderIcons[id] || null;
    } else {
        const note = notes.find(n => n.id === id);
        return note?.icon || null;
    }
}
