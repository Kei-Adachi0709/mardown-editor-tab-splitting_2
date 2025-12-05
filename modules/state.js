const state = {
    appSettings: {
        fontSize: '16px',
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
        theme: 'light',
        autoSave: true
    },
    currentDirectoryPath: null,
    openedFiles: new Map(),
    fileModificationState: new Map(),
    currentSortOrder: 'asc',
    isPositionRight: true,
    isTerminalVisible: false,
    isRightActivityBarVisible: true,
    isPdfPreviewVisible: false,
    pdfDocument: null,
    pdfjsLib: null,
    pdfMetadataCache: new Map(),
    timeouts: {
        pdfUpdate: null
    }
};
module.exports = state;