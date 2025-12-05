console.log('[Module] Terminal Manager loading...');
window.App = window.App || {};

class TerminalManager {
    constructor() {
        this.terminals = new Map();
        this.activeTerminalId = null;
        this.container = document.getElementById('terminal-container');
        this.tabsList = document.getElementById('terminal-tabs-list');
    }

    async init() {
        // イベントリスナー設定
        const newBtn = document.getElementById('new-terminal-btn');
        if (newBtn) {
            // クローンしてリスナー重複防止
            const clone = newBtn.cloneNode(true);
            newBtn.parentNode.replaceChild(clone, newBtn);
            clone.addEventListener('click', () => this.createSession());
        }

        window.electronAPI.onTerminalData(({ terminalId, data }) => {
            const term = this.terminals.get(terminalId);
            if (term) term.xterm.write(data);
        });
    }

    async createSession() {
        try {
            const { terminalId, shellName } = await window.electronAPI.createTerminal({});
            
            // xterm.js 初期化
            const xterm = new Terminal({
                cursorBlink: true,
                fontSize: 14,
                theme: { background: '#1e1e1e' }
            });
            const fitAddon = new FitAddon.FitAddon();
            xterm.loadAddon(fitAddon);

            const el = document.createElement('div');
            el.className = 'terminal-instance';
            // 初期は非表示
            el.style.visibility = 'hidden'; 
            this.container.appendChild(el);

            xterm.open(el);
            fitAddon.fit();

            xterm.onData(data => window.electronAPI.writeToTerminal(terminalId, data));

            this.terminals.set(terminalId, { xterm, fitAddon, element: el });
            this.addTab(terminalId, shellName);
            this.switchTerminal(terminalId);

        } catch (e) {
            console.error('Terminal create failed:', e);
        }
    }

    addTab(id, name) {
        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.textContent = name;
        tab.dataset.id = id;
        tab.addEventListener('click', () => this.switchTerminal(id));
        this.tabsList.appendChild(tab);
    }

    switchTerminal(id) {
        this.activeTerminalId = id;
        
        // タブのアクティブ表示
        Array.from(this.tabsList.children).forEach(t => {
            t.classList.toggle('active', t.dataset.id == id);
        });

        // ターミナルの表示切り替え
        this.terminals.forEach((term, tid) => {
            if (tid === id) {
                term.element.style.visibility = 'visible';
                term.element.style.opacity = '1';
                term.element.style.zIndex = '10';
                term.fitAddon.fit();
                term.xterm.focus();
            } else {
                term.element.style.visibility = 'hidden';
                term.element.style.opacity = '0';
                term.element.style.zIndex = '0';
            }
        });
    }
}

window.App.TerminalManager = TerminalManager;