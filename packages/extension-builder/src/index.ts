
import {
  JupyterLab
} from '@jupyterlab/application';

import * as fs
  from 'fs-extra';

import * as glob
  from 'glob';

import * as path
  from 'path';


/**
 * Build a JupyterLab extension.
 *
 * @param options - The options used to build the extension asset tree.
 */
export
function build(options: build.IOptions): void {
  new Private.Builder(options);
}


/**
 * The namespace for `build` function statics.
 */
export
namespace build {
  /**
   * The options used to build the extension.
   */
  export interface IOptions {
    /**
     * The root path of the build, defaults to the cwd.
     */
    rootPath?: string;

    /**
     * The output path of the build, defaults to `'./build'`.
     */
    outPath?: string;
  }
}


/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * The builder implementation.
   */
  export
  class Builder {
    /**
     * Create a builder.
     */
    constructor(options: build.IOptions) {
      this._rootPath = path.resolve(options.rootPath || '.');
      this._outPath = path.resolve(options.outPath || './build');
      this._validateEntry();

      fs.removeSync(this._outPath);
      fs.ensureDirSync(this._outPath);

      // Handle the packages starting at the root.
      this._handlePackage(this._rootPath);
    }

    /**
     * Validate the entry point of the extension.
     */
    private _validateEntry(): void {
      let packagePath = path.join(this._rootPath, 'package.json');
      if (!fs.existsSync(packagePath)) {
        throw Error('Requires a package.json file in the root path');
      }
      let data = require(packagePath);
      if (!data.main) {
        throw Error('Must specify a "main" entry point in package.json');
      }
      let mainPath = path.join(this._rootPath, data.main);
      if (!fs.existsSync(mainPath)) {
        throw Error('Main entry point not found, perhaps unbuilt?');
      }
      let main = require(mainPath) as JupyterLab.PluginModule;
      let app = new JupyterLab();
      app.registerPluginModule(main);
    }

    /**
     * Handle the package and its dependencies, recursively.
     */
    private _handlePackage(basePath: string): void {
      let data = require(path.join(basePath, 'package.json'));
      let name = data.name + '@' + data.version;
      if (this._packages.has(name)) {
        return;
      }
      this._packages.set(name, data);
      for (let name in data.dependencies) {
        this._handlePackage(this._findPackage(basePath, name));
      }
      // Handle paths that are not in a node_modules directory.
      let parts = basePath.split(path.sep);
      if (parts.length > 2 && parts[parts.length - 2] !== 'node_modules') {
        return this._moveLocal(basePath, data, name);
      }
      // Handle others.
      this._movePackage(basePath, data, name);
    }

    /**
     * Move local packages using the package.json config.
     */
    private _moveLocal(basePath: string, data: any, name: string): void {
      let destDir = path.join(this._outPath, 'node_modules', data.name);
      if (basePath === this._rootPath) {
        destDir = this._outPath;
      }
      fs.ensureDirSync(destDir);
      let seen = new Set();
      let seenDir = new Set();
      data.files = data.files || [];
      data.files.forEach((pattern: string) => {
        let files = glob.sync(pattern, { cwd: basePath });
        // Move these files.
        files.forEach((fname: string) => {
          let source = path.join(basePath, fname);
          if (seen.has(source)) {
            return;
          }
          seen.add(source);
          let target = path.join(destDir, fname);
          let targetDir = path.dirname(target);
          if (!seenDir.has(targetDir)) {
              fs.ensureDirSync(targetDir);
          }
          seenDir.add(targetDir);
          fs.copySync(source, path.join(destDir, fname));
        });
      });
      // Make sure we have the main entry point.
      if (data.main) {
        let source = path.join(basePath, data.main);
        if (!seen.has(source)) {
          let target = path.join(destDir, data.main);
          fs.ensureDirSync(path.dirname(target));
          fs.copySync(source, path.join(destDir, data.main));
        }
      }
      let packagePath = path.join(destDir, 'package.json');
      fs.writeFileSync(packagePath, JSON.stringify(data, null, 2) + '\n');
    }


    /**
     * Move packages from npm.
     */
    private _movePackage(basePath: string, data: any, name: string): void {
      // Pull in the whole package except its node modules.
      function fileFilter(source: string): boolean {
        let localRel = path.relative(basePath, source);
        return localRel.split(path.sep)[0] !== 'node_modules';
      }

      let parts = basePath.split(path.sep);
      let index = parts.indexOf('node_modules');
      let relPath = parts.slice(index).join(path.sep);
      let dirDest = path.join(this._outPath, relPath);
      fs.ensureDirSync(dirDest);
      fs.copySync(basePath, dirDest, { filter: fileFilter });
    }

    /**
     * Walk up the tree to the root path looking for the package.
     */
    private _findPackage(basePath: string, name: string): string {
      while (true) {
        let packagePath = path.join(basePath, 'node_modules', name);
        if (fs.existsSync(packagePath)) {
          return fs.realpathSync(packagePath);
        }
        let prev = basePath;
        basePath = path.resolve(basePath, '..');
        if (prev === basePath) {
          throw new Error(`Could not find module '${name}'`);
        }
      }
    }

    private _packages = new Map();
    private _rootPath: string;
    private _outPath: string;
  }
}
