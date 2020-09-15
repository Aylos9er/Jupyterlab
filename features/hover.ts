import { getModifierState, uris_equal } from '../utils';
import { IRootPosition, is_equal, IVirtualPosition } from '../positioning';
import * as lsProtocol from 'vscode-languageserver-protocol';
import * as CodeMirror from 'codemirror';
import { Throttler } from '@lumino/polling';
import {
  CodeMirrorIntegration,
  IEditorRange
} from '../editor_integration/codemirror';
import { FeatureSettings, IFeatureLabIntegration } from '../feature';
import { EditorTooltipManager } from '../components/free_tooltip';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ILSPAdapterManager, ILSPFeatureManager, PLUGIN_ID } from '../tokens';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { CodeHover as LSPHoverSettings, ModifierKey } from '../_hover';
import { LabIcon } from '@jupyterlab/ui-components';

import hoverSvg from '../../style/icons/hover.svg';
import { IEditorChange } from '../virtual/editor';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { PositionConverter } from '../converter';

export const hoverIcon = new LabIcon({
  name: 'lsp:hover',
  svgstr: hoverSvg
});

interface IResponseData {
  response: lsProtocol.Hover;
  uri: string;
  editor_range: IEditorRange;
  ce_editor: CodeEditor.IEditor;
}

class ResponseCache {
  protected _data: Array<IResponseData>;
  get data() {
    return this._data;
  }

  constructor(public maxSize: number) {
    this._data = [];
  }

  store(item: IResponseData) {
    if (this._data.length >= this.maxSize) {
      this._data.shift();
    }
    this._data.push(item);
  }

  clean() {
    this._data = [];
  }
}

function to_markup(
  content: string | lsProtocol.MarkedString
): lsProtocol.MarkupContent {
  if (typeof content === 'string') {
    // coerce to MarkedString  object
    return {
      kind: 'plaintext',
      value: content
    };
  } else {
    return {
      kind: 'markdown',
      value: '```' + content.language + '\n' + content.value + '\n```'
    };
  }
}

export class HoverCM extends CodeMirrorIntegration {
  protected last_hover_character: IRootPosition;
  private last_hover_response: lsProtocol.Hover;
  protected hover_marker: CodeMirror.TextMarker;
  private virtual_position: IVirtualPosition;
  lab_integration: HoverLabIntegration;
  settings: FeatureSettings<LSPHoverSettings>;
  protected cache: ResponseCache;

  private debounced_get_hover: Throttler<Promise<lsProtocol.Hover>>;

  get modifierKey(): ModifierKey {
    return this.settings.composite.modifierKey;
  }

  protected restore_from_cache(
    root_position: IRootPosition
  ): IResponseData | null {
    const virtual_position = this.virtual_editor.root_position_to_virtual_position(
      root_position
    );
    const document_uri = this.virtual_document.document_info.uri;
    const matching_items = this.cache.data.filter(cache_item => {
      if (!uris_equal(cache_item.uri, document_uri)) {
        return false;
      }
      let range = cache_item.response.range;
      let { line, ch } = virtual_position;
      return (
        line >= range.start.line &&
        line <= range.end.line &&
        (line != range.start.line || ch >= range.start.character) &&
        (line != range.end.line || ch <= range.end.character)
      );
    });
    return matching_items.length != 0 ? matching_items[0] : null;
  }

  register(): void {
    this.cache = new ResponseCache(this.settings.composite.cacheSize);
    this.wrapper_handlers.set('mousemove', this.handleMouseOver);
    this.wrapper_handlers.set('mouseleave', this.remove_range_highlight);
    // show hover after pressing the modifier key
    this.wrapper_handlers.set('keydown', (event: KeyboardEvent) => {
      if (
        getModifierState(event, this.modifierKey) &&
        typeof this.last_hover_character !== 'undefined'
      ) {
        let response_data = this.restore_from_cache(this.last_hover_character);
        if (response_data == null) {
          return;
        }
        this.handleResponse(response_data, this.last_hover_character, true);
      }
    });
    this.debounced_get_hover = this.create_throttler();

    this.settings.changed.connect(() => {
      this.cache.maxSize = this.settings.composite.cacheSize;
      this.debounced_get_hover = this.create_throttler();
    });
    super.register();
  }

