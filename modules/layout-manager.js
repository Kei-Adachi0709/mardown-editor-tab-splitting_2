console.log('[Module] Layout Manager loading...');
window.App = window.App || {};

class LayoutManager {
    constructor(rootId, callbacks) {
        this.rootContainer = document.getElementById(rootId);
        this.callbacks = callbacks;
        this.panes = new Map();
        this.paneCounter = 0;
        this.activePaneId = null;
    }

    init() {
        if (!this.rootContainer) {
            console.error('Root container not found');
            return;
        }
        this.rootContainer.innerHTML = '';
        this.panes.clear();
        
        // 初期ペイン
        const id = this.createPane(this.rootContainer);
        this.setActivePane(id);
    }

    createPane(container) {
        const id = `pane-${++this.paneCounter}`;
        // window.App.Pane を使用
        const pane = new window.App.Pane(id, container, this, this.callbacks);
        this.panes.set(id, pane);
        return id;
    }

    setActivePane(id) {
        if (this.activePaneId === id) return; // 変更なしなら無視

        const prev = this.panes.get(this.activePaneId);
        if (prev) prev.element.classList.remove('active');

        this.activePaneId = id;
        const next = this.panes.get(id);
        if (next) {
            next.element.classList.add('active');
            
            // コールバック呼び出し
            if (this.callbacks.onActivePaneChanged) {
                this.callbacks.onActivePaneChanged(next);
            }
        }
    }

    get activePane() {
        return this.panes.get(this.activePaneId);
    }

    removePane(paneId) {
        // 簡易実装: 最後の1つは消さない
        if (this.panes.size <= 1) return;
        
        const pane = this.panes.get(paneId);
        if (pane) {
            pane.destroy();
            this.panes.delete(paneId);
            // 別のペインをアクティブに
            if (this.activePaneId === paneId) {
                const nextId = this.panes.keys().next().value;
                this.setActivePane(nextId);
            }
        }
    }
    
    updateAllPaneSettings() {
        this.panes.forEach(p => p.updateSettings());
    }
}

window.App.LayoutManager = LayoutManager;