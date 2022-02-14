/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import * as fs from 'fs-extra';
import * as glob from 'glob';
import * as minimatch from 'minimatch';
import * as path from 'path';
import * as prettier from 'prettier';
import * as ts from 'typescript';
import { getDependency } from './get-dependency';
import * as utils from './utils';

const HEADER_TEMPLATE = `
/*-----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

/* This file was auto-generated by {{funcName}}() in @jupyterlab/buildutils */
`;

const ICON_IMPORTS_TEMPLATE = `
import { LabIcon } from './labicon';

// icon svg import statements
{{svgImportStatements}}

// LabIcon instance construction
{{labiconConstructions}}
`;

const ICON_CSS_CLASSES_TEMPLATE = `
/**
 * (DEPRECATED) Support for consuming icons as CSS background images
 */

/* Icons urls */

:root {
  {{iconCSSUrls}}
}

/* Icon CSS class declarations */

{{iconCSSDeclarations}}
`;

/**
 * Ensure the integrity of a package.
 *
 * @param options - The options used to ensure the package.
 *
 * @returns A list of changes that were made to ensure the package.
 */
export async function ensurePackage(
  options: IEnsurePackageOptions
): Promise<string[]> {
  const { data, pkgPath } = options;
  const deps: { [key: string]: string } = data.dependencies || {};
  const devDeps: { [key: string]: string } = data.devDependencies || {};
  const seenDeps = options.depCache || {};
  const missing = options.missing || [];
  const unused = options.unused || [];
  const messages: string[] = [];
  const locals = options.locals || {};
  const cssImports = options.cssImports || [];
  const cssModuleImports = options.cssModuleImports || [];
  const differentVersions = options.differentVersions || [];
  const isPrivate = data.private == true;

  // Verify dependencies are consistent.
  let promises = Object.keys(deps).map(async name => {
    if (differentVersions.indexOf(name) !== -1) {
      // Skip processing packages that can have different versions
      return;
    }
    if (!(name in seenDeps)) {
      seenDeps[name] = await getDependency(name);
    }
    if (deps[name] !== seenDeps[name]) {
      messages.push(`Updated dependency: ${name}@${seenDeps[name]}`);
    }
    deps[name] = seenDeps[name];
  });

  await Promise.all(promises);

  // Verify devDependencies are consistent.
  promises = Object.keys(devDeps).map(async name => {
    if (differentVersions.indexOf(name) !== -1) {
      // Skip processing packages that can have different versions
      return;
    }
    if (!(name in seenDeps)) {
      seenDeps[name] = await getDependency(name);
    }
    if (devDeps[name] !== seenDeps[name]) {
      messages.push(`Updated devDependency: ${name}@${seenDeps[name]}`);
    }
    devDeps[name] = seenDeps[name];
  });

  await Promise.all(promises);

  // For TypeScript files, verify imports match dependencies.
  let filenames: string[] = [];
  filenames = glob.sync(path.join(pkgPath, 'src/*.ts*'));
  filenames = filenames.concat(glob.sync(path.join(pkgPath, 'src/**/*.ts*')));

  const tsConfigPath = path.join(pkgPath, 'tsconfig.json');
  const usesTS = fs.existsSync(tsConfigPath);

  // Make sure typedoc config files are consistent
  if (fs.existsSync(path.join(pkgPath, 'typedoc.json'))) {
    const name = data.name.split('/');
    utils.writeJSONFile(path.join(pkgPath, 'typedoc.json'), {
      out: `../../docs/api/${name[name.length - 1]}`,
      theme: '../../typedoc-theme'
    });
  }

  let imports: string[] = [];

  // Extract all of the imports from the TypeScript files.
  filenames.forEach(fileName => {
    const sourceFile = ts.createSourceFile(
      fileName,
      fs.readFileSync(fileName).toString(),
      (ts.ScriptTarget as any).ES6,
      /* setParentNodes */ true
    );
    imports = imports.concat(getImports(sourceFile));
  });

  // Make sure we are not importing CSS in a core package.
  if (
    data.name.indexOf('example') === -1 &&
    data.name !== '@jupyterlab/codemirror'
  ) {
    imports.forEach(importStr => {
      if (importStr.indexOf('.css') !== -1) {
        messages.push('CSS imports are not allowed source files');
      }
    });
  }

  let names: string[] = Array.from(new Set(imports)).sort();
  names = names.map(function (name) {
    const parts = name.split('/');
    if (name.indexOf('@') === 0) {
      return parts[0] + '/' + parts[1];
    }
    if (parts[0].indexOf('!') !== -1) {
      parts[0] = parts[0].slice(parts[0].lastIndexOf('!') + 1);
    }
    return parts[0];
  });

  // Look for imports with no dependencies.
  promises = names.map(async name => {
    if (missing.indexOf(name) !== -1) {
      return;
    }
    if (name === '.' || name === '..') {
      return;
    }
    if (!deps[name]) {
      if (!(name in seenDeps)) {
        seenDeps[name] = await getDependency(name);
      }
      deps[name] = seenDeps[name];
      messages.push(`Added dependency: ${name}@${seenDeps[name]}`);
    }
  });

  await Promise.all(promises);

  // Template the CSS index file.
  if (
    usesTS &&
    (cssImports.length > 0 ||
      fs.existsSync(path.join(pkgPath, 'style/base.css')))
  ) {
    const funcName = 'ensurePackage';
    const cssIndexContents = [
      utils.fromTemplate(HEADER_TEMPLATE, { funcName }, { end: '' }),
      ...cssImports.map(x => `@import url('~${x}');`),
      ''
    ];
    if (fs.existsSync(path.join(pkgPath, 'style/base.css'))) {
      cssIndexContents.push("@import url('./base.css');\n");
    }

    // write out cssIndexContents, if needed
    const cssIndexPath = path.join(pkgPath, 'style/index.css');
    if (!fs.existsSync(cssIndexPath)) {
      fs.ensureFileSync(cssIndexPath);
    }
    messages.push(
      ...ensureFile(cssIndexPath, cssIndexContents.join('\n'), false)
    );
  }

  // Template the style module index file.
  if (
    usesTS &&
    (cssModuleImports.length > 0 ||
      fs.existsSync(path.join(pkgPath, 'style/base.css')))
  ) {
    const funcName = 'ensurePackage';
    const jsIndexContents = [
      utils.fromTemplate(HEADER_TEMPLATE, { funcName }, { end: '' }),
      ...cssModuleImports.map(x => `import '${x}';`),
      ''
    ];
    if (fs.existsSync(path.join(pkgPath, 'style/base.css'))) {
      jsIndexContents.push("import './base.css';\n");
    }

    // write out jsIndexContents, if needed
    const jsIndexPath = path.join(pkgPath, 'style/index.js');
    if (!fs.existsSync(jsIndexPath)) {
      fs.ensureFileSync(jsIndexPath);
    }
    messages.push(
      ...ensureFile(jsIndexPath, jsIndexContents.join('\n'), false)
    );
  }

  // Look for unused packages
  if (usesTS) {
    Object.keys(deps).forEach(name => {
      if (options.noUnused === false) {
        return;
      }
      if (unused.indexOf(name) !== -1) {
        return;
      }
      const isTest = data.name.indexOf('test') !== -1;
      if (isTest) {
        const testLibs = ['jest', 'ts-jest', '@jupyterlab/testutils'];
        if (testLibs.indexOf(name) !== -1) {
          return;
        }
      }
      if (names.indexOf(name) === -1) {
        const version = data.dependencies[name];
        messages.push(
          `Unused dependency: ${name}@${version}: remove or add to list of known unused dependencies for this package`
        );
      }
    });
  }

  // Handle typedoc config output.
  const tdOptionsPath = path.join(pkgPath, 'tdoptions.json');
  if (fs.existsSync(tdOptionsPath)) {
    const tdConfigData = utils.readJSONFile(tdOptionsPath);
    const pkgDirName = pkgPath.split('/').pop();
    tdConfigData['out'] = `../../docs/api/${pkgDirName}`;
    utils.writeJSONFile(tdOptionsPath, tdConfigData);
  }

  // Handle references.
  const references: { [key: string]: string } = Object.create(null);
  Object.keys(deps).forEach(name => {
    if (!(name in locals)) {
      return;
    }
    const target = locals[name];
    if (!fs.existsSync(path.join(target, 'tsconfig.json'))) {
      return;
    }
    const ref = path.relative(pkgPath, locals[name]);
    references[name] = ref.split(path.sep).join('/');
  });

  if (
    usesTS &&
    data.name.indexOf('example-') === -1 &&
    Object.keys(references).length > 0
  ) {
    const tsConfigData = utils.readJSONFile(tsConfigPath);
    tsConfigData.references = [];
    Object.keys(references).forEach(name => {
      tsConfigData.references.push({ path: references[name] });
    });
    utils.writeJSONFile(tsConfigPath, tsConfigData);
  }

  // Inherit from the base tsconfig.
  if (usesTS) {
    const tsConfigData = utils.readJSONFile(tsConfigPath);
    tsConfigData.references = [];
    Object.keys(references).forEach(name => {
      tsConfigData.references.push({ path: references[name] });
    });
    let prefix = '';
    let dirName = pkgPath;
    while (!fs.existsSync(path.join(dirName, 'tsconfigbase.json'))) {
      dirName = path.dirname(dirName);
      prefix += '../';
    }
    tsConfigData.extends = path.posix.join(prefix, 'tsconfigbase');
    utils.writeJSONFile(tsConfigPath, tsConfigData);
  }

  // Handle references in tsconfig.test.json if it exists
  const tsConfigTestPath = path.join(pkgPath, 'tsconfig.test.json');
  if (fs.existsSync(tsConfigTestPath)) {
    const testReferences: { [key: string]: string } = { ...references };

    // Add a reference to self to build the local package as well.
    testReferences['.'] = '.';

    Object.keys(devDeps).forEach(name => {
      if (!(name in locals)) {
        return;
      }
      const target = locals[name];
      if (!fs.existsSync(path.join(target, 'tsconfig.json'))) {
        return;
      }
      const ref = path.relative(pkgPath, locals[name]);
      testReferences[name] = ref.split(path.sep).join('/');
    });

    const tsConfigTestData = utils.readJSONFile(tsConfigTestPath);
    tsConfigTestData.references = [];
    Object.keys(testReferences).forEach(name => {
      tsConfigTestData.references.push({ path: testReferences[name] });
    });
    utils.writeJSONFile(tsConfigTestPath, tsConfigTestData);
  }

  // Get a list of all the published files.
  // This will not catch .js or .d.ts files if they have not been built,
  // but we primarily use this to check for files that are published as-is,
  // like styles, assets, and schemas.
  const published = new Set<string>(
    data.files
      ? data.files.reduce((acc: string[], curr: string) => {
          return acc.concat(glob.sync(path.join(pkgPath, curr)));
        }, [])
      : []
  );

  // Ensure that the `schema` directories match what is in the `package.json`
  const schemaDir = data.jupyterlab && data.jupyterlab.schemaDir;
  const schemas = glob.sync(
    path.join(pkgPath, schemaDir || 'schema', '*.json')
  );
  if (schemaDir && !schemas.length && pkgPath.indexOf('examples') == -1) {
    messages.push(`No schemas found in ${path.join(pkgPath, schemaDir)}.`);
  } else if (!schemaDir && schemas.length) {
    messages.push(`Schemas found, but no schema indicated in ${pkgPath}`);
  }
  for (const schema of schemas) {
    if (!published.has(schema) && !isPrivate) {
      messages.push(`Schema ${schema} not published in ${pkgPath}`);
    }
  }

  // Ensure that the `style` directories match what is in the `package.json`
  const styles = glob.sync(path.join(pkgPath, 'style', '**/*.*'));
  const styleIndex: { [key: string]: string } = {};
  if (styles.length && usesTS) {
    // If there is no theme path, the style/styleModule must be defined
    if (!data.jupyterlab?.themePath) {
      if (data.style === undefined) {
        data.style = 'style/index.css';
      }
      if (data.styleModule === undefined) {
        data.styleModule = 'style/index.js';
      }
    }

    // If the theme path is given, make sure it exists.
    if (data.jupyterlab?.themePath) {
      styleIndex[path.join(pkgPath, data.jupyterlab.themePath)] =
        data.jupyterlab.themePath;
      if (!fs.existsSync(path.join(pkgPath, data.jupyterlab.themePath))) {
        messages.push(
          `Theme file from .jupyterlab.themePath package.json key (${data.jupyterlab.themePath}) does not exist`
        );
      }
    }

    // If the style path is given, make sure it exists.
    if (data.style) {
      styleIndex[path.join(pkgPath, data.style)] = data.style;
      if (!fs.existsSync(path.join(pkgPath, data.style))) {
        messages.push(
          `Style file from .style package.json key (${data.style}) does not exist`
        );
      }
    }

    // If the styleModule path is given, make sure it exists.
    if (data.styleModule) {
      styleIndex[path.join(pkgPath, data.styleModule)] = data.styleModule;
      if (!fs.existsSync(path.join(pkgPath, data.styleModule))) {
        messages.push(
          `Style module file from .styleModule package.json key (${data.styleModule}) does not exist`
        );
      }
    }
  } else {
    // Delete the style field
    delete data.style;
    delete data.styleModule;
    delete data.jupyterlab?.themePath;
  }

  for (const style of styles) {
    if (!published.has(style)) {
      // Automatically add the style index files
      if (data.files !== undefined && styleIndex[style] !== undefined) {
        data.files.push(styleIndex[style]);
      } else if (!isPrivate) {
        messages.push(`Style file ${style} not published in ${pkgPath}`);
      }
    }
  }

  // Ensure that sideEffects are declared, and that any styles are covered
  if (styles.length > 0 && !isPrivate) {
    if (data.sideEffects === undefined) {
      messages.push(
        `Side effects not declared in ${pkgPath}, and styles are present.`
      );
    } else if (data.sideEffects === false) {
      messages.push(`Style files not included in sideEffects in ${pkgPath}`);
    } else if (data.sideEffects !== true) {
      // Check to see if all .js and .css style files are listed in sideEffects
      const sideEffects = new Set<string>(
        data.sideEffects
          ? data.sideEffects.reduce((acc: string[], curr: string) => {
              return acc.concat(glob.sync(path.join(pkgPath, curr)));
            }, [])
          : []
      );
      for (const style of styles) {
        let ext = path.extname(style);
        if (['.js', '.css'].includes(ext) && !sideEffects.has(style)) {
          // If it is the data.style or corresponding js file, just add it to sideEffects
          if (styleIndex[style] !== undefined) {
            data.sideEffects.push(styleIndex[style]);
          } else {
            messages.push(
              `Style file ${style} not covered by sideEffects globs in ${pkgPath}`
            );
          }
        }
      }
    }
  }

  // Ensure style and lib are included in files metadata.
  const filePatterns: string[] = data.files || [];

  // Function to get all of the files in a directory, recursively.
  function recurseDir(dirname: string, files: string[]) {
    if (!fs.existsSync(dirname)) {
      return files;
    }
    fs.readdirSync(dirname).forEach(fpath => {
      const absolute = path.join(dirname, fpath);
      if (fs.statSync(absolute).isDirectory())
        return recurseDir(absolute, files);
      else return files.push(absolute);
    });
    return files;
  }

  // Ensure style files are included by pattern.
  const styleFiles = recurseDir(path.join(pkgPath, 'style'), []);
  styleFiles.forEach(fpath => {
    const basePath = fpath.slice(pkgPath.length + 1);
    let found = false;
    filePatterns.forEach(fpattern => {
      if (minimatch.default(basePath, fpattern)) {
        found = true;
      }
    });
    if (!found && !isPrivate) {
      messages.push(`File ${basePath} not included in files`);
    }
  });

  // Ensure source TS files are included in lib (.js, .js.map, .d.ts)
  const srcFiles = recurseDir(path.join(pkgPath, 'src'), []);
  srcFiles.forEach(fpath => {
    const basePath = fpath.slice(pkgPath.length + 1).replace('src', 'lib');
    ['.js', '.js.map', '.d.ts'].forEach(ending => {
      let found = false;
      const targetPattern = basePath
        .replace('.tsx', ending)
        .replace('.ts', ending);
      filePatterns.forEach(fpattern => {
        if (minimatch.default(targetPattern, fpattern)) {
          found = true;
        }
      });
      if (!found && !isPrivate) {
        messages.push(`File ${targetPattern} not included in files`);
      }
    });
  });

  // Ensure dependencies and dev dependencies.
  data.dependencies = deps;
  data.devDependencies = devDeps;

  if (Object.keys(data.dependencies).length === 0) {
    delete data.dependencies;
  }
  if (Object.keys(data.devDependencies).length === 0) {
    delete data.devDependencies;
  }

  // Make sure there are no gitHead keys, which are only temporary keys used
  // when a package is actually being published.
  delete data.gitHead;

  // Ensure that there is a public access set, if the package is not private.
  if (!isPrivate) {
    data['publishConfig'] = { access: 'public' };
  }

  // Ensure there is not a prepublishOnly script.
  // Since publishing is handled by an automated script and we don't
  // Want to run individual scripts during publish.
  if (data.scripts?.prepublishOnly) {
    delete data.scripts.prepublishOnly;
  }

  // If the package is not in `packages` or does not use `tsc` in its
  // build script, add a `build:all` target
  const buildScript = data.scripts?.build || '';
  if (
    buildScript &&
    (pkgPath.indexOf('packages') == -1 || buildScript.indexOf('tsc') == -1) &&
    !isPrivate
  ) {
    data.scripts['build:all'] = 'npm run build';
  }

  // Ensure the main module has an @packageDocumentation comment
  let mainFile = path.join(pkgPath, 'src', 'index.ts');
  if (!fs.existsSync(mainFile)) {
    mainFile = path.join(pkgPath, 'src', 'index.tsx');
  }
  if (pkgPath.includes('packages') && fs.existsSync(mainFile)) {
    let main = fs.readFileSync(mainFile, 'utf8');
    let lines = main.split('\n');
    let writeMain = false;

    if (!main.includes('Copyright ')) {
      lines.unshift(
        '// Copyright (c) Jupyter Development Team.',
        '// Distributed under the terms of the Modified BSD License.',
        ''
      );
      writeMain = true;
    }
    if (!main.includes('@packageDocumentation')) {
      lines.splice(
        lines.indexOf(''),
        0,
        '/**',
        ' * @packageDocumentation',
        ` * @module ${data.name.split('/')[1]}`,
        ' */'
      );
      writeMain = true;
    }

    if (writeMain) {
      fs.writeFileSync(mainFile, lines.join('\n'));
    }
  }

  // Ensure extra LICENSE is not packaged (always use repo license)
  let licenseFile = path.join(pkgPath, 'LICENSE');

  if (fs.existsSync(licenseFile)) {
    messages.push('Removed LICENSE (prefer top-level)');
    await fs.unlink(licenseFile);
  }

  if (utils.writePackageData(path.join(pkgPath, 'package.json'), data)) {
    messages.push('Updated package.json');
  }
  return messages;
}

