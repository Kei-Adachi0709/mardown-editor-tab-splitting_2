function showNotification(msg, type='info') {
    const c = document.getElementById('notification-container');
    const d = document.createElement('div');
    d.className = `notification-toast ${type}`;
    d.textContent = msg;
    c.appendChild(d);
    setTimeout(() => d.classList.add('show'), 10);
    setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 300); }, 3000);
}

function showModalConfirm(name, onConfirm) {
    // 簡易実装（既存のDOMがあればそれを使うか、新規作成）
    if(!confirm(`「${name}」を削除しますか？`)) return;
    onConfirm();
}

function showContextMenu(x, y, path, name, cbs) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    
    const item1 = document.createElement('div');
    item1.className = 'context-menu-item';
    item1.textContent = '名前の変更';
    item1.onclick = () => { menu.remove(); cbs.onRename(); };
    
    const item2 = document.createElement('div');
    item2.className = 'context-menu-item';
    item2.textContent = '削除';
    item2.onclick = () => { menu.remove(); cbs.onDelete(); };
    
    menu.appendChild(item1);
    menu.appendChild(item2);
    document.body.appendChild(menu);
    
    const close = () => { menu.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
}

function showPasteOptionModal(text, view, callbacks) {
    // 簡易実装: すべての選択肢ボタンを持つダイアログを作成
    // ここでは簡略化のため、常にLinkとして貼り付ける例
    // 実運用ではモーダルDOMを作成してcallbacksを呼ぶ
    if(confirm(`URL: ${text}\nリンクとして貼り付けますか？`)) {
        callbacks.onLink();
    } else {
        callbacks.onPlain();
    }
}

module.exports = { showNotification, showModalConfirm, showContextMenu, showPasteOptionModal };