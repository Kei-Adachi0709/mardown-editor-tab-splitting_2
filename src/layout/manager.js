/**
 * layout/manager.js
 * ペインの分割、統合、アクティブペインの管理を行います。
 */
import { Pane } from "./pane.js";

export class LayoutManager {
    constructor(rootContainerId) {
        console.log('[LayoutManager] Initializing...');
        this.panes = new Map();
        this.activePaneId = null;
        this.paneCounter = 0;
        this.rootContainer = document.getElementById(rootContainerId);
        
        if (!this.rootContainer) {
            console.error(`[LayoutManager] Root container #${rootContainerId} not found!`);
        }
    }

    init() {
        this.rootContainer.innerHTML = '';
        this.panes.clear();
        
        // 初期ペイン作成
        const initialPaneId = this.createPane(this.rootContainer);
        this.setActivePane(initialPaneId);
    }

    createPane(container) {
        const id = `pane-${++this.paneCounter}`;
        const pane = new Pane(id, container, this);
        this.panes.set(id, pane);
        console.log(`[LayoutManager] Created pane: ${id}`);
        return id;
    }

    get activePane() {
        return this.panes.get(this.activePaneId);
    }

    setActivePane(id) {
        // 以前のアクティブペインのスタイル解除
        if (this.activePaneId) {
            const prevPane = this.panes.get(this.activePaneId);
            if (prevPane && prevPane.element) prevPane.element.classList.remove('active');
        }

        this.activePaneId = id;
        const nextPane = this.panes.get(id);
        
        if (nextPane) {
            nextPane.element.classList.add('active');
            console.log(`[LayoutManager] Active pane switched to: ${id}`);
            
            // ファイル情報UI等の更新通知
            if (window.updateUIForActivePane) {
                window.updateUIForActivePane(nextPane);
            }
        }
    }

    removePane(paneId) {
        const pane = this.panes.get(paneId);
        if (!pane) return;

        // 最後の1つは削除しない
        if (pane.element.parentNode === this.rootContainer) {
            console.warn('[LayoutManager] Cannot remove the last root pane.');
            return;
        }

        console.log(`[LayoutManager] Removing pane: ${paneId}`);
        // ... (兄弟要素の昇格ロジックなど、元の複雑なDOM操作をここに実装) ...
        
        pane.destroy();
        this.panes.delete(paneId);
    }

    // 分割などの機能
    splitPane(targetPaneId, direction) {
        // ... (分割ロジック) ...
    }
}