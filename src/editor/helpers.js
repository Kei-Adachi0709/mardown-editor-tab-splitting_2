/**
 * editor/helpers.js
 * CodeMirrorのエディタ操作に関するヘルパー関数群。
 * リストの自動インデントやツールバーのアクション（太字、見出し等）を定義します。
 */

import { indentMore, indentLess } from "@codemirror/commands";

// リスト検出用正規表現
const LIST_RE = /^(\s*)((- \[[ xX]\])|(?:[-*+]|\d+(?:-\d+)*\.))\s+/;
const ORDERED_RE = /^(\s*)(\d+(?:-\d+)*)\.\s/;

// ========== リスト操作ロジック ==========

// 番号付きリストの番号をインクリメントする (例: "1-1" -> "1-2")
function incrementOrderedNumber(currentNum) {
    const parts = currentNum.split('-');
    const lastPart = parts.pop();
    if (!isNaN(lastPart)) {
        parts.push(String(parseInt(lastPart, 10) + 1));
        return parts.join('-');
    }
    return currentNum;
}

// Enterキー押下時のリスト継続処理
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

    // カーソルがマーカーの後ろにあるかチェック
    if (from < line.from + fullMatch.length) return false;

    // 行が空（マーカーのみ）の場合はリスト終了
    if (text.trim().length === fullMatch.trim().length) {
        console.log('[EditorHelper] Ending list (empty item)');
        dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
        return true;
    }

    let nextMarker = marker;

    // 次のマーカーを決定
    const orderedMatch = text.match(ORDERED_RE);
    if (orderedMatch) {
        const currentNum = orderedMatch[2];
        nextMarker = incrementOrderedNumber(currentNum) + ".";
    } else if (marker.startsWith("- [")) {
        nextMarker = "- [ ]"; // チェックボックスは未チェック状態で継続
    }

    const insertText = `\n${indent}${nextMarker} `;
    console.log(`[EditorHelper] Continuing list with marker: "${nextMarker}"`);
    
    dispatch({ changes: { from: to, insert: insertText }, selection: { anchor: to + insertText.length } });
    return true;
};

// Tabキーによるインデント処理（サブリスト化）
export const handleListIndent = (view) => {
    const { state, dispatch } = view;
    const { from, empty } = state.selection.main;

    if (!empty && state.selection.ranges.some(r => !r.empty)) {
        return indentMore(view);
    }

    const line = state.doc.lineAt(from);
    const match = line.text.match(ORDERED_RE);

    if (match) {
        console.log('[EditorHelper] Indenting ordered list item');
        const currentNum = match[2];
        
        // 前の行の番号を探してサブ番号を生成 (例: 1. -> 1-1.)
        let prevLineNumStr = "";
        if (line.number > 1) {
            const prevLine = state.doc.line(line.number - 1);
            const prevMatch = prevLine.text.match(ORDERED_RE);
            if (prevMatch) {
                prevLineNumStr = prevMatch[2];
            }
        }

        const newNum = prevLineNumStr ? `${prevLineNumStr}-1` : `${currentNum}-1`;
        const newMarker = `${newNum}.`;
        const indentUnitText = "    "; // 4スペース

        const changes = [
            { from: line.from, insert: indentUnitText },
            { from: line.from + match[1].length, to: line.from + match[1].length + match[2].length + 1, insert: newMarker }
        ];

        dispatch({ changes });
        return true;
    }

    return indentMore(view);
};

