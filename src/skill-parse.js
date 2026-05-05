function parseFrontmatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n'))
    return null;

  const newline = content.startsWith('---\r\n') ? '\r\n' : '\n';
  const close = `${newline}---${newline}`;
  const end = content.indexOf(close, 4);

  if (end === -1)
    throw new Error('frontmatter is not closed');

  const block = content.slice(4, end).trim();
  const metadata = {};

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#'))
      continue;

    const index = trimmed.indexOf(':');

    if (index === -1)
      continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');

    if (key)
      metadata[key] = value;
  }

  return metadata;
}

function parseHeadingMetadata(content) {
  const lines = content.split(/\r?\n/);
  const metadata = {};
  const heading = lines.find((line) => line.trim().startsWith('# '));

  if (heading)
    metadata.name = heading.replace(/^#\s+/, '').trim();

  const description = lines
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));

  if (description)
    metadata.description = description;

  return metadata;
}

export function parseSkillMd(content) {
  const result = {
    metadata: {},
    warnings: []
  };

  try {
    const frontmatter = parseFrontmatter(content);

    if (frontmatter) {
      result.metadata = frontmatter;
      return result;
    }
  } catch (error) {
    result.warnings.push(error.message);
  }

  result.metadata = parseHeadingMetadata(content);
  return result;
}
