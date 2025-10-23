// Avoid static imports of Node.js modules to keep React Native compatible
// Use dynamic require pattern instead
let cachedRoot = null;
let cachedFs;
let cachedPath;
const loadPath = () => {
    var _a;
    if (cachedPath !== undefined) {
        return cachedPath;
    }
    if (typeof process === 'undefined' || !((_a = process.versions) === null || _a === void 0 ? void 0 : _a.node)) {
        cachedPath = null;
        return cachedPath;
    }
    try {
        const req = Function('return require')();
        cachedPath = req('path');
        return cachedPath;
    }
    catch (_b) {
        cachedPath = null;
        return cachedPath;
    }
};
const loadFs = () => {
    var _a;
    if (cachedFs !== undefined) {
        return cachedFs;
    }
    if (typeof process === 'undefined' || !((_a = process.versions) === null || _a === void 0 ? void 0 : _a.node)) {
        cachedFs = null;
        return cachedFs;
    }
    try {
        const req = Function('return require')();
        cachedFs = req('fs');
        return cachedFs;
    }
    catch (_b) {
        cachedFs = null;
        return cachedFs;
    }
};
const isWorkspaceRoot = (directory) => {
    const fs = loadFs();
    const path = loadPath();
    if (!fs || !path) {
        return false;
    }
    try {
        const pkgPath = path.join(directory, 'package.json');
        if (!fs.existsSync(pkgPath)) {
            return false;
        }
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return Array.isArray(pkg.workspaces);
    }
    catch (_a) {
        return false;
    }
};
export const getRepoRoot = () => {
    if (cachedRoot) {
        return cachedRoot;
    }
    const path = loadPath();
    if (!path) {
        throw new Error('getRepoRoot requires Node.js environment');
    }
    let currentDir = process.cwd();
    const visited = new Set();
    while (true) {
        if (isWorkspaceRoot(currentDir)) {
            cachedRoot = currentDir;
            return currentDir;
        }
        visited.add(currentDir);
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir || visited.has(parentDir)) {
            // Fallback to directory of this file when no workspace root found
            const fallback = path.resolve(__dirname, '../../../');
            cachedRoot = fallback;
            return fallback;
        }
        currentDir = parentDir;
    }
};
export const getDataPath = (...segments) => {
    const path = loadPath();
    if (!path) {
        throw new Error('getDataPath requires Node.js environment');
    }
    return path.join(getRepoRoot(), 'data', ...segments);
};
