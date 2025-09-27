module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        extensions: ['.tsx', '.ts', '.js', '.json'],
        alias: {
          '@': './src',
          '@portfolio/core': '../../packages/core/src',
          '@portfolio/server': '../../packages/server/src',
          '@portfolio/types': '../../packages/types/src'
        }
      }]
    ]
  };
};
