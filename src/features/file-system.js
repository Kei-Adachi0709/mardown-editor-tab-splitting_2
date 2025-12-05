/**
 * features/file-system.js
 * ファイルの読み込み、保存、ファイルツリーの操作を担当します。
 */
import { openedFiles, fileModificationState } from "../state.js";

// 現在のディレクトリパス
let currentDirectoryPath = null;
let currentSortOrder = 'asc';

export async function openFile(filePath, fileName, layoutManager) {
    console.log(`[FileSystem] Opening file: ${fileName} (${filePath})`);
    
    // パスの正規化などはここで行う（pathモジュールなどが使える環境前提）
    
    try {
        let content = '';
        if (openedFiles.has(filePath)) {
            content = openedFiles.get(filePath).content;
        } else {
            // Electron API経由で読み込み
            if (window.electronAPI?.loadFile) {
                content = await window.electronAPI.loadFile(filePath);
            } else {
                content = "(Unable to load file content)";
            }
            // キャッシュに保存
            openedFiles.set(filePath, { content, fileName });
        }

        // アクティブなペインで開く
        if (layoutManager && layoutManager.activePane) {
            layoutManager.activePane.openFile(filePath);
        }
    } catch (e) {
        console.error('[FileSystem] Error opening file:', e);
        // エラー通知UIの呼び出しなど
    }
}

export async function saveCurrentFile(layoutManager) {
    const pane = layoutManager.activePane;
    if (!pane || !pane.activeFilePath) return;

    console.log(`[FileSystem] Saving file: ${pane.activeFilePath}`);
    try {
        const content = pane.editorView.state.doc.toString();
        
        if (window.electronAPI?.saveFile) {
            await window.electronAPI.saveFile(pane.activeFilePath, content);
            
            // 状態更新
            const fileData = openedFiles.get(pane.activeFilePath);
            if (fileData) fileData.content = content;
            fileModificationState.delete(pane.activeFilePath);
            
            pane.updateTabs();
            console.log('[FileSystem] File saved successfully');
        }
    } catch (e) {
        console.error('[FileSystem] Save failed:', e);
    }
}

export async function initializeFileTree() {
    console.log('[FileSystem] Initializing file tree...');
    // ... (ファイルツリー構築ロジック) ...
}