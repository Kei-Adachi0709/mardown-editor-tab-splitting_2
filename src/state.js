/**
 * state.js
 * アプリケーション設定と状態管理
 */

// 設定の初期値
const appSettings = {
    fontSize: '16px',
    fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
    theme: 'light',
    autoSave: true
};

// 開いているファイルの状態
const openedFiles = new Map();

// ファイルの変更状態
const fileModificationState = new Map();

// 設定をロード
async function loadSettings() {
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

// 設定を保存
async function saveSettings() {
    console.log('[State] Saving settings:', appSettings);
    try {
        if (window.electronAPI && window.electronAPI.saveAppSettings) {
            await window.electronAPI.saveAppSettings(appSettings);
        }
    } catch (e) {
        console.error('[State] Failed to save settings:', e);
    }
}

module.exports = {
    appSettings,
    openedFiles,
    fileModificationState,
    loadSettings,
    saveSettings
};