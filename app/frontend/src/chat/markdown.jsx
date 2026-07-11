/**
 * Tiny markdown → React renderer for assistant messages (DES-7: paragraphs,
 * lists, bold, inline code, and links — sanitized, no raw HTML). Emitting
 * React elements instead of an HTML string is the sanitization: source text is
 * always rendered as text nodes, never parsed as markup, so there is no
 * innerHTML surface at all and no markdown dependency in the bundle.
 *
 * Links: only http(s) and site-relative hrefs become anchors (anything else —
 * javascript:, data:, … — renders as plain text). External links open in a new
 * tab; same-app hrefs stay in the tab. (In-app client-side navigation that
 * keeps the panel mounted arrives with the router ticket — no router exists
 * in the app yet.)
 *
 * Renders progressively well: it is re-run on every streamed delta, and a
 * half-finished construct simply renders as plain text until its closer lands.
 */

const BLOCK_UL = /^[-*]\s+/;
const BLOCK_OL = /^\d+[.)]\s+/;

/** Markdown source → array of React nodes. */
export function renderMarkdown(source) {
  const lines = String(source ?? '').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null; // { ordered, items: [string] }

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'p', text: paragraph.join('\n') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', ...list });
      list = null;
    }
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else if (BLOCK_UL.test(line.trim())) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(line.trim().replace(BLOCK_UL, ''));
    } else if (BLOCK_OL.test(line.trim())) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(line.trim().replace(BLOCK_OL, ''));
    } else if (list) {
      // Continuation line inside a list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return blocks.map((block, i) => {
    if (block.type === 'p') {
      return <p key={i}>{renderInline(block.text)}</p>;
    }
    const Tag = block.ordered ? 'ol' : 'ul';
    return (
      <Tag key={i}>
        {block.items.map((item, j) => (
          <li key={j}>{renderInline(item)}</li>
        ))}
      </Tag>
    );
  });
}

// One scan, earliest match wins: **bold**, `code`, [text](href).
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/;

function renderInline(text, keyBase = 'i') {
  const nodes = [];
  let rest = text;
  let k = 0;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const [, bold, code, linkText, href] = match;
    const key = `${keyBase}-${(k += 1)}`;
    if (bold !== undefined) {
      nodes.push(<strong key={key}>{renderInline(bold, key)}</strong>);
    } else if (code !== undefined) {
      nodes.push(<code key={key}>{code}</code>);
    } else if (isSafeHref(href)) {
      nodes.push(
        <a key={key} href={href} {...(isExternal(href) ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {renderInline(linkText, key)}
        </a>,
      );
    } else {
      nodes.push(linkText); // unsafe scheme — keep the words, drop the link
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return nodes;
}

function isSafeHref(href) {
  return /^(https?:\/\/|\/)/.test(href);
}

function isExternal(href) {
  return /^https?:\/\//.test(href);
}