/**
 * An extra ensure function just for the @jupyterlab/ui-components package.
 * Ensures that the icon svg import statements are synced with the contents
 * of ui-components/style/icons.
 *
 * @param pkgPath - The path to the @jupyterlab/ui-components package.
 * @param dorequire - If true, use `require` function in place of `import`
 *  statements when loading the icon svg files
 *
 * @returns A list of changes that were made to ensure the package.
 */
export async function ensureUiComponents(
  pkgPath: string,
  dorequire: boolean = false
): Promise<string[]> {
  const funcName = 'ensureUiComponents';
  const pkgName = utils.stem(pkgPath);
  const messages: string[] = [];

  const svgPaths = glob.sync(path.join(pkgPath, 'style/icons', '**/*.svg'));

  /* support for glob import of icon svgs */
  const iconSrcDir = path.join(pkgPath, 'src/icon');

  // build the per-icon import code
  const _svgImportStatements: string[] = [];
  const _labiconConstructions: string[] = [];
  svgPaths.forEach(svgPath => {
    const svgName = utils.stem(svgPath);
    const svgImportPath = path
      .relative(iconSrcDir, svgPath)
      .split(path.sep)
      .join('/');

    const svgstrRef = utils.camelCase(svgName) + 'Svgstr';
    const iconRef = utils.camelCase(svgName) + 'Icon';
    const iconName = [pkgName, utils.stem(svgPath)].join(':');

    if (dorequire) {
      // load the icon svg using `require`
      _labiconConstructions.push(
        `export const ${iconRef} = new LabIcon({ name: '${iconName}', svgstr: require('${svgImportPath}').default });`
      );
    } else {
      // load the icon svg using `import`
      _svgImportStatements.push(`import ${svgstrRef} from '${svgImportPath}';`);

      _labiconConstructions.push(
        `export const ${iconRef} = new LabIcon({ name: '${iconName}', svgstr: ${svgstrRef} });`
      );
    }
  });

  // sort the statements and then join them
  const svgImportStatements = _svgImportStatements.sort().join('\n');
  const labiconConstructions = _labiconConstructions.sort().join('\n');

  // generate the actual contents of the iconImports file
  const iconImportsPath = path.join(iconSrcDir, 'iconimports.ts');
  const iconImportsContents = utils.fromTemplate(
    HEADER_TEMPLATE + ICON_IMPORTS_TEMPLATE,
    { funcName, svgImportStatements, labiconConstructions }
  );
  messages.push(...ensureFile(iconImportsPath, iconImportsContents, false));

  /* support for deprecated icon CSS classes */
  const iconCSSDir = path.join(pkgPath, 'style');

  // build the per-icon import code
  const _iconCSSUrls: string[] = [];
  const _iconCSSDeclarations: string[] = [];
  svgPaths.forEach(svgPath => {
    const svgName = utils.stem(svgPath);
    const urlName = 'jp-icon-' + svgName;
    const className = 'jp-' + utils.camelCase(svgName, true) + 'Icon';

    _iconCSSUrls.push(
      `--${urlName}: url('${path
        .relative(iconCSSDir, svgPath)
        .split(path.sep)
        .join('/')}');`
    );
    _iconCSSDeclarations.push(
      `.${className} {background-image: var(--${urlName})}`
    );
  });

  // sort the statements and then join them
  const iconCSSUrls = _iconCSSUrls.sort().join('\n');
  const iconCSSDeclarations = _iconCSSDeclarations.sort().join('\n\n');

  // generate the actual contents of the iconCSSClasses file
  const iconCSSClassesPath = path.join(iconCSSDir, 'deprecated.css');
  const iconCSSClassesContent = utils.fromTemplate(
    HEADER_TEMPLATE + ICON_CSS_CLASSES_TEMPLATE,
    { funcName, iconCSSUrls, iconCSSDeclarations }
  );
  messages.push(...ensureFile(iconCSSClassesPath, iconCSSClassesContent));

  return messages;
}

