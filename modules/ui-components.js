console.log('[Module] UI Components loading...');
window.App = window.App || {};

window.App.UI = {
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `notification-toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        // アニメーション用
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    showModalConfirm(itemName, onConfirm) {
        if (confirm(`「${itemName}」を削除しますか？\nこの操作は元に戻せません。`)) {
            onConfirm();
        }
    },

    showContextMenu(x, y, path, name, callbacks) {
        const existing = document.querySelector('.context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const addItem = (text, onClick) => {
            const item = document.createElement('div');
            item.className = 'context-menu-item';
            item.textContent = text;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                onClick();
            });
            menu.appendChild(item);
        };

        addItem('名前の変更', callbacks.onRename);
        addItem('削除', callbacks.onDelete);

        document.body.appendChild(menu);

        const closeMenu = () => {
            if(document.body.contains(menu)) menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },

    showPasteOptionModal(text, view, callbacks) {
        // 簡易実装（ブラウザ標準confirm使用）
        // 実際はモーダルUIを作っても良いが、まずは動くことを優先
        if (confirm(`URLが検出されました:\n${text}\n\n[OK] リンクとして貼り付け\n[キャンセル] 通常のテキストとして貼り付け`)) {
            callbacks.onLink();
        } else {
            callbacks.onPlain();
        }
    }
};