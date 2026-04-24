module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      function replaceImportMeta() {
        return {
          name: 'replace-import-meta',
          visitor: {
            MetaProperty(path) {
              const { meta, property } = path.node;
              if (meta && meta.name === 'import' && property && property.name === 'meta') {
                path.replaceWithSourceString('({env:{MODE:"production"}})');
              }
            },
          },
        };
      },
    ],
  };
};