  create_throttler() {
    return new Throttler<Promise<lsProtocol.Hover>>(this.on_hover, {
      limit: this.settings.composite.throttlerDelay,
      edge: 'trailing'
    });
  }

  afterChange(change: IEditorChange, root_position: IRootPosition) {
    super.afterChange(change, root_position);
    // reset cache on any change in the document
    this.cache.clean();
    this.last_hover_character = undefined;
    this.remove_range_highlight();
  }

  protected on_hover = async () => {
    return await this.connection.getHoverTooltip(
      this.virtual_position,
      this.virtual_document.document_info,
      false
    );
  };

  protected static get_markup_for_hover(
    response: lsProtocol.Hover
  ): lsProtocol.MarkupContent {
    let contents = response.contents;

    // this causes the webpack to fail "Module not found: Error: Can't resolve 'net'" for some reason
    // if (lsProtocol.MarkedString.is(contents))
    ///  contents = [contents];

    if (typeof contents === 'string') {
      contents = [contents as lsProtocol.MarkedString];
    }

    if (!Array.isArray(contents)) {
      return contents as lsProtocol.MarkupContent;
    }

    let markups = contents.map(to_markup);
    if (markups.every(markup => markup.kind == 'plaintext')) {
      return {
        kind: 'plaintext',
        value: markups.map(markup => markup.value).join('\n')
      };
    } else {
      return {
        kind: 'markdown',
        value: markups.map(markup => markup.value).join('\n\n')
      };
    }
  }

  public handleResponse = (
    response_data: IResponseData,
    root_position: IRootPosition,
    show_tooltip: boolean
  ) => {
    let response = response_data.response;

    // testing for object equality because the response will likely be reused from cache
    if (this.last_hover_response != response) {
      this.remove_range_highlight();
      this.hover_marker = this.highlight_range(
        response_data.editor_range,
        'cm-lsp-hover-available'
      );
    }

    this.last_hover_response = response;

    if (show_tooltip) {
      this.lab_integration.tooltip.remove();
      const markup = HoverCM.get_markup_for_hover(response);
      let editor_position = this.virtual_editor.root_position_to_editor(
        root_position
      );

      this.lab_integration.tooltip.create({
        markup,
        position: editor_position,
        ce_editor: response_data.ce_editor,
        className: 'lsp-hover'
      });
    }
  };

  protected is_token_empty(token: CodeMirror.Token) {
    return token.string.length === 0;
    // TODO  || token.type.length === 0? (sometimes the underline is shown on meaningless tokens)
  }

  protected is_event_inside_visible(event: MouseEvent) {
    let target = event.target as HTMLElement;
    return target.closest('.CodeMirror-sizer') != null;
  }

  protected is_useful_response(response: lsProtocol.Hover) {
    return (
      response &&
      response.contents &&
      !(Array.isArray(response.contents) && response.contents.length === 0)
    );
  }

  protected async _handleMouseOver(event: MouseEvent) {
    const show_tooltip = getModifierState(event, this.modifierKey);

    // currently the events are coming from notebook panel; ideally these would be connected to individual cells,
    // (only cells with code) instead, but this is more complex to implement right. In any case filtering
    // is needed to determine in hovered character belongs to this virtual document

    let root_position = this.position_from_mouse(event);

    // happens because mousemove is attached to panel, not individual code cells,
    // and because some regions of the editor (between lines) have no characters
    if (root_position == null) {
      this.remove_range_highlight();
      return;
    }

    let token = this.virtual_editor.getTokenAt(root_position);

    let document = this.virtual_editor.document_at_root_position(root_position);
    let virtual_position = this.virtual_editor.root_position_to_virtual_position(
      root_position
    );

    if (
      this.is_token_empty(token) ||
      document !== this.virtual_document ||
      !this.is_event_inside_visible(event)
    ) {
      this.remove_range_highlight();
      return;
    }

    if (!is_equal(root_position, this.last_hover_character)) {
      this.virtual_position = virtual_position;
      this.last_hover_character = root_position;

      let response_data = this.restore_from_cache(root_position);

      if (response_data == null) {
        let response = await this.debounced_get_hover.invoke();
        if (this.is_useful_response(response)) {
          let ce_editor = this.virtual_editor.get_editor_at_root_position(
            root_position
          );
          let cm_editor = this.virtual_editor.ce_editor_to_cm_editor.get(
            ce_editor
          );

          let editor_range = this.get_editor_range(
            response,
            root_position,
            token,
            cm_editor
          );

          response_data = {
            response: this.add_range_if_needed(
              response,
              editor_range,
              ce_editor
            ),
            uri: this.virtual_document.document_info.uri,
            editor_range: editor_range,
            ce_editor: ce_editor
          };

          this.cache.store(response_data);
        } else {
          this.remove_range_highlight();
          return;
        }
      }

      this.handleResponse(response_data, root_position, show_tooltip);
    }
  }

