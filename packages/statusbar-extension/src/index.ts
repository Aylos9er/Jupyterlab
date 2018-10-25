// Local CSS must be loaded prior to loading other libs.
import '../style/index.css';

import { JupyterLab, JupyterLabPlugin } from '@jupyterlab/application';

import { IStatusBar, StatusBar } from '@jupyterlab/statusbar';

// Export default status bar items

import {
  lineColItem,
  kernelStatus,
  runningSessionsItem,
  filePathStatus,
  tabSpaceItem,
  memoryUsageItem,
  savingStatusItem
} from './defaults';

export const STATUSBAR_PLUGIN_ID = '@jupyterlab/statusbar-extension:plugin';

/**
 * Initialization data for the statusbar extension.
 */
const statusBar: JupyterLabPlugin<IStatusBar> = {
  id: STATUSBAR_PLUGIN_ID,
  provides: IStatusBar,
  autoStart: true,
  activate: (app: JupyterLab) => {
    return new StatusBar({ host: app.shell });
  }
};

const plugins: JupyterLabPlugin<any>[] = [
  statusBar,
  lineColItem,
  kernelStatus,
  runningSessionsItem,
  filePathStatus,
  tabSpaceItem,
  memoryUsageItem,
  savingStatusItem
];

export default plugins;
