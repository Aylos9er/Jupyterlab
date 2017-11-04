
# Making a JupyterLab release

This document guides a contributor through creating a release of JupyterLab.

## Check installed tools

Review ``CONTRIBUTING.md``. Make sure all the tools needed to generate the
built JavaScript files are properly installed.

## Create the release

We publish the npm packages, a Python source package, and a Python universal binary wheel.  We also publish a conda package on conda-forge (see below).
See the Python docs on [package uploading](https://packaging.python.org/guides/tool-recommendations/)
for twine setup instructions and for why twine is the recommended method.

### Publish the npm packages
The command below ensures the latest dependencies and built files,
then prompts you to select package versions.  When one package has an 
effective major release, the packages that depend on it should also get a 
major release, to prevent consumers that are using the `^` semver 
requirement from getting a conflict.

```bash
npm run publish
```

### Publish the python package

- Update `jupyterlab/_version.py` with an `rc` version
- Prep the static assets for release:

```bash
npm run build:static
```

- Commit and tag and push the tag
- Create the python release artifacts:

```bash
rm -rf dist
python setup.py sdist
python setup.py bdist_wheel --universal
twine upload dist/*
```

- Test the `rc` in a clean environment 
- Make sure the CI builds pass
  - The build will fail if we publish a new package because by default it is
    private.  Use `npm access public @jupyterlab/<name>` to make it public.
  - The build will fail if we forget to include `style/` in the `files:`
    of a package (it will fail on the `jupyter lab build` command because
    webpack cannot find the referenced styles to import.
- Update `jupyterlab/_version.py` with a final version 
- Make another Python release
- Get the sha256 hash for conda-forge release:

```bash
shasum -a 256 dist/*.tar.gz
```

### Publish to conda-forge
- Fork https://github.com/conda-forge/jupyterlab-feedstock
- Create a PR with the version bump
- Update `recipe/meta.yaml` with the new version and md5 and reset the build number to 0.

### Update the cookie cutters as necessary
- Update https://github.com/jupyterlab/extension-cookiecutter-js
- Update https://github.com/jupyterlab/extension-cookiecutter-ts
- Update https://github.com/jupyterlab/mimerender-cookiecutter

### Update the extension examples
- https://github.com/jupyterlab/jupyterlab/blob/master/docs/notebook.md#adding-a-button-to-the-toolbar

### Update the xkcd tutorial
- Create a new empty branch in the xkcd repo.

```bash
git checkout --orphan NEWBRANCH
git rm -rf .
```

- Create a new PR in JupyterLab.
- Run through the tutorial in the PR, making commits and updating
the tutorial as appropriate.
- Prefix the new tags with the branch name, e.g. `0.28-01-show-a-panel`
- For the publish section of the readme, use the `LICENSE` and `README`
files from the previous branch, as well as the `package.json` fields up to 
`license`.
- Push the branch and set it as the default branch for the tutorial repo.
- Submit the PR to JupyterLab

### Set master back to dev version
- Update `jupyterlab/_version.py` with a `dev` version
- Commit and push the version update.


## Making a patch release of a JavaScript Package
- Create a branch based on the last Python release if one does not exist.
- Create a PR against that branch with the changes.
- Merge the PR.
- Run the following script from the branch to make a patch release, 
where the package is in `/packages/packageFolder`:

```bash
node scripts/patch-release.js packageFolder
```

- Push the resulting commit and tag.
