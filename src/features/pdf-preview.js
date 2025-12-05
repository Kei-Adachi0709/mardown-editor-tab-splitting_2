/**
 * features/pdf-preview.js (ES Module 完全版)
 */
import path from 'path';

let isPdfPreviewVisible = false;
let pdfDocument = null;
let pdfjsLib = null;

// PDF.jsの動的ロード
export async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;

    try {
        // ブラウザ環境とElectron環境の両方を考慮
        if (typeof window.pdfjsLib !== 'undefined') {
             pdfjsLib = window.pdfjsLib;
             return pdfjsLib;
        }

        // Electron環境でのパス解決（ESMでは__dirnameが使えないため工夫が必要だが、ここでは簡易実装）
        // 実際にはHTML側で読み込むか、バンドラーを使うのが確実
        console.log('[PdfPreview] Loading PDF.js...');
        // ここではエラーにならないようnullを返して、HTML側でのscriptタグ読み込みに期待するフォールバック
        return null; 
    } catch (e) {
        console.error("[PdfPreview] Failed to load PDF.js:", e);
        return null;
    }
}

export function togglePdfPreview(isVisible) {
    isPdfPreviewVisible = isVisible;
    if (isPdfPreviewVisible) {
        generatePdfPreview();
    }
}

export async function generatePdfPreview() {
    if (!isPdfPreviewVisible) return;
    
    // renderer.jsのグローバル layoutManager を参照
    const view = window.layoutManager?.activePane?.editorView;
    if (!view) {
        clearCanvas();
        return;
    }

    try {
        const markdownContent = view.state.doc.toString();
        if (!markdownContent.trim()) {
            clearCanvas();
            return;
        }

        // Markdownの前処理（ハイライトやブックマーク）を実行
        const processedMarkdown = await processMarkdownForExport(markdownContent);
        
        // markedライブラリでHTML変換
        const htmlContent = marked.parse(processedMarkdown, { breaks: true, gfm: true });

        // ElectronのPDF生成APIが使える場合
        if (window.electronAPI && typeof window.electronAPI.generatePdf === 'function') {
            await renderHtmlToPdf(htmlContent);
        } else {
            // ブラウザプレビュー用フォールバック
            console.warn('[PdfPreview] PDF generation API not available, using fallback');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            await createCanvasBasedPreview(tempDiv);
        }
    } catch (error) {
        console.error('[PdfPreview] Failed to generate PDF preview:', error);
    }
}

function clearCanvas() {
    const canvas = document.getElementById('pdf-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// ========== Markdown処理ロジック (省略されていた部分) ==========

async function processMarkdownForExport(markdown) {
    // ハイライト記法 (==text==) -> <mark>
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

// ========== PDFレンダリング (省略されていた部分) ==========

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
        // window.pdfjsLibが読み込まれているかチェック
        if (!pdfjsLib && window.pdfjsLib) pdfjsLib = window.pdfjsLib;
        if (!pdfjsLib) {
             console.error("PDF.js not loaded");
             return;
        }

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
    
    // A4サイズ相当 (72dpi換算)
    canvas.width = 794;
    canvas.height = 1123;
    
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';
    ctx.font = '14px Arial';
    
    // 簡易的なテキスト描画
    const text = htmlElement.textContent || "";
    const lines = text.split('\n');
    let y = 50;
    lines.forEach(line => {
        // 簡易的な行送り
        ctx.fillText(line.substring(0, 100), 50, y);
        y += 20;
    });
}