const path = require('path');
const { EditorState, Compartment, Annotation } = require("@codemirror/state");
const { EditorView, keymap, highlightActiveLine, lineNumbers } = require("@codemirror/view");
const { defaultKeymap, history, historyKeymap } = require("@codemirror/commands");
const { markdown, markdownLanguage } = require("@codemirror/lang-markdown");
const { syntaxHighlighting, defaultHighlightStyle, indentUnit, LanguageDescription } = require("@codemirror/language");
const { javascript } = require("@codemirror/lang-javascript");
const { oneDark } = require("@codemirror/theme-one-dark");

// Plugins (Try-Catch safe import)
let livePreviewPlugin = [], tablePlugin = [];
try {
    livePreviewPlugin = require(path.join(__dirname, '../livePreviewPlugin.js')).livePreviewPlugin;
    tablePlugin = require(path.join(__dirname, '../tablePlugin.js')).tablePlugin;
} catch (e) { console.error('Plugin load error:', e); }

const state = require('./state');
const { showPasteOptionModal } = require('./ui-components');

const ExternalChange = Annotation.define();
const themeCompartment = new Compartment();
const editorStyleCompartment = new Compartment();

// Language Support
const codeLanguages = (info) => {
    const lang = String(info).trim().toLowerCase();
    if (['js','javascript','node'].includes(lang)) return LanguageDescription.of({ name: 'javascript', support: javascript() });
    return null;
};

const pasteHandler = EditorView.domEventHandlers({
    paste(event, view) {
        const text = event.clipboardData.getData("text/plain");
        if (/^(http|https):\/\/[^ "]+$/.test(text)) {
            event.preventDefault();
            showPasteOptionModal(text, view, {
                onPlain: () => view.dispatch(view.state.replaceSelection(text)),
                onLink: async () => {
                    let title = text;
                    if (window.electronAPI?.fetchUrlTitle) title = await window.electronAPI.fetchUrlTitle(text);
                    view.dispatch(view.state.replaceSelection(`[${title}](${text})`));
                },
                onBookmark: () => view.dispatch(view.state.replaceSelection(`\n@card ${text}\n`))
            });
            return true;
        }
        return false;
    }
});

class Pane {
    constructor(id, parentContainer, layoutManager, callbacks) {
        this.id = id;
        this.layoutManager = layoutManager;
        this.callbacks = callbacks || {};
        this.files = [];
        this.activeFilePath = null;
        this.editorView = null;

        // DOM
        this.element = document.createElement('div');
        this.element.className = 'pane';
        this.element.dataset.id = id;
        this.element.style.flex = '1';
        this.element.addEventListener('click', () => this.layoutManager.setActivePane(this.id));

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
        const startState = EditorState.create({
            doc: "",
            extensions: [
                themeCompartment.of(state.appSettings.theme === 'dark' ? oneDark : []),
                editorStyleCompartment.of(EditorView.theme({
                    ".cm-content": { fontSize: state.appSettings.fontSize, fontFamily: state.appSettings.fontFamily },
                    "&": { height: "100%" }
                })),
                indentUnit.of("    "),
                pasteHandler,
                history(),
                keymap.of([
                    ...defaultKeymap, 
                    ...historyKeymap,
                    { key: "Mod-s", run: () => { if(this.callbacks.onSave) this.callbacks.onSave(); return true; } }
                ]),
                syntaxHighlighting(defaultHighlightStyle),
                markdown({ base: markdownLanguage, codeLanguages }),
                livePreviewPlugin,
                tablePlugin,
                EditorView.lineWrapping,
                highlightActiveLine(),
                lineNumbers(),
                EditorView.updateListener.of(update => {
                    if (update.docChanged) {
                        const isExternal = update.transactions.some(tr => tr.annotation(ExternalChange));
                        if (this.callbacks.onEditorInput) this.callbacks.onEditorInput(!isExternal);
                    }
                    if (update.focusChanged && update.view.hasFocus) {
                        this.layoutManager.setActivePane(this.id);
                    }
                })
            ],
        });

        this.editorView = new EditorView({
            state: startState,
            parent: this.body,
        });
    }

    destroy() {
        if (this.editorView) this.editorView.destroy();
        this.element.remove();
    }

    updateTabs() {
        this.tabsContainer.innerHTML = '';
        this.files.forEach(filePath => {
            const fileData = state.openedFiles.get(filePath);
            const fileName = fileData ? fileData.fileName : path.basename(filePath);
            const isActive = filePath === this.activeFilePath;
            const isDirty = state.fileModificationState.has(filePath);

            const tab = document.createElement('div');
            tab.className = `editor-tab ${isActive ? 'active' : ''}`;
            tab.draggable = true;
            tab.innerHTML = `<span class="tab-title">${fileName} ${isDirty ? '●' : ''}</span><span class="close-tab">×</span>`;
            
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('close-tab')) {
                    e.stopPropagation();
                    this.closeFile(filePath);
                } else {
                    this.switchToFile(filePath);
                }
            });
            
            tab.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ paneId: this.id, filePath }));
                this.layoutManager.setDragSource(this.id, filePath);
            });

            this.tabsContainer.appendChild(tab);
        });
    }

    openFile(filePath) {
        if (!this.files.includes(filePath)) this.files.push(filePath);
        this.switchToFile(filePath);
    }

    closeFile(filePath, isMoving = false) {
        const index = this.files.indexOf(filePath);
        if (index > -1) {
            this.files.splice(index, 1);
            if (this.activeFilePath === filePath) {
                const next = this.files[index] || this.files[index - 1];
                if (next) this.switchToFile(next);
                else {
                    this.activeFilePath = null;
                    this.setEditorContent("");
                }
            }
            this.updateTabs();
        }
        if (!isMoving && this.files.length === 0) this.layoutManager.removePane(this.id);
    }

    switchToFile(filePath) {
        this.activeFilePath = filePath;
        const content = state.openedFiles.get(filePath)?.content || "";
        this.setEditorContent(content);
        this.updateTabs();
        // 通知
        if(this.layoutManager.callbacks.onActivePaneChanged) {
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

    updateSettings() {
        if (!this.editorView) return;
        this.editorView.dispatch({
            effects: [
                themeCompartment.reconfigure(state.appSettings.theme === 'dark' ? oneDark : []),
                editorStyleCompartment.reconfigure(EditorView.theme({
                    ".cm-content": { fontSize: state.appSettings.fontSize, fontFamily: state.appSettings.fontFamily }
                }))
            ]
        });
    }
}

module.exports = { Pane };