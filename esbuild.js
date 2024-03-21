const esbuild = require('esbuild');
const { NodeModulesPolyfillPlugin } = require('@esbuild-plugins/node-modules-polyfill')


esbuild
    .build({
        entryPoints: ['src/index.js'],
        outdir: 'dist',
        bundle: true,
        sourcemap: true,
        plugins: [NodeModulesPolyfillPlugin()],
        minify: false,
        format: 'cjs',
        target: ['es2020'],
        define: { 'process.env.NODE_ENV': '"production"' }
    })