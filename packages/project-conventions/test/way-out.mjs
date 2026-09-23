// REQ-RELEASE-039
const COMMAND = /\b(?:conventions|release|mise run|git) [a-z][a-z-]*/;
const KEY = /(?:^|\s|«|`)--[a-z][a-z-]+/;
const IMPERATIVE = /(?:^|[\s:;—«(])[а-яё]+(?:ите|йте|ьте)(?=[\s,.:;»)]|$)/iu;

// REQ-RELEASE-039
export function namesAWayOut(text) {
  return COMMAND.test(text) || KEY.test(text) || IMPERATIVE.test(text);
}
