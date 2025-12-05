/**
 * layout/pane.js
 * 個別ペインの定義
 */
const { EditorView } = require("@codemirror/view");
const { createEditorState, ExternalChange } = require("../editor/config.js");
const { openedFiles, fileModificationState } = require("../state.js");

class Pane {
    constructor(id, parentContainer, layoutManager) {
        console.log(`[Pane] Creating pane: ${id}`);
        this.id = id;
        this.layoutManager = layoutManager;
        this.files = [];
        this.activeFilePath = null;
        this.editorView = null;

        this.element = document.createElement('div');
        this.element.className = 'pane';
        this.element.dataset.id = id;
        this.element.style.flex = '1';

        this.element.addEventListener('click', () => {
            this.layoutManager.setActivePane(this.id);
        });

        this.header = document.createElement('div');
        this.header.className = 'pane-header';
        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'pane-tabs-container';
        this.header.appendChild(this.tabsContainer);

        this.body = document.createElement('div');
        this.body.className = 'pane-body';

        this.element.appendChild(this.header);
        this.element.appendChild(this.body);

        parentContainer.appendChild(this.element);

        this.initEditor();
    }

    initEditor() {
        const state = createEditorState("", (update) => {
            if (update.docChanged) {
                const isExternal = update.transactions.some(tr => tr.annotation(ExternalChange));
                if (!isExternal) {
                    // renderer.js で定義したグローバル関数を呼ぶ
                    if (window.onEditorInputGlobal) {
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

    openFile(filePath) {
        if (!this.files.includes(filePath)) {
            this.files.push(filePath);
        }
        this.switchToFile(filePath);
    }

    switchToFile(filePath) {
        this.activeFilePath = filePath;
        const fileData = openedFiles.get(filePath);
        const content = fileData ? fileData.content : "";
        
        if (this.editorView) {
            this.editorView.dispatch({
                changes: { from: 0, to: this.editorView.state.doc.length, insert: content },
                annotations: ExternalChange.of(true)
            });
        }
        this.updateTabs();
    }

    updateTabs() {
        this.tabsContainer.innerHTML = '';
        this.files.forEach(filePath => {
            const fileData = openedFiles.get(filePath);
            // 簡易的にファイル名を取得（pathモジュールがない場合を考慮）
            const fileName = fileData ? fileData.fileName : filePath.split(/[/\\]/).pop();
            const isActive = filePath === this.activeFilePath;
            const isDirty = fileModificationState.has(filePath);

            const tab = document.createElement('div');
            tab.className = `editor-tab ${isActive ? 'active' : ''}`;
            tab.innerHTML = `<span class="tab-title">${fileName} ${isDirty ? '●' : ''}</span><span class="close-tab">×</span>`;
            
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('close-tab')) {
                    e.stopPropagation();
                    this.closeFile(filePath);
                } else {
                    this.switchToFile(filePath);
                }
            });

            this.tabsContainer.appendChild(tab);
        });
    }

    closeFile(filePath) {
        const index = this.files.indexOf(filePath);
        if (index > -1) {
            this.files.splice(index, 1);
            if (this.activeFilePath === filePath) {
                const nextFile = this.files[index] || this.files[index - 1];
                if (nextFile) {
                    this.switchToFile(nextFile);
                } else {
                    this.activeFilePath = null;
                    // エディタをクリア
                    if (this.editorView) {
                        this.editorView.dispatch({
                            changes: { from: 0, to: this.editorView.state.doc.length, insert: "" },
                            annotations: ExternalChange.of(true)
                        });
                    }
                }
            }
            this.updateTabs();
        }
        
        if (this.files.length === 0) {
            this.layoutManager.removePane(this.id);
        }
    }

    destroy() {
        if (this.editorView) this.editorView.destroy();
        this.element.remove();
    }
}

module.exports = { Pane };