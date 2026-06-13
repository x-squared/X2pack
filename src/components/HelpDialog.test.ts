import { describe, it, expect } from 'vitest';
import { renderHelpContent } from './HelpDialog.js';
import helpMarkdown from '../help.md?raw';

describe('renderHelpContent', () => {
  it('renders section headings from help.md', () => {
    const html = renderHelpContent(helpMarkdown);
    expect(html).toContain('<h2>Lists and packing</h2>');
    expect(html).toContain('<h2>When you change a list</h2>');
    expect(html).toContain('<h2>Syncing with another phone</h2>');
  });

  it('passes through the nested-list example HTML block', () => {
    const html = renderHelpContent(helpMarkdown);
    expect(html).toContain('class="help__example"');
    expect(html).toContain('Weekend trip');
  });

  it('stops before the load-examples marker', () => {
    const html = renderHelpContent(helpMarkdown);
    expect(html).not.toContain('LOAD_EXAMPLES_BUTTON');
  });
});
