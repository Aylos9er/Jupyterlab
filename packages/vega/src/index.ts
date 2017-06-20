import {
  JSONObject
} from '@phosphor/coreutils';

import {
  Message,
} from '@phosphor/messaging';

import {
  Widget
} from '@phosphor/widgets';

import {
  RenderMime
} from '@jupyterlab/rendermime';

import {
  DocumentRegistry
} from '@jupyterlab/docregistry';


import embed = require('vega-embed');



const VEGA_COMMON_CLASS = 'jp-RenderedVegaCommon';

const VEGA_CLASS = 'jp-RenderedVega';

const VEGALITE_CLASS = 'jp-RenderedVegaLite';


export
const VEGA_MIME_TYPE = 'application/vnd.vega.v2+json';

export
const VEGALITE_MIME_TYPE = 'application/vnd.vegalite.v1+json';

export
class RenderedVega extends Widget {

  constructor(options: RenderMime.IRenderOptions) {
    super();
    this.addClass(VEGA_COMMON_CLASS);
    this._model = options.model;
    let mimeType = this._mimeType = options.mimeType;
    if (mimeType === VEGA_MIME_TYPE) {
      this.addClass(VEGA_CLASS);
      this._mode = 'vega';
    } else {
      this.addClass(VEGALITE_CLASS);
      this._mode = 'vega-lite';
    }
  }

  dispose(): void {
    this._model = null;
    super.dispose();
  }

  onAfterAttach(msg: Message): void {
    this._renderVega();
  }

  private _renderVega(): void {

    let data = this._model.data.get(this._mimeType) as JSONObject;
  
    let embedSpec = {
      mode: this._mode,
      spec: data
    };

    embed(this.node, embedSpec, (error: any, result: any): any => {
      // This is copied out for now as there is a bug in JupyterLab
      // that triggers and infinite rendering loop when this is done.
      // let imageData = result.view.toImageURL();
      // imageData = imageData.split(',')[1];
      // this._injector('image/png', imageData);
    });
  }

  private _model: RenderMime.IMimeModel = null;
  private _mimeType: string;
  private _mode: string;

}


/**
 * A mime renderer for GeoJSON.
 */
export
class VegaRenderer implements RenderMime.IRenderer {
  /**
   * The mimeTypes this renderer accepts.
   */
  mimeTypes = [VEGA_MIME_TYPE, VEGALITE_MIME_TYPE];

  /**
   * Whether the renderer can render given the render options.
   */
  canRender(options: RenderMime.IRenderOptions): boolean {
    return this.mimeTypes.indexOf(options.mimeType) !== -1;
  }

  /**
   * Render the transformed mime bundle.
   */
  render(options: RenderMime.IRenderOptions): Widget {
    return new RenderedVega(options);
  }

  /**
   * Whether the renderer will sanitize the data given the render options.
   */
  wouldSanitize(options: RenderMime.IRenderOptions): boolean {
    return !options.model.trusted;
  }
}


export
interface IRendererExtension {
  mimeType: string;
  renderer: RenderMime.IRenderer;
  rendererIndex?: number;
  widgetFactoryOptions: DocumentRegistry.IWidgetFactoryOptions;
}


const extensions: IRendererExtension | IRendererExtension[] = [
  {
    mimeType: VEGA_MIME_TYPE,
    renderer: VegaRenderer,
    rendererIndex: 0,
    widgetFactoryOptions: {
      name: 'Vega',
      fileExtensions: ['.vg', '.vg.json', 'json'],
      defaultFor: ['.vg', '.vg.json'],
      readOnly: true
    }
  },
  {
    mimeType: VEGALITE_MIME_TYPE,
    renderer: VegaRenderer,
    rendererIndex: 0,
    widgetFactoryOptions: {
      name: 'Vega-Lite',
      fileExtensions: ['.vl', '.vl.json', 'json'],
      defaultFor: ['.vl', '.vl.json'],
      readOnly: true
    }
  }
];

export default extensions;
