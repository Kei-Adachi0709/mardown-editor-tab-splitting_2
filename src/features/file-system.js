/**
 * features/file-system.js (ES Module 完全版)
 * ファイル操作、ファイルツリー、コンテキストメニューなど
 */
import path from 'path';
import { openedFiles, fileModificationState } from "../state.js";

// モジュール内ステート
let currentDirectoryPath = null;
let currentSortOrder = 'asc';
let activeContextMenu = null;

// DOMヘルパー
const getTreeContainer = () => document.getElementById('file-tree-container');

export async function openFile(filePath, fileName, layoutManager) {
    try {
        let content = '';
        if (openedFiles.has(filePath)) {
            content = openedFiles.get(filePath).content;
        } else {
            content = window.electronAPI?.loadFile ? await window.electronAPI.loadFile(filePath) : "(No Content)";
            openedFiles.set(filePath, { content, fileName });
        }
        layoutManager?.activePane?.openFile(filePath);
    } catch (e) {
        console.error('Open error:', e);
    }
}

export async function saveCurrentFile(layoutManager) {
    const pane = layoutManager.activePane;
    if (!pane?.activeFilePath) return;

    try {
        const content = pane.editorView.state.doc.toString();
        if (window.electronAPI?.saveFile) {
            await window.electronAPI.saveFile(pane.activeFilePath, content);
            const fileData = openedFiles.get(pane.activeFilePath);
            if(fileData) fileData.content = content;
            
            fileModificationState.delete(pane.activeFilePath);
            pane.updateTabs();
            console.log('Saved:', pane.activeFilePath);
        }
    } catch (e) {
        console.error('Save error:', e);
    }
}

// ========== ファイルツリー初期化 ==========

export async function initializeFileTree() {
    console.log('[FileSystem] Initializing File Tree...');
    try {
        if (window.electronAPI?.getCurrentDirectory) {
            currentDirectoryPath = await window.electronAPI.getCurrentDirectory();
        } else {
            currentDirectoryPath = '.';
        }

        const container = getTreeContainer();
        if (!container) return;

        // クローンしてイベントリスナーをリセット
        const newContainer = container.cloneNode(true);
        container.parentNode.replaceChild(newContainer, container);

        const rootItem = newContainer.querySelector('.tree-item.expanded');
        if (rootItem) {
            rootItem.dataset.path = currentDirectoryPath;
            const rootLabel = rootItem.querySelector('.tree-label');
            if (rootLabel) {
                rootLabel.textContent = currentDirectoryPath.split(/[/\\]/).pop() || currentDirectoryPath;
            }
            const rootChildren = rootItem.nextElementSibling;
            if (rootChildren) rootChildren.innerHTML = '';
            
            await loadDirectoryTreeContents(rootItem, currentDirectoryPath);

            // ルートへのドロップイベント
            rootItem.addEventListener('dragover', handleDragOver);
            rootItem.addEventListener('dragleave', handleDragLeave);
            rootItem.addEventListener('drop', handleDrop);
        }

        // コンテナ全体のイベント
        newContainer.addEventListener('dragover', handleDragOver);
        newContainer.addEventListener('drop', handleDrop);
        newContainer.addEventListener('click', handleTreeClick);
        newContainer.addEventListener('contextmenu', handleContextMenu);
        
        // ファイルシステム変更監視のコールバック用
        if (window.electronAPI?.onFileSystemChanged) {
            // renderer.js側でセットアップ済み
        }

    } catch (error) {
        console.error('Failed to initialize file tree:', error);
    }
}

// フォルダ内容の読み込み
async function loadDirectoryTreeContents(folderElement, dirPath) {
    let childrenContainer = folderElement.nextElementSibling;
    if (!childrenContainer || !childrenContainer.classList.contains('tree-children')) {
        childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        folderElement.parentNode.insertBefore(childrenContainer, folderElement.nextSibling);
    }
    childrenContainer.innerHTML = '';

    const items = await getSortedDirectoryContents(dirPath);
    items.forEach(item => {
        childrenContainer.appendChild(createTreeElement(item, dirPath));
    });
}

// ソート済みディレクトリ内容取得
async function getSortedDirectoryContents(dirPath) {
    try {
        const items = window.electronAPI?.readDirectory ? await window.electronAPI.readDirectory(dirPath) : [];
        return items.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return b.isDirectory ? 1 : -1;
            const cmp = a.name.localeCompare(b.name);
            return currentSortOrder === 'asc' ? cmp : -cmp;
        });
    } catch (e) {
        console.error(e);
        return [];
    }
}

