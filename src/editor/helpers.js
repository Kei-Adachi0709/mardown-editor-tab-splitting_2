/**
 * editor/helpers.js
 * エディタ操作のヘルパー関数完全版
 * リスト操作、ツールバー、ペースト処理（URLダイアログ）、ドロップ処理
 */
const { indentMore, indentLess } = require("@codemirror/commands");
const { EditorView } = require("@codemirror/view");

// ========== リスト操作ロジック ==========

const LIST_RE = /^(\s*)((- \[[ xX]\])|(?:[-*+]|\d+(?:-\d+)*\.))\s+/;
const ORDERED_RE = /^(\s*)(\d+(?:-\d+)*)\.\s/;

function incrementOrderedNumber(currentNum) {
    const parts = currentNum.split('-');
    const lastPart = parts.pop();
    if (!isNaN(lastPart)) {
        parts.push(String(parseInt(lastPart, 10) + 1));
        return parts.join('-');
    }
    return currentNum;
}

const handleListNewline = (view) => {
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

const handleListIndent = (view) => {
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

const handleListDedent = (view) => {
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

// ========== ペースト処理 (URL検出時のモーダル表示) ==========

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
    message.style.whiteSpace = 'pre-wrap';
    message.style.wordBreak = 'break-all';

    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';

    const createBtn = (text, cls = 'modal-btn') => {
        const btn = document.createElement('button');
        btn.className = cls;
        btn.textContent = text;
        return btn;
    };

    const cancelBtn = createBtn('キャンセル');
    const plainBtn = createBtn('通常のURL');
    const linkBtn = createBtn('リンク');
    const bookmarkBtn = createBtn('ブックマーク', 'modal-btn primary');

    buttons.append(cancelBtn, plainBtn, linkBtn, bookmarkBtn);
    content.append(message, buttons);
    overlay.append(content);
    document.body.appendChild(overlay);

    const closeModal = () => {
        overlay.remove();
        if (view) view.focus();
    };

    cancelBtn.addEventListener('click', closeModal);

    plainBtn.addEventListener('click', () => {
        view.dispatch(view.state.replaceSelection(url));
        closeModal();
    });

    linkBtn.addEventListener('click', async () => {
        linkBtn.disabled = true;
        linkBtn.textContent = '取得中...';
        try {
            let title = url;
            if (window.electronAPI && window.electronAPI.fetchUrlTitle) {
                title = await window.electronAPI.fetchUrlTitle(url);
            }
            view.dispatch(view.state.replaceSelection(`[${title}](${url})`));
        } catch (e) {
            view.dispatch(view.state.replaceSelection(`[${url}](${url})`));
        }
        closeModal();
    });

    bookmarkBtn.addEventListener('click', () => {
        const state = view.state;
        const doc = state.doc;
        const selection = state.selection.main;
        const hasNewlineBefore = selection.from === 0 || doc.sliceString(selection.from - 1, selection.from) === '\n';
        const hasNewlineAfter = selection.to === doc.length || doc.sliceString(selection.to, selection.to + 1) === '\n';
        
        let insertText = `@card ${url}`;
        if (!hasNewlineBefore) insertText = '\n' + insertText;
        if (!hasNewlineAfter) insertText = insertText + '\n';

        view.dispatch(view.state.replaceSelection(insertText));
        closeModal();
    });

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

// CodeMirror用のイベントハンドラ
const pasteHandler = EditorView.domEventHandlers({
    paste(event, view) {
        const text = event.clipboardData.getData("text/plain");
        const urlRegex = /^(http|https):\/\/[^ "]+$/;
        if (urlRegex.test(text)) {
            event.preventDefault();
            showPasteOptionModal(text, view);
            return true;
        }
        return false;
    }
});

const dropHandler = EditorView.domEventHandlers({
    drop(event, view) {
        const data = event.dataTransfer.getData('text/plain');
        try {
            const parsed = JSON.parse(data);
            if (parsed && parsed.paneId && parsed.filePath) {
                return true; // LayoutManagerに任せる
            }
        } catch (e) {}
        return false;
    }
});

// ========== ツールバーアクション ==========

function toggleLinePrefix(view, prefix) {
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

function toggleMark(view, mark) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from, to, empty } = state.selection.main;
    const text = state.sliceDoc(from, to);
    
    // 簡易トグルロジック（既に囲まれていれば解除、なければ追加）
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
            selection: empty 
                ? { anchor: from + mark.length }
                : { anchor: to + mark.length * 2 }
        });
    }
    view.focus();
}

function toggleList(view, type) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from, to } = state.selection.main;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    let changes = [];
    
    for (let i = startLine.number; i <= endLine.number; i++) {
        const line = state.doc.line(i);
        const text = line.text;
        const bulletMatch = text.match(/^(\s*)([-*+] )\s*/);
        const orderedMatch = text.match(/^(\s*)(\d+(?:-\d+)*\. )\s*/);
        const checkMatch = text.match(/^(\s*)(- \[[ x]\] )\s*/);

        // 簡易実装: 既存リストがあれば削除、なければ追加
        // 厳密な切り替えロジックが必要ならここに実装を追加
        if (type === 'ul') {
            if (bulletMatch) changes.push({ from: line.from + bulletMatch[1].length, to: line.from + bulletMatch[0].length, insert: "" });
            else changes.push({ from: line.from, insert: "- " });
        } else if (type === 'ol') {
            if (orderedMatch) changes.push({ from: line.from + orderedMatch[1].length, to: line.from + orderedMatch[0].length, insert: "" });
            else changes.push({ from: line.from, insert: "1. " });
        } else if (type === 'task') {
            if (checkMatch) changes.push({ from: line.from + checkMatch[1].length, to: line.from + checkMatch[0].length, insert: "" });
            else changes.push({ from: line.from, insert: "- [ ] " });
        }
    }
    dispatch({ changes });
    view.focus();
}

// 挿入ヘルパー
function insertTextAtCursor(view, text, cursorOffset = 0) {
    const { from, to } = view.state.selection.main;
    view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + cursorOffset }
    });
    view.focus();
}

function insertLink(view) {
    if (!view) return;
    const { state } = view;
    const { from, to } = state.selection.main;
    const text = state.sliceDoc(from, to) || "link";
    view.dispatch({
        changes: { from, to, insert: `[${text}](url)` },
        selection: { anchor: from + text.length + 3, head: from + text.length + 6 }
    });
    view.focus();
}

function insertImage(view) {
    if (!view) return;
    const { state } = view;
    const { from, to } = state.selection.main;
    const text = state.sliceDoc(from, to) || "Image";
    view.dispatch({
        changes: { from, to, insert: `![${text}](url)` },
        selection: { anchor: from + 4 + text.length, head: from + 7 + text.length }
    });
    view.focus();
}

function insertTable(view) { if(view) insertTextAtCursor(view, "\n| Col 1 | Col 2 | Col 3 |\n| :--- | :--- | :--- |\n|  |  |  |\n|  |  |  |\n", 0); }
function insertHorizontalRule(view) { if(view) insertTextAtCursor(view, "\n---\n"); }
function insertPageBreak(view) { if(view) insertTextAtCursor(view, '\n<div class="page-break"></div>\n'); }
function insertCodeBlock(view) { if(view) insertTextAtCursor(view, "\n```\n\n```\n", 5); }

module.exports = {
    handleListNewline,
    handleListIndent,
    handleListDedent,
    pasteHandler,
    dropHandler,
    toggleLinePrefix,
    toggleMark,
    toggleList,
    insertLink,
    insertImage,
    insertTable,
    insertHorizontalRule,
    insertPageBreak,
    insertCodeBlock
};