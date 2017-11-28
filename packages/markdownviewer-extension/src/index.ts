// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILayoutRestorer, JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
  InstanceTracker
} from '@jupyterlab/apputils';

import {
  MimeDocumentFactory, MimeDocument
} from '@jupyterlab/docregistry';


import '../style/index.css';

/**
 * The name of the factory that creates markdown widgets.
 */
const FACTORY = 'Markdown Preview';
console.log('hi hi hi')

/**
 * The command IDs used by the document manager plugin.
 */
namespace CommandIDs {
  export
  const preview = 'markdownviewer:open';
}


/**
 * The markdown handler extension.
 */
const plugin: JupyterLabPlugin<void> = {
  activate,
  id: '@jupyterlab/markdownviewer-extension:plugin',
  requires: [ILayoutRestorer],
  autoStart: true
};


/**
 * Activate the markdown plugin.
 */
function activate(app: JupyterLab, restorer: ILayoutRestorer) {
    const primaryFileType = app.docRegistry.getFileType('markdown');
    const factory = new MimeDocumentFactory({
      name: FACTORY,
      primaryFileType,
      fileTypes: ['markdown'],
      rendermime: app.rendermime
    });
    const { commands } = app;
    const namespace = 'rendered-markdown';
    const tracker = new InstanceTracker<MimeDocument>({ namespace });

    app.docRegistry.addWidgetFactory(factory);

    // Handle state restoration.
    restorer.restore(tracker, {
      command: 'docmanager:open',
      args: widget => ({ path: widget.context.path, factory: FACTORY }),
      name: widget => widget.context.path
    });

    factory.widgetCreated.connect((sender, widget) => {
      // Notify the instance tracker if restore data needs to update.
      widget.context.pathChanged.connect(() => { tracker.save(widget); });
      tracker.add(widget);
    });

    commands.addCommand(CommandIDs.preview, {
      label: 'Markdown Preview',
      execute: (args) => {
        let path = args['path'];
        if (typeof path !== 'string') {
          return;
        }
        return commands.execute('docmanager:open', {
          path, factory: FACTORY
        });
      }
    });
  }


/**
 * Export the plugin as default.
 */
export default plugin;
