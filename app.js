/**
 * app.js - Refactored Entry Point
 */

// --- Error Handling for Debugging ---
window.addEventListener('error', (event) => {
    const errorMsg = event.error ? event.error.stack : event.message;
    console.error('Global Error Caught:', errorMsg);
    // エラー発生時に画面にオーバーレイを表示（開発用）
    showErrorOverlay(`Critical Error: ${event.message}\n\n${errorMsg}`);
});

function showErrorOverlay(message) {
    let overlay = document.getElementById('critical-error-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'critical-error-overlay';
        overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(50, 0, 0, 0.9); color: #ffcccc; z-index: 99999; padding: 20px; overflow: auto; font-family: monospace; white-space: pre-wrap; font-size: 14px;`;
        document.body.appendChild(overlay);
    }
    overlay.textContent += '\n--------------------------\n' + message;
}

console.log('[App] Starting initialization...');

// --- Module Loading ---
const path = require('path');

function safeRequire(modulePath) {
    try {
        console.log(`[App] Loading module: ${modulePath}`);
        return require(path.join(__dirname, modulePath));
    } catch (e) {
        console.error(`[App] Failed to load module: ${modulePath}`, e);
        throw e;
    }
}

// Import Modules
const state = safeRequire('./modules/state');
const uiComponents = safeRequire('./modules/ui-components');
const { LayoutManager } = safeRequire('./modules/layout-manager');
const { FileExplorer } = safeRequire('./modules/file-explorer');
const { TerminalManager } = safeRequire('./modules/terminal-manager');
const pdfPreview = safeRequire('./modules/pdf-preview');
const EditorUtils = safeRequire('./modules/editor-utils'); // 新規作成: 編集ヘルパー

// Instances
let layoutManager;
let fileExplorer;
let terminalManager;

// --- Initialization ---
window.addEventListener('load', async () => {
    console.log('[App] Window Loaded');
    try {
        // 1. Layout Manager
        layoutManager = new LayoutManager('pane-root', {
            onActivePaneChanged: (pane) => updateUIForActivePane(pane),
            onEditorInput: (isDirty) => handleEditorInput(isDirty),
            onSave: () => saveCurrentFile()
        });
        layoutManager.init();

        // 2. File Explorer
        fileExplorer = new FileExplorer(layoutManager);

        // 3. Terminal Manager
        terminalManager = new TerminalManager();
        if (state.isTerminalVisible) {
            await terminalManager.init();
            terminalManager.createSession();
        }

        // 4. Settings & UI
        await loadSettings();
        applySettingsToUI();
        setupGlobalEventListeners();
        setupSidebarEvents();
        setupToolbarEvents(); // ツールバーイベントの設定
        setupOutlineEvents(); // アウトラインイベントの設定

        // 5. Initial File
        openWelcomeFile();

        // 6. PDF Lib Preload
        setTimeout(() => pdfPreview.loadPdfJs(), 1000);

        console.log('[App] Initialization complete.');
        
        // Window Controls
        setupWindowControls();

    } catch (e) {
        console.error('[App] Init failed:', e);
        showErrorOverlay(e.stack);
    }
});

// --- Helper Functions ---

async function loadSettings() {
    try {
        if(window.electronAPI) {
            const settings = await window.electronAPI.loadAppSettings();
            if (settings) Object.assign(state.appSettings, settings);
        }
    } catch (e) { console.warn('Failed to load settings', e); }
}

function applySettingsToUI() {
    if (state.appSettings.theme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
    }
    // Update inputs
    const fontSizeInput = document.getElementById('font-size');
    if (fontSizeInput) fontSizeInput.value = state.appSettings.fontSize;
    // ... other settings mapping if needed
    
    if (layoutManager) layoutManager.updateAllPaneSettings();
}

