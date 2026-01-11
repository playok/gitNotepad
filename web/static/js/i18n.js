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
            'sidebar.newNote': 'New Note (Ctrl+N)',
            'sidebar.help': 'Help (F1)',
            'sidebar.settings': 'Settings',
            'sidebar.language': 'Language',
            'sidebar.toggleTheme': 'Toggle theme',
            'sidebar.theme': 'Toggle theme',
            'sidebar.collapse': 'Toggle sidebar',
            'sidebar.collapseShortcut': 'Toggle sidebar (Ctrl+B)',
            'sidebar.listView': 'List View',
            'sidebar.calendarView': 'Calendar View',
            'sidebar.expandAll': 'Expand All',
            'sidebar.collapseAll': 'Collapse All',
            'sidebar.noNotes': 'No notes yet',
            'sidebar.notes': 'notes',
            'sidebar.clearSearch': 'Clear search',

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
            'editor.formatJsonShortcut': 'Format JSON (Ctrl+Shift+F)',
            'editor.fullscreen': 'Fullscreen',
            'editor.share': 'Share',
            'editor.attachments': 'Attachments',
            'editor.dropFiles': 'Drop files here to attach',
            'editor.noteType': 'Note type',
            'editor.syntaxHelp': 'Syntax Reference',
            'editor.privateNote': 'Private note',
            'editor.autoSave': 'Auto-save',
            'editor.save': 'Save',
            'editor.delete': 'Delete',
            'editor.toggleAttachments': 'Toggle attachments',

            // Markdown Toolbar
            'toolbar.bold': 'Bold (Ctrl+B)',
            'toolbar.italic': 'Italic (Ctrl+I)',
            'toolbar.strikethrough': 'Strikethrough',
            'toolbar.code': 'Inline Code',
            'toolbar.h1': 'Heading 1',
            'toolbar.h2': 'Heading 2',
            'toolbar.h3': 'Heading 3',
            'toolbar.link': 'Link (Ctrl+K)',
            'toolbar.image': 'Image',
            'toolbar.quote': 'Quote',
            'toolbar.ul': 'Bullet List',
            'toolbar.ol': 'Numbered List',
            'toolbar.tasklist': 'Task List',
            'toolbar.codeblock': 'Code Block',
            'toolbar.table': 'Table',
            'toolbar.hr': 'Horizontal Rule',

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
            'calendar.toggle': 'Toggle calendar',

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
            'password.privateNote': 'Private Note',
            'password.enterToAccess': 'Enter password to access this note:',
            'password.setDescription': 'Enter a password for this private note:',
            'password.unlock': 'Unlock',

            // Share
            'share.title': 'Share Note',
            'share.description': 'Share this link with your team:',
            'share.link': 'Share Link',
            'share.copy': 'Copy',
            'share.copied': 'Copied!',
            'share.expiration': 'Link expiration:',
            'share.expiry': 'Expiry',
            'share.expiresOn': 'Expires on:',
            'share.never': 'Never',
            'share.create': 'Create Link',
            'share.regenerate': 'Regenerate',
            'share.delete': 'Delete Link',
            'share.generating': 'Generating...',
            'share.regenerating': 'Regenerating...',
            'share.expires': 'Expires: {date}',
            'share.neverExpires': 'This link never expires',
            'share.expiryUpdated': 'Expiry updated!',
            'share.newLinkGenerated': 'New link generated!',
            'share.copySuccess': 'Copied to clipboard!',
            'share.failedToGenerate': 'Failed to generate link',
            'share.errorGenerating': 'Error generating link',
            'share.errorUpdating': 'Error updating expiry',
            'share.errorRegenerating': 'Error regenerating link',

            // Settings
            'settings.title': 'Settings',
            'settings.general': 'General',
            'settings.users': 'Users',
            'settings.data': 'Data',
            'settings.usage': 'Usage',
            'settings.generalSettings': 'General Settings',
            'settings.language': 'Language',
            'settings.theme': 'Theme',
            'settings.themeDesc': 'Choose light or dark mode',
            'settings.light': 'Light',
            'settings.dark': 'Dark',
            'settings.darkHighContrast': 'Dark (High Contrast)',
            'settings.darkCyan': 'Dark (Cyan)',
            'settings.auto': 'Auto',
            'settings.lineNumbers': 'Line Numbers',
            'settings.lineNumbersDesc': 'Show line numbers in editor',
            'settings.fontSize': 'Font Size',
            'settings.fontSizeDesc': 'Editor and preview font size',
            'settings.autoSave': 'Auto Save',
            'settings.autoSaveDesc': 'Automatically save changes',
            'settings.defaultType': 'Default Note Type',
            'settings.defaultTypeDesc': 'Default format for new notes',
            'settings.userManagement': 'User Management',
            'settings.dataManagement': 'Data Management',
            'settings.exportNotes': 'Export Notes',
            'settings.exportNotesDesc': 'Download all your notes as a ZIP file',
            'settings.importNotes': 'Import Notes',
            'settings.importNotesDesc': 'Import notes from a ZIP file',
            'settings.deleteAllNotes': 'Delete All Notes',
            'settings.deleteAllNotesDesc': 'Permanently delete all your notes',
            'settings.usageStatistics': 'Usage Statistics',
            'settings.sharedLinks': 'Shared Links',
            'settings.sharedLinksManagement': 'Shared Links Management',
            'settings.noSharedLinks': 'No shared links yet',
            'settings.clickToCopy': 'Click to copy',
            'settings.created': 'Created',
            'settings.changeExpiry': 'Change expiry',
            'settings.expiry': 'Expiry',
            'settings.never': 'Never',
            'settings.days': 'days',
            'settings.year': 'year',
            'settings.neverExpires': 'Never expires',
            'settings.expired': 'Expired',
            'settings.expiresIn': 'Expires in',
            'settings.expiresOn': 'Expires',
            'settings.delete': 'Delete',
            'settings.copied': 'Copied!',
            'settings.updateFailed': 'Failed to update expiry',
            'settings.deleteFailed': 'Failed to delete shared link',
            'settings.deleteSharedLinkConfirm': 'Are you sure you want to delete this shared link?',
            'settings.deleteAllSharedLinksConfirm': 'Are you sure you want to delete ALL shared links?',
            'settings.deleteAll': 'Delete All',
            'settings.selectExpiryDate': 'Select expiry date',
            'settings.selectFutureDate': 'Please select a future date',

            // Syntax Help
            'syntax.title': 'Syntax Reference',
            'syntax.headers': 'Headers',
            'syntax.emphasis': 'Emphasis',
            'syntax.lists': 'Lists',
            'syntax.links': 'Links & Images',
            'syntax.codeBlocks': 'Code Blocks',
            'syntax.blockquotes': 'Blockquotes',
            'syntax.tables': 'Tables',
            'syntax.horizontalRule': 'Horizontal Rule',
            'syntax.taskList': 'Task List',
            'syntax.admonitions': 'Admonitions',
            'syntax.cellSpan': 'Cell Span',

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
            'stats.refresh': 'Refresh',

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

            // Buttons
            'btn.edit': 'Edit',

            // Context Menu
            'context.open': 'Open',
            'context.edit': 'Edit',
            'context.rename': 'Rename',
            'context.duplicate': 'Duplicate',
            'context.move': 'Move to...',
            'context.changeIcon': 'Change Icon',
            'context.history': 'History',
            'context.decrypt': 'Remove Encryption',
            'context.delete': 'Delete',
            'context.newNote': 'New Note',
            'context.newFolder': 'New Folder',
            'context.newNoteInFolder': 'New Note Here',
            'context.newSubfolder': 'New Subfolder',
            'context.expand': 'Expand',
            'context.expandAll': 'Expand All',
            'context.collapse': 'Collapse',
            'context.collapseAll': 'Collapse All',
            'context.deleteFolder': 'Delete Folder',

            // Icon Picker
            'iconPicker.title': 'Select Icon',
            'iconPicker.reset': 'Reset to Default',

            // Prompts
            'prompt.enterFolderName': 'Enter folder name:',

            // Confirm
            'confirm.deleteFolder': 'Delete this folder? (Must be empty)',
            'confirm.decryptNote': 'Remove encryption from this note? The file will be stored in plain text.',

            // Toast
            'toast.noteDecrypted': 'Note decrypted successfully',
            'toast.codeCopied': 'Code copied!',
            'toast.copyFailed': 'Failed to copy',

            // Help
            'help.title': 'Keyboard Shortcuts',
            'help.general': 'General',
            'help.view': 'View',
            'help.editor': 'Editor',
            'help.newNote': 'New note',
            'help.save': 'Save note',
            'help.search': 'Search notes',
            'help.formatJson': 'Format JSON',
            'help.help': 'Show this help',
            'help.toggleSidebar': 'Toggle sidebar',
            'help.editorFullscreen': 'Editor fullscreen',
            'help.previewFullscreen': 'Preview fullscreen',
            'help.closeModal': 'Close modal / Exit fullscreen',
            'help.dragDrop': 'Move note to folder',
            'help.contextMenu': 'Context menu',

            // Attachment
            'attachment.removeConfirm': 'Remove this attachment?',
            'attachment.linkInContentWarning': '\n\nThis attachment is referenced {count} time(s) in the note. References will also be removed.',

            // Date Notes Panel
            'datePanel.empty': 'No notes for this date',
            'datePanel.newNote': 'New note for this date',

            // Table Editor
            'tableEditor.title': 'AsciiDoc Table Editor',
            'tableEditor.instructions': 'Click and drag to select cells for merging. Double-click to edit cell content.',
            'tableEditor.merge': 'Merge Cells',
            'tableEditor.unmerge': 'Unmerge',
            'tableEditor.insert': 'Insert Table',
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
            'sidebar.newNote': '새 노트 (Ctrl+N)',
            'sidebar.help': '도움말 (F1)',
            'sidebar.settings': '설정',
            'sidebar.language': '언어',
            'sidebar.toggleTheme': '테마 변경',
            'sidebar.theme': '테마 변경',
            'sidebar.collapse': '사이드바 토글',
            'sidebar.collapseShortcut': '사이드바 토글 (Ctrl+B)',
            'sidebar.listView': '목록 보기',
            'sidebar.calendarView': '캘린더 보기',
            'sidebar.expandAll': '모두 펼치기',
            'sidebar.collapseAll': '모두 닫기',
            'sidebar.noNotes': '노트가 없습니다',
            'sidebar.notes': '개의 노트',
            'sidebar.clearSearch': '검색 지우기',

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
            'editor.formatJsonShortcut': 'JSON 정리 (Ctrl+Shift+F)',
            'editor.fullscreen': '전체화면',
            'editor.share': '공유',
            'editor.attachments': '첨부파일',
            'editor.dropFiles': '파일을 여기에 드롭하세요',
            'editor.noteType': '노트 유형',
            'editor.syntaxHelp': '문법 참조',
            'editor.privateNote': '비공개 노트',
            'editor.autoSave': '자동 저장',
            'editor.save': '저장',
            'editor.delete': '삭제',
            'editor.toggleAttachments': '첨부파일 토글',

            // Markdown Toolbar
            'toolbar.bold': '굵게 (Ctrl+B)',
            'toolbar.italic': '기울임 (Ctrl+I)',
            'toolbar.strikethrough': '취소선',
            'toolbar.code': '인라인 코드',
            'toolbar.h1': '제목 1',
            'toolbar.h2': '제목 2',
            'toolbar.h3': '제목 3',
            'toolbar.link': '링크 (Ctrl+K)',
            'toolbar.image': '이미지',
            'toolbar.quote': '인용',
            'toolbar.ul': '글머리 기호 목록',
            'toolbar.ol': '번호 목록',
            'toolbar.tasklist': '할 일 목록',
            'toolbar.codeblock': '코드 블록',
            'toolbar.table': '표',
            'toolbar.hr': '구분선',

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
            'calendar.toggle': '캘린더 토글',

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
            'password.privateNote': '비공개 노트',
            'password.enterToAccess': '이 노트에 접근하려면 비밀번호를 입력하세요:',
            'password.setDescription': '비공개 노트의 비밀번호를 설정하세요:',
            'password.unlock': '잠금 해제',

            // Share
            'share.title': '노트 공유',
            'share.description': '이 링크를 팀원과 공유하세요:',
            'share.link': '공유 링크',
            'share.copy': '복사',
            'share.copied': '복사됨!',
            'share.expiration': '링크 만료:',
            'share.expiry': '만료일',
            'share.expiresOn': '만료일:',
            'share.never': '무기한',
            'share.create': '링크 생성',
            'share.regenerate': '재생성',
            'share.delete': '링크 삭제',
            'share.generating': '생성 중...',
            'share.regenerating': '재생성 중...',
            'share.expires': '만료일: {date}',
            'share.neverExpires': '이 링크는 만료되지 않습니다',
            'share.expiryUpdated': '만료일이 변경되었습니다!',
            'share.newLinkGenerated': '새 링크가 생성되었습니다!',
            'share.copySuccess': '클립보드에 복사되었습니다!',
            'share.failedToGenerate': '링크 생성에 실패했습니다',
            'share.errorGenerating': '링크 생성 오류',
            'share.errorUpdating': '만료일 변경 오류',
            'share.errorRegenerating': '링크 재생성 오류',

            // Settings
            'settings.title': '설정',
            'settings.general': '일반',
            'settings.users': '사용자',
            'settings.data': '데이터',
            'settings.usage': '사용량',
            'settings.generalSettings': '일반 설정',
            'settings.language': '언어',
            'settings.theme': '테마',
            'settings.themeDesc': '라이트 또는 다크 모드 선택',
            'settings.light': '라이트',
            'settings.dark': '다크',
            'settings.darkHighContrast': '다크 (고대비)',
            'settings.darkCyan': '다크 (시안)',
            'settings.auto': '자동',
            'settings.lineNumbers': '줄 번호',
            'settings.lineNumbersDesc': '편집기에 줄 번호 표시',
            'settings.fontSize': '글꼴 크기',
            'settings.fontSizeDesc': '편집기 및 미리보기 글꼴 크기',
            'settings.autoSave': '자동 저장',
            'settings.autoSaveDesc': '변경 사항을 자동으로 저장',
            'settings.defaultType': '기본 노트 형식',
            'settings.defaultTypeDesc': '새 노트의 기본 형식',
            'settings.userManagement': '사용자 관리',
            'settings.dataManagement': '데이터 관리',
            'settings.exportNotes': '노트 내보내기',
            'settings.exportNotesDesc': '모든 노트를 ZIP 파일로 다운로드',
            'settings.importNotes': '노트 가져오기',
            'settings.importNotesDesc': 'ZIP 파일에서 노트 가져오기',
            'settings.deleteAllNotes': '모든 노트 삭제',
            'settings.deleteAllNotesDesc': '모든 노트를 영구적으로 삭제',
            'settings.usageStatistics': '사용 통계',
            'settings.sharedLinks': '공유 링크',
            'settings.sharedLinksManagement': '공유 링크 관리',
            'settings.noSharedLinks': '공유 링크가 없습니다',
            'settings.clickToCopy': '클릭하여 복사',
            'settings.created': '생성일',
            'settings.changeExpiry': '만료일 변경',
            'settings.expiry': '만료',
            'settings.never': '무기한',
            'settings.days': '일',
            'settings.year': '년',
            'settings.neverExpires': '무기한',
            'settings.expired': '만료됨',
            'settings.expiresIn': '만료까지',
            'settings.expiresOn': '만료일',
            'settings.delete': '삭제',
            'settings.copied': '복사됨!',
            'settings.updateFailed': '만료일 변경 실패',
            'settings.deleteFailed': '공유 링크 삭제 실패',
            'settings.deleteSharedLinkConfirm': '이 공유 링크를 삭제하시겠습니까?',
            'settings.deleteAllSharedLinksConfirm': '모든 공유 링크를 삭제하시겠습니까?',
            'settings.deleteAll': '모두 삭제',
            'settings.selectExpiryDate': '만료일 선택',
            'settings.selectFutureDate': '미래 날짜를 선택해주세요',

            // Syntax Help
            'syntax.title': '문법 참조',
            'syntax.headers': '제목',
            'syntax.emphasis': '강조',
            'syntax.lists': '목록',
            'syntax.links': '링크 & 이미지',
            'syntax.codeBlocks': '코드 블록',
            'syntax.blockquotes': '인용문',
            'syntax.tables': '표',
            'syntax.horizontalRule': '구분선',
            'syntax.taskList': '체크리스트',
            'syntax.admonitions': '경고문',
            'syntax.cellSpan': '셀 병합',

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
            'stats.refresh': '새로고침',

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

            // Buttons
            'btn.edit': '편집',

            // Context Menu
            'context.open': '열기',
            'context.edit': '편집',
            'context.rename': '이름 변경',
            'context.duplicate': '복제',
            'context.move': '이동...',
            'context.changeIcon': '아이콘 변경',
            'context.history': '히스토리',
            'context.decrypt': '암호화 해제',
            'context.delete': '삭제',
            'context.newNote': '새 노트',
            'context.newFolder': '새 폴더',
            'context.newNoteInFolder': '여기에 새 노트',
            'context.newSubfolder': '하위 폴더',
            'context.expand': '펼치기',
            'context.expandAll': '모두 펼치기',
            'context.collapse': '닫기',
            'context.collapseAll': '모두 닫기',
            'context.deleteFolder': '폴더 삭제',

            // Icon Picker
            'iconPicker.title': '아이콘 선택',
            'iconPicker.reset': '기본값으로 초기화',

            // Prompts
            'prompt.enterFolderName': '폴더 이름을 입력하세요:',

            // Confirm
            'confirm.deleteFolder': '이 폴더를 삭제하시겠습니까? (비어있어야 합니다)',
            'confirm.decryptNote': '이 노트의 암호화를 해제하시겠습니까? 파일이 평문으로 저장됩니다.',

            // Toast
            'toast.noteDecrypted': '노트 암호화가 해제되었습니다',
            'toast.codeCopied': '코드가 복사되었습니다!',
            'toast.copyFailed': '복사 실패',

            // Help
            'help.title': '키보드 단축키',
            'help.general': '일반',
            'help.view': '보기',
            'help.editor': '편집기',
            'help.newNote': '새 노트',
            'help.save': '노트 저장',
            'help.search': '노트 검색',
            'help.formatJson': 'JSON 정리',
            'help.help': '도움말 표시',
            'help.toggleSidebar': '사이드바 토글',
            'help.editorFullscreen': '편집기 전체화면',
            'help.previewFullscreen': '미리보기 전체화면',
            'help.closeModal': '모달 닫기 / 전체화면 종료',
            'help.dragDrop': '노트를 폴더로 이동',
            'help.contextMenu': '컨텍스트 메뉴',

            // Attachment
            'attachment.removeConfirm': '이 첨부 파일을 삭제하시겠습니까?',
            'attachment.linkInContentWarning': '\n\n본문에서 {count}번 참조되고 있습니다. 참조도 함께 삭제됩니다.',

            // Date Notes Panel
            'datePanel.empty': '이 날짜에 노트가 없습니다',
            'datePanel.newNote': '이 날짜에 새 노트 만들기',

            // Table Editor
            'tableEditor.title': 'AsciiDoc 테이블 편집기',
            'tableEditor.instructions': '셀을 클릭하고 드래그하여 병합할 셀을 선택하세요. 더블클릭으로 내용을 편집합니다.',
            'tableEditor.merge': '셀 병합',
            'tableEditor.unmerge': '병합 해제',
            'tableEditor.insert': '테이블 삽입',
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
