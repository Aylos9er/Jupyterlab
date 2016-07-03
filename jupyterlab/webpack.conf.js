// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

var webpack = require('webpack');
var glob = require('glob');
var findImports = require('find-imports');

// Support for Node 0.10
// See https://github.com/webpack/css-loader/issues/144
require('es6-promise').polyfill();

// Get the list of vendor files.
console.log('Finding vendored files...')
var vendorFiles = findImports('../lib/**/*.js', { flatten: true });
vendorFiles.push('xterm/src/xterm.css');
console.log('Vendored files:\n', vendorFiles)

// Build the bundles.
console.log('\nBuilding webpack bundles...')

module.exports = [{
  entry: {
    main: './index.js',
    vendor: vendorFiles
  },
  output: {
    path: __dirname + "/build",
    library: '[name]',
    libraryTarget: 'umd',
    filename: "[name].bundle.js",
    publicPath: "lab/"
  },
  node: {
    fs: "empty"
  },
  debug: true,
  bail: true,
  devtool: 'inline-source-map',
  module: {
    loaders: [
      { test: /\.css$/, loader: 'style-loader!css-loader' },
      { test: /\.json$/, loader: 'json-loader' },
      { test: /\.html$/, loader: 'file'},
      // jquery-ui loads some images
      { test: /\.(jpg|png|gif)$/, loader: "file" },
      // required to load font-awesome
      { test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/, loader: "url?limit=10000&mimetype=application/font-woff" },
      { test: /\.woff(\?v=\d+\.\d+\.\d+)?$/, loader: "url?limit=10000&mimetype=application/font-woff" },
      { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/, loader: "url?limit=10000&mimetype=application/octet-stream" },
      { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, loader: "file" },
      { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/, loader: "url?limit=10000&mimetype=image/svg+xml" }
    ]
  },
  externals: {
    jquery: '$',
    'jquery-ui': '$',
    'jupyter-js-services': 'umd jupyter-js-services'
  },
  plugins: [
    new webpack.optimize.CommonsChunkPlugin('vendor', 'vendor.bundle.js')
  ]
},
{
    entry: 'jupyter-js-services',
    output: {
        filename: 'jupyter-js-services.bundle.js',
        path: './build',
        library: 'jupyter-js-services',
        libraryTarget: 'umd',
    }
}]
