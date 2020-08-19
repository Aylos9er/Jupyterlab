import { expect } from 'chai';
import { RenameCM } from './rename';
import { FileEditorFeatureTestEnvironment } from '../editor_integration/testutils';
import * as lsProtocol from 'vscode-languageserver-protocol';
import { PageConfig } from '@jupyterlab/coreutils';

describe('Rename', () => {
  let env: FileEditorFeatureTestEnvironment;

  beforeEach(() => (env = new FileEditorFeatureTestEnvironment()));
  afterEach(() => env.dispose());

  describe('Works with VirtualFileEditor', () => {
    let feature: RenameCM;

    beforeEach(() => (feature = env.init_integration(RenameCM)));
    afterEach(() => env.dispose_feature(feature));

    PageConfig.setOption('rootUri', 'file://');

    it('renders inspections', async () => {
      env.ce_editor.model.value.text = 'x = 1\n';
      await env.adapter.update_documents();
      let main_document = env.virtual_editor.virtual_document;

      await feature.handleRename({
        changes: {
          ['file://' + env.path]: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 2, character: 0 }
              },
              newText: 'y = 1\n'
            } as lsProtocol.TextEdit
          ]
        }
      });

      await env.adapter.update_documents();

      expect(env.status_message.message).to.be.equal('Renamed a variable');
      expect(main_document.value).to.be.equal('y = 1\n');
    });
  });
});