/**
 * The options used to ensure a package.
 */
export interface IEnsurePackageOptions {
  /**
   * The path to the package.
   */
  pkgPath: string;

  /**
   * The package data.
   */
  data: any;

  /**
   * The cache of dependency versions by package.
   */
  depCache?: { [key: string]: string };

  /**
   * A list of dependencies that can be unused.
   */
  unused?: string[];

  /**
   * A list of dependencies that can be missing.
   */
  missing?: string[];

  /**
   * A map of local package names and their relative path.
   */
  locals?: { [key: string]: string };

  /**
   * Whether to enforce that dependencies get used.  Default is true.
   */
  noUnused?: boolean;

  /**
   * The css import list for the package.
   */
  cssImports?: string[];

  /**
   * The css module import list for the package.
   */
  cssModuleImports?: string[];

  /**
   * Packages which are allowed to have multiple versions pulled in
   */
  differentVersions?: string[];
}

/**
 * Ensure that contents of a file match a supplied string. If they do match,
 * do nothing and return an empty array. If they don't match, overwrite the
 * file and return an array with an update message.
 *
 * @param fpath: The path to the file being checked. The file must exist,
 * or else this function does nothing.
 *
 * @param contents: The desired file contents.
 *
 * @param prettify: default = true. If true, format the contents with
 * `prettier` before comparing/writing. Set to false only if you already
 * know your code won't be modified later by the `prettier` git commit hook.
 *
 * @returns a string array with 0 or 1 messages.
 */
