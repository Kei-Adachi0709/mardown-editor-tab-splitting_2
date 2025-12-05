/**
 * renderer.js (ES Module Entry Point)
 */
import { LayoutManager } from "./layout/manager.js";
import { loadSettings, openedFiles, fileModificationState } from "./state.js";
import { openFile, saveCurrentFile, initializeFileTree } from "./features/file-system.js";
import { 
    toggleLinePrefix, toggleMark, insertLink, insertImage, insertTable, insertCodeBlock 
} from "./editor/helpers.js";
import { initializeTerminal, createTerminalSession } from "./features/terminal.js";
import { loadPdfJs, togglePdfPreview } from "./features/pdf-preview.js";

// import { livePreviewPlugin } from "../livePreviewPlugin.js"; // 共通JS非対応のためコメントアウト
// import { tablePlugin } from "../tablePlugin.js"; // 共通JS非対応のためコメントアウト

const layoutManager = new LayoutManager('pane-root');
window.layoutManager = layoutManager;

window.onEditorInputGlobal = (paneId) => {
    const pane = layoutManager.panes.get(paneId);
    if (!pane) return;
    if (pane.activeFilePath) {
        fileModificationState.set(pane.activeFilePath, true);
        openedFiles.get(pane.activeFilePath).content = pane.editorView.state.doc.toString();
        pane.updateTabs();
    }
    updateStats(pane);
};

window.updateUIForActivePane = (pane) => {
    updateStats(pane);
    const titleInput = document.getElementById('file-title-input');
    if (titleInput) {
        titleInput.value = openedFiles.get(pane.activeFilePath)?.fileName || "";
    }
};

function updateStats(pane) {
    const statsEl = document.getElementById('file-stats');
    if (statsEl && pane.editorView) {
        statsEl.textContent = `文字数: ${pane.editorView.state.doc.length} | 行数: ${pane.editorView.state.doc.lines}`;
    }
}

function setupButton(id, cb) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', cb);
}

window.addEventListener('load', async () => {
    console.log('[App] Starting (ESM)...');
    await loadSettings();
    layoutManager.init();
    await initializeFileTree();

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

    // ターミナル
    setupButton('btn-terminal-right', () => {
        initializeTerminal();
        const container = document.getElementById('terminal-container');
        if(container) container.classList.toggle('hidden');
    });
    setupButton('new-terminal-btn', () => createTerminalSession());

    // PDF
    setupButton('btn-pdf-preview', () => {
        const pane = document.getElementById('pdf-preview-container');
        const isHidden = pane.classList.contains('hidden');
        pane.classList.toggle('hidden');
        togglePdfPreview(isHidden);
    });

    console.log('[App] Ready');
});