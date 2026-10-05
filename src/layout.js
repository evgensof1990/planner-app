// Configurable parts of the interface: sidebar items, toolbar buttons, themes.
export const SIDE_ITEMS = [
  ['inbox', 'Входящие', 'inbox'],
  ['today', 'Сегодня', 'star'],
  ['plans', 'Планы', 'calendar'],
  ['calendar', 'Календарь', 'grid'],
  ['habits', 'Привычки', 'habit'],
  ['filter', 'Фильтр', 'filter'],
  ['tags', 'Теги', 'tag'],
  ['noproject', 'Без проекта', 'noProject'],
  ['someday', 'Когда-нибудь', 'someday'],
  ['archive', 'Архив', 'restore'],
  ['trash', 'Корзина', 'trash'],
];

export const TOOL_ITEMS = [
  ['search', 'Поиск', 'search'],
  ['calendar', 'Календарь', 'calendar'],
  ['pomo', 'Помодоро', 'timer'],
  ['notifications', 'Уведомления', 'bell'],
  ['habits', 'Привычки', 'habit'],
  ['filter', 'Фильтр', 'filter'],
  ['tags', 'Теги', 'tag'],
  ['settings', 'Настройки', 'settings'],
];
// shown when the toolbar is collapsed
export const TOOL_SHORT = new Set(['search', 'calendar', 'pomo', 'notifications']);

export const THEMES = [
  ['cosmos', 'Космос', '#0b0a17', '#24233f', '#e8e8f2'],
  ['normal', 'Обычная', '#1e1f22', '#393a40', '#e6e6e8'],
  ['dark', 'Тёмная', '#101010', '#2c2c2c', '#e9e9e9'],
  ['light', 'Светлая', '#ffffff', '#dedee5', '#1c1c22'],
  ['gray', 'Серая', '#ececef', '#cbcbd2', '#1c1c22'],
];

export const ACCENTS = ['#4aa8ff', '#f5c932', '#f0574f', '#f08a2c', '#4cc764', '#a984f0', '#d84ff0'];
export const DEFAULT_ACCENT = '#a984f0';

export const isHidden = (list, key) => (list || []).includes(key);