// Shift-Tabキーによるデデント処理（親リストへ戻る）
export const handleListDedent = (view) => {
    const { state, dispatch } = view;
    const { from, empty } = state.selection.main;

    if (!empty && state.selection.ranges.some(r => !r.empty)) {
        return indentLess(view);
    }

    const line = state.doc.lineAt(from);
    const text = line.text;
    const match = text.match(ORDERED_RE);

    if (match) {
        console.log('[EditorHelper] Dedenting ordered list item');
        const currentIndent = match[1];
        if (currentIndent.length === 0) return indentLess(view);

        let targetIndentLen = Math.max(0, currentIndent.length - 4);
        let nextNum = "1";

        // 前の行を遡って適切な番号を探す
        for (let i = line.number - 1; i >= 1; i--) {
            const prevLine = state.doc.line(i);
            const prevMatch = prevLine.text.match(ORDERED_RE);
            if (prevMatch) {
                const prevIndent = prevMatch[1];
                if (prevIndent.length <= targetIndentLen) {
                    nextNum = incrementOrderedNumber(prevMatch[2]);
                    break;
                }
            }
        }

        const newMarker = `${nextNum}.`;
        let deleteLen = 0;
        if (text.startsWith("\t")) deleteLen = 1;
        else if (text.startsWith("    ")) deleteLen = 4;
        else if (text.startsWith(" ")) deleteLen = currentIndent.length;

        if (deleteLen > 0) {
            const changes = [
                { from: line.from, to: line.from + deleteLen, insert: "" },
                { from: line.from + match[1].length, to: line.from + match[1].length + match[2].length + 1, insert: newMarker }
            ];
            dispatch({ changes });
            return true;
        }
    }

    return indentLess(view);
};

// ========== ツールバーアクション ==========

// 行頭のプレフィックス切り替え (#, >, - 等)
export function toggleLinePrefix(view, prefix) {
    if (!view) return;
    console.log(`[EditorHelper] Toggling prefix: "${prefix}"`);
    
    const { state, dispatch } = view;
    const { from } = state.selection.main;
    const line = state.doc.lineAt(from);
    const match = line.text.match(/^\s*(#+\s*|>\s*)/);

    let changes;
    let newCursorPos;

    // 既に同じプレフィックスがあれば削除、なければ追加
    if (match && match[1].trim() === prefix.trim()) {
        const matchLen = match[0].length;
        changes = { from: line.from, to: line.from + matchLen, insert: "" };
        newCursorPos = line.to - matchLen;
    } else {
        const insertText = prefix.endsWith(' ') ? prefix : prefix + ' ';
        if (match) {
            // 別のプレフィックスがあれば置換
            const matchLen = match[0].length;
            changes = { from: line.from, to: line.from + matchLen, insert: insertText };
            newCursorPos = line.to - matchLen + insertText.length;
        } else {
            // なければ挿入
            changes = { from: line.from, to: line.from, insert: insertText };
            newCursorPos = line.to + insertText.length;
        }
    }

    dispatch({
        changes: changes,
        selection: { anchor: newCursorPos, head: newCursorPos }
    });
    view.focus();
}

// テキスト装飾の切り替え (**, *, ~~, ==)
export function toggleMark(view, mark) {
    if (!view) return;
    console.log(`[EditorHelper] Toggling mark: "${mark}"`);
    
    const { state, dispatch } = view;
    const { from, to, empty } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);
    
    // 選択範囲の前後に既にマークがあるかチェック
    const extendedFrom = Math.max(0, from - mark.length);
    const extendedTo = Math.min(state.doc.length, to + mark.length);

    if (extendedFrom >= 0 && extendedTo <= state.doc.length) {
        const surroundingText = state.sliceDoc(extendedFrom, extendedTo);
        if (surroundingText.startsWith(mark) && surroundingText.endsWith(mark)) {
            // マークを削除
            dispatch({
                changes: { from: extendedFrom, to: extendedTo, insert: selectedText },
                selection: { anchor: extendedFrom, head: extendedFrom + selectedText.length }
            });
            view.focus(); return;
        }
    }

    // マークを追加
    dispatch({
        changes: { from: from, to: to, insert: `${mark}${selectedText}${mark}` },
        selection: empty
            ? { anchor: from + mark.length, head: from + mark.length } // カーソルをマークの間に
            : { anchor: to + mark.length * 2, head: to + mark.length * 2 } // 選択範囲の後ろに
    });
    view.focus();
}

// リスト形式の切り替え
export function toggleList(view, type) {
    if (!view) return;
    console.log(`[EditorHelper] Toggling list type: ${type}`);
    
    const { state, dispatch } = view;
    const { from, to } = state.selection.main;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    let changes = [];
    let totalChangeLength = 0;

    for (let i = startLine.number; i <= endLine.number; i++) {
        const line = state.doc.line(i);
        const text = line.text;
        const bulletMatch = text.match(/^(\s*)([-*+] )\s*/);
        const orderedMatch = text.match(/^(\s*)(\d+(?:-\d+)*\. )\s*/);
        const checkMatch = text.match(/^(\s*)(- \[[ x]\] )\s*/);

        let diff = 0;

        if (type === 'ul') {
            if (bulletMatch) {
                // 削除
                const delLen = bulletMatch[0].length - bulletMatch[1].length;
                changes.push({ from: line.from + bulletMatch[1].length, to: line.from + bulletMatch[0].length, insert: "" });
                diff = -delLen;
            } else {
                // 追加
                changes.push({ from: line.from, insert: "- " });
                diff = 2;
            }
        } else if (type === 'ol') {
            if (orderedMatch) {
                const delLen = orderedMatch[0].length - orderedMatch[1].length;
                changes.push({ from: line.from + orderedMatch[1].length, to: line.from + orderedMatch[0].length, insert: "" });
                diff = -delLen;
            } else {
                changes.push({ from: line.from, insert: "1. " });
                diff = 3;
            }
        } else if (type === 'task') {
            if (checkMatch) {
                const delLen = checkMatch[0].length - checkMatch[1].length;
                changes.push({ from: line.from + checkMatch[1].length, to: line.from + checkMatch[0].length, insert: "" });
                diff = -delLen;
            } else {
                changes.push({ from: line.from, insert: "- [ ] " });
                diff = 6;
            }
        }
        totalChangeLength += diff;
    }

    // 選択範囲の維持（簡易実装）
    const newHead = endLine.to + totalChangeLength;

    dispatch({
        changes: changes,
        selection: { anchor: newHead, head: newHead }
    });
    view.focus();
}

// 各種挿入関数
export function insertLink(view) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from, to } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);
    const text = selectedText || "link";
    dispatch({ changes: { from: from, to: to, insert: `[${text}](url)` }, selection: { anchor: from + text.length + 3, head: from + text.length + 6 } });
    view.focus();
}

