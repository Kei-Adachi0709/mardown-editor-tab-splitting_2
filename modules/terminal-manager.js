const state = require('./state');

class TerminalManager {
    constructor() {
        this.terminals = new Map();
        this.activeTerminalId = null;
        this.container = document.getElementById('terminal-container');
        this.tabsList = document.getElementById('terminal-tabs-list');
    }

    async init() {
        this.setupEvents();
    }

    setupEvents() {
        // UI events
        const newBtn = document.getElementById('new-terminal-btn');
        if(newBtn) {
            const clone = newBtn.cloneNode(true);
            newBtn.parentNode.replaceChild(clone, newBtn);
            clone.addEventListener('click', () => this.createSession());
        }
        
        window.electronAPI.onTerminalData(({ terminalId, data }) => {
            const t = this.terminals.get(terminalId);
            if(t) t.xterm.write(data);
        });
    }

    async createSession() {
        const { terminalId, shellName } = await window.electronAPI.createTerminal({});
        
        const xterm = new Terminal({ cursorBlink: true, fontSize: 14, theme: { background: '#1e1e1e' } });
        const fitAddon = new FitAddon.FitAddon();
        xterm.loadAddon(fitAddon);
        
        const el = document.createElement('div');
        el.className = 'terminal-instance';
        el.style.visibility = 'hidden';
        this.container.appendChild(el);
        
        xterm.open(el);
        fitAddon.fit();
        
        xterm.onData(d => window.electronAPI.writeToTerminal(terminalId, d));
        
        this.terminals.set(terminalId, { xterm, fitAddon, element: el });
        this.addTab(terminalId, shellName);
        this.switchTerminal(terminalId);
    }

    addTab(id, name) {
        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.dataset.id = id;
        tab.innerHTML = `<span class="terminal-tab-title">${name}</span><button>x</button>`;
        tab.addEventListener('click', () => this.switchTerminal(id));
        this.tabsList.appendChild(tab);
    }

    switchTerminal(id) {
        this.activeTerminalId = id;
        this.terminals.forEach((t, tid) => {
            if(tid === id) {
                t.element.style.visibility = 'visible';
                t.element.style.opacity = '1';
                t.element.style.zIndex = '10';
                t.fitAddon.fit();
                t.xterm.focus();
            } else {
                t.element.style.visibility = 'hidden';
                t.element.style.opacity = '0';
                t.element.style.zIndex = '0';
            }
        });
        
        Array.from(this.tabsList.children).forEach(t => {
            t.classList.toggle('active', t.dataset.id == id);
        });
    }
}
module.exports = { TerminalManager };