function updateUIForActivePane(pane) {
    const fileTitleInput = document.getElementById('file-title-input');
    const fileTitleBar = document.getElementById('file-title-bar');
    const stats = document.getElementById('file-stats');

    if (pane && pane.activeFilePath) {
        if (fileTitleBar) fileTitleBar.classList.remove('hidden');
        if (fileTitleInput) {
            const name = state.openedFiles.get(pane.activeFilePath)?.fileName || '';
            // 拡張子を除去して表示
            const extIndex = name.lastIndexOf('.');
            fileTitleInput.value = extIndex > 0 ? name.substring(0, extIndex) : name;
        }
        updateFileStats(pane.editorView);
        updateOutline(); // アウトライン更新
    } else {
        if (fileTitleBar) fileTitleBar.classList.add('hidden');
        if (fileTitleInput) fileTitleInput.value = '';
        if (stats) stats.textContent = '文字数: 0 | 行数: 0';
        // Clear outline
        const outlineTree = document.getElementById('outline-tree');
        if(outlineTree) outlineTree.innerHTML = '';
    }
    
    if (state.isPdfPreviewVisible && pane && pane.editorView) {
        pdfPreview.generatePdfPreview(pane.editorView.state.doc.toString());
    }
}

function updateFileStats(view) {
    const stats = document.getElementById('file-stats');
    if (!view || !stats) return;
    const text = view.state.doc.toString();
    stats.textContent = `文字数: ${text.length} | 行数: ${view.state.doc.lines}`;
}

function handleEditorInput(isDirty) {
    const pane = layoutManager.activePane;
    if (pane && pane.activeFilePath) {
        if (isDirty) {
            state.fileModificationState.set(pane.activeFilePath, true);
            const fileData = state.openedFiles.get(pane.activeFilePath);
            if (fileData) fileData.content = pane.editorView.state.doc.toString();
            pane.updateTabs();
        }
        updateFileStats(pane.editorView);
        
        // Debounced updates
        if (window.outlineUpdateTimeout) clearTimeout(window.outlineUpdateTimeout);
        window.outlineUpdateTimeout = setTimeout(updateOutline, 500);

        if (state.isPdfPreviewVisible) {
            if (state.timeouts.pdfUpdate) clearTimeout(state.timeouts.pdfUpdate);
            state.timeouts.pdfUpdate = setTimeout(() => {
                pdfPreview.generatePdfPreview(pane.editorView.state.doc.toString());
            }, 1000);
        }
    }
}

async function saveCurrentFile() {
    const pane = layoutManager.activePane;
    if (!pane || !pane.activeFilePath) return;
    
    const content = pane.editorView.state.doc.toString();
    try {
        await window.electronAPI.saveFile(pane.activeFilePath, content);
        state.fileModificationState.delete(pane.activeFilePath);
        pane.updateTabs();
        uiComponents.showNotification('保存しました', 'success');
    } catch(e) {
        uiComponents.showNotification('保存失敗', 'error');
    }
}

function openWelcomeFile() {
    const readmePath = 'README.md';
    if (!state.openedFiles.has(readmePath)) {
        state.openedFiles.set(readmePath, {
            content: '# Welcome to Markdown IDE\nStart typing...',
            fileName: 'README.md'
        });
    }
    // 初期ペインがあれば開く
    if (layoutManager.panes.size > 0) {
        const firstPane = layoutManager.panes.values().next().value;
        firstPane.openFile(readmePath);
    }
}

function getActiveView() {
    return layoutManager.activePane ? layoutManager.activePane.editorView : null;
}

// --- Event Listeners Setup ---

function setupGlobalEventListeners() {
    // Save
    document.getElementById('btn-save')?.addEventListener('click', saveCurrentFile);
    
    // PDF Preview Toggle
    document.getElementById('btn-pdf-preview')?.addEventListener('click', togglePdfPreview);

    // Terminal Toggle
    document.getElementById('btn-terminal-right')?.addEventListener('click', toggleTerminal);

    // Zen Mode
    document.getElementById('btn-zen')?.addEventListener('click', () => {
        document.getElementById('ide-container').classList.toggle('zen-mode-active');
    });

    // Settings
    document.getElementById('btn-settings')?.addEventListener('click', () => {
        switchMainView('content-settings');
    });
}

function togglePdfPreview() {
    state.isPdfPreviewVisible = !state.isPdfPreviewVisible;
    const rightPane = document.getElementById('right-pane');
    
    if (state.isPdfPreviewVisible) {
        state.isTerminalVisible = false;
        rightPane.classList.remove('hidden');
        document.getElementById('pdf-preview-header').classList.remove('hidden');
        document.getElementById('pdf-preview-container').classList.remove('hidden');
        document.getElementById('terminal-header').classList.add('hidden');
        document.getElementById('terminal-container').classList.add('hidden');
        
        const pane = layoutManager.activePane;
        if(pane) pdfPreview.generatePdfPreview(pane.editorView.state.doc.toString());
    } else {
        rightPane.classList.add('hidden');
    }
    // UI更新（ボタンのactive状態など）はCSSやrenderer.jsのロジックに合わせるなら必要
    document.getElementById('btn-pdf-preview')?.classList.toggle('active', state.isPdfPreviewVisible);
    document.getElementById('btn-terminal-right')?.classList.toggle('active', false);
}