  protected handleMouseOver = (event: MouseEvent) => {
    try {
      return this._handleMouseOver(event);
    } catch (e) {
      if (
        !(
          e.message === 'Cell not found in cell_line_map' ||
          e.message === "Cannot read property 'string' of undefined"
        )
      ) {
        console.warn(e);
      }
    }
  };

  protected remove_range_highlight = () => {
    if (this.hover_marker) {
      this.hover_marker.clear();
      this.hover_marker = null;
    }
  };

  remove(): void {
    this.cache.clean();
    this.remove_range_highlight();
    this.debounced_get_hover.dispose();
    super.remove();

    // just to be sure
    this.debounced_get_hover = null;
    this.remove_range_highlight = null;
    this.handleResponse = null;
    this.on_hover = null;
  }

  private get_editor_range(
    response: lsProtocol.Hover,
    position: IRootPosition,
    token: CodeMirror.Token,
    cm_editor: CodeMirror.Editor
  ): IEditorRange {
    if (typeof response.range !== 'undefined') {
      return this.range_to_editor_range(response.range, cm_editor);
    }

    // construct the range manually using the token information
    let start_in_root = {
      line: position.line,
      ch: token.start
    } as IRootPosition;
    let end_in_root = {
      line: position.line,
      ch: token.end
    } as IRootPosition;

    return {
      start: this.virtual_editor.root_position_to_editor(start_in_root),
      end: this.virtual_editor.root_position_to_editor(end_in_root),
      editor: cm_editor
    };
  }

  private add_range_if_needed(
    response: lsProtocol.Hover,
    editor_range: IEditorRange,
    ce_editor: CodeEditor.IEditor
  ): lsProtocol.Hover {
    if (typeof response.range !== 'undefined') {
      return response;
    }
    return {
      ...response,
      range: {
        start: PositionConverter.cm_to_lsp(
          this.virtual_editor.transform_from_editor_to_root(
            ce_editor,
            editor_range.start
          )
        ),
        end: PositionConverter.cm_to_lsp(
          this.virtual_editor.transform_from_editor_to_root(
            ce_editor,
            editor_range.end
          )
        )
      }
    };
  }
}

class HoverLabIntegration implements IFeatureLabIntegration {
  tooltip: EditorTooltipManager;
  settings: FeatureSettings<any>;

  constructor(
    app: JupyterFrontEnd,
    settings: FeatureSettings<any>,
    renderMimeRegistry: IRenderMimeRegistry,
    adapterManager: ILSPAdapterManager
  ) {
    this.tooltip = new EditorTooltipManager(renderMimeRegistry, adapterManager);
  }
}

const FEATURE_ID = PLUGIN_ID + ':hover';

export const HOVER_PLUGIN: JupyterFrontEndPlugin<void> = {
  id: FEATURE_ID,
  requires: [
    ILSPFeatureManager,
    ISettingRegistry,
    IRenderMimeRegistry,
    ILSPAdapterManager
  ],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    featureManager: ILSPFeatureManager,
    settingRegistry: ISettingRegistry,
    renderMimeRegistry: IRenderMimeRegistry,
    adapterManager: ILSPAdapterManager
  ) => {
    const settings = new FeatureSettings(settingRegistry, FEATURE_ID);
    const labIntegration = new HoverLabIntegration(
      app,
      settings,
      renderMimeRegistry,
      adapterManager
    );

    featureManager.register({
      feature: {
        editorIntegrationFactory: new Map([['CodeMirrorEditor', HoverCM]]),
        id: FEATURE_ID,
        name: 'LSP Hover tooltip',
        labIntegration: labIntegration,
        settings: settings
      }
    });
  }
};
