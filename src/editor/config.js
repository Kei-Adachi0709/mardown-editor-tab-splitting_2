/**
 * editor/config.js (ES Module)
 */
import { EditorState, Prec, Compartment, Annotation } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle, LanguageDescription, indentUnit } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

import { appSettings } from "../state.js";
import { 
    handleListNewline, handleListIndent, handleListDedent, 
    pasteHandler, dropHandler 
} from "./helpers.js";

export const ExternalChange = Annotation.define();
export const themeCompartment = new Compartment();
export const editorStyleCompartment = new Compartment();

const codeLanguages = (info) => {
    const lang = String(info).trim().toLowerCase();
    if (['js', 'javascript', 'node'].includes(lang)) return LanguageDescription.of({ name: 'javascript', support: javascript() });
    return null;
};

const obsidianLikeListKeymap = [
    { key: "Enter", run: handleListNewline },
    { key: "Tab", run: handleListIndent },
    { key: "Shift-Tab", run: handleListDedent }
];

export function createEditorState(initialContent = "", onUpdate) {
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