// ツリー要素作成
function createTreeElement(item, parentPath) {
    const itemPath = item.path || path.join(parentPath, item.name);
    const container = document.createElement('div');
    container.className = 'tree-item' + (item.isDirectory ? '' : ' file');
    container.dataset.path = itemPath;
    container.dataset.name = item.name;
    container.draggable = true;

    // ドラッグイベント
    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);

    if (item.isDirectory) {
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        toggle.textContent = '▶';
        container.appendChild(toggle);
    }

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    if (item.isDirectory) {
        icon.textContent = '📁';
        icon.style.color = '#dcb67a';
    } else {
        const data = getFileIconData(item.name);
        icon.textContent = data.text;
        icon.style.color = data.color;
        icon.classList.add('file-icon-styled');
    }

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = item.name;

    container.appendChild(icon);
    container.appendChild(label);

    return container;
}

// アイコン取得
function getFileIconData(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
        'md': { text: 'M↓', color: '#519aba' }, 'js': { text: 'JS', color: '#f1e05a' },
        'ts': { text: 'TS', color: '#2b7489' }, 'html': { text: '<>', color: '#e34c26' },
        'css': { text: '#', color: '#563d7c' }, 'json': { text: '{}', color: '#cbcb41' },
        'py': { text: 'Py', color: '#3572a5' }, 'png': { text: 'img', color: '#b07219' },
        'jpg': { text: 'img', color: '#b07219' }
    };
    return map[ext] || { text: '📄', color: '#90a4ae' };
}

// ========== イベントハンドラ ==========

function handleTreeClick(e) {
    const item = e.target.closest('.tree-item');
    if (!item || item.classList.contains('creation-mode') || e.target.tagName === 'INPUT') return;

    e.stopPropagation();
    document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');

    if (item.classList.contains('file')) {
        openFile(item.dataset.path, item.dataset.name, window.layoutManager);
    } else {
        toggleFolder(item);
    }
}

async function toggleFolder(folderElement) {
    const toggle = folderElement.querySelector('.tree-toggle');
    if (!toggle) return;
    const isExpanded = toggle.textContent === '▼';
    
    if (isExpanded) {
        toggle.textContent = '▶';
        if (folderElement.nextElementSibling?.classList.contains('tree-children')) {
            folderElement.nextElementSibling.style.display = 'none';
        }
    } else {
        toggle.textContent = '▼';
        let children = folderElement.nextElementSibling;
        if (!children?.classList.contains('tree-children')) {
            children = document.createElement('div');
            children.className = 'tree-children';
            folderElement.parentNode.insertBefore(children, folderElement.nextSibling);
        }
        children.style.display = 'block';
        await loadDirectoryTreeContents(folderElement, folderElement.dataset.path);
    }
}

// ドラッグ&ドロップ
function handleDragStart(e) {
    const item = e.target.closest('.tree-item');
    if (!item || !item.dataset.path) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', item.dataset.path);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
}

function handleDragOver(e) {
    e.preventDefault(); e.stopPropagation();
    const item = e.target.closest('.tree-item');
    if (item && !item.classList.contains('file')) {
        item.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
    } else {
        e.dataTransfer.dropEffect = 'none';
    }
}

function handleDragLeave(e) {
    const item = e.target.closest('.tree-item');
    if (item) item.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault(); e.stopPropagation();
    const targetItem = e.target.closest('.tree-item');
    if (targetItem) targetItem.classList.remove('drag-over');

    const srcPath = e.dataTransfer.getData('text/plain');
    if (!srcPath) return;
    try { if (JSON.parse(srcPath).paneId) return; } catch {} // LayoutのD&Dは無視

    let destFolderPath = currentDirectoryPath;
    if (targetItem) {
        if (targetItem.classList.contains('file')) return; // ファイルにはドロップ不可
        destFolderPath = targetItem.dataset.path;
    }

    const fileName = path.basename(srcPath);
    const destPath = path.join(destFolderPath, fileName);

    if (srcPath !== destPath && window.electronAPI?.moveFile) {
        const res = await window.electronAPI.moveFile(srcPath, destPath);
        if (res.success) {
            console.log(`Moved ${fileName} to ${destFolderPath}`);
            // ツリー更新はファイル監視イベント経由で行われるためここでは何もしないか、
            // 強制リロードする場合は reloadContainer(targetContainer) を呼ぶ
        } else {
            console.error('Move failed:', res.error);
        }
    }
}

