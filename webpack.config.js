const path = require('path');

const config = {
    target: 'node',
    mode: 'production',
    entry: ['PATH-TO-ENTRY-FILE'],
    output: {
      filename: '[name].bundle.js',
      path: path.resolve(__dirname, 'dist'),
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'node-loader'
          }
        },
        {
          test: /\.ts$/,
          use: [
            'ts-loader',
          ]
        }
      ]
    }
  };

module.exports = config;
