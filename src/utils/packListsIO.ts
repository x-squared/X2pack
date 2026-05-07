import { v4 as uuidv4 } from 'uuid';
import type { PackList } from '../types/index.js';

/**¨
 * Markdown format:
 * 
 * # List Name
 * 
 * - include: List Name
 * - Item 1
 * - Item 2
 * - ...
 * 
 * # Another List Name
 * 
 * - include: List Name
 * - Item 1
 * - Item 2
 * - ...
 */

/** Parsed list from markdown. */
type ParsedList = {
  name: string;
  items: string[];
  referencedListNames: string[];
  isMajor: boolean;
};

const REFERENCE_PREFIX = 'include';
const MAJOR_PREFIX = 'main';

function parseMarkdown(markdown: string): ParsedList[] {
  const result: ParsedList[] = [];
  let current: ParsedList | null = null;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();

    const headingMatch = /^#\s+(.+)$/.exec(line);
    if (headingMatch) {
      const headingText = headingMatch[1]!;
      const majorMatch = new RegExp(`^${MAJOR_PREFIX}:\\s+(.+)$`).exec(headingText);
      const isMajor = majorMatch !== null;
      const name = majorMatch ? majorMatch[1]! : headingText;
      current = { name, items: [], referencedListNames: [], isMajor };
      result.push(current);
      continue;
    }

    if (!current) continue;

    const refMatch = new RegExp(`^-\\s+${REFERENCE_PREFIX}:\\s+(.+)$`).exec(line);
    if (refMatch) {
      current.referencedListNames.push(refMatch[1]!.trim());
      continue;
    }

    const itemMatch = /^-\s+(.+)$/.exec(line);
    if (itemMatch) {
      current.items.push(itemMatch[1]!.trim());
    }
  }

  return result;
}

export function serializePackLists(lists: readonly PackList[]): string {
  const nameById = new Map(lists.map((l) => [l.id, l.name]));
  const sections: string[] = [];

  for (const list of lists) {
    const heading = list.isMajor ? `# ${MAJOR_PREFIX}: ${list.name}` : `# ${list.name}`;
    const lines: string[] = [heading, ''];
    for (const item of list.items) {
      lines.push(`- ${item}`);
    }
    for (const refId of list.referencedListIds) {
      const refName = nameById.get(refId) ?? refId;
      lines.push(`- ${REFERENCE_PREFIX}: ${refName}`);
    }
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

export type PackListImportEntry = {
  data: { name: string; items: string[]; referencedListIds: string[]; isMajor: boolean };
  id: string;
};

export function resolveImport(
  markdown: string,
  existingLists: readonly PackList[],
): PackListImportEntry[] {
  const parsed = parseMarkdown(markdown);
  const nameToId = new Map(existingLists.map((l) => [l.name, l.id]));

  for (const { name } of parsed) {
    if (!nameToId.has(name)) {
      nameToId.set(name, uuidv4());
    }
  }

  return parsed.map(({ name, items, referencedListNames, isMajor }) => ({
    data: {
      name,
      items,
      referencedListIds: referencedListNames
        .map((n) => nameToId.get(n))
        .filter((id): id is string => id !== undefined),
      isMajor,
    },
    id: nameToId.get(name)!,
  }));
}

type WindowWithFilePicker = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

export async function downloadPackLists(lists: readonly PackList[]): Promise<void> {
  const content = serializePackLists(lists);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `pack-lists-${today}.md`;
  const blob = new Blob([content], { type: 'text/markdown' });

  // File System Access API — user picks the save location (Chrome desktop, Android Chrome)
  const win = window as WindowWithFilePicker;
  if (win.showSaveFilePicker) {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
      // Fall through on other errors
    }
  }

  // Web Share API with file — opens the iOS Share Sheet so the user picks the destination
  const file = new File([blob], filename, { type: 'text/markdown' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') throw err;
    }
    return;
  }

  // Fallback: anchor-based download (goes to browser's default download folder)
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
