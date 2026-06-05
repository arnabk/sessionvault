import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  testId?: string;
}

type Cmd = { icon: string; title: string; run: () => void };

// Lightweight rich text editor (contentEditable + execCommand). No dependencies.
// Stores HTML. Output is sanitised on render via sanitizeHtml().
export function RichText({ value, onChange, placeholder, testId }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the DOM in sync when the value changes externally (e.g. switching steps),
  // without clobbering the caret while the user is typing.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || '';
  }, [value]);

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function addLink() {
    const url = window.prompt('Link URL (https://…)');
    if (url) exec('createLink', url);
  }

  const cmds: Cmd[] = [
    { icon: 'B', title: 'Bold', run: () => exec('bold') },
    { icon: 'I', title: 'Italic', run: () => exec('italic') },
    { icon: 'U', title: 'Underline', run: () => exec('underline') },
    { icon: 'H', title: 'Heading', run: () => exec('formatBlock', 'H3') },
    { icon: '“”', title: 'Quote', run: () => exec('formatBlock', 'BLOCKQUOTE') },
    { icon: '•', title: 'Bullet list', run: () => exec('insertUnorderedList') },
    { icon: '1.', title: 'Numbered list', run: () => exec('insertOrderedList') },
    { icon: '</>', title: 'Code', run: () => exec('formatBlock', 'PRE') },
    { icon: '🔗', title: 'Link', run: addLink },
    { icon: '⌫', title: 'Clear formatting', run: () => exec('removeFormat') },
  ];

  return (
    <div className="rt" data-testid={testId}>
      <div className="rt-toolbar">
        {cmds.map((c) => (
          <button
            key={c.title}
            type="button"
            className="rt-btn"
            title={c.title}
            onMouseDown={(e) => { e.preventDefault(); c.run(); }}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="rt-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Write the instructions…'}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}

// Allow a small, safe subset of tags/attributes. Strips scripts, event handlers,
// styles, and disallowed tags while keeping basic formatting.
const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'H3', 'H4',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'SPAN', 'DIV',
]);

export function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (node: Element) => {
    [...node.children].forEach((child) => {
      if (!ALLOWED.has(child.tagName)) {
        // Unwrap unknown elements: keep their text/children, drop the tag.
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      // Strip all attributes except safe href on <a>.
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
  walk(tpl.content as unknown as Element);
  return tpl.innerHTML;
}