function toggleTerminal() {
    state.isTerminalVisible = !state.isTerminalVisible;
    state.isPdfPreviewVisible = false;
    
    const rightPane = document.getElementById('right-pane');
    const termContainer = document.getElementById('terminal-container');
    
    if (state.isTerminalVisible) {
        rightPane.classList.remove('hidden');
        document.getElementById('terminal-header').classList.remove('hidden');
        termContainer.classList.remove('hidden');
        document.getElementById('pdf-preview-header').classList.add('hidden');
        document.getElementById('pdf-preview-container').classList.add('hidden');
        
        if (terminalManager.terminals.size === 0) {
            terminalManager.init().then(() => terminalManager.createSession());
        }
    } else {
        rightPane.classList.add('hidden');
    }
    document.getElementById('btn-terminal-right')?.classList.toggle('active', state.isTerminalVisible);
    document.getElementById('btn-pdf-preview')?.classList.toggle('active', false);
}

// --- Sidebar Switching ---
function setupSidebarEvents() {
    const btns = document.querySelectorAll('.side-switch');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            switchSidebarTab(targetId);
        });
    });

    document.getElementById('btn-toggle-leftpane')?.addEventListener('click', () => {
        const leftPane = document.getElementById('left-pane');
        const ideContainer = document.getElementById('ide-container');
        const isHidden = leftPane.classList.contains('hidden');
        
        if (isHidden) {
            leftPane.classList.remove('hidden');
            ideContainer.classList.remove('left-pane-hidden');
        } else {
            leftPane.classList.add('hidden');
            ideContainer.classList.add('left-pane-hidden');
        }
    });
}

function switchSidebarTab(targetId) {
    // Buttons Active State
    document.querySelectorAll('.side-switch').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.side-switch[data-target="${targetId}"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // Show Left Pane if hidden
    const leftPane = document.getElementById('left-pane');
    if(leftPane.classList.contains('hidden')) {
        leftPane.classList.remove('hidden');
        document.getElementById('ide-container').classList.remove('left-pane-hidden');
    }

    // Switch Content
    document.querySelectorAll('.left-pane-content').forEach(c => c.classList.add('content-hidden'));
    const targetContent = document.getElementById(`content-${targetId}`);
    if(targetContent) targetContent.classList.remove('content-hidden');

    // Switch Header Buttons
    document.querySelectorAll('.header-buttons').forEach(h => h.classList.add('content-hidden'));
    const targetHeader = document.getElementById(`header-buttons-${targetId}`);
    if(targetHeader) targetHeader.classList.remove('content-hidden');

    if(targetId === 'outline') updateOutline();
}

// --- Toolbar Events (Using EditorUtils) ---
function setupToolbarEvents() {
    // Undo/Redo
    document.getElementById('toolbar-undo')?.addEventListener('click', () => {
        const v = getActiveView();
        if(v) { EditorUtils.undo(v); v.focus(); }
    });
    document.getElementById('toolbar-redo')?.addEventListener('click', () => {
        const v = getActiveView();
        if(v) { EditorUtils.redo(v); v.focus(); }
    });

    // Formatting
    document.getElementById('bold-btn')?.addEventListener('click', () => EditorUtils.toggleMark(getActiveView(), "**"));
    document.getElementById('italic-btn')?.addEventListener('click', () => EditorUtils.toggleMark(getActiveView(), "*"));
    document.getElementById('strike-btn')?.addEventListener('click', () => EditorUtils.toggleMark(getActiveView(), "~~"));
    document.getElementById('highlight-btn')?.addEventListener('click', () => EditorUtils.toggleMark(getActiveView(), "=="));
    
    // Headings
    document.getElementById('btn-h2')?.addEventListener('click', () => EditorUtils.toggleLinePrefix(getActiveView(), "##"));
    document.getElementById('btn-h3')?.addEventListener('click', () => EditorUtils.toggleLinePrefix(getActiveView(), "###"));
    
    // Inserts
    document.getElementById('link-btn')?.addEventListener('click', () => EditorUtils.insertLink(getActiveView()));
    document.getElementById('image-btn')?.addEventListener('click', () => EditorUtils.insertImage(getActiveView()));
    document.getElementById('btn-table')?.addEventListener('click', () => EditorUtils.insertTable(getActiveView()));
    document.getElementById('code-btn')?.addEventListener('click', () => EditorUtils.insertCodeBlock(getActiveView()));
    document.getElementById('inline-code-btn')?.addEventListener('click', () => EditorUtils.toggleMark(getActiveView(), "`"));
    document.getElementById('quote-btn')?.addEventListener('click', () => EditorUtils.toggleLinePrefix(getActiveView(), ">"));
    document.getElementById('hr-btn')?.addEventListener('click', () => EditorUtils.insertHorizontalRule(getActiveView()));
    document.getElementById('btn-page-break')?.addEventListener('click', () => EditorUtils.insertPageBreak(getActiveView()));

    // Lists
    document.getElementById('btn-bullet-list')?.addEventListener('click', () => EditorUtils.toggleList(getActiveView(), 'ul'));
    document.getElementById('btn-number-list')?.addEventListener('click', () => EditorUtils.toggleList(getActiveView(), 'ol'));
    document.getElementById('btn-check-list')?.addEventListener('click', () => EditorUtils.toggleList(getActiveView(), 'task'));

    // Dropdowns
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if(action && action.startsWith('h')) {
                const level = parseInt(action.replace('h', ''));
                EditorUtils.toggleLinePrefix(getActiveView(), "#".repeat(level));
            }
        });
    });
}

