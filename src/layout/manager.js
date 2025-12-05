/**
 * layout/manager.js (ES Module 完全版)
 * レイアウト管理、画面分割、ペイン管理
 */
import { Pane } from "./pane.js";

export class LayoutManager {
    constructor(rootContainerId) {
        this.panes = new Map();
        this.activePaneId = null;
        this.paneCounter = 0;
        this.rootContainerId = rootContainerId;
        this.dragSource = null; // { paneId, filePath }
        this.rootContainer = null;
    }

    init() {
        console.log('[LayoutManager] Init');
        this.rootContainer = document.getElementById(this.rootContainerId);
        if (!this.rootContainer) return;

        this.rootContainer.innerHTML = '';
        this.panes.clear();
        
        // 初期ペイン
        const initialPaneId = this.createPane(this.rootContainer);
        this.setActivePane(initialPaneId);
        
        this.setupDragDrop();
    }

    createPane(container) {
        const id = `pane-${++this.paneCounter}`;
        const pane = new Pane(id, container, this);
        this.panes.set(id, pane);
        return id;
    }

    setActivePane(id) {
        if (this.activePaneId) {
            this.panes.get(this.activePaneId)?.element.classList.remove('active');
        }
        this.activePaneId = id;
        const next = this.panes.get(id);
        if (next) {
            next.element.classList.add('active');
            if (window.updateUIForActivePane) window.updateUIForActivePane(next);
        }
    }

    get activePane() { return this.panes.get(this.activePaneId); }

    removePane(id) {
        const pane = this.panes.get(id);
        if (!pane) return;

        // ルート直下の最後の1つは削除しない
        if (pane.element.parentNode === this.rootContainer && this.panes.size <= 1) {
            pane.setEditorContent(""); // 空にするだけ
            return;
        }

        // 親コンテナ（分割コンテナ）の処理
        const parentSplit = pane.element.parentNode;
        const grandParent = parentSplit.parentNode;

        // 兄弟要素を探して昇格させる（簡易実装）
        // 厳密なDOM操作は元のロジックが必要だが、ここではシンプルに「残った方を親に付け替える」
        if (parentSplit.classList.contains('split-container')) {
            const sibling = Array.from(parentSplit.children).find(el => el !== pane.element);
            if (sibling) {
                // スタイルリセット
                sibling.style.width = ''; sibling.style.height = ''; sibling.style.flex = '1';
                grandParent.replaceChild(sibling, parentSplit);
            }
        } else {
             // ルート直下の場合など
             pane.element.remove();
        }

        pane.destroy();
        this.panes.delete(id);
        
        if (this.activePaneId === id) {
            // 適当なペインをアクティブに
            const nextId = this.panes.keys().next().value;
            if(nextId) this.setActivePane(nextId);
        }
    }

    // 画面分割
    splitPane(targetPaneId, direction) {
        const targetPane = this.panes.get(targetPaneId);
        if (!targetPane) return null;

        const parent = targetPane.element.parentNode;
        
        const splitContainer = document.createElement('div');
        splitContainer.className = `split-container ${['left','right'].includes(direction) ? 'horizontal' : 'vertical'}`;
        splitContainer.style.flex = '1';
        
        parent.replaceChild(splitContainer, targetPane.element);
        
        // 新しいペイン
        const newPaneId = this.createPane(splitContainer);
        const newPane = this.panes.get(newPaneId);

        // 要素再配置
        targetPane.element.style.flex = '1';
        newPane.element.style.flex = '1';
        
        if (direction === 'left' || direction === 'top') {
            splitContainer.appendChild(newPane.element);
            splitContainer.appendChild(targetPane.element);
        } else {
            splitContainer.appendChild(targetPane.element);
            splitContainer.appendChild(newPane.element);
        }
        
        return newPaneId;
    }

    // ドラッグ&ドロップ設定
    setDragSource(paneId, filePath) {
        this.dragSource = { paneId, filePath };
    }
    clearDragSource() { this.dragSource = null; }

    setupDragDrop() {
        const container = document.getElementById('content-readme') || document.body;
        const overlay = document.getElementById('drop-overlay');
        const indicator = document.getElementById('drop-indicator');

        container.addEventListener('dragover', (e) => {
            if (!this.dragSource) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // ゾーン判定 (20% threshold)
            let zone = 'center';
            const th = 0.2;
            if (x < rect.width * th) zone = 'left';
            else if (x > rect.width * (1-th)) zone = 'right';
            else if (y < rect.height * th) zone = 'top';
            else if (y > rect.height * (1-th)) zone = 'bottom';

            this.currentDropZone = zone;
            overlay.classList.remove('hidden');
            
            // インジケータ表示
            indicator.style.top = '0'; indicator.style.left = '0'; indicator.style.width = '100%'; indicator.style.height = '100%';
            if(zone === 'left') indicator.style.width = '50%';
            else if(zone === 'right') { indicator.style.left = '50%'; indicator.style.width = '50%'; }
            else if(zone === 'top') indicator.style.height = '50%';
            else if(zone === 'bottom') { indicator.style.top = '50%'; indicator.style.height = '50%'; }
        });

        container.addEventListener('dragleave', (e) => {
             if (e.target === overlay) overlay.classList.add('hidden');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this.dragSource) return;
            overlay.classList.add('hidden');

            const src = this.dragSource;
            const zone = this.currentDropZone;
            let targetPaneId = this.activePaneId; // 簡易的にアクティブペインをターゲットとする

            // ドロップ先の要素からペインIDを特定できるなら尚良し
            // const el = e.target.closest('.pane'); ...

            if (zone === 'center') {
                // タブ移動（別ペインへ）
                if (targetPaneId !== src.paneId) {
                    this.panes.get(targetPaneId).openFile(src.filePath);
                    this.panes.get(src.paneId).closeFile(src.filePath);
                    this.setActivePane(targetPaneId);
                }
            } else {
                // 分割
                const newId = this.splitPane(targetPaneId, zone);
                if (newId) {
                    this.panes.get(newId).openFile(src.filePath);
                    this.panes.get(src.paneId).closeFile(src.filePath);
                    this.setActivePane(newId);
                }
            }
            this.clearDragSource();
        });
    }
}