function ensureFile(
  fpath: string,
  contents: string,
  prettify: boolean = true
): string[] {
  const messages: string[] = [];

  if (!fs.existsSync(fpath)) {
    // bail
    messages.push(
      `Tried to ensure the contents of ${fpath}, but the file does not exist`
    );
    return messages;
  }

  // (maybe) run the newly generated contents through prettier before comparing
  let formatted = prettify
    ? prettier.format(contents, { filepath: fpath, singleQuote: true })
    : contents;

  const prev = fs.readFileSync(fpath, { encoding: 'utf8' });
  if (prev.indexOf('\r') !== -1) {
    // Normalize line endings to match current content
    formatted = formatted.replace(/\n/g, '\r\n');
  }
  if (prev !== formatted) {
    // Write out changes and notify
    fs.writeFileSync(fpath, formatted);

    const msgpath = fpath.startsWith('/') ? fpath : `./${fpath}`;
    messages.push(`Updated ${msgpath}`);
  }

  return messages;
}

/**
 * Extract the module imports from a TypeScript source file.
 *
 * @param sourceFile - The path to the source file.
 *
 * @returns An array of package names.
 */
function getImports(sourceFile: ts.SourceFile): string[] {
  const imports: string[] = [];
  handleNode(sourceFile);

  function handleNode(node: any): void {
    switch (node.kind) {
      case ts.SyntaxKind.ImportDeclaration:
        imports.push(node.moduleSpecifier.text);
        break;
      case ts.SyntaxKind.ImportEqualsDeclaration:
        imports.push(node.moduleReference.expression.text);
        break;
      default:
      // no-op
    }
    ts.forEachChild(node, handleNode);
  }
  return imports;
}
