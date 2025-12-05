/**
 * features/pdf-preview.js
 * MarkdownをHTML/PDFに変換してプレビュー表示する機能を提供します。
 * PDF.jsの動的ロードや、特殊なMarkdown記法の変換処理を含みます。
 */

import path from 'path';

// PDFの状態管理（ローカル）
let isPdfPreviewVisible = false;
let pdfDocument = null;
let pdfjsLib = null;

// DOM要素の参照（呼び出し元から設定するか、ここで取得するか）
const getPreviewContainer = () => document.getElementById('pdf-preview-container');
const getPdfCanvas = () => document.getElementById('pdf-canvas');

// ========== PDF.js ローディング ==========

async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;
    console.log('[PdfPreview] Loading PDF.js library...');

    try {
        // Electron環境を想定したパス解決
        // 注意: __dirname は ES Modules では使用できないため、必要なら呼び出し元からパスを受け取るか
        // バンドラーの設定に合わせる必要があります。ここではNode.js/Electronのrequireが使える前提のパス解決を模しています。
        // もし純粋なブラウザ環境なら CDN URL等に変更してください。
        
        // 簡易的なパス構築 (実際の環境に合わせて調整してください)
        const pdfjsPath = './node_modules/pdfjs-dist/build/pdf.min.mjs'; 
        const workerPath = './node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
        
        // 実際のアプリ構造に依存するため、エラー時はコンソールに出力
        const loadedLib = await import(pdfjsPath).catch(e => {
             console.warn('[PdfPreview] Failed to import local PDF.js, trying absolute path logic or skipping.');
             throw e;
        });

        if (loadedLib) {
            loadedLib.GlobalWorkerOptions.workerSrc = workerPath;
            pdfjsLib = loadedLib;
            console.log('[PdfPreview] PDF.js loaded successfully');
            return pdfjsLib;
        }
    } catch (e) {
        console.error("[PdfPreview] Failed to load PDF.js:", e);
        return null;
    }
}

// ========== メイン機能 ==========

export function togglePdfPreview(layoutManager) {
    isPdfPreviewVisible = !isPdfPreviewVisible;
    console.log(`[PdfPreview] Toggled visibility: ${isPdfPreviewVisible}`);
    
    // UIの切り替え処理（renderer.js側で実装されている updateTerminalVisibility 等と連携が必要）
    // ここではプレビュー生成のみ呼び出します
    if (isPdfPreviewVisible) {
        generatePdfPreview(layoutManager);
    }
    
    return isPdfPreviewVisible;
}

export async function generatePdfPreview(layoutManager) {
    if (!isPdfPreviewVisible) return;
    
    const view = layoutManager.activePane ? layoutManager.activePane.editorView : null;
    if (!view) {
        console.warn('[PdfPreview] No active editor view found.');
        return;
    }

    try {
        const markdownContent = view.state.doc.toString();
        if (!markdownContent.trim()) {
            clearPreview();
            return;
        }

        console.log('[PdfPreview] Generating preview...');
        
        // Markdown前処理
        const processedMarkdown = await processMarkdownForExport(markdownContent);
        
        // HTML変換 (markedライブラリがグローバルにある前提)
        if (typeof marked === 'undefined') {
            console.error('[PdfPreview] "marked" library is not loaded.');
            return;
        }
        
        const htmlContent = marked.parse(processedMarkdown, { breaks: true, gfm: true });

        // PDF生成プロセス
        if (typeof window.electronAPI?.generatePdf === 'function') {
            await renderHtmlToPdf(htmlContent);
        } else {
            console.warn('[PdfPreview] PDF generation API not available, using simple canvas fallback');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            await createCanvasBasedPreview(tempDiv);
        }
    } catch (error) {
        console.error('[PdfPreview] Failed to generate preview:', error);
    }
}