// ========== コンテキストメニュー ==========

function handleContextMenu(e) {
    const item = e.target.closest('.tree-item');
    if (!item || item.classList.contains('creation-mode')) return;
    e.preventDefault(); e.stopPropagation();

    document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
    item.classList.add('selected');

    showContextMenu(e.pageX, e.pageY, item.dataset.path, item.dataset.name);
}

function showContextMenu(x, y, path, name) {
    if (activeContextMenu) activeContextMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const addOpt = (label, cb) => {
        const d = document.createElement('div');
        d.className = 'context-menu-item';
        d.textContent = label;
        d.onclick = () => { menu.remove(); activeContextMenu = null; cb(); };
        menu.appendChild(d);
    };

    addOpt('名前の変更', () => {
        const el = document.querySelector(`.tree-item[data-path="${CSS.escape(path)}"]`);
        if (el) startRenaming(el);
    });
    addOpt('削除', () => showModalConfirm(name, () => confirmAndDelete(path)));

    document.body.appendChild(menu);
    activeContextMenu = menu;
}

document.addEventListener('click', () => {
    if (activeContextMenu) { activeContextMenu.remove(); activeContextMenu = null; }
});

// ========== 名前変更・削除・作成 ==========

function startRenaming(treeItem) {
    const labelSpan = treeItem.querySelector('.tree-label');
    if (!labelSpan) return;
    const originalName = treeItem.dataset.name;
    const originalPath = treeItem.dataset.path;

    labelSpan.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = originalName;
    treeItem.appendChild(input);
    input.focus();

    const finish = async () => {
        const newName = input.value.trim();
        input.remove();
        labelSpan.style.display = '';
        
        if (newName && newName !== originalName && window.electronAPI?.renameFile) {
            const res = await window.electronAPI.renameFile(originalPath, newName);
            if (!res.success) alert(`Rename failed: ${res.error}`);
        }
    };

    input.onblur = finish;
    input.onkeydown = (e) => { if(e.key === 'Enter') finish(); };
}

function showModalConfirm(name, onConfirm) {
    if(confirm(`「${name}」を削除しますか？`)) onConfirm();
}

async function confirmAndDelete(filePath) {
    if (window.electronAPI?.deleteFile) {
        if (await window.electronAPI.deleteFile(filePath)) {
            // タブを閉じる
            window.layoutManager?.panes.forEach(pane => {
                pane.files.filter(f => f.startsWith(filePath)).forEach(f => pane.closeFile(f));
            });
            // openedFilesからも削除
            openedFiles.forEach((_, key) => {
                if(key.startsWith(filePath)) openedFiles.delete(key);
            });
        }
    }
}

export function showCreationInput(isFolder) {
    // 選択中のフォルダまたはルートを特定
    const selected = document.querySelector('.tree-item.selected');
    let parentPath = currentDirectoryPath;
    let container = getTreeContainer().querySelector('.tree-children'); // root children default

    if (selected) {
        if (!selected.classList.contains('file')) {
             parentPath = selected.dataset.path;
             // 展開しておく
             const toggle = selected.querySelector('.tree-toggle');
             if(toggle && toggle.textContent === '▼') {
                 container = selected.nextElementSibling;
             } else {
                 // 閉じてるなら開く処理が必要だが簡易的に直下に挿入
                 container = selected.nextElementSibling || selected.parentNode; 
             }
        } else {
             // ファイル選択時はその親フォルダ
             const parentItem = selected.parentElement.previousElementSibling;
             if(parentItem) parentPath = parentItem.dataset.path;
             container = selected.parentElement;
        }
    }
    
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'tree-item creation-mode';
    div.innerHTML = `<span class="tree-icon">${isFolder ? '📁' : '📄'}</span><input type="text" class="creation-input" placeholder="Name">`;
    container.prepend(div);
    
    const input = div.querySelector('input');
    input.focus();

    const finish = async () => {
        const name = input.value.trim();
        div.remove();
        if(!name) return;
        const newPath = path.join(parentPath, name);
        try {
            if(isFolder) await window.electronAPI.createDirectory(newPath);
            else await window.electronAPI.saveFile(newPath, '');
        } catch(e) { console.error(e); }
    };

    input.onblur = finish;
    input.onkeydown = (e) => { if(e.key === 'Enter') finish(); };
}

// フォルダを開くなど
export function handleOpenFolder() {
    window.electronAPI?.selectFolder().then(res => {
        if(res.success) initializeFileTree();
    });
}