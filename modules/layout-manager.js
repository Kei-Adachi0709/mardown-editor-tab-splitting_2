const { Pane } = require('./editor-pane');
const state = require('./state');

class LayoutManager {
    constructor(rootContainerId, callbacks) {
        this.panes = new Map();
        this.activePaneId = null;
        this.paneCounter = 0;
        this.rootContainer = document.getElementById(rootContainerId);
        this.callbacks = callbacks || {};
        this.dragSource = null;
    }

    init() {
        this.rootContainer.innerHTML = '';
        this.panes.clear();
        const id = this.createPane(this.rootContainer);
        this.setActivePane(id);
        this.setupDragDrop();
    }

    createPane(container) {
        const id = `pane-${++this.paneCounter}`;
        const pane = new Pane(id, container, this, this.callbacks);
        this.panes.set(id, pane);
        return id;
    }

    removePane(paneId) {
        const pane = this.panes.get(paneId);
        if (!pane) return;
        if (pane.element.parentNode === this.rootContainer) {
            if (pane.files.length === 0) pane.setEditorContent("");
            return;
        }
        const parentSplit = pane.element.parentNode;
        const grandParent = parentSplit.parentNode;
        const sibling = Array.from(parentSplit.children).find(el => el !== pane.element);
        
        grandParent.replaceChild(sibling, parentSplit);
        sibling.style.flex = '1';
        
        pane.destroy();
        this.panes.delete(paneId);
        if (this.activePaneId === paneId) this.activateNearestPane(sibling);
    }

    activateNearestPane(element) {
        const firstPane = element.classList.contains('pane') ? element : element.querySelector('.pane');
        if (firstPane) this.setActivePane(firstPane.dataset.id);
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
            if (this.callbacks.onActivePaneChanged) this.callbacks.onActivePaneChanged(next);
        }
    }

    get activePane() { return this.panes.get(this.activePaneId); }

    setDragSource(paneId, filePath) { this.dragSource = { paneId, filePath }; }

    splitPane(targetId, direction) {
        const target = this.panes.get(targetId);
        if (!target) return;
        
        const parent = target.element.parentNode;
        const split = document.createElement('div');
        split.className = `split-container ${['left','right'].includes(direction) ? 'horizontal' : 'vertical'}`;
        split.style.flex = '1';
        
        parent.replaceChild(split, target.element);
        const newId = this.createPane(split);
        const newPane = this.panes.get(newId);
        
        target.element.style.flex = '1';
        newPane.element.style.flex = '1';

        if (['left','top'].includes(direction)) {
            split.appendChild(newPane.element);
            split.appendChild(target.element);
        } else {
            split.appendChild(target.element);
            split.appendChild(newPane.element);
        }
        return newId;
    }

    setupDragDrop() {
        const overlay = document.getElementById('drop-overlay');
        const indicator = document.getElementById('drop-indicator');
        const area = document.getElementById('content-readme'); // エディタエリア全体

        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!this.dragSource) return;
            
            const rect = area.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const w = rect.width, h = rect.height;
            
            let zone = 'center';
            if (x < w * 0.2) zone = 'left';
            else if (x > w * 0.8) zone = 'right';
            else if (y < h * 0.2) zone = 'top';
            else if (y > h * 0.8) zone = 'bottom';

            overlay.classList.remove('hidden');
            indicator.style.top = indicator.style.left = '0';
            indicator.style.width = indicator.style.height = '100%';
            
            if (zone === 'left') indicator.style.width = '50%';
            else if (zone === 'right') { indicator.style.left = '50%'; indicator.style.width = '50%'; }
            else if (zone === 'top') indicator.style.height = '50%';
            else if (zone === 'bottom') { indicator.style.top = '50%'; indicator.style.height = '50%'; }
            
            this.currentDropZone = zone;
        });

        area.addEventListener('dragleave', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });

        area.addEventListener('drop', (e) => {
            e.preventDefault();
            overlay.classList.add('hidden');
            if (!this.dragSource) return;

            const zone = this.currentDropZone;
            const targetId = this.activePaneId; // 簡易的にアクティブペインをターゲットとする
            
            if (zone === 'center') {
                if (targetId !== this.dragSource.paneId) {
                    this.panes.get(targetId).openFile(this.dragSource.filePath);
                    this.panes.get(this.dragSource.paneId).closeFile(this.dragSource.filePath, true);
                    this.setActivePane(targetId);
                }
            } else {
                const newId = this.splitPane(targetId, zone);
                this.panes.get(newId).openFile(this.dragSource.filePath);
                this.panes.get(this.dragSource.paneId).closeFile(this.dragSource.filePath, true);
                this.setActivePane(newId);
            }
            this.dragSource = null;
        });
    }

    updateAllPaneSettings() {
        this.panes.forEach(p => p.updateSettings());
    }
}
module.exports = { LayoutManager };