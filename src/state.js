/**
 * state.js (ES Module)
 */

export const appSettings = {
    fontSize: '16px',
    fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
    theme: 'light',
    autoSave: true
};

export const openedFiles = new Map();
export const fileModificationState = new Map();

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