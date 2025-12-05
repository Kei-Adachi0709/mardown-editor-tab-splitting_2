/**
 * features/file-system.js
 * ファイル操作
 */
const path = require('path');
const { openedFiles, fileModificationState } = require("../state.js");

async function openFile(filePath, fileName, layoutManager) {
    console.log(`[FileSystem] Opening: ${filePath}`);
    try {
        let content = '';
        if (openedFiles.has(filePath)) {
            content = openedFiles.get(filePath).content;
        } else {
            if (window.electronAPI?.loadFile) {
                content = await window.electronAPI.loadFile(filePath);
            } else {
                content = "Content load failed.";
            }
            openedFiles.set(filePath, { content, fileName });
        }

        if (layoutManager && layoutManager.activePane) {
            layoutManager.activePane.openFile(filePath);
        }
    } catch (e) {
        console.error('Open error:', e);
    }
}

async function saveCurrentFile(layoutManager) {
    const pane = layoutManager.activePane;
    if (!pane || !pane.activeFilePath) return;

    try {
        const content = pane.editorView.state.doc.toString();
        if (window.electronAPI?.saveFile) {
            await window.electronAPI.saveFile(pane.activeFilePath, content);
            
            const fileData = openedFiles.get(pane.activeFilePath);
            if (fileData) fileData.content = content;
            
            fileModificationState.delete(pane.activeFilePath);
            pane.updateTabs();
            console.log('Saved:', pane.activeFilePath);
        }
    } catch (e) {
        console.error('Save error:', e);
    }
}

async function initializeFileTree() {
    console.log('[FileSystem] Tree init (stub)');
    // ツリー初期化ロジックは renderer.js の移植が必要ならここに書く
}

module.exports = { openFile, saveCurrentFile, initializeFileTree };