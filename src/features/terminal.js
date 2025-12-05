/**
 * features/terminal.js (ES Module 完全版)
 */

const terminals = new Map();
let activeTerminalId = null;
let terminalConfig = null;
let availableShells = [];

// DOM要素取得用ヘルパー
const getContainer = () => document.getElementById('terminal-container');
const getTabsList = () => document.getElementById('terminal-tabs-list');
const getDropdown = () => document.getElementById('shell-dropdown');

export async function initializeTerminal() {
    if (terminals.size > 0) return;

    console.log('[Terminal] Initializing...');
    try {
        if (window.electronAPI) {
            terminalConfig = await window.electronAPI.getTerminalConfig();
            availableShells = await window.electronAPI.getAvailableShells();
            
            // データ受信リスナー
            window.electronAPI.onTerminalData(({ terminalId, data }) => {
                const term = terminals.get(terminalId);
                if (term) term.xterm.write(data);
            });

            window.electronAPI.onTerminalExit(({ terminalId }) => {
                closeTerminalSession(terminalId);
            });
        }
    } catch (e) {
        console.error("[Terminal] Failed to load config:", e);
    }

    renderShellDropdown();
    setupTerminalResizeObserver();
}

function renderShellDropdown() {
    const shellDropdown = getDropdown();
    if (!shellDropdown) return;
    
    shellDropdown.innerHTML = '';
    if (availableShells.length === 0) {
        shellDropdown.innerHTML = '<div class="dropdown-item">No shells</div>';
        return;
    }
    
    availableShells.forEach(shell => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = shell.displayName;
        item.addEventListener('click', () => {
            createTerminalSession(shell.name);
            shellDropdown.classList.add('hidden');
        });
        shellDropdown.appendChild(item);
    });
}

export async function createTerminalSession(profileName = null) {
    if(!window.electronAPI) {
        console.warn("[Terminal] Electron API not available");
        return;
    }

    try {
        const { terminalId, shellName } = await window.electronAPI.createTerminal({ profileName });
        const container = getContainer();
        if (!container) return;

        const xterm = new Terminal({
            cursorBlink: terminalConfig?.cursorBlink ?? true,
            fontSize: terminalConfig?.fontSize || 14,
            fontFamily: terminalConfig?.fontFamily || 'Consolas, "Courier New", monospace',
            theme: terminalConfig?.theme || { background: '#1e1e1e' },
            allowTransparency: true,
            windowsMode: navigator.platform.indexOf('Win') > -1
        });

        const fitAddon = new FitAddon.FitAddon();
        xterm.loadAddon(fitAddon);

        if (typeof WebLinksAddon !== 'undefined') {
            xterm.loadAddon(new WebLinksAddon.WebLinksAddon());
        }

        const el = document.createElement('div');
        el.className = 'terminal-instance';
        el.id = `term-${terminalId}`;
        container.appendChild(el);

        xterm.open(el);
        xterm.onData(data => window.electronAPI.writeToTerminal(terminalId, data));

        terminals.set(terminalId, {
            xterm,
            fitAddon,
            element: el,
            lastCols: 0,
            lastRows: 0,
            resizeTimeout: null
        });
        
        // 初期サイズ合わせ
        setTimeout(() => fitTerminal(terminalId), 50);
        
        activeTerminalId = terminalId;
        addTerminalTab(terminalId, shellName);
        switchTerminal(terminalId);

    } catch (e) {
        console.error('[Terminal] Create failed:', e);
    }
}

function addTerminalTab(id, name) {
    const list = getTabsList();
    if (!list) return;

    const tab = document.createElement('div');
    tab.className = 'terminal-tab active';
    tab.dataset.id = id;
    tab.innerHTML = `<span class="terminal-tab-title">${name}</span><button class="terminal-tab-close">×</button>`;

    tab.addEventListener('click', () => switchTerminal(id));
    
    const closeBtn = tab.querySelector('.terminal-tab-close');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTerminalSession(id);
    });
    
    list.appendChild(tab);
}

export function switchTerminal(id) {
    activeTerminalId = id;
    const list = getTabsList();
    if (list) {
        Array.from(list.children).forEach(tab => {
            tab.classList.toggle('active', tab.dataset.id == id);
        });
    }

    terminals.forEach((term, tid) => {
        if (tid === id) {
            term.element.style.visibility = 'visible';
            term.element.style.opacity = '1';
            term.element.style.zIndex = '10';
            setTimeout(() => {
                fitTerminal(tid);
                term.xterm.focus();
            }, 50);
        } else {
            term.element.style.visibility = 'hidden';
            term.element.style.opacity = '0';
            term.element.style.zIndex = '0';
        }
    });
}

export async function closeTerminalSession(terminalId) {
    const term = terminals.get(terminalId);
    if (!term) return;

    if (term.resizeTimeout) clearTimeout(term.resizeTimeout);
    term.xterm.dispose();
    term.element.remove();
    terminals.delete(terminalId);

    const list = getTabsList();
    const tab = list?.querySelector(`.terminal-tab[data-id="${terminalId}"]`);
    if (tab) tab.remove();

    if (window.electronAPI) {
        await window.electronAPI.closeTerminal(terminalId);
    }

    if (activeTerminalId === terminalId) {
        activeTerminalId = null;
        if (terminals.size > 0) {
            switchTerminal(terminals.keys().next().value);
        }
    }
}

function fitTerminal(terminalId) {
    const term = terminals.get(terminalId);
    if (!term || !term.fitAddon) return;
    
    // 非表示状態ではサイズ計算できないのでスキップ
    if (term.element.offsetParent === null) return;

    try {
        term.fitAddon.fit();
        const newCols = term.xterm.cols;
        const newRows = term.xterm.rows;

        if (newCols <= 0 || newRows <= 0) return;
        if (term.lastCols === newCols && term.lastRows === newRows) return;

        if (term.resizeTimeout) clearTimeout(term.resizeTimeout);

        term.resizeTimeout = setTimeout(() => {
            if(window.electronAPI) {
                window.electronAPI.resizeTerminal(terminalId, newCols, newRows);
            }
            term.lastCols = newCols;
            term.lastRows = newRows;
            term.xterm.refresh(0, newRows - 1);
        }, 50);
    } catch (e) {
        console.warn(`Fit terminal ${terminalId} failed:`, e);
    }
}

function setupTerminalResizeObserver() {
    const container = getContainer();
    if (!container) return;
    
    const observer = new ResizeObserver(() => {
        if (activeTerminalId) {
            requestAnimationFrame(() => fitTerminal(activeTerminalId));
        }
    });
    observer.observe(container);
}