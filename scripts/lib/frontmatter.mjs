// Front matter parsing.
//
// Every documentation page in telecraft-dev/telecraft carries YAML front
// matter of `title`, `description`, and `order`. Pages listed in the
// `pages` block of nav.yaml can carry their metadata there instead, so a
// missing block is not an error here: the caller decides what it needs.

import { parse as parseYaml } from 'yaml';

const FENCE = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split a Markdown source into its front matter and its body.
 *
 * @param {string} source Raw file contents.
 * @returns {{data: Record<string, unknown>, body: string}}
 */
export function splitFrontMatter(source) {
  const match = FENCE.exec(source);
  if (!match) return { data: {}, body: stripBom(source) };

  const data = parseYaml(match[1]);
  if (data !== null && typeof data !== 'object') {
    throw new Error('front matter must be a YAML mapping');
  }
  return { data: data ?? {}, body: source.slice(match[0].length) };
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
