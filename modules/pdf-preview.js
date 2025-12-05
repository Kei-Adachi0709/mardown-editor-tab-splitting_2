const path = require('path');
const state = require('./state');
const { marked } = require('marked');

async function loadPdfJs() {
    if (state.pdfjsLib) return state.pdfjsLib;
    try {
        const projectRoot = path.join(__dirname, '..');
        const pdfjsPath = path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.mjs');
        const workerPath = path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
        const loadedLib = await import('file:///' + pdfjsPath.replace(/\\/g, '/'));
        loadedLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.replace(/\\/g, '/');
        state.pdfjsLib = loadedLib;
        return state.pdfjsLib;
    } catch (e) { console.error(e); }
}

async function generatePdfPreview(md) {
    if (!md) return;
    const html = marked.parse(md);
    const pdfData = await window.electronAPI.generatePdf(html);
    if(pdfData) displayPdf(pdfData);
}

async function displayPdf(data) {
    await loadPdfJs();
    if(!state.pdfjsLib) return;
    
    const loadingTask = state.pdfjsLib.getDocument({ data: Uint8Array.from(atob(data), c => c.charCodeAt(0)) });
    const doc = await loadingTask.promise;
    
    const container = document.getElementById('pdf-preview-container');
    container.innerHTML = '';
    
    for(let i=1; i<=doc.numPages; i++) {
        const page = await doc.getPage(i);
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        container.appendChild(canvas);
        
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
    document.getElementById('pdf-page-info').textContent = `全 ${doc.numPages} ページ`;
}

module.exports = { loadPdfJs, generatePdfPreview };