import { findProseComments } from './comments.mjs';
import { findSystemClockUses } from './clock.mjs';

export const RULES = [
  {
    id: 'comments',
    title: 'пояснительных комментариев',
    find: findProseComments,
  },
  {
    id: 'clock',
    title: 'обращений к системным часам',
    find: findSystemClockUses,
  },
];