function clearPreview() {
    const canvas = getPdfCanvas();
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// ========== Markdown処理ロジック ==========

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

    if (matches.length > 0) {
        console.log(`[PdfPreview] Found ${matches.length} bookmark tags to process`);
        
        const replacements = await Promise.all(matches.map(async (match) => {
            const url = match[1];
            
            // メタデータ取得処理 (キャッシュ対応)
            let data = null;
            if (!window.pdfMetadataCache) window.pdfMetadataCache = new Map();

            if (window.pdfMetadataCache.has(url)) {
                data = window.pdfMetadataCache.get(url);
            } else {
                try {
                    if (window.electronAPI?.fetchUrlMetadata) {
                        const result = await window.electronAPI.fetchUrlMetadata(url);
                        if (result.success) {
                            data = result.data;
                            window.pdfMetadataCache.set(url, data);
                        }
                    }
                } catch (e) {
                    console.error(`[PdfPreview] Failed to fetch metadata for ${url}:`, e);
                }
            }

            // HTML生成
            if (!data) {
                // フォールバック表示
                return {
                    original: match[0],
                    replacement: `<div class="cm-bookmark-widget"><a href="${url}">${url}</a></div>`
                };
            }

            const faviconUrl = `https://www.google.com/s2/favicons?domain=${data.domain}&sz=32`;
            const html = `
                <a href="${data.url}" class="cm-bookmark-widget" target="_blank">
                    <div class="cm-bookmark-content">
                        <div class="cm-bookmark-title">${data.title}</div>
                        <div class="cm-bookmark-desc">${data.description}</div>
                        <div class="cm-bookmark-meta">
                            <img src="${faviconUrl}" class="cm-bookmark-favicon">
                            <span>${data.domain}</span>
                        </div>
                    </div>
                    ${data.image ? `<div class="cm-bookmark-cover"><img src="${data.image}"></div>` : ''}
                </a>`;

            return { original: match[0], replacement: html };
        }));

        // 置換実行
        for (const item of replacements) {
            processed = processed.replaceAll(item.original, item.replacement);
        }
    }

    return processed;
}

// ========== レンダリングロジック ==========

async function renderHtmlToPdf(htmlContent) {
    try {
        const pdfData = await window.electronAPI.generatePdf(htmlContent);
        if (pdfData) {
            await displayPdfFromData(pdfData);
        }
    } catch (error) {
        console.error('[PdfPreview] Error rendering HTML to PDF:', error);
        // エラー時は簡易表示へフォールバック
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        await createCanvasBasedPreview(tempDiv);
    }
}

async function displayPdfFromData(pdfData) {
    try {
        await loadPdfJs();
        if (!pdfjsLib) {
            throw new Error('PDF.js lib not available');
        }

        const pdfDataArray = Uint8Array.from(atob(pdfData), c => c.charCodeAt(0));
        const loadingTask = pdfjsLib.getDocument({ data: pdfDataArray });
        pdfDocument = await loadingTask.promise;

        console.log(`[PdfPreview] PDF loaded. Pages: ${pdfDocument.numPages}`);

        const pageInfo = document.getElementById('pdf-page-info');
        if (pageInfo) pageInfo.textContent = `全 ${pdfDocument.numPages} ページ`;

        const container = getPreviewContainer();
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
    // 簡易的なテキスト描画のみの実装（Canvas）
    console.log('[PdfPreview] Using canvas fallback renderer');
    const canvas = getPdfCanvas();
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = 794; // A4 width px approx
    canvas.height = 1123; // A4 height px approx

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'black';
    ctx.font = '14px Arial';

    const text = htmlElement.textContent || "";
    const lines = text.split('\n');
    const lineHeight = 20;
    
    let y = 50;
    lines.forEach(line => {
        if (y > canvas.height - 50) return; // ページあふれ防止（簡易）
        ctx.fillText(line.substring(0, 80), 50, y); // 簡易的な文字数制限
        y += lineHeight;
    });
}