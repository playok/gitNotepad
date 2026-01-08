// Internationalization (i18n) Module
const i18n = {
    currentLocale: localStorage.getItem('locale') || navigator.language.split('-')[0] || 'en',

    translations: {
        en: {
            // App
            'app.title': 'Git Notepad',
            'app.subtitle': 'Your notes are automatically saved and version controlled with Git.',
            'app.selectNote': 'Select a note or create a new one',

            // Common
            'common.save': 'Save',
            'common.delete': 'Delete',
            'common.cancel': 'Cancel',
            'common.confirm': 'Confirm',
            'common.close': 'Close',
            'common.ok': 'OK',
            'common.yes': 'Yes',
            'common.no': 'No',
            'common.loading': 'Loading...',
            'common.error': 'Error',
            'common.success': 'Success',

            // Sidebar
            'sidebar.search': 'Search notes...',
            'sidebar.newNote': 'New Note',
            'sidebar.help': 'Help',
            'sidebar.settings': 'Settings',
            'sidebar.theme': 'Toggle theme',
            'sidebar.collapse': 'Toggle sidebar',
            'sidebar.listView': 'List View',
            'sidebar.calendarView': 'Calendar View',
            'sidebar.noNotes': 'No notes yet',
            'sidebar.notes': 'notes',

            // Editor
            'editor.untitled': 'Untitled',
            'editor.title': 'Note title',
            'editor.preview': 'Preview',
            'editor.editor': 'Editor',
            'editor.history': 'Version History',
            'editor.private': 'Private',
            'editor.public': 'Public',
            'editor.saving': 'Saving...',
            'editor.saved': 'Saved',
            'editor.unsaved': 'Unsaved',
            'editor.upload': 'Upload file',
            'editor.formatJson': 'Format JSON',
            'editor.fullscreen': 'Fullscreen',
            'editor.share': 'Share',
            'editor.attachments': 'Attachments',
            'editor.dropFiles': 'Drop files here to attach',

            // Note types
            'type.markdown': 'Markdown',
            'type.asciidoc': 'AsciiDoc',
            'type.text': 'Plain Text',

            // Calendar
            'calendar.today': 'Today',
            'calendar.newNote': 'New Note',
            'calendar.noNotes': 'No notes for this date',
            'calendar.selectDate': 'Select a date',
            'calendar.notesForDate': 'Click on a date to view notes',

            // Months
            'month.january': 'January',
            'month.february': 'February',
            'month.march': 'March',
            'month.april': 'April',
            'month.may': 'May',
            'month.june': 'June',
            'month.july': 'July',
            'month.august': 'August',
            'month.september': 'September',
            'month.october': 'October',
            'month.november': 'November',
            'month.december': 'December',

            // Weekdays
            'weekday.sun': 'Sun',
            'weekday.mon': 'Mon',
            'weekday.tue': 'Tue',
            'weekday.wed': 'Wed',
            'weekday.thu': 'Thu',
            'weekday.fri': 'Fri',
            'weekday.sat': 'Sat',

            // History
            'history.title': 'Version History',
            'history.noHistory': 'No history available',
            'history.restore': 'Restore',
            'history.version': 'Version',
            'history.current': 'Current',

            // Password
            'password.enter': 'Enter Password',
            'password.set': 'Set Password',
            'password.confirm': 'Confirm Password',
            'password.placeholder': 'Enter password',
            'password.confirmPlaceholder': 'Confirm password',
            'password.submit': 'Submit',
            'password.mismatch': 'Passwords do not match',
            'password.required': 'Password is required',

            // Share
            'share.title': 'Share Note',
            'share.link': 'Share Link',
            'share.copy': 'Copy',
            'share.copied': 'Copied!',
            'share.expiry': 'Expiry',
            'share.never': 'Never',
            'share.create': 'Create Link',
            'share.delete': 'Delete Link',

            // Settings
            'settings.title': 'Settings',
            'settings.language': 'Language',
            'settings.theme': 'Theme',
            'settings.light': 'Light',
            'settings.dark': 'Dark',
            'settings.auto': 'Auto',
            'settings.lineNumbers': 'Line Numbers',
            'settings.autoSave': 'Auto Save',
            'settings.defaultType': 'Default Note Type',

            // User
            'user.login': 'Login',
            'user.logout': 'Logout',
            'user.profile': 'Profile',
            'user.manageUsers': 'Manage Users',
            'user.username': 'Username',
            'user.password': 'Password',

            // Admin
            'admin.users': 'Users',
            'admin.addUser': 'Add User',
            'admin.deleteUser': 'Delete User',
            'admin.changePassword': 'Change Password',
            'admin.role': 'Role',
            'admin.admin': 'Admin',
            'admin.user': 'User',

            // Stats
            'stats.title': 'Statistics',
            'stats.totalNotes': 'Total Notes',
            'stats.totalAttachments': 'Attachments',
            'stats.privateNotes': 'Private Notes',
            'stats.storageUsed': 'Storage Used',
            'stats.notesByType': 'Notes by Type',
            'stats.recentActivity': 'Recent Activity',
            'stats.export': 'Export',
            'stats.import': 'Import',
            'stats.deleteAll': 'Delete All',

            // Messages
            'msg.confirmDelete': 'Are you sure you want to delete this note?',
            'msg.confirmDeleteAll': 'Are you sure you want to delete ALL notes? This cannot be undone.',
            'msg.enterTitle': 'Please enter a title',
            'msg.invalidPassword': 'Invalid password',
            'msg.noteSaved': 'Note saved successfully',
            'msg.noteDeleted': 'Note deleted',
            'msg.uploadFailed': 'Failed to upload file',
            'msg.loadFailed': 'Failed to load',
            'msg.saveFailed': 'Failed to save',
            'msg.copySuccess': 'Copied to clipboard',
            'msg.copyFailed': 'Failed to copy',
            'msg.importSuccess': 'Import successful',
            'msg.exportSuccess': 'Export successful',
            'msg.userCreated': 'User created successfully',
            'msg.userDeleted': 'User deleted successfully',
            'msg.passwordChanged': 'Password changed successfully',
            'msg.folderCreated': 'Folder created',
            'msg.folderDeleted': 'Folder deleted',

            // Context Menu
            'context.open': 'Open',
            'context.rename': 'Rename',
            'context.duplicate': 'Duplicate',
            'context.move': 'Move to...',
            'context.history': 'History',
            'context.delete': 'Delete',
            'context.newNote': 'New Note',
            'context.newFolder': 'New Folder',
            'context.newNoteInFolder': 'New Note Here',
            'context.newSubfolder': 'New Subfolder',
            'context.deleteFolder': 'Delete Folder',

            // Prompts
            'prompt.enterFolderName': 'Enter folder name:',

            // Confirm
            'confirm.deleteFolder': 'Delete this folder? (Must be empty)',

            // Help
            'help.title': 'Keyboard Shortcuts',
            'help.global': 'Global',
            'help.editor': 'Editor',
            'help.newNote': 'New note',
            'help.save': 'Save',
            'help.search': 'Search',
            'help.toggleSidebar': 'Toggle sidebar',
            'help.help': 'Show help',
            'help.editorFullscreen': 'Editor fullscreen',
            'help.previewFullscreen': 'Preview fullscreen',
            'help.formatJson': 'Format JSON',
        },

        ko: {
            // App
            'app.title': 'Git 메모장',
            'app.subtitle': '노트는 자동으로 저장되고 Git으로 버전 관리됩니다.',
            'app.selectNote': '노트를 선택하거나 새로 만드세요',

            // Common
            'common.save': '저장',
            'common.delete': '삭제',
            'common.cancel': '취소',
            'common.confirm': '확인',
            'common.close': '닫기',
            'common.ok': '확인',
            'common.yes': '예',
            'common.no': '아니오',
            'common.loading': '로딩 중...',
            'common.error': '오류',
            'common.success': '성공',

            // Sidebar
            'sidebar.search': '노트 검색...',
            'sidebar.newNote': '새 노트',
            'sidebar.help': '도움말',
            'sidebar.settings': '설정',
            'sidebar.theme': '테마 변경',
            'sidebar.collapse': '사이드바 토글',
            'sidebar.listView': '목록 보기',
            'sidebar.calendarView': '캘린더 보기',
            'sidebar.noNotes': '노트가 없습니다',
            'sidebar.notes': '개의 노트',

            // Editor
            'editor.untitled': '제목 없음',
            'editor.title': '노트 제목',
            'editor.preview': '미리보기',
            'editor.editor': '편집기',
            'editor.history': '버전 기록',
            'editor.private': '비공개',
            'editor.public': '공개',
            'editor.saving': '저장 중...',
            'editor.saved': '저장됨',
            'editor.unsaved': '저장 안됨',
            'editor.upload': '파일 업로드',
            'editor.formatJson': 'JSON 정리',
            'editor.fullscreen': '전체화면',
            'editor.share': '공유',
            'editor.attachments': '첨부파일',
            'editor.dropFiles': '파일을 여기에 드롭하세요',

            // Note types
            'type.markdown': '마크다운',
            'type.asciidoc': 'AsciiDoc',
            'type.text': '일반 텍스트',

            // Calendar
            'calendar.today': '오늘',
            'calendar.newNote': '새 노트',
            'calendar.noNotes': '이 날짜에 노트가 없습니다',
            'calendar.selectDate': '날짜를 선택하세요',
            'calendar.notesForDate': '날짜를 클릭하여 노트를 확인하세요',

            // Months
            'month.january': '1월',
            'month.february': '2월',
            'month.march': '3월',
            'month.april': '4월',
            'month.may': '5월',
            'month.june': '6월',
            'month.july': '7월',
            'month.august': '8월',
            'month.september': '9월',
            'month.october': '10월',
            'month.november': '11월',
            'month.december': '12월',

            // Weekdays
            'weekday.sun': '일',
            'weekday.mon': '월',
            'weekday.tue': '화',
            'weekday.wed': '수',
            'weekday.thu': '목',
            'weekday.fri': '금',
            'weekday.sat': '토',

            // History
            'history.title': '버전 기록',
            'history.noHistory': '기록이 없습니다',
            'history.restore': '복원',
            'history.version': '버전',
            'history.current': '현재',

            // Password
            'password.enter': '비밀번호 입력',
            'password.set': '비밀번호 설정',
            'password.confirm': '비밀번호 확인',
            'password.placeholder': '비밀번호를 입력하세요',
            'password.confirmPlaceholder': '비밀번호를 다시 입력하세요',
            'password.submit': '확인',
            'password.mismatch': '비밀번호가 일치하지 않습니다',
            'password.required': '비밀번호를 입력해주세요',

            // Share
            'share.title': '노트 공유',
            'share.link': '공유 링크',
            'share.copy': '복사',
            'share.copied': '복사됨!',
            'share.expiry': '만료일',
            'share.never': '무기한',
            'share.create': '링크 생성',
            'share.delete': '링크 삭제',

            // Settings
            'settings.title': '설정',
            'settings.language': '언어',
            'settings.theme': '테마',
            'settings.light': '라이트',
            'settings.dark': '다크',
            'settings.auto': '자동',
            'settings.lineNumbers': '줄 번호',
            'settings.autoSave': '자동 저장',
            'settings.defaultType': '기본 노트 형식',

            // User
            'user.login': '로그인',
            'user.logout': '로그아웃',
            'user.profile': '프로필',
            'user.manageUsers': '사용자 관리',
            'user.username': '사용자명',
            'user.password': '비밀번호',

            // Admin
            'admin.users': '사용자',
            'admin.addUser': '사용자 추가',
            'admin.deleteUser': '사용자 삭제',
            'admin.changePassword': '비밀번호 변경',
            'admin.role': '역할',
            'admin.admin': '관리자',
            'admin.user': '일반',

            // Stats
            'stats.title': '통계',
            'stats.totalNotes': '전체 노트',
            'stats.totalAttachments': '첨부파일',
            'stats.privateNotes': '비공개 노트',
            'stats.storageUsed': '저장 공간',
            'stats.notesByType': '유형별 노트',
            'stats.recentActivity': '최근 활동',
            'stats.export': '내보내기',
            'stats.import': '가져오기',
            'stats.deleteAll': '전체 삭제',

            // Messages
            'msg.confirmDelete': '이 노트를 삭제하시겠습니까?',
            'msg.confirmDeleteAll': '모든 노트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
            'msg.enterTitle': '제목을 입력하세요',
            'msg.invalidPassword': '비밀번호가 올바르지 않습니다',
            'msg.noteSaved': '노트가 저장되었습니다',
            'msg.noteDeleted': '노트가 삭제되었습니다',
            'msg.uploadFailed': '파일 업로드에 실패했습니다',
            'msg.loadFailed': '로드에 실패했습니다',
            'msg.saveFailed': '저장에 실패했습니다',
            'msg.copySuccess': '클립보드에 복사되었습니다',
            'msg.copyFailed': '복사에 실패했습니다',
            'msg.importSuccess': '가져오기 완료',
            'msg.exportSuccess': '내보내기 완료',
            'msg.userCreated': '사용자가 생성되었습니다',
            'msg.userDeleted': '사용자가 삭제되었습니다',
            'msg.passwordChanged': '비밀번호가 변경되었습니다',
            'msg.folderCreated': '폴더가 생성되었습니다',
            'msg.folderDeleted': '폴더가 삭제되었습니다',

            // Context Menu
            'context.open': '열기',
            'context.rename': '이름 변경',
            'context.duplicate': '복제',
            'context.move': '이동...',
            'context.history': '히스토리',
            'context.delete': '삭제',
            'context.newNote': '새 노트',
            'context.newFolder': '새 폴더',
            'context.newNoteInFolder': '여기에 새 노트',
            'context.newSubfolder': '하위 폴더',
            'context.deleteFolder': '폴더 삭제',

            // Prompts
            'prompt.enterFolderName': '폴더 이름을 입력하세요:',

            // Confirm
            'confirm.deleteFolder': '이 폴더를 삭제하시겠습니까? (비어있어야 합니다)',

            // Help
            'help.title': '키보드 단축키',
            'help.global': '전역',
            'help.editor': '편집기',
            'help.newNote': '새 노트',
            'help.save': '저장',
            'help.search': '검색',
            'help.toggleSidebar': '사이드바 토글',
            'help.help': '도움말',
            'help.editorFullscreen': '편집기 전체화면',
            'help.previewFullscreen': '미리보기 전체화면',
            'help.formatJson': 'JSON 정리',
        }
    },

    // Get translation
    t(key, params = {}) {
        let translation = this.translations[this.currentLocale]?.[key]
            || this.translations['en'][key]
            || key;

        // Replace parameters like {count}
        Object.keys(params).forEach(k => {
            translation = translation.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
        });

        return translation;
    },

    // Set locale
    setLocale(locale) {
        if (this.translations[locale]) {
            this.currentLocale = locale;
            localStorage.setItem('locale', locale);
            document.documentElement.setAttribute('lang', locale);
            this.updateUI();
            // Dispatch event for dynamic content updates
            window.dispatchEvent(new CustomEvent('localeChanged', { detail: { locale } }));
        }
    },

    // Get current locale
    getLocale() {
        return this.currentLocale;
    },

    // Get available locales
    getLocales() {
        return Object.keys(this.translations);
    },

    // Update all UI elements with data-i18n attributes
    updateUI() {
        // Text content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = translation;
            } else {
                el.textContent = translation;
            }
        });

        // Placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });

        // Titles (tooltips)
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });

        // ARIA labels
        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            el.setAttribute('aria-label', this.t(key));
        });
    },

    // Initialize
    init() {
        // Set initial locale from storage or browser
        const savedLocale = localStorage.getItem('locale');
        if (savedLocale && this.translations[savedLocale]) {
            this.currentLocale = savedLocale;
        } else {
            const browserLang = navigator.language.split('-')[0];
            this.currentLocale = this.translations[browserLang] ? browserLang : 'en';
        }
        document.documentElement.setAttribute('lang', this.currentLocale);
        this.updateUI();
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => i18n.init());
} else {
    i18n.init();
}
