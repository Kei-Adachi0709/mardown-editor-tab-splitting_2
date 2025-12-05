console.log('[App] Starting...');

window.addEventListener('load', async () => {
    console.log('[App] Window loaded. Initializing...');

    try {
        // 必須モジュールのチェック
        if (!window.App || !window.App.LayoutManager || !window.App.FileExplorer) {
            throw new Error('Required modules are missing. Check script tags in index.html');
        }

        // 短く書けるようにエイリアスを作成
        const { LayoutManager, FileExplorer, TerminalManager, State, UI, EditorUtils, PdfPreview } = window.App;

        // --- 1. レイアウトマネージャー初期化 ---
        const layoutManager = new LayoutManager('pane-root', {
            // アクティブなペインが切り替わった時の処理
            onActivePaneChanged: (pane) => {
                const titleInput = document.getElementById('file-title-input');
                const titleBar = document.getElementById('file-title-bar');
                const stats = document.getElementById('file-stats');

                if (pane && pane.activeFilePath) {
                    const fileData = State.openedFiles.get(pane.activeFilePath);
                    if (titleInput) titleInput.value = fileData ? fileData.fileName : '';
                    if (titleBar) titleBar.classList.remove('hidden');
                    if (stats) stats.textContent = `行数: ${pane.editorView.state.doc.lines}`;
                    
                    // PDFプレビュー更新
                    if (State.isPdfPreviewVisible) {
                        PdfPreview.generatePdfPreview(pane.editorView.state.doc.toString());
                    }
                } else {
                    if (titleBar) titleBar.classList.add('hidden');
                    if (titleInput) titleInput.value = '';
                    if (stats) stats.textContent = '';
                }
            },
            // エディタに入力があった時の処理
            onEditorInput: (isDirty) => {
                const pane = layoutManager.activePane;
                if (pane && State.isPdfPreviewVisible) {
                    // 入力中は少し待ってからPDF更新 (Debounce)
                    if (State.timeouts.pdfUpdate) clearTimeout(State.timeouts.pdfUpdate);
                    State.timeouts.pdfUpdate = setTimeout(() => {
                        PdfPreview.generatePdfPreview(pane.editorView.state.doc.toString());
                    }, 800);
                }
            },
            // Ctrl+S で保存された時の処理
            onSave: () => saveFile()
        });
        
        layoutManager.init();

        // --- 2. ファイルエクスプローラー初期化 ---
        const fileExplorer = new FileExplorer(layoutManager);

        // --- 3. ターミナル初期化 ---
        const terminalManager = new TerminalManager();
        await terminalManager.init(); // 初期設定読み込み

        // --- 4. 共通処理関数 ---
        
        // ファイル保存処理
        const saveFile = async () => {
            const pane = layoutManager.activePane;
            if (pane && pane.activeFilePath) {
                try {
                    await window.electronAPI.saveFile(pane.activeFilePath, pane.editorView.state.doc.toString());
                    State.fileModificationState.delete(pane.activeFilePath);
                    pane.updateTabs();
                    UI.showNotification('保存しました', 'success');
                } catch (e) {
                    UI.showNotification('保存に失敗しました', 'error');
                }
            }
        };

        // アクティブなエディタビューを取得するヘルパー
        const getActiveView = () => layoutManager.activePane?.editorView;

        // --- 5. イベントリスナー設定 (ここが重要) ---

        // ▼ ツールバーボタン設定
        const bindBtn = (id, action) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', () => {
                const view = getActiveView();
                if (view) {
                    action(view);
                    view.focus();
                }
            });
        };

        // 保存 & PDF
        document.getElementById('btn-save')?.addEventListener('click', saveFile);
        document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
            // エクスポート処理（未実装なら通知だけ）
            UI.showNotification('PDFエクスポート機能は準備中です'); 
        });

        // Undo / Redo
        bindBtn('toolbar-undo', EditorUtils.undo);
        bindBtn('toolbar-redo', EditorUtils.redo);

        // 書式
        bindBtn('bold-btn', (v) => EditorUtils.toggleMark(v, '**'));
        bindBtn('italic-btn', (v) => EditorUtils.toggleMark(v, '*'));
        bindBtn('strike-btn', (v) => EditorUtils.toggleMark(v, '~~'));
        bindBtn('highlight-btn', (v) => EditorUtils.toggleMark(v, '=='));
        bindBtn('inline-code-btn', (v) => EditorUtils.toggleMark(v, '`'));

        // 見出し
        bindBtn('btn-h2', (v) => EditorUtils.toggleLinePrefix(v, '##'));
        bindBtn('btn-h3', (v) => EditorUtils.toggleLinePrefix(v, '###'));
        // Hn ドロップダウン (簡易実装: クリックで動くようにする)
        document.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action; // "h1" 〜 "h6"
                if (action) {
                    const level = action.replace('h', '');
                    const prefix = '#'.repeat(parseInt(level));
                    const view = getActiveView();
                    if(view) EditorUtils.toggleLinePrefix(view, prefix);
                }
            });
        });

        // 挿入系
        bindBtn('link-btn', EditorUtils.insertLink);
        bindBtn('image-btn', EditorUtils.insertImage);
        bindBtn('btn-table', EditorUtils.insertTable);
        bindBtn('code-btn', EditorUtils.insertCodeBlock);
        bindBtn('quote-btn', (v) => EditorUtils.toggleLinePrefix(v, '>'));
        bindBtn('hr-btn', EditorUtils.insertHorizontalRule);
        bindBtn('btn-page-break', EditorUtils.insertPageBreak);

        // リスト系
        bindBtn('btn-bullet-list', (v) => EditorUtils.toggleList(v, 'ul'));
        bindBtn('btn-number-list', (v) => EditorUtils.toggleList(v, 'ol'));
        bindBtn('btn-check-list', (v) => EditorUtils.toggleList(v, 'task'));

        // ファイルを閉じる
        document.getElementById('btn-close-file-toolbar')?.addEventListener('click', () => {
            const pane = layoutManager.activePane;
            if (pane && pane.activeFilePath) {
                pane.closeFile(pane.activeFilePath);
            }
        });

        // ▼ サイドバー切り替え (ファイル / Git / アウトライン)
        const setupSidebar = () => {
            const btns = document.querySelectorAll('.side-switch');
            btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    // 全ボタン非アクティブ化
                    btns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // 全コンテンツ非表示
                    document.querySelectorAll('.left-pane-content').forEach(c => c.classList.add('content-hidden'));
                    document.querySelectorAll('.header-buttons').forEach(h => h.classList.add('content-hidden'));

                    // 対象を表示
                    const target = btn.dataset.target; // files, git, outline
                    document.getElementById(`content-${target}`)?.classList.remove('content-hidden');
                    document.getElementById(`header-buttons-${target}`)?.classList.remove('content-hidden');
                    
                    // 左ペイン自体が表示されていなければ表示する
                    const leftPane = document.getElementById('left-pane');
                    if (leftPane.classList.contains('hidden')) {
                        leftPane.classList.remove('hidden');
                        document.getElementById('ide-container').classList.remove('left-pane-hidden');
                    }
                });
            });
        };
        setupSidebar();

        // 左ペイン開閉ボタン
        document.getElementById('btn-toggle-leftpane')?.addEventListener('click', () => {
            const leftPane = document.getElementById('left-pane');
            const container = document.getElementById('ide-container');
            leftPane.classList.toggle('hidden');
            container.classList.toggle('left-pane-hidden');
        });

        // ▼ 右パネル (ターミナル / PDF) 切り替え
        const toggleRightPanel = (mode) => { // mode: 'terminal' or 'pdf'
            const rightPane = document.getElementById('right-pane');
            const termContainer = document.getElementById('terminal-container');
            const pdfContainer = document.getElementById('pdf-preview-container');
            const termHeader = document.getElementById('terminal-header');
            const pdfHeader = document.getElementById('pdf-preview-header');

            const isSameMode = (mode === 'terminal' && State.isTerminalVisible) || (mode === 'pdf' && State.isPdfPreviewVisible);
            
            // 既に開いているモードと同じボタンを押したら閉じる
            if (isSameMode) {
                rightPane.classList.add('hidden');
                State.isTerminalVisible = false;
                State.isPdfPreviewVisible = false;
                return;
            }

            // 開く処理
            rightPane.classList.remove('hidden');
            
            if (mode === 'terminal') {
                State.isTerminalVisible = true;
                State.isPdfPreviewVisible = false;
                
                termContainer.classList.remove('hidden');
                termHeader.classList.remove('hidden');
                pdfContainer.classList.add('hidden');
                pdfHeader.classList.add('hidden');

                if (terminalManager.terminals.size === 0) terminalManager.createSession();
                
            } else if (mode === 'pdf') {
                State.isTerminalVisible = false;
                State.isPdfPreviewVisible = true;

                pdfContainer.classList.remove('hidden');
                pdfHeader.classList.remove('hidden');
                termContainer.classList.add('hidden');
                termHeader.classList.add('hidden');

                const pane = layoutManager.activePane;
                if (pane) PdfPreview.generatePdfPreview(pane.editorView.state.doc.toString());
            }
        };

        document.getElementById('btn-terminal-right')?.addEventListener('click', () => toggleRightPanel('terminal'));
        document.getElementById('btn-pdf-preview')?.addEventListener('click', () => toggleRightPanel('pdf'));

        // ▼ ウィンドウ制御ボタン
        document.getElementById('btn-minimize')?.addEventListener('click', () => window.electronAPI.minimizeWindow());
        document.getElementById('btn-maximize')?.addEventListener('click', () => window.electronAPI.maximizeWindow());
        document.getElementById('btn-close')?.addEventListener('click', () => window.electronAPI.closeWindow());

        // --- 6. 初期表示 ---
        const readmePath = 'README.md';
        if (!State.openedFiles.has(readmePath)) {
            State.openedFiles.set(readmePath, { 
                content: '# Welcome to Markdown IDE\n\nStart typing...', 
                fileName: 'README.md' 
            });
        }
        if (layoutManager.activePane) {
            layoutManager.activePane.openFile(readmePath);
        }

        console.log('[App] Initialization complete.');

    } catch (e) {
        console.error('CRITICAL INITIALIZATION ERROR:', e);
        if (window.onerror) window.onerror(e.message, 'app.js', 0, 0, e);
    }
});