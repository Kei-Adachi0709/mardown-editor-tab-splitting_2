/**
 * features/pdf-preview.js
 * PDFプレビュー機能 (CommonJS版 - 完全版)
 */
const path = require('path');

let isPdfPreviewVisible = false;
let pdfDocument = null;
let pdfjsLib = null;

// PDF.jsの動的ロード
async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;

    try {
        const pdfjsPath = path.join(__dirname, '../../node_modules', 'pdfjs-dist', 'build', 'pdf.min.mjs');
        const workerPath = path.join(__dirname, '../../node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
        
        const pdfjsUrl = 'file:///' + pdfjsPath.replace(/\\/g, '/');
        const workerUrl = 'file:///' + workerPath.replace(/\\/g, '/');

        const loadedLib = await import(pdfjsUrl);
        loadedLib.GlobalWorkerOptions.workerSrc = workerUrl;
        pdfjsLib = loadedLib;
        return pdfjsLib;
    } catch (e) {
        console.error("[PdfPreview] Failed to load PDF.js:", e);
        return null;
    }
}

function togglePdfPreview(isVisible) {
    isPdfPreviewVisible = isVisible;
    if (isPdfPreviewVisible) {
        generatePdfPreview();
    }
}

async function generatePdfPreview() {
    if (!isPdfPreviewVisible) return;
    
    // renderer.jsのグローバル layoutManager を参照
    const view = window.layoutManager?.activePane?.editorView;
    if (!view) {
        // ビューがない場合はクリア
        const canvas = document.getElementById('pdf-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
    }

    try {
        const markdownContent = view.state.doc.toString();
        if (!markdownContent.trim()) {
            const canvas = document.getElementById('pdf-canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            return;
        }

        const processedMarkdown = await processMarkdownForExport(markdownContent);
        
        // markedはグローバルに読み込まれている前提
        const htmlContent = marked.parse(processedMarkdown, { breaks: true, gfm: true });

        if (typeof window.electronAPI?.generatePdf === 'function') {
            await renderHtmlToPdf(htmlContent);
        } else {
            console.warn('[PdfPreview] PDF generation API not available, using fallback');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            await createCanvasBasedPreview(tempDiv);
        }
    } catch (error) {
        console.error('[PdfPreview] Failed to generate PDF preview:', error);
    }
}

// Markdownの変換処理（ハイライト、ブックマーク展開など）
async function processMarkdownForExport(markdown) {
    let processed = markdown.replace(/==([^=]+)==/g, '<mark>$1</mark>');

    // ネストされたリストのインデント調整
    processed = processed.replace(/^(\s+)(\d+(?:-\d+)+\.)/gm, (match, indent, marker) => {
        return '&nbsp;'.repeat(indent.length) + marker;
    });

    // ブックマーク記法 (@card url) の展開
    const bookmarkRegex = /^@card\s+(https?:\/\/[^\s]+)$/gm;
    const matches = [...processed.matchAll(bookmarkRegex)];

    if (matches.length === 0) return processed;

    const replacements = await Promise.all(matches.map(async (match) => {
        const url = match[1];
        let data = null;

        // キャッシュチェック
        if (!window.pdfMetadataCache) window.pdfMetadataCache = new Map();

        if (window.pdfMetadataCache.has(url)) {
            data = window.pdfMetadataCache.get(url);
        } else {
            try {
                if (window.electronAPI && window.electronAPI.fetchUrlMetadata) {
                    const result = await window.electronAPI.fetchUrlMetadata(url);
                    if (result.success) {
                        data = result.data;
                        window.pdfMetadataCache.set(url, data);
                    }
                }
            } catch (e) {
                console.error("[PdfPreview] Metadata fetch failed:", e);
            }
        }

        if (!data) {
            return {
                original: match[0],
                replacement: `<div class="cm-bookmark-widget"><div class="cm-bookmark-content"><div class="cm-bookmark-title"><a href="${url}">${url}</a></div></div></div>`
            };
        }

        const faviconUrl = `https://www.google.com/s2/favicons?domain=${data.domain}&sz=32`;

        const html = `<a href="${data.url}" class="cm-bookmark-widget" target="_blank" rel="noopener noreferrer">
    <div class="cm-bookmark-content">
        <div class="cm-bookmark-title">${data.title}</div>
        <div class="cm-bookmark-desc">${data.description}</div>
        <div class="cm-bookmark-meta">
            <img src="${faviconUrl}" class="cm-bookmark-favicon">
            <span class="cm-bookmark-domain">${data.domain}</span>
        </div>
    </div>
    ${data.image ? `<div class="cm-bookmark-cover"><img src="${data.image}" class="cm-bookmark-image"></div>` : ''}
</a>`;

        return {
            original: match[0],
            replacement: html
        };
    }));

    for (const item of replacements) {
        processed = processed.replaceAll(item.original, item.replacement);
    }

    return processed;
}

async function renderHtmlToPdf(htmlContent) {
    try {
        const pdfData = await window.electronAPI.generatePdf(htmlContent);
        if (pdfData) {
            await displayPdfFromData(pdfData);
        }
    } catch (error) {
        console.error('[PdfPreview] Error rendering HTML to PDF:', error);
        // エラー時はキャンバスフォールバック
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        await createCanvasBasedPreview(tempDiv);
    }
}

async function displayPdfFromData(pdfData) {
    try {
        await loadPdfJs();
        if (!pdfjsLib) return;

        const pdfDataArray = Uint8Array.from(atob(pdfData), c => c.charCodeAt(0));
        const loadingTask = pdfjsLib.getDocument({ data: pdfDataArray });
        pdfDocument = await loadingTask.promise;

        const pageInfo = document.getElementById('pdf-page-info');
        if (pageInfo) {
            pageInfo.textContent = `全 ${pdfDocument.numPages} ページ`;
        }

        const container = document.getElementById('pdf-preview-container');
        if (!container) return;
        container.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
            await renderPageToContainer(pageNum, container);
        }

    } catch (error) {
        console.error('[PdfPreview] Error displaying PDF:', error);
    }
}

async function renderPageToContainer(pageNumber, container) {
    try {
        const page = await pdfDocument.getPage(pageNumber);
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        container.appendChild(canvas);

        const context = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 1.5 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

    } catch (error) {
        console.error(`[PdfPreview] Error rendering page ${pageNumber}:`, error);
    }
}

async function createCanvasBasedPreview(htmlElement) {
    const canvas = document.getElementById('pdf-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 794;
    canvas.height = 1123;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';
    ctx.font = '14px Arial';
    
    const text = htmlElement.textContent || "";
    const lines = text.split('\n');
    let y = 50;
    lines.forEach(line => {
        ctx.fillText(line.substring(0, 100), 50, y);
        y += 20;
    });
}

module.exports = {
    loadPdfJs,
    togglePdfPreview,
    generatePdfPreview
};