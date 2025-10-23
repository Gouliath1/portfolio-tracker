import path from 'path';
let cachedRoot = null;
let cachedFs;
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
    if (!fs) {
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
            cachedRoot = path.resolve(__dirname, '../../../');
            return cachedRoot;
        }
        currentDir = parentDir;
    }
};
export const getDataPath = (...segments) => {
    return path.join(getRepoRoot(), 'data', ...segments);
};
