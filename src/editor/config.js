/**
 * editor/config.js
 * CodeMirrorのエディタ設定、テーマ、キーマップ定義などを管理します。
 */
import { EditorState, Prec, Compartment, Annotation } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle, LanguageDescription, indentUnit } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

// プラグイン（既存のファイルパスに合わせて適宜importしてください）
// import { livePreviewPlugin } from "./livePreviewPlugin.js"; 
// import { tablePlugin } from "./tablePlugin.js"; 

import { appSettings } from "../state.js";

// プログラムによる変更を識別するためのアノテーション
export const ExternalChange = Annotation.define();

// 動的設定変更用のCompartment
export const themeCompartment = new Compartment();
export const editorStyleCompartment = new Compartment();

// 言語サポートの定義
export const codeLanguages = (info) => {
    const lang = String(info).trim().toLowerCase();
    if (!lang) return null;
    
    // 必要に応じて言語を追加
    if (['js', 'javascript', 'node'].includes(lang)) return LanguageDescription.of({ name: 'javascript', support: javascript() });
    // ... 他の言語定義
    return null;
};

// リスト操作などのキーマップ（既存ロジックを簡略化して記述）
const obsidianLikeListKeymap = [
    { key: "Tab", run: indentMore },      // 実際には詳細なインデントロジックを入れる
    { key: "Shift-Tab", run: indentLess } // 実際には詳細なデデントロジックを入れる
];

// エディタの初期ステートを作成するファクトリー関数
export function createEditorState(initialContent = "", onUpdate) {
    console.log('[EditorConfig] Creating new editor state');
    
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
            history(),
            keymap.of(defaultKeymap),
            keymap.of(historyKeymap),
            syntaxHighlighting(defaultHighlightStyle),
            markdown({ base: markdownLanguage, codeLanguages: codeLanguages }),
            EditorView.lineWrapping,
            highlightActiveLine(),
            lineNumbers(),
            // 変更リスナー
            EditorView.updateListener.of(update => {
                if (onUpdate) onUpdate(update);
            })
        ]
    });
}