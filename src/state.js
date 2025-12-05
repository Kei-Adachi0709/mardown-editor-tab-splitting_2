/**
 * state.js
 * アプリケーション全体で共有する状態（設定、開いているファイルなど）を管理します。
 */

// アプリケーション設定の初期値
export const appSettings = {
    fontSize: '16px',
    fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
    theme: 'light',
    autoSave: true
};

// 開いているファイルの状態
// Map<filePath, {content: string, fileName: string}>
export const openedFiles = new Map();

// ファイルの変更状態（保存されていない変更があるか）
export const fileModificationState = new Map();

// PDFプレビューの状態
export const pdfState = {
    isVisible: false,
    document: null
};

// 設定をロードする関数
export async function loadSettings() {
    console.log('[State] Loading settings...');
    try {
        if (window.electronAPI && window.electronAPI.loadAppSettings) {
            const settings = await window.electronAPI.loadAppSettings();
            if (settings) {
                Object.assign(appSettings, settings);
                console.log('[State] Settings loaded:', appSettings);
            }
        }
    } catch (e) {
        console.error('[State] Failed to load settings:', e);
    }
}

// 設定を保存する関数
export async function saveSettings() {
    console.log('[State] Saving settings:', appSettings);
    try {
        if (window.electronAPI && window.electronAPI.saveAppSettings) {
            await window.electronAPI.saveAppSettings(appSettings);
        }
    } catch (e) {
        console.error('[State] Failed to save settings:', e);
    }
}