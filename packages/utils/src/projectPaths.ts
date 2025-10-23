// Avoid static imports of Node.js modules to keep React Native compatible
// Use dynamic require pattern instead

let cachedRoot: string | null = null;

// Avoid TypeScript type imports that reference Node.js modules
// This keeps the compiled output React Native compatible
type FsModule = any;
type PathModule = any;

let cachedFs: FsModule | null | undefined;
let cachedPath: PathModule | null | undefined;

const loadPath = (): PathModule | null => {
  if (cachedPath !== undefined) {
    return cachedPath;
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    cachedPath = null;
    return cachedPath;
  }

  try {
    const req = Function('return require')() as NodeJS.Require;
    cachedPath = req('path') as PathModule;
    return cachedPath;
  } catch {
    cachedPath = null;
    return cachedPath;
  }
};

const loadFs = (): FsModule | null => {
  if (cachedFs !== undefined) {
    return cachedFs;
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    cachedFs = null;
    return cachedFs;
  }

  try {
    const req = Function('return require')() as NodeJS.Require;
    cachedFs = req('fs') as FsModule;
    return cachedFs;
  } catch {
    cachedFs = null;
    return cachedFs;
  }
};

const isWorkspaceRoot = (directory: string): boolean => {
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
  } catch {
    return false;
  }
};

export const getRepoRoot = (): string => {
  if (cachedRoot) {
    return cachedRoot;
  }

  const path = loadPath();
  if (!path) {
    throw new Error('getRepoRoot requires Node.js environment');
  }

  let currentDir = process.cwd();
  const visited = new Set<string>();

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

export const getDataPath = (...segments: string[]): string => {
  const path = loadPath();
  if (!path) {
    throw new Error('getDataPath requires Node.js environment');
  }
  return path.join(getRepoRoot(), 'data', ...segments);
};
