/**
 * editor/helpers.js (ES Module 完全版)
 */
import { indentMore, indentLess } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";

const LIST_RE = /^(\s*)((- \[[ xX]\])|(?:[-*+]|\d+(?:-\d+)*\.))\s+/;
const ORDERED_RE = /^(\s*)(\d+(?:-\d+)*)\.\s/;

// ========== リスト操作 ==========

function incrementOrderedNumber(currentNum) {
    const parts = currentNum.split('-');
    const lastPart = parts.pop();
    if (!isNaN(lastPart)) {
        parts.push(String(parseInt(lastPart, 10) + 1));
        return parts.join('-');
    }
    return currentNum;
}

export const handleListNewline = (view) => {
    const { state, dispatch } = view;
    const { from, to, empty } = state.selection.main;
    if (!empty) return false;

    const line = state.doc.lineAt(from);
    const text = line.text;
    const match = text.match(LIST_RE);
    if (!match) return false;

    const fullMatch = match[0];
    const indent = match[1];
    const marker = match[2];

    if (from < line.from + fullMatch.length) return false;

    if (text.trim().length === fullMatch.trim().length) {
        dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
        return true;
    }

    let nextMarker = marker;
    const orderedMatch = text.match(ORDERED_RE);
    if (orderedMatch) {
        nextMarker = incrementOrderedNumber(orderedMatch[2]) + ".";
    } else if (marker.startsWith("- [")) {
        nextMarker = "- [ ]";
    }

    const insertText = `\n${indent}${nextMarker} `;
    dispatch({ changes: { from: to, insert: insertText }, selection: { anchor: to + insertText.length } });
    return true;
};

export const handleListIndent = (view) => {
    const { state, dispatch } = view;
    const { from, empty } = state.selection.main;
    if (!empty) return indentMore(view);

    const line = state.doc.lineAt(from);
    const match = line.text.match(ORDERED_RE);
    if (match) {
        const currentIndent = match[1];
        const currentNum = match[2];
        let prevLineNumStr = "";
        if (line.number > 1) {
            const prevLine = state.doc.line(line.number - 1);
            const prevMatch = prevLine.text.match(ORDERED_RE);
            if (prevMatch) prevLineNumStr = prevMatch[2];
        }
        const newNum = prevLineNumStr ? `${prevLineNumStr}-1` : `${currentNum}-1`;
        const changes = [
            { from: line.from, insert: "    " },
            { from: line.from + match[1].length, to: line.from + match[1].length + match[2].length + 1, insert: `${newNum}.` }
        ];
        dispatch({ changes });
        return true;
    }
    return indentMore(view);
};

export const handleListDedent = (view) => {
    const { state, dispatch } = view;
    const { from, empty } = state.selection.main;
    if (!empty) return indentLess(view);

    const line = state.doc.lineAt(from);
    const match = line.text.match(ORDERED_RE);
    if (match) {
        const currentIndent = match[1];
        if (currentIndent.length === 0) return indentLess(view);

        let targetIndentLen = Math.max(0, currentIndent.length - 4);
        let nextNum = "1";
        for (let i = line.number - 1; i >= 1; i--) {
            const prevLine = state.doc.line(i);
            const prevMatch = prevLine.text.match(ORDERED_RE);
            if (prevMatch && prevMatch[1].length <= targetIndentLen) {
                nextNum = incrementOrderedNumber(prevMatch[2]);
                break;
            }
        }
        
        let deleteLen = text.startsWith("\t") ? 1 : (text.startsWith("    ") ? 4 : currentIndent.length);
        const changes = [
            { from: line.from, to: line.from + deleteLen, insert: "" },
            { from: line.from + match[1].length, to: line.from + match[1].length + match[2].length + 1, insert: `${nextNum}.` }
        ];
        dispatch({ changes });
        return true;
    }
    return indentLess(view);
};

// ========== ペースト・ドロップ処理 ==========

