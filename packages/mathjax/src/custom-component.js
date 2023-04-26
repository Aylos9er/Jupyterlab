/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module mathjax
 */

//
//  Initialize the MathJax startup code
//
import 'mathjax-full/components/src/startup/lib/startup.js';

//
//  Get the loader module and indicate the modules that
//  will be loaded by hand below
//
import { Loader } from 'mathjax-full/js/components/loader.js';
Loader.preLoad(
  'loader',
  'startup',
  'core',
  'input/tex-full',
  'output/chtml',
  'output/chtml/fonts/tex.js',
  'ui/safe',
  'a11y/assistive-mml'
);

//
// Update the configuration to include any needed values
// (we set the mathjax path explicitly, since it defaults
//  to the location from which this file is loaded)
//
import { insert } from 'mathjax-full/js/util/Options.js';
insert(
  MathJax.config,
  {
    // loader: {
    //   paths: {
    //     mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5'
    //   }
    // },
    tex: {
      inlineMath: [
        ['$', '$'],
        ['\\(', '\\)']
      ],
      displayMath: [
        ['$$', '$$'],
        ['\\[', '\\]']
      ],
      processEscapes: true,
      processEnvironments: true
    }
  },
  false
);

//
// Load the components that we want to combine into one component
//   (the ones listed in the preLoad() call above)
//
import 'mathjax-full/components/src/core/core.js';

import 'mathjax-full/components/src/input/tex-full/tex-full.js';

import 'mathjax-full/components/src/output/chtml/chtml.js';
import 'mathjax-full/components/src/output/chtml/fonts/tex/tex.js';

import 'mathjax-full/components/src/ui/safe/safe.js';

import 'mathjax-full/components/src/a11y/assistive-mml/assistive-mml.js';

//
// Loading this component will cause all the normal startup
//   operations to be performed when this component is loaded
//
import 'mathjax-full/components/src/startup/startup.js';
import { MathJax } from 'mathjax-full/js/components/global';
