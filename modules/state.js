console.log('[Module] State loading...');
window.App = window.App || {};

window.App.State = {
    appSettings: {
        fontSize: '16px',
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
        theme: 'light',
        autoSave: true
    },
    currentDirectoryPath: null,
    openedFiles: new Map(), // filePath -> { content, fileName }
    fileModificationState: new Map(),
    currentSortOrder: 'asc',
    
    // UI State
    isPositionRight: true,
    isTerminalVisible: false,
    isRightActivityBarVisible: true,
    isPdfPreviewVisible: false,
    
    // Cache & References
    pdfDocument: null,
    pdfjsLib: null,
    pdfMetadataCache: new Map(),
    
    timeouts: {
        pdfUpdate: null,
        outlineUpdate: null
    }
};
console.log('[Module] State loaded');