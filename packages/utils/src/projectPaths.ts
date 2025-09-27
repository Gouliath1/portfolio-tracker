import path from 'path';

let cachedRoot: string | null = null;

type FsModule = typeof import('fs');

let cachedFs: FsModule | null | undefined;

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
  } catch {
    return false;
  }
};

export const getRepoRoot = (): string => {
  if (cachedRoot) {
    return cachedRoot;
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
      cachedRoot = path.resolve(__dirname, '../../../');
      return cachedRoot;
    }

    currentDir = parentDir;
  }
};

export const getDataPath = (...segments: string[]): string => {
  return path.join(getRepoRoot(), 'data', ...segments);
};
