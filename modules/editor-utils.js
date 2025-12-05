(() => {
    console.log('[Module] Editor Utils loading...');
    const { undo, redo } = require("@codemirror/commands");

    window.App = window.App || {};

    window.App.EditorUtils = {
        undo,
        redo,

        toggleMark(view, mark) {
            if (!view) return;
            const { state, dispatch } = view;
            const { from, to, empty } = state.selection.main;
            const selectedText = state.sliceDoc(from, to);
            
            // 簡易的なトグル実装
            const around = state.sliceDoc(from - mark.length, to + mark.length);
            if (around.startsWith(mark) && around.endsWith(mark)) {
                dispatch({
                    changes: { from: from - mark.length, to: to + mark.length, insert: selectedText },
                    selection: { anchor: from - mark.length, head: to - mark.length }
                });
            } else {
                dispatch({
                    changes: { from, to, insert: `${mark}${selectedText}${mark}` },
                    selection: { anchor: from + mark.length, head: to + mark.length }
                });
            }
            view.focus();
        },

        toggleLinePrefix(view, prefix) {
            if (!view) return;
            const { state, dispatch } = view;
            const line = state.doc.lineAt(state.selection.main.from);
            const text = line.text;
            
            let changes;
            const cleanPrefix = prefix.trim();
            const regex = new RegExp(`^${cleanPrefix}\\s?`);
            
            if (regex.test(text)) {
                const match = text.match(regex);
                changes = { from: line.from, to: line.from + match[0].length, insert: '' };
            } else {
                changes = { from: line.from, insert: prefix + ' ' };
            }
            dispatch({ changes });
            view.focus();
        },

        toggleList(view, type) {
            if (!view) return;
            const { state, dispatch } = view;
            const line = state.doc.lineAt(state.selection.main.from);
            const text = line.text;
            
            let prefix = '';
            let regex = null;

            if (type === 'ul') { prefix = '- '; regex = /^-\s/; }
            else if (type === 'ol') { prefix = '1. '; regex = /^\d+\.\s/; }
            else if (type === 'task') { prefix = '- [ ] '; regex = /^-\s\[[ x]\]\s/; }

            let changes;
            if (regex && regex.test(text)) {
                const match = text.match(regex);
                changes = { from: line.from, to: line.from + match[0].length, insert: '' };
            } else {
                changes = { from: line.from, insert: prefix };
            }
            dispatch({ changes });
            view.focus();
        },

        insertLink(view) {
            if (!view) return;
            const { from, to } = view.state.selection.main;
            const text = view.state.sliceDoc(from, to) || 'link';
            view.dispatch({
                changes: { from, to, insert: `[${text}](url)` },
                selection: { anchor: from + text.length + 3, head: from + text.length + 6 }
            });
            view.focus();
        },

        insertImage(view) {
            if (!view) return;
            view.dispatch({
                changes: { from: view.state.selection.main.from, insert: '![Image](url)' },
                selection: { anchor: view.state.selection.main.from + 9, head: view.state.selection.main.from + 12 }
            });
            view.focus();
        },

        insertTable(view) {
            if (!view) return;
            const table = `
| Col 1 | Col 2 | Col 3 |
| :--- | :--- | :--- |
|  |  |  |
|  |  |  |
`;
            view.dispatch({ changes: { from: view.state.selection.main.from, insert: table.trim() } });
            view.focus();
        },

        insertCodeBlock(view) {
            if (!view) return;
            const { from, to } = view.state.selection.main;
            const text = view.state.sliceDoc(from, to);
            const insert = `\`\`\`\n${text}\n\`\`\`\n`;
            view.dispatch({ changes: { from, to, insert } });
            view.focus();
        },

        insertHorizontalRule(view) {
            if (!view) return;
            const line = view.state.doc.lineAt(view.state.selection.main.from);
            view.dispatch({ changes: { from: line.to, insert: '\n---\n' } });
            view.focus();
        },
        
        insertPageBreak(view) {
            if (!view) return;
            const line = view.state.doc.lineAt(view.state.selection.main.from);
            view.dispatch({ changes: { from: line.to, insert: '\n<div class="page-break"></div>\n' } });
            view.focus();
        }
    };
})();