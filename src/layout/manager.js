/**
 * layout/manager.js
 * レイアウトマネージャー
 */
const { Pane } = require("./pane.js");

class LayoutManager {
    constructor(rootContainerId) {
        this.panes = new Map();
        this.activePaneId = null;
        this.paneCounter = 0;
        this.rootContainerId = rootContainerId;
    }

    init() {
        console.log('[LayoutManager] Init');
        const container = document.getElementById(this.rootContainerId);
        if (!container) return;
        
        container.innerHTML = '';
        this.panes.clear();
        
        const initialPaneId = this.createPane(container);
        this.setActivePane(initialPaneId);
    }

    createPane(container) {
        const id = `pane-${++this.paneCounter}`;
        const pane = new Pane(id, container, this);
        this.panes.set(id, pane);
        return id;
    }

    setActivePane(id) {
        if (this.activePaneId) {
            const prev = this.panes.get(this.activePaneId);
            if (prev) prev.element.classList.remove('active');
        }
        this.activePaneId = id;
        const next = this.panes.get(id);
        if (next) {
            next.element.classList.add('active');
            if (window.updateUIForActivePane) {
                window.updateUIForActivePane(next);
            }
        }
    }

    get activePane() {
        return this.panes.get(this.activePaneId);
    }

    removePane(id) {
        const pane = this.panes.get(id);
        if (!pane) return;
        
        // 最後のペインは削除しない
        if (this.panes.size <= 1) return;

        pane.destroy();
        this.panes.delete(id);
        
        // 別のペインをアクティブに
        if (this.activePaneId === id) {
            const nextId = this.panes.keys().next().value;
            this.setActivePane(nextId);
        }
    }
}

module.exports = { LayoutManager };