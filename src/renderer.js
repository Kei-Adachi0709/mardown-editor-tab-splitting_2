/**
 * renderer.js
 * アプリケーションのエントリーポイント。
 * 各モジュールを初期化し、イベントを紐付けます。
 */
import { LayoutManager } from "./layout/manager.js";
import { loadSettings, fileModificationState, openedFiles } from "./state.js";
import { openFile, saveCurrentFile, initializeFileTree } from "./features/file-system.js";
import { initializeTerminal } from "./features/terminal.js";

// レイアウトマネージャーのインスタンス
const layoutManager = new LayoutManager('pane-root');

// グローバルコールバック（Paneからの呼び出し用）
window.onEditorInputGlobal = (paneId) => {
    const pane = layoutManager.panes.get(paneId);
    if (!pane) return;

    // 変更フラグを立てる
    if (pane.activeFilePath) {
        fileModificationState.set(pane.activeFilePath, true);
        const fileData = openedFiles.get(pane.activeFilePath);
        if (fileData) {
            fileData.content = pane.editorView.state.doc.toString();
        }
        pane.updateTabs();
    }
    
    // アウトライン更新や統計情報の更新などをここにフック
};

// UI更新用コールバック
window.updateUIForActivePane = (pane) => {
    // ファイル名表示の更新や統計情報の更新
    const statsEl = document.getElementById('file-stats');
    if (statsEl && pane.editorView) {
        const lines = pane.editorView.state.doc.lines;
        statsEl.textContent = `Lines: ${lines}`;
    }
};

// 初期化処理
window.addEventListener('load', async () => {
    console.log('[App] Starting Markdown IDE...');

    try {
        // 1. 設定ロード
        await loadSettings();

        // 2. レイアウト初期化
        layoutManager.init();

        // 3. ファイルツリー初期化
        await initializeFileTree();

        // 4. ターミナル初期化（必要であれば）
        // initializeTerminal();

        // 5. キーボードショートカット登録
        document.addEventListener('keydown', (e) => {
            // 保存 (Ctrl+S)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveCurrentFile(layoutManager);
            }
        });

        // 6. 初期ファイル（READMEなど）を開く
        // openFile('README.md', 'README.md', layoutManager);

        console.log('[App] Initialization complete.');
    } catch (e) {
        console.error('[App] Critical initialization error:', e);
    }
});

// デバッグ用にグローバル公開（必要に応じて）
window.layoutManager = layoutManager;