export function insertImage(view) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from, to } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);
    const text = selectedText || "Image";
    dispatch({
        changes: { from: from, to: to, insert: `![${text}](url)` },
        selection: { anchor: from + 2 + text.length + 2, head: from + 2 + text.length + 5 }
    });
    view.focus();
}

export function insertTable(view) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from, to } = state.selection.main;

    const table =
        `| Col 1 | Col 2 | Col 3 |
| :--- | :--- | :--- |
|  |  |  |
|  |  |  |
`;
    const lineStart = state.doc.lineAt(from).from;
    const needsNewline = from !== lineStart;
    const insertText = (needsNewline ? "\n" : "") + table;

    dispatch({
        changes: { from: from, to: to, insert: insertText },
        selection: { anchor: from + (needsNewline ? 1 : 0) + 2 }
    });
    view.focus();
}

export function insertCodeBlock(view) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from, to } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);
    const text = selectedText || "";
    const insert = `\`\`\`\n${text}\n\`\`\`\n`;

    dispatch({
        changes: { from: from, to: to, insert: insert },
        selection: { anchor: from + 4, head: from + 4 }
    });
    view.focus();
}

export function insertHorizontalRule(view) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from } = state.selection.main;
    const line = state.doc.lineAt(from);
    const insert = `\n---\n`;
    const newPos = line.to + insert.length;
    dispatch({
        changes: { from: line.to, insert: insert },
        selection: { anchor: newPos, head: newPos }
    });
    view.focus();
}

export function insertPageBreak(view) {
    if (!view) return;
    const { state, dispatch } = view;
    const { from } = state.selection.main;
    const line = state.doc.lineAt(from);
    const insert = `\n<div class="page-break"></div>\n`;
    const newPos = line.to + insert.length;
    dispatch({
        changes: { from: line.to, insert: insert },
        selection: { anchor: newPos, head: newPos }
    });
    view.focus();
}