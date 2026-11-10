import { tagsWithCommits } from '../release/git.mjs';

// REQ-STORE-019
const TAG_OF = { semver: /^v\d+\.\d+\.\d+$/, date: /^\d{4}\.\d{2}\.\d+$/ };

const parts = (tag) => tag.replace(/^v/, '').split('.').map(Number);

function later(one, other) {
  const [left, right] = [parts(one), parts(other)];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (right[index] ?? 0) - (left[index] ?? 0);
  }
  return 0;
}

// REQ-STORE-019
export async function releaseTags(root, scheme) {
  return (await tagsWithCommits(root)).filter((one) => TAG_OF[scheme].test(one.tag)).sort((one, other) => later(one.tag, other.tag));
}

// REQ-RELEASE-036, REQ-STORE-019
export async function previousTag(root, scheme, openTag) {
  return (await releaseTags(root, scheme)).find((one) => one.tag !== openTag)?.tag ?? null;
}
