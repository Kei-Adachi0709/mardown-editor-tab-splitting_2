const path = require('path');
const state = require('./state');
const { showContextMenu, showModalConfirm, showNotification } = require('./ui-components');

class FileExplorer {
    constructor(layoutManager) {
        this.layoutManager = layoutManager;
        this.container = document.getElementById('file-tree-container');
        if (this.container) {
            this.setupEvents();
            this.initTree();
        }
    }

    async initTree() {
        try {
            state.currentDirectoryPath = await window.electronAPI.getCurrentDirectory() || '.';
            const root = this.container.querySelector('.tree-item.expanded');
            if (root) {
                root.dataset.path = state.currentDirectoryPath;
                root.querySelector('.tree-label').textContent = path.basename(state.currentDirectoryPath);
                await this.loadDir(root, state.currentDirectoryPath);
            }
        } catch (e) { console.error(e); }
    }

    setupEvents() {
        this.container.addEventListener('click', (e) => {
            const item = e.target.closest('.tree-item');
            if (!item || item.classList.contains('creation-mode')) return;
            e.stopPropagation();
            
            this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');

            if (item.classList.contains('file')) {
                this.openFile(item.dataset.path, item.dataset.name);
            } else {
                this.toggleDir(item);
            }
        });

        this.container.addEventListener('contextmenu', (e) => {
            const item = e.target.closest('.tree-item');
            if(!item) return;
            e.preventDefault();
            this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            showContextMenu(e.pageX, e.pageY, item.dataset.path, item.dataset.name, {
                onRename: () => this.rename(item),
                onDelete: () => showModalConfirm(item.dataset.name, () => this.delete(item.dataset.path))
            });
        });
    }

    async loadDir(folderElem, dirPath) {
        let childContainer = folderElem.nextElementSibling;
        if (!childContainer || !childContainer.classList.contains('tree-children')) {
            childContainer = document.createElement('div');
            childContainer.className = 'tree-children';
            folderElem.parentNode.insertBefore(childContainer, folderElem.nextSibling);
        }
        childContainer.innerHTML = '';
        
        const items = await window.electronAPI.readDirectory(dirPath);
        items.sort((a,b) => {
            if(a.isDirectory !== b.isDirectory) return b.isDirectory ? 1 : -1;
            return a.name.localeCompare(b.name);
        });

        items.forEach(item => {
            childContainer.appendChild(this.createItem(item, dirPath));
        });
        childContainer.style.display = 'block';
    }

    createItem(item, parentPath) {
        const fullPath = path.join(parentPath, item.name);
        const div = document.createElement('div');
        div.className = `tree-item ${item.isDirectory ? '' : 'file'}`;
        div.dataset.path = fullPath;
        div.dataset.name = item.name;
        
        let html = '';
        if(item.isDirectory) html += `<span class="tree-toggle">▶</span><span class="tree-icon">📁</span>`;
        else html += `<span class="tree-icon">📄</span>`;
        html += `<span class="tree-label">${item.name}</span>`;
        
        div.innerHTML = html;
        return div;
    }

    async toggleDir(elem) {
        const toggle = elem.querySelector('.tree-toggle');
        if(!toggle) return;
        const isExpanded = toggle.textContent === '▼';
        const children = elem.nextElementSibling;
        
        if (isExpanded) {
            toggle.textContent = '▶';
            if(children) children.style.display = 'none';
        } else {
            toggle.textContent = '▼';
            await this.loadDir(elem, elem.dataset.path);
        }
    }

    async openFile(filePath, fileName) {
        try {
            if (!state.openedFiles.has(filePath)) {
                const content = await window.electronAPI.loadFile(filePath);
                state.openedFiles.set(filePath, { content, fileName });
            }
            this.layoutManager.activePane.openFile(filePath);
        } catch (e) { showNotification('開けませんでした', 'error'); }
    }

    rename(item) {
        // Simple rename impl
        const nameSpan = item.querySelector('.tree-label');
        const oldName = item.dataset.name;
        nameSpan.style.display = 'none';
        const input = document.createElement('input');
        input.value = oldName;
        input.className = 'rename-input';
        item.appendChild(input);
        input.focus();
        
        const finish = async () => {
            const newName = input.value.trim();
            if(newName && newName !== oldName) {
                await window.electronAPI.renameFile(item.dataset.path, newName);
                this.initTree(); // Reload
            }
            input.remove();
            nameSpan.style.display = '';
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', e => { if(e.key==='Enter') finish(); });
    }

    async delete(path) {
        await window.electronAPI.deleteFile(path);
        this.initTree();
    }
}
module.exports = { FileExplorer };