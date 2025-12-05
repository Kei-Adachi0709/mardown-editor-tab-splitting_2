(() => {
    console.log('[Module] Editor Pane loading...');
    const path = require('path');
    const { EditorState, Compartment, Annotation } = require("@codemirror/state");
    const { EditorView, keymap, highlightActiveLine, lineNumbers } = require("@codemirror/view");
    const { defaultKeymap, history, historyKeymap } = require("@codemirror/commands");
    const { markdown, markdownLanguage } = require("@codemirror/lang-markdown");
    const { syntaxHighlighting, defaultHighlightStyle, indentUnit } = require("@codemirror/language");
    const { oneDark } = require("@codemirror/theme-one-dark");

    // プラグイン読み込み (パス解決の修正版)
    let livePreviewPlugin = [], tablePlugin = [];
    try {
        // エラーログから __dirname がプロジェクトルートを指している可能性が高いため、
        // まずルート直下として探してみる (../ を外す)
        livePreviewPlugin = require(path.join(__dirname, 'livePreviewPlugin.js')).livePreviewPlugin;
        tablePlugin = require(path.join(__dirname, 'tablePlugin.js')).tablePlugin;
    } catch (e) {
        // 上記で失敗した場合（__dirnameが modules フォルダ内だった場合）は親ディレクトリを探す
        try {
            livePreviewPlugin = require(path.join(__dirname, '../livePreviewPlugin.js')).livePreviewPlugin;
            tablePlugin = require(path.join(__dirname, '../tablePlugin.js')).tablePlugin;
        } catch (e2) {
            console.error('Plugin load failed completely:', e2);
            // エラーでもエディタ自体は起動するように空配列のまま進む
        }
    }

    window.App = window.App || {};

    const ExternalChange = Annotation.define();
    const themeCompartment = new Compartment();

    class Pane {
        constructor(id, parentContainer, layoutManager, callbacks) {
            this.id = id;
            this.layoutManager = layoutManager;
            this.callbacks = callbacks || {};
            this.files = [];
            this.activeFilePath = null;
            this.editorView = null;

            // DOM構築
            this.element = document.createElement('div');
            this.element.className = 'pane';
            this.element.dataset.id = id;
            this.element.style.flex = '1';
            
            // クリックでアクティブ化
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
            const settings = window.App.State.appSettings;
            
            // 拡張機能の配列を構築
            const extensions = [
                themeCompartment.of(settings.theme === 'dark' ? oneDark : []),
                EditorView.lineWrapping,
                lineNumbers(),
                history(),
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap,
                    { key: "Mod-s", run: () => { if (this.callbacks.onSave) this.callbacks.onSave(); return true; } }
                ]),
                syntaxHighlighting(defaultHighlightStyle),
                markdown({ base: markdownLanguage }),
                EditorView.updateListener.of(update => {
                    // 変更検知
                    if (update.docChanged) {
                        const isExternal = update.transactions.some(tr => tr.annotation(ExternalChange));
                        if (this.callbacks.onEditorInput) this.callbacks.onEditorInput(!isExternal);
                    }
                    // フォーカス変更時
                    if (update.focusChanged && update.view.hasFocus) {
                        if (this.layoutManager.activePaneId !== this.id) {
                            setTimeout(() => {
                                this.layoutManager.setActivePane(this.id);
                            }, 0);
                        }
                    }
                })
            ];

            // プラグインが正常に読み込めていれば追加
            if (livePreviewPlugin && livePreviewPlugin.length > 0) {
                extensions.push(livePreviewPlugin);
            }
            if (tablePlugin && tablePlugin.length > 0) {
                extensions.push(tablePlugin);
            }

            const startState = EditorState.create({
                doc: "",
                extensions: extensions
            });

            this.editorView = new EditorView({
                state: startState,
                parent: this.body
            });
        }

        destroy() {
            if (this.editorView) this.editorView.destroy();
            if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
        }

        openFile(filePath) {
            if (!this.files.includes(filePath)) this.files.push(filePath);
            this.switchToFile(filePath);
        }

        closeFile(filePath) {
            const idx = this.files.indexOf(filePath);
            if (idx > -1) {
                this.files.splice(idx, 1);
                if (this.activeFilePath === filePath) {
                    const next = this.files[idx] || this.files[idx - 1];
                    if (next) this.switchToFile(next);
                    else {
                        this.activeFilePath = null;
                        this.setEditorContent("");
                    }
                }
                this.updateTabs();
            }
            // タブがなくなったらペイン削除（最後の一つでなければ）
            if (this.files.length === 0) {
                this.layoutManager.removePane(this.id);
            }
        }

        switchToFile(filePath) {
            this.activeFilePath = filePath;
            const fileData = window.App.State.openedFiles.get(filePath);
            const content = fileData ? fileData.content : "";
            this.setEditorContent(content);
            this.updateTabs();
            
            // 呼び出し元へ通知（タイトルバー更新など）
            if (this.layoutManager.callbacks.onActivePaneChanged) {
                this.layoutManager.callbacks.onActivePaneChanged(this);
            }
        }

        setEditorContent(content) {
            if (!this.editorView) return;
            this.editorView.dispatch({
                changes: { from: 0, to: this.editorView.state.doc.length, insert: content },
                annotations: ExternalChange.of(true)
            });
        }

        updateTabs() {
            this.tabsContainer.innerHTML = '';
            this.files.forEach(fp => {
                const fileData = window.App.State.openedFiles.get(fp);
                const fileName = fileData ? fileData.fileName : path.basename(fp);
                const isDirty = window.App.State.fileModificationState.has(fp);
                
                const tab = document.createElement('div');
                tab.className = 'editor-tab' + (fp === this.activeFilePath ? ' active' : '');
                tab.innerHTML = `<span class="tab-title">${fileName}${isDirty ? ' ●' : ''}</span><span class="close-tab">×</span>`;
                
                tab.onclick = (e) => {
                    if (e.target.classList.contains('close-tab')) {
                        e.stopPropagation();
                        this.closeFile(fp);
                    } else {
                        this.switchToFile(fp);
                    }
                };
                this.tabsContainer.appendChild(tab);
            });
        }
        
        updateSettings() {
            // 設定反映ロジック
            const settings = window.App.State.appSettings;
            if (!this.editorView) return;
            this.editorView.dispatch({
                effects: [
                    themeCompartment.reconfigure(settings.theme === 'dark' ? oneDark : []),
                ]
            });
        }
    }

    window.App.Pane = Pane;
})();