const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
];
config.resolver.assetExts.push('cjs');

// Force @libsql/client to use web build and resolve @libsql/core subpath imports
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Map @libsql/client to web build
  if (moduleName === '@libsql/client') {
    return {
      filePath: path.join(
        workspaceRoot,
        'node_modules/.pnpm/@libsql+client@0.15.15/node_modules/@libsql/client/lib-esm/web.js'
      ),
      type: 'sourceFile',
    };
  }

  // Map @libsql/core subpath imports
  if (moduleName.startsWith('@libsql/core/')) {
    const subpath = moduleName.replace('@libsql/core/', '');
    return {
      filePath: path.join(
        workspaceRoot,
        `node_modules/.pnpm/@libsql+core@0.15.15/node_modules/@libsql/core/lib-esm/${subpath}.js`
      ),
      type: 'sourceFile',
    };
  }

  // Default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
