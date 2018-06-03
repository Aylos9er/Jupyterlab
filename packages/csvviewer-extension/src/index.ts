// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    ILayoutRestorer, JupyterLab, JupyterLabPlugin
} from '@jupyterlab/application';

import {
    InstanceTracker
} from '@jupyterlab/apputils';

import {
    CSVViewer, CSVViewerFactory, TSVViewerFactory
} from '@jupyterlab/csvviewer';

import {
    IDocumentWidget
} from '@jupyterlab/docregistry';

/**
 * The name of the factory that creates CSV widgets.
 */
const FACTORY = 'Table';


/**
 * The CSV file handler extension.
 */

const csv: JupyterLabPlugin<void> = {
    activate: (app: JupyterLab, restorer: ILayoutRestorer): void => {
        const factory = new CSVViewerFactory({
            name: FACTORY,
            fileTypes: ['csv'],
            defaultFor: ['csv'],
            readOnly: true
        });
        const tracker = new InstanceTracker<IDocumentWidget<CSVViewer>>({ namespace: 'csvviewer' });

        // Handle state restoration.
        restorer.restore(tracker, {
            command: 'docmanager:open',
            args: widget => ({ path: widget.context.path, factory: FACTORY }),
            name: widget => widget.context.path
        });

        app.docRegistry.addWidgetFactory(factory);
        let ft = app.docRegistry.getFileType('csv');
        factory.widgetCreated.connect((sender, widget) => {
            // Track the widget.
            tracker.add(widget);
            // Notify the instance tracker if restore data needs to update.
            widget.context.pathChanged.connect(() => { tracker.save(widget); });

            if (ft) {
                widget.title.iconClass = ft.iconClass;
                widget.title.iconLabel = ft.iconLabel;
            }
        });
    },
    id: '@jupyterlab/csvviewer-extension:csv-plugin',
    requires: [ILayoutRestorer],
    autoStart: true
};



/**
 * The TSV file handler extension.
 */
const tsv: JupyterLabPlugin<void> = {
    activate: (app: JupyterLab, restorer: ILayoutRestorer): void => {
        const factory = new TSVViewerFactory({
            name: FACTORY,
            fileTypes: ['tsv'],
            defaultFor: ['tsv'],
            readOnly: true
        });
        const tracker = new InstanceTracker<IDocumentWidget<CSVViewer>>({ namespace: 'csvviewer' });

        // Handle state restoration.
        restorer.restore(tracker, {
            command: 'docmanager:open',
            args: widget => ({ path: widget.context.path, factory: FACTORY }),
            name: widget => widget.context.path
        });

        app.docRegistry.addWidgetFactory(factory);
        let ft = app.docRegistry.getFileType('tsv');
        factory.widgetCreated.connect((sender, widget) => {
            // Track the widget.
            tracker.add(widget);
            // Notify the instance tracker if restore data needs to update.
            widget.context.pathChanged.connect(() => { tracker.save(widget); });

            if (ft) {
                widget.title.iconClass = ft.iconClass;
                widget.title.iconLabel = ft.iconLabel;
            }
        });
    },
    id: '@jupyterlab/csvviewer-extension:tsv-plugin',
    requires: [ILayoutRestorer],
    autoStart: true
};


/**
 * Export the plugins as default.
 */
const plugins: JupyterLabPlugin<any>[] = [tsv, csv];
export default plugins;
