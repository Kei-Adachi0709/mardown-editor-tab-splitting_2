const { undo, redo, indentMore, indentLess } = require("@codemirror/commands");

module.exports = {
    undo, redo,

    toggleMark(view, mark) {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to, empty } = state.selection.main;
        const selectedText = state.sliceDoc(from, to);
        const extendedFrom = Math.max(0, from - mark.length);
        const extendedTo = Math.min(state.doc.length, to + mark.length);

        if (extendedFrom >= 0 && extendedTo <= state.doc.length) {
            const surroundingText = state.sliceDoc(extendedFrom, extendedTo);
            if (surroundingText.startsWith(mark) && surroundingText.endsWith(mark)) {
                dispatch({
                    changes: { from: extendedFrom, to: extendedTo, insert: selectedText },
                    selection: { anchor: extendedFrom, head: extendedFrom + selectedText.length }
                });
                view.focus(); return;
            }
        }

        dispatch({
            changes: { from: from, to: to, insert: `${mark}${selectedText}${mark}` },
            selection: empty
                ? { anchor: from + mark.length, head: from + mark.length }
                : { anchor: to + mark.length * 2, head: to + mark.length * 2 }
        });
        view.focus();
    },

    toggleLinePrefix(view, prefix) {
        if (!view) return;
        const { state, dispatch } = view;
        const { from } = state.selection.main;
        const line = state.doc.lineAt(from);
        const match = line.text.match(/^\s*(#+\s*|>\s*)/);

        let changes;
        let newCursorPos;

        if (match && match[1].trim() === prefix.trim()) {
            const matchLen = match[0].length;
            changes = { from: line.from, to: line.from + matchLen, insert: "" };
            newCursorPos = line.to - matchLen;
        } else {
            const insertText = prefix.endsWith(' ') ? prefix : prefix + ' ';
            if (match) {
                const matchLen = match[0].length;
                changes = { from: line.from, to: line.from + matchLen, insert: insertText };
                newCursorPos = line.to - matchLen + insertText.length;
            } else {
                changes = { from: line.from, to: line.from, insert: insertText };
                newCursorPos = line.to + insertText.length;
            }
        }

        dispatch({
            changes: changes,
            selection: { anchor: newCursorPos, head: newCursorPos }
        });
        view.focus();
    },

    toggleList(view, type) {
        if (!view) return;
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
                    const delLen = bulletMatch[0].length - bulletMatch[1].length;
                    changes.push({ from: line.from + bulletMatch[1].length, to: line.from + bulletMatch[0].length, insert: "" });
                    diff = -delLen;
                } else {
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

        const newHead = endLine.to + totalChangeLength;
        dispatch({ changes, selection: { anchor: newHead, head: newHead } });
        view.focus();
    },

    insertLink(view) {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to } = state.selection.main;
        const selectedText = state.sliceDoc(from, to) || "link";
        dispatch({ changes: { from, to, insert: `[${selectedText}](url)` }, selection: { anchor: from + selectedText.length + 3, head: from + selectedText.length + 6 } });
        view.focus();
    },

    insertImage(view) {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to } = state.selection.main;
        const selectedText = state.sliceDoc(from, to) || "Image";
        dispatch({ changes: { from, to, insert: `![${selectedText}](url)` }, selection: { anchor: from + 4 + selectedText.length + 2, head: from + 4 + selectedText.length + 5 } });
        view.focus();
    },

    insertCodeBlock(view) {
        if (!view) return;
        const { state, dispatch } = view;
        const { from, to } = state.selection.main;
        const selectedText = state.sliceDoc(from, to);
        const insert = `\`\`\`\n${selectedText}\n\`\`\`\n`;
        dispatch({ changes: { from, to, insert }, selection: { anchor: from + 4 } });
        view.focus();
    },

    insertHorizontalRule(view) {
        if (!view) return;
        const { state, dispatch } = view;
        const line = state.doc.lineAt(state.selection.main.from);
        dispatch({ changes: { from: line.to, insert: `\n---\n` } });
        view.focus();
    },

    insertPageBreak(view) {
        if (!view) return;
        const { state, dispatch } = view;
        const line = state.doc.lineAt(state.selection.main.from);
        dispatch({ changes: { from: line.to, insert: `\n<div class="page-break"></div>\n` } });
        view.focus();
    },

    insertTable(view) {
        if (!view) return;
        const { state, dispatch } = view;
        const { from } = state.selection.main;
        const table = `| Col 1 | Col 2 | Col 3 |\n| :--- | :--- | :--- |\n|  |  |  |\n|  |  |  |\n`;
        dispatch({ changes: { from, insert: table } });
        view.focus();
    }
};