import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  testId?: string;
}

// Rich text editor built on TipTap (ProseMirror). Stores HTML.
export function RichText({ value, onChange, placeholder, testId }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noreferrer noopener', target: '_blank' } }),
      Placeholder.configure({ placeholder: placeholder || 'Write the instructions…' }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sync external value changes (e.g. switching steps) without disturbing typing.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return <div className="rt" data-testid={testId} />;

  return (
    <div className="rt" data-testid={testId}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="rt-editor" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean, title: string, label: string, run: () => void) => (
    <button
      type="button"
      title={title}
      className={`rt-btn ${active ? 'active' : ''}`}
      onMouseDown={(e) => { e.preventDefault(); run(); }}
    >
      {label}
    </button>
  );

  function setLink() {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (https://…)', prev || 'https://');
    if (url === null) return;
    if (url === '') return editor.chain().focus().unsetLink().run();
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className="rt-toolbar">
      {btn(editor.isActive('bold'), 'Bold', 'B', () => editor.chain().focus().toggleBold().run())}
      {btn(editor.isActive('italic'), 'Italic', 'I', () => editor.chain().focus().toggleItalic().run())}
      {btn(editor.isActive('strike'), 'Strikethrough', 'S', () => editor.chain().focus().toggleStrike().run())}
      {btn(editor.isActive('heading', { level: 2 }), 'Heading', 'H', () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {btn(editor.isActive('blockquote'), 'Quote', '“”', () => editor.chain().focus().toggleBlockquote().run())}
      {btn(editor.isActive('bulletList'), 'Bullet list', '•', () => editor.chain().focus().toggleBulletList().run())}
      {btn(editor.isActive('orderedList'), 'Numbered list', '1.', () => editor.chain().focus().toggleOrderedList().run())}
      {btn(editor.isActive('codeBlock'), 'Code block', '</>', () => editor.chain().focus().toggleCodeBlock().run())}
      {btn(editor.isActive('link'), 'Link', '🔗', setLink)}
      {btn(false, 'Clear formatting', '⌫', () => editor.chain().focus().unsetAllMarks().clearNodes().run())}
    </div>
  );
}

// Sanitise stored HTML before rendering it to participants. Allowlist of tags,
// strips scripts/handlers/styles, keeps safe links.
const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'H1', 'H2', 'H3', 'H4',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'SPAN', 'DIV',
]);

export function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node: ParentNode) => {
    [...node.children].forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (child.tagName === 'A' && name === 'href' && /^https?:\/\//i.test(attr.value)) return;
        child.removeAttribute(attr.name);
      });
      if (child.tagName === 'A') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noreferrer noopener');
      }
      walk(child);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}
