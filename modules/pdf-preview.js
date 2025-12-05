(() => {
    console.log('[Module] PDF Preview loading...');
    const path = require('path');
    const { marked } = require('marked');

    window.App = window.App || {};

    window.App.PdfPreview = {
        async loadPdfJs() {
            if (window.App.State.pdfjsLib) return window.App.State.pdfjsLib;
            try {
                // node_modules の場所を絶対パスで指定
                const projectRoot = path.resolve(__dirname, '..');
                const pdfjsPath = path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.mjs');
                const workerPath = path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
                
                // Windowsパス対策
                const pdfjsUrl = 'file:///' + pdfjsPath.replace(/\\/g, '/');
                const workerUrl = 'file:///' + workerPath.replace(/\\/g, '/');

                const loadedLib = await import(pdfjsUrl);
                loadedLib.GlobalWorkerOptions.workerSrc = workerUrl;
                window.App.State.pdfjsLib = loadedLib;
                console.log('PDF.js loaded');
                return loadedLib;
            } catch (e) {
                console.error('PDF.js load failed:', e);
            }
        },

        async generatePdfPreview(markdownContent) {
            if (!markdownContent) return;
            try {
                const htmlContent = marked.parse(markdownContent);
                // メインプロセスでPDF生成
                if (window.electronAPI && window.electronAPI.generatePdf) {
                    const pdfData = await window.electronAPI.generatePdf(htmlContent);
                    if (pdfData) await this.displayPdf(pdfData);
                }
            } catch (e) {
                console.error('PDF Preview Error:', e);
            }
        },

        async displayPdf(pdfData) {
            await this.loadPdfJs();
            const lib = window.App.State.pdfjsLib;
            if (!lib) return;

            const container = document.getElementById('pdf-preview-container');
            if (!container) return;
            container.innerHTML = ''; // クリア

            try {
                const pdfDataArray = Uint8Array.from(atob(pdfData), c => c.charCodeAt(0));
                const doc = await lib.getDocument({ data: pdfDataArray }).promise;
                window.App.State.pdfDocument = doc;

                // 1ページ目のみ表示（軽量化）
                const page = await doc.getPage(1);
                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-page-canvas';
                container.appendChild(canvas);

                const viewport = page.getViewport({ scale: 1.2 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport: viewport
                }).promise;

                const info = document.getElementById('pdf-page-info');
                if (info) info.textContent = `全 ${doc.numPages} ページ`;

            } catch (e) {
                console.error('PDF Render Error:', e);
                container.innerHTML = '<div style="color:red">PDF表示エラー</div>';
            }
        }
    };
})();