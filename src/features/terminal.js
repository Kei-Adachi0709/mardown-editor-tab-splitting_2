/**
 * features/terminal.js
 * xterm.jsを使用したターミナル統合機能。
 */

const terminals = new Map();
let activeTerminalId = null;

export async function initializeTerminal() {
    console.log('[Terminal] Initializing...');
    try {
        // ターミナル設定のロードなど
        // const config = await window.electronAPI.getTerminalConfig();
        
        // 最初のセッション作成
        // createTerminalSession();
    } catch (e) {
        console.error('[Terminal] Init failed:', e);
    }
}

export async function createTerminalSession() {
    // ... (xtermのインスタンス生成、FitAddon適用など) ...
    console.log('[Terminal] Created new session');
}

export function fitActiveTerminal() {
    // ... (リサイズ処理) ...
}