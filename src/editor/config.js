/**
 * editor/config.js
 * CodeMirrorの設定 (CommonJS版)
 */
const { EditorState, Prec, Compartment, Annotation } = require("@codemirror/state");
const { EditorView, keymap, highlightActiveLine, lineNumbers } = require("@codemirror/view");
const { defaultKeymap, history, historyKeymap, indentMore, indentLess } = require("@codemirror/commands");
const { markdown, markdownLanguage } = require("@codemirror/lang-markdown");
const { syntaxHighlighting, defaultHighlightStyle, LanguageDescription, indentUnit } = require("@codemirror/language");
const { javascript } = require("@codemirror/lang-javascript");
const { oneDark } = require("@codemirror/theme-one-dark");

const { appSettings } = require("../state.js");

// ★ここで pasteHandler, dropHandler も読み込む
const { 
    handleListNewline, handleListIndent, handleListDedent, 
    pasteHandler, dropHandler 
} = require("./helpers.js");

const ExternalChange = Annotation.define();
const themeCompartment = new Compartment();
const editorStyleCompartment = new Compartment();

const codeLanguages = (info) => {
    const lang = String(info).trim().toLowerCase();
    if (!lang) return null;
    if (['js', 'javascript', 'node'].includes(lang)) return LanguageDescription.of({ name: 'javascript', support: javascript() });
    return null;
};

const obsidianLikeListKeymap = [
    { key: "Enter", run: handleListNewline },
    { key: "Tab", run: handleListIndent },
    { key: "Shift-Tab", run: handleListDedent }
];

function createEditorState(initialContent = "", onUpdate) {
    const initialTheme = appSettings.theme === 'dark' ? oneDark : [];
    const initialStyle = EditorView.theme({
        ".cm-content": {
            fontSize: appSettings.fontSize,
            fontFamily: appSettings.fontFamily
        },
        ".cm-gutters": {
            fontSize: appSettings.fontSize,
            fontFamily: appSettings.fontFamily
        }
    });

    return EditorState.create({
        doc: initialContent,
        extensions: [
            themeCompartment.of(initialTheme),
            editorStyleCompartment.of(initialStyle),
            indentUnit.of("    "),
            Prec.highest(keymap.of(obsidianLikeListKeymap)),
            // ★ここに追加
            pasteHandler,
            dropHandler,
            
            history(),
            keymap.of(defaultKeymap),
            keymap.of(historyKeymap),
            syntaxHighlighting(defaultHighlightStyle),
            markdown({ base: markdownLanguage, codeLanguages: codeLanguages }),
            EditorView.lineWrapping,
            highlightActiveLine(),
            lineNumbers(),
            EditorView.updateListener.of(update => {
                if (onUpdate) onUpdate(update);
            })
        ]
    });
}

module.exports = {
    ExternalChange,
    themeCompartment,
    editorStyleCompartment,
    createEditorState,
    oneDark
};