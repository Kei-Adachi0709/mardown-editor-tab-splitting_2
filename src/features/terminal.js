/**
 * features/terminal.js
 * ターミナル機能 (CommonJS版)
 */

const terminals = new Map();
let activeTerminalId = null;
let terminalConfig = null;
let availableShells = [];

async function initializeTerminal() {
    if (terminals.size > 0) return;

    console.log('[Terminal] Initializing...');
    try {
        terminalConfig = await window.electronAPI.getTerminalConfig();
        availableShells = await window.electronAPI.getAvailableShells();
    } catch (e) {
        console.error("[Terminal] Failed to load config:", e);
    }

    renderShellDropdown();

    window.electronAPI.onTerminalData(({ terminalId, data }) => {
        const term = terminals.get(terminalId);
        if (term) term.xterm.write(data);
    });

    window.electronAPI.onTerminalExit(({ terminalId }) => {
        closeTerminalSession(terminalId);
    });
    
    // リサイズ監視
    const container = document.getElementById('terminal-container');
    if (container) {
        const observer = new ResizeObserver(() => {
            if (activeTerminalId) {
                const term = terminals.get(activeTerminalId);
                if (term) term.fitAddon.fit();
            }
        });
        observer.observe(container);
    }
}

function renderShellDropdown() {
    const shellDropdown = document.getElementById('shell-dropdown');
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

async function createTerminalSession(profileName = null) {
    try {
        const { terminalId, shellName } = await window.electronAPI.createTerminal({ profileName });
        const container = document.getElementById('terminal-container');
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
            lastRows: 0
        });
        
        fitAddon.fit();
        activeTerminalId = terminalId;

        addTerminalTab(terminalId, shellName);
        switchTerminal(terminalId);

    } catch (e) {
        console.error('[Terminal] Create failed:', e);
    }
}

function addTerminalTab(terminalId, name) {
    const list = document.getElementById('terminal-tabs-list');
    if (!list) return;

    const tab = document.createElement('div');
    tab.className = 'terminal-tab active';
    tab.dataset.id = terminalId;
    tab.innerHTML = `<span class="terminal-tab-title">${name}</span><button class="terminal-tab-close">×</button>`;

    tab.addEventListener('click', () => switchTerminal(terminalId));
    tab.querySelector('.terminal-tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTerminalSession(terminalId);
    });
    list.appendChild(tab);
}

function switchTerminal(terminalId) {
    activeTerminalId = terminalId;
    const list = document.getElementById('terminal-tabs-list');
    if (list) {
        Array.from(list.children).forEach(tab => {
            tab.classList.toggle('active', tab.dataset.id == terminalId);
        });
    }

    terminals.forEach((term, id) => {
        if (id === terminalId) {
            term.element.style.display = 'block';
            setTimeout(() => {
                term.fitAddon.fit();
                term.xterm.focus();
            }, 50);
        } else {
            term.element.style.display = 'none';
        }
    });
}

async function closeTerminalSession(terminalId) {
    const term = terminals.get(terminalId);
    if (!term) return;
    
    term.xterm.dispose();
    term.element.remove();
    terminals.delete(terminalId);
    
    const list = document.getElementById('terminal-tabs-list');
    const tab = list?.querySelector(`.terminal-tab[data-id="${terminalId}"]`);
    if (tab) tab.remove();

    await window.electronAPI.closeTerminal(terminalId);
}

module.exports = {
    initializeTerminal,
    createTerminalSession,
    switchTerminal
};