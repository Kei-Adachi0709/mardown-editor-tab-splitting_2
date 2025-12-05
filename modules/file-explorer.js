(() => {
    console.log('[Module] File Explorer loading...');
    const path = require('path');
    
    window.App = window.App || {};

    class FileExplorer {
        constructor(layoutManager) {
            this.layoutManager = layoutManager;
            this.container = document.getElementById('file-tree-container');
            if (this.container) this.initTree();
        }

        async initTree() {
            try {
                const dir = await window.electronAPI.getCurrentDirectory() || '.';
                window.App.State.currentDirectoryPath = dir;
                
                // ルート要素作成
                this.container.innerHTML = '';
                const root = document.createElement('div');
                root.className = 'tree-item expanded';
                root.dataset.path = dir;
                root.innerHTML = `<span class="tree-toggle">▼</span><span class="tree-icon">📂</span><span class="tree-label">${path.basename(dir)}</span>`;
                this.container.appendChild(root);

                // ルートの子要素コンテナ
                const children = document.createElement('div');
                children.className = 'tree-children';
                children.style.display = 'block';
                this.container.appendChild(children);

                await this.loadDir(children, dir);
                this.setupEvents();

            } catch (e) {
                console.error('File Tree Init Error:', e);
            }
        }

        async loadDir(container, dirPath) {
            container.innerHTML = '';
            const items = await window.electronAPI.readDirectory(dirPath);
            
            // フォルダ優先ソート
            items.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return b.isDirectory ? 1 : -1;
                return a.name.localeCompare(b.name);
            });

            items.forEach(item => {
                const div = document.createElement('div');
                div.className = `tree-item ${item.isDirectory ? '' : 'file'}`;
                const fullPath = path.join(dirPath, item.name);
                div.dataset.path = fullPath;
                div.dataset.name = item.name;
                
                div.innerHTML = item.isDirectory 
                    ? `<span class="tree-toggle">▶</span><span class="tree-icon">📁</span><span class="tree-label">${item.name}</span>`
                    : `<span class="tree-icon">📄</span><span class="tree-label">${item.name}</span>`;
                
                container.appendChild(div);
            });
        }

        setupEvents() {
            this.container.addEventListener('click', async (e) => {
                const item = e.target.closest('.tree-item');
                if (!item) return;
                e.stopPropagation();

                // 選択状態更新
                this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');

                const filePath = item.dataset.path;
                
                if (item.classList.contains('file')) {
                    // ファイルを開く
                    await this.openFile(filePath, item.dataset.name);
                } else {
                    // フォルダ開閉
                    const toggle = item.querySelector('.tree-toggle');
                    const next = item.nextElementSibling;
                    
                    if (toggle && toggle.textContent === '▶') {
                        toggle.textContent = '▼';
                        // 子コンテナがなければ作成
                        let childrenContainer = next;
                        if (!childrenContainer || !childrenContainer.classList.contains('tree-children')) {
                            childrenContainer = document.createElement('div');
                            childrenContainer.className = 'tree-children';
                            item.parentNode.insertBefore(childrenContainer, item.nextSibling);
                        }
                        childrenContainer.style.display = 'block';
                        await this.loadDir(childrenContainer, filePath);
                    } else if (toggle) {
                        toggle.textContent = '▶';
                        if (next && next.classList.contains('tree-children')) {
                            next.style.display = 'none';
                        }
                    }
                }
            });
        }

        async openFile(filePath, fileName) {
            try {
                if (!window.App.State.openedFiles.has(filePath)) {
                    const content = await window.electronAPI.loadFile(filePath);
                    window.App.State.openedFiles.set(filePath, { content, fileName });
                }
                if (this.layoutManager && this.layoutManager.activePane) {
                    this.layoutManager.activePane.openFile(filePath);
                }
            } catch (e) {
                console.error('Open file error:', e);
                window.App.UI.showNotification('ファイルを開けませんでした', 'error');
            }
        }
    }

    window.App.FileExplorer = FileExplorer;
})();