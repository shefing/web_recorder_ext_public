/*eslint-env node */

const path = require("path");
const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const GenerateJsonPlugin = require("generate-json-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

const APP_FILE_SERVE_PREFIX = "http://files.archiveweb.page/";

const AWP_PACKAGE = require("./package.json");
const WARCIO_PACKAGE = require("./node_modules/warcio/package.json");

const BANNER =
  "[name].js is part of the Webrecorder Extension (https://replayweb.page) Copyright (C) 2020-2021, Webrecorder Software. Licensed under the Affero General Public License v3.";

const manifest = require("./src/ext/manifest.json");
const Dotenv = require('dotenv-webpack');


const defaultDefines = {
  __AWP_VERSION__: JSON.stringify(AWP_PACKAGE.version),
  __WARCIO_VERSION__: JSON.stringify(WARCIO_PACKAGE.version),
  __SW_NAME__: JSON.stringify("sw.js"),
  __APP_FILE_SERVE_PREFIX__: JSON.stringify(APP_FILE_SERVE_PREFIX),
  __WEB3_STORAGE_TOKEN__: JSON.stringify(""),
};

const DIST_EXT = path.join(__dirname, "dist", "ext");

const moduleSettings = {
  rules: [
    {
      test: /\.svg$/,
      use: "svg-inline-loader",
    },
    {
      test: /\.s(a|c)ss$/,
      use: ["css-loader", "sass-loader"],
    },
    {
      test: /(dist\/wombat.js|src\/wombatWorkers.js|behaviors.js|extractPDF.js|ruffle.js|index.html)$/i,
      use: ["thread-loader", "raw-loader"],
    },
  ],
};

const optimization = {
  minimize: true,
  minimizer: [
    new TerserPlugin({
      extractComments: false,
    }),
  ],
};

// ===========================================================================
function sharedBuild(outputPath, { plugins = [], copy = [], entry = {}, extra = {}, flat = false } = {}, env, argv) {
  if (copy.length) {
    plugins.push(new CopyPlugin({ patterns: copy }));
  }
  return {
    mode: "production",
    target: "web",
    entry: {
      ...entry,
    },
    optimization,
    //resolve: { fallback },
    devtool: "inline-source-map",
    output: {
      path: outputPath,
      filename: (chunkData) => {
        const name = "[name].js";
        const replayName = "./replay/" + name;

        switch (chunkData.chunk.name) {
          case "ui":
            return flat ? name : replayName;

          case "sw":
            return replayName;

          default:
            return name;
        }
      },
      libraryTarget: "global",
      globalObject: "self",
    },
    plugins: [
      new Dotenv({
        allowEmptyValues: true, // allow empty variables (e.g. `FOO=`) (treat it as empty string, rather than missing)
        systemvars: true, // load all the predefined 'process.env' variables which will trump anything local per dotenv specs.
        silent: false, // hide any errors
        defaults: false, // load '.env.defaults' as the default values if empty.
        prefix: 'process.env.' // reference your env variables as 'import.meta.env.ENV_VAR'.
      }),        
      new webpack.NormalModuleReplacementPlugin(/^node:*/, (resource) => {
        switch (resource.request) {
          case "node:stream":
            resource.request = "stream-browserify";
            break;
        }
      }),
      new webpack.ProvidePlugin({
        process: "process/browser.js",
        Buffer: ["buffer", "Buffer"],
      }),
      new MiniCssExtractPlugin(),
      new webpack.BannerPlugin(BANNER),
      new webpack.DefinePlugin({
        ...defaultDefines,
      }),
      ...plugins,
    ],

    module: moduleSettings,
    ...extra,
  };
}

// ===========================================================================
const extensionWebConfig = (env, argv) => {
  const icon = argv.mode === "production" ? "logo.png" : "logo-dev.png";

  const generateManifest = (name, value) => {
    switch (value) {
      case "$VERSION":
        return AWP_PACKAGE.version + (process.env.EXTENSION_VERSION || "111");

      case "$ICON":
        return icon;

      case "$ADMIN_URL":
        return  argv.mode === "production" ? (process.env.ADMIN_URL)+"/" : '*://*/*' ;

    }

    return value;
  };

  const plugins = [new GenerateJsonPlugin("manifest.json", manifest, generateManifest, 2)];

  const copy = [{ from: "src/static/", to: "./" }];

  const entry = {
    bg: "./src/ext/bg.js",
    popup: "./src/popup.js",
    content: "./src/ext/content.js"
  };

  return sharedBuild(DIST_EXT, { plugins, copy, entry }, env, argv);
};

// ===========================================================================
module.exports = [extensionWebConfig];
