import { useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { PageHeader } from '../../components/ui';
import { DocumentEditor } from './DocumentEditor';

const SAMPLE: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Release checklist' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Try the toolbar, the shortcuts, and ' },
        { type: 'text', text: 'Markdown-style typing', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' such as "# " or "- " at the start of a line.' },
      ],
    },
    {
      type: 'bulletList',
      content: ['Run the checks', 'Build the installer'].map((text) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    },
    {
      type: 'codeBlock',
      content: [{ type: 'text', text: 'npm run check' }],
    },
  ],
};

/**
 * A development-only screen for trying the DocumentEditor prototype (ADR-0012). Nothing here is
 * saved; the JSON panel shows what the editor reports through onChange.
 */
export function EditorLabPage() {
  const [title, setTitle] = useState('Editor prototype');
  const [content, setContent] = useState<JSONContent>(SAMPLE);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Development only"
        title="Editor lab"
        description="A prototype of the document editor. Nothing on this screen is saved."
      />
      <div className="editor-lab">
        <DocumentEditor
          title={title}
          onTitleChange={setTitle}
          initialContent={SAMPLE}
          onChange={setContent}
        />
        <section aria-labelledby="editor-lab-json" className="section">
          <h2 id="editor-lab-json">Reported content</h2>
          <pre className="editor-lab__json" data-testid="editor-lab-json">
            {JSON.stringify({ title, content }, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