// --- Outline Logic ---
function setupOutlineEvents() {
    document.getElementById('btn-outline-collapse')?.addEventListener('click', () => {
        document.querySelectorAll('.outline-item').forEach(i => {
            if(parseInt(i.dataset.level) > 1) i.classList.add('hidden-outline-item');
        });
    });
    document.getElementById('btn-outline-expand')?.addEventListener('click', () => {
        document.querySelectorAll('.outline-item').forEach(i => i.classList.remove('hidden-outline-item'));
    });
}

function updateOutline() {
    const view = getActiveView();
    const outlineTree = document.getElementById('outline-tree');
    if (!outlineTree || !view) return;

    const content = view.state.doc.toString();
    const headers = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.*)/);
        if (match) {
            headers.push({
                level: match[1].length,
                text: match[2],
                lineNumber: index
            });
        }
    });

    if (headers.length === 0) {
        outlineTree.innerHTML = '<li style="color: #999; padding: 5px;">見出しがありません</li>';
        return;
    }

    let html = '';
    headers.forEach((header) => {
        const paddingLeft = (header.level - 1) * 15 + 5;
        const fontSize = Math.max(14 - (header.level - 1), 11);
        html += `<li class="outline-item" data-line="${header.lineNumber}" data-level="${header.level}" style="padding-left: ${paddingLeft}px; font-size: ${fontSize}px;">
            <span class="outline-text">${header.text}</span>
        </li>`;
    });

    outlineTree.innerHTML = html;

    outlineTree.querySelectorAll('.outline-item').forEach(item => {
        item.addEventListener('click', () => {
            const lineNum = parseInt(item.dataset.line);
            const line = view.state.doc.line(lineNum + 1);
            view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
            view.focus();
        });
    });
}

// --- View Switching (Settings vs Editor) ---
function switchMainView(targetId) {
    document.getElementById('content-readme').classList.add('content-hidden');
    document.getElementById('content-settings').classList.add('content-hidden');
    document.getElementById(targetId).classList.remove('content-hidden');
    
    // Toggle Title Bar visibility
    const fileTitleBar = document.getElementById('file-title-bar');
    if (targetId === 'content-settings') {
        if(fileTitleBar) fileTitleBar.classList.add('hidden');
    } else {
        const pane = layoutManager.activePane;
        if (pane && pane.activeFilePath && fileTitleBar) {
            fileTitleBar.classList.remove('hidden');
        }
    }
}

// --- Window Controls ---
function setupWindowControls() {
    document.getElementById('btn-minimize')?.addEventListener('click', () => window.electronAPI.minimizeWindow());
    document.getElementById('btn-maximize')?.addEventListener('click', () => window.electronAPI.maximizeWindow());
    document.getElementById('btn-close')?.addEventListener('click', () => window.electronAPI.closeWindow());
}