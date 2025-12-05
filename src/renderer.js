/**
 * renderer.js
 * エントリーポイント (CommonJS版)
 */
const { LayoutManager } = require("./layout/manager.js");
const { loadSettings, openedFiles, fileModificationState } = require("./state.js");
const { openFile, saveCurrentFile, initializeFileTree } = require("./features/file-system.js");
const { toggleLinePrefix, toggleMark, insertLink, insertImage, insertTable, insertCodeBlock } = require("./editor/helpers.js");

// インスタンス作成
const layoutManager = new LayoutManager('pane-root');

// グローバル連携
window.layoutManager = layoutManager;

// エディタ入力時のコールバック
window.onEditorInputGlobal = (paneId) => {
    const pane = layoutManager.panes.get(paneId);
    if (!pane) return;

    if (pane.activeFilePath) {
        fileModificationState.set(pane.activeFilePath, true);
        const fileData = openedFiles.get(pane.activeFilePath);
        if (fileData) fileData.content = pane.editorView.state.doc.toString();
        pane.updateTabs();
    }
    
    // 統計更新
    updateStats(pane);
};

window.updateUIForActivePane = (pane) => {
    updateStats(pane);
    
    // ファイル名入力欄の更新
    const titleInput = document.getElementById('file-title-input');
    if (titleInput && pane.activeFilePath) {
        const fileData = openedFiles.get(pane.activeFilePath);
        titleInput.value = fileData ? fileData.fileName : "";
    }
};

function updateStats(pane) {
    const statsEl = document.getElementById('file-stats');
    if (statsEl && pane.editorView) {
        const chars = pane.editorView.state.doc.length;
        const lines = pane.editorView.state.doc.lines;
        statsEl.textContent = `文字数: ${chars} | 行数: ${lines}`;
    }
}

// ボタンイベント設定ヘルパー
function setupButton(id, callback) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', callback);
}

window.addEventListener('load', async () => {
    console.log('[App] Starting...');
    
    await loadSettings();
    layoutManager.init();
    await initializeFileTree();

    // ツールバーのイベントリスナー
    setupButton('btn-save', () => saveCurrentFile(layoutManager));
    
    // 書式ボタン
    setupButton('bold-btn', () => toggleMark(layoutManager.activePane?.editorView, "**"));
    setupButton('italic-btn', () => toggleMark(layoutManager.activePane?.editorView, "*"));
    setupButton('strike-btn', () => toggleMark(layoutManager.activePane?.editorView, "~~"));
    setupButton('highlight-btn', () => toggleMark(layoutManager.activePane?.editorView, "=="));
    
    setupButton('link-btn', () => insertLink(layoutManager.activePane?.editorView));
    setupButton('image-btn', () => insertImage(layoutManager.activePane?.editorView));
    setupButton('btn-table', () => insertTable(layoutManager.activePane?.editorView));
    setupButton('code-btn', () => insertCodeBlock(layoutManager.activePane?.editorView));

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCurrentFile(layoutManager);
        }
    });

    console.log('[App] Ready');
});