function showPasteOptionModal(url, view) {
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.width = '400px';

    const message = document.createElement('div');
    message.className = 'modal-message';
    message.textContent = `URLが検出されました: ${url}\nどのように貼り付けますか？`;

    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';

    const createBtn = (text, onClick, cls = 'modal-btn') => {
        const btn = document.createElement('button');
        btn.className = cls;
        btn.textContent = text;
        btn.addEventListener('click', () => { onClick(); overlay.remove(); view.focus(); });
        return btn;
    };

    buttons.appendChild(createBtn('キャンセル', () => {}));
    buttons.appendChild(createBtn('通常のURL', () => view.dispatch(view.state.replaceSelection(url))));
    buttons.appendChild(createBtn('リンク', () => view.dispatch(view.state.replaceSelection(`[link](${url})`))));
    buttons.appendChild(createBtn('ブックマーク', () => view.dispatch(view.state.replaceSelection(`\n@card ${url}\n`)), 'modal-btn primary'));

    content.appendChild(message);
    content.appendChild(buttons);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
}

export const pasteHandler = EditorView.domEventHandlers({
    paste(event, view) {
        const text = event.clipboardData.getData("text/plain");
        if (/^(http|https):\/\/[^ "]+$/.test(text)) {
            event.preventDefault();
            showPasteOptionModal(text, view);
            return true;
        }
        return false;
    }
});

export const dropHandler = EditorView.domEventHandlers({
    drop(event, view) {
        const data = event.dataTransfer.getData('text/plain');
        try {
            const parsed = JSON.parse(data);
            if (parsed && parsed.paneId && parsed.filePath) {
                // LayoutManagerに処理を任せるためここではtrueを返してCodeMirrorのデフォルト動作を防ぐ
                return true; 
            }
        } catch (e) {}
        return false;
    }
});

// ========== ツールバーアクション ==========

export function toggleLinePrefix(view, prefix) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from } = state.selection.main;
    const line = state.doc.lineAt(from);
    const match = line.text.match(/^\s*(#+\s*|>\s*)/);

    let changes;
    if (match && match[1].trim() === prefix.trim()) {
        changes = { from: line.from, to: line.from + match[0].length, insert: "" };
    } else {
        const insertText = prefix.endsWith(' ') ? prefix : prefix + ' ';
        changes = { from: line.from, to: line.from, insert: insertText };
    }
    dispatch({ changes });
    view.focus();
}

export function toggleMark(view, mark) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from, to, empty } = state.selection.main;
    const text = state.sliceDoc(from, to);
    
    // 簡易トグルロジック
    const extendedFrom = Math.max(0, from - mark.length);
    const extendedTo = Math.min(state.doc.length, to + mark.length);
    const surrounding = state.sliceDoc(extendedFrom, extendedTo);
    
    if (surrounding === mark + text + mark) {
         dispatch({
            changes: { from: extendedFrom, to: extendedTo, insert: text },
            selection: { anchor: extendedFrom, head: extendedFrom + text.length }
        });
    } else {
        dispatch({
            changes: { from, to, insert: `${mark}${text}${mark}` },
            selection: empty ? { anchor: from + mark.length } : undefined
        });
    }
    view.focus();
}

export function toggleList(view, type) {
    if (!view) return;
    // 簡易実装: 本来は範囲選択の行すべてに適用するループが必要
    // ここではカーソル行のみ対応
    const prefix = type === 'ul' ? '- ' : (type === 'ol' ? '1. ' : '- [ ] ');
    toggleLinePrefix(view, prefix);
}

function insertTextAtCursor(view, text, offset = 0) {
    const { from } = view.state.selection.main;
    view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + offset + (offset===0?text.length:0) } });
    view.focus();
}

export function insertLink(view) { if(view) insertTextAtCursor(view, "[link](url)", 3); }
export function insertImage(view) { if(view) insertTextAtCursor(view, "![Image](url)", 4); }
export function insertTable(view) { if(view) insertTextAtCursor(view, "\n| A | B |\n|---|---|\n| | |\n"); }
export function insertHorizontalRule(view) { if(view) insertTextAtCursor(view, "\n---\n"); }
export function insertPageBreak(view) { if(view) insertTextAtCursor(view, '\n<div class="page-break"></div>\n'); }
export function insertCodeBlock(view) { if(view) insertTextAtCursor(view, "\n```\n\n```\n", 5); }