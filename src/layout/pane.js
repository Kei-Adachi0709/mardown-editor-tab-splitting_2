/**
 * layout/pane.js
 * 個別のエディタペイン（タブとエディタ本体）のクラス定義。
 */
import { EditorView } from "@codemirror/view";
import { createEditorState, ExternalChange } from "../editor/config.js";
import { openedFiles, fileModificationState } from "../state.js";
import { onEditorInput } from "../renderer.js"; // 循環参照注意: 必要ならコールバックで渡す設計にする

export class Pane {
    constructor(id, parentContainer, layoutManager) {
        console.log(`[Pane] Initializing pane: ${id}`);
        this.id = id;
        this.layoutManager = layoutManager;
        this.files = []; 
        this.activeFilePath = null;
        this.editorView = null;
        
        // DOM構築
        this.element = document.createElement('div');
        this.element.className = 'pane';
        this.element.dataset.id = id;
        this.element.style.flex = '1';

        // アクティブ化イベント
        this.element.addEventListener('click', () => {
            this.layoutManager.setActivePane(this.id);
        });

        // ヘッダー（タブエリア）
        this.header = document.createElement('div');
        this.header.className = 'pane-header';
        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'pane-tabs-container';
        this.header.appendChild(this.tabsContainer);

        // ボディ（エディタエリア）
        this.body = document.createElement('div');
        this.body.className = 'pane-body';

        this.element.appendChild(this.header);
        this.element.appendChild(this.body);
        
        parentContainer.appendChild(this.element);

        this.initEditor();
    }

    initEditor() {
        // エディタの初期化
        const state = createEditorState("", (update) => {
            if (update.docChanged) {
                const isExternal = update.transactions.some(tr => tr.annotation(ExternalChange));
                // 外部変更以外なら入力を処理
                if (!isExternal) {
                     // ここでメインプロセスの入力ハンドラを呼ぶ
                     if (typeof window.onEditorInputGlobal === 'function') {
                         window.onEditorInputGlobal(this.id);
                     }
                }
            }
            if (update.focusChanged && update.view.hasFocus) {
                this.layoutManager.setActivePane(this.id);
            }
        });

        this.editorView = new EditorView({
            state: state,
            parent: this.body,
        });
    }

    destroy() {
        console.log(`[Pane] Destroying pane ${this.id}`);
        if (this.editorView) {
            this.editorView.destroy();
            this.editorView = null;
        }
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    // ファイルを開く
    openFile(filePath) {
        console.log(`[Pane ${this.id}] Opening file: ${filePath}`);
        if (!this.files.includes(filePath)) {
            this.files.push(filePath);
        }
        this.switchToFile(filePath);
        this.updateTabs();
    }

    // 指定したファイルに切り替え
    switchToFile(filePath) {
        this.activeFilePath = filePath;
        const fileData = openedFiles.get(filePath);
        const content = fileData ? fileData.content : "";
        
        this.setEditorContent(content);
        this.updateTabs();

        // ウィンドウタイトルの更新などはイベント発行またはコールバックで行うのが理想
    }

    // エディタの内容を更新
    setEditorContent(content) {
        if (!this.editorView) return;
        this.editorView.dispatch({
            changes: { from: 0, to: this.editorView.state.doc.length, insert: content },
            annotations: ExternalChange.of(true)
        });
    }

    // タブの描画更新
    updateTabs() {
        this.tabsContainer.innerHTML = '';
        this.files.forEach(filePath => {
            const fileData = openedFiles.get(filePath);
            const fileName = fileData ? fileData.fileName : filePath; // 簡易ファイル名取得
            const isActive = filePath === this.activeFilePath;
            const isDirty = fileModificationState.has(filePath);

            const tab = document.createElement('div');
            tab.className = `editor-tab ${isActive ? 'active' : ''}`;
            
            tab.innerHTML = `
                <span class="tab-title">${fileName} ${isDirty ? '●' : ''}</span>
                <span class="close-tab">×</span>
            `;

            // タブ切り替え
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('close-tab')) {
                    e.stopPropagation();
                    this.closeFile(filePath);
                } else {
                    this.switchToFile(filePath);
                }
            });
            
            // ドラッグ＆ドロップ用イベントリスナーなどもここに記述

            this.tabsContainer.appendChild(tab);
        });
    }

    // ファイルを閉じる
    closeFile(filePath) {
        const index = this.files.indexOf(filePath);
        if (index > -1) {
            this.files.splice(index, 1);
            // アクティブファイルを閉じた場合の処理
            if (this.activeFilePath === filePath) {
                const nextFile = this.files[index] || this.files[index - 1];
                if (nextFile) {
                    this.switchToFile(nextFile);
                } else {
                    this.activeFilePath = null;
                    this.setEditorContent("");
                }
            }
            this.updateTabs();
        }
        
        // ファイルが空になった場合のペイン削除処理
        if (this.files.length === 0) {
            this.layoutManager.removePane(this.id);
        }
    }
}