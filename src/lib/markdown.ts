import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';

/**
 * Shared article body pipeline: raw markdown -> HTML.
 *
 * Both the English and Spanish article routes use this so that, for the same
 * source body, they produce byte-for-byte identical HTML.
 */
export async function renderMarkdown(body: string): Promise<string> {
  const processed = await remark()
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(() => (tree: any) => {
      // Remove empty comment nodes that cause "Expected node, got ``" errors
      const visit = (node: any, index: number, parent: any) => {
        if (node.type === 'comment' && (!node.value || node.value.trim() === '')) {
          if (parent && parent.children) {
            parent.children.splice(index, 1);
          }
          return;
        }
        if (node.children) {
          for (let i = node.children.length - 1; i >= 0; i--) {
            visit(node.children[i], i, node);
          }
        }
      };
      visit(tree, 0, { children: tree.children });

      // Add copy button to code blocks
      const visit2 = (node: any) => {
        if (node.type === 'element' && node.tagName === 'pre' && node.children[0]?.tagName === 'code') {
          node.properties = node.properties || {};
          node.properties.className = [...(node.properties.className || []), 'code-block'];
        }
        if (node.children) node.children.forEach(visit2);
      };
      visit2(tree);
    })
    .use(rehypeStringify)
    .process(body);

  let html = String(processed);
  // Remove TODO comments from HTML
  html = html.replace(/<!--\s*TODO:.*?-->/g, '');
  return html;
}
