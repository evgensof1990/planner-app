// The goal tree from «Путь к Точке Б» turned into projects, quarter sections and tasks.
// Fixed ids make the import safe to run again: only what is missing gets added.
const Q = [
  ['q0', 'Ноя–дек 2026', '2026-12-31'],
  ['q1', 'Q1 2027', '2027-03-31'],
  ['q2', 'Q2 2027', '2027-06-30'],
  ['q3', 'Q3 2027', '2027-09-30'],
  ['q4', 'Q4 2027', '2027-12-31'],
];

const PROJECTS = [
  {
    id: 'goal-biz',
    name: 'Бизнес: посуточная аренда',
    emoji: '🏢',
    area: 'personal',
    description: 'К 2031: ~18 объектов, из них ~12 премиум; чистыми ~200 тыс./мес; участие ≤ 10 ч/нед. 2027: уборки не делаю сам, +3 премиум-объекта, доход УК ~70 тыс./мес',
    goals: {
      q0: ['Посчитать чистую прибыль каждого объекта за год', 'Собрать 5 цен на уборку', 'Решить, что делегируем первым'],
      q1: ['Уборки на наёмном человеке хотя бы на половине объектов', 'Поднять цену или ввести сбор за уборку'],
      q2: ['Упаковка для собственников: сайт или презентация, кейсы, договор', '+1–2 премиум-объекта к сезону'],
      q3: ['Сезон без моих рук на уборках', '+1–2 премиум-объекта'],
      q4: ['Итог года по каждому объекту', 'План найма управляющего на 2028'],
    },
  },
  {
    id: 'goal-fin',
    name: 'Финансы',
    emoji: '💰',
    area: 'personal',
    description: '2027: пристройка оплачена (1,5 млн), отпуск 300 тыс., подушка ≥ 600 тыс., в ВТБ 20 тыс./мес без пропусков',
    goals: {
      q0: ['Закрыть кредит Т-Банка', 'Отпуск: 30 тыс. за ноябрь–декабрь'],
      q1: ['Премия февраля: 180 тыс. на отпуск', 'Пристройка: 219 тыс. к марту'],
      q2: ['Первый платёж строителям 400 тыс. в июне', 'Отпуск 300 тыс. собран'],
      q3: ['Платёж строителям 550 тыс. в августе (премия)'],
      q4: ['Платежи строителям 250 и 300 тыс.', 'План первого взноса за дом: ~140 тыс./мес с января 2028'],
    },
  },
  {
    id: 'goal-home',
    name: 'Дом и семья',
    emoji: '🏡',
    area: 'personal',
    description: '2027: участок узаконен, пристройка с детскими готова к декабрю; копилки детям 2% / 0,5% / 0,5%; семейный отпуск в июле',
    goals: {
      q0: ['Узаконивание участка: следующий официальный этап'],
      q1: ['Договор со строителем и смета'],
      q2: ['Старт стройки'],
      q3: ['Семейный отпуск в июле'],
      q4: ['Пристройка сдана, дети в своих комнатах'],
    },
  },
  {
    id: 'goal-self',
    name: 'Здоровье и развитие',
    emoji: '🧘',
    area: 'personal',
    description: '2027: спорт 3 раза в неделю, чекап, отбой и подъём в одно время; 4 хобби на пробу, по одной книге или курсу про управление в квартал',
    goals: {
      q0: ['Выбрать спорт на зиму, 3 раза в неделю'],
      q1: ['Хобби № 1 на пробу', 'Чекап', 'Книга или курс про управление'],
      q2: ['Хобби № 2', 'Книга или курс про управление'],
      q3: ['Хобби № 3', 'Книга или курс про управление'],
      q4: ['Хобби № 4 и выбор одного на 2028', 'Книга или курс про управление'],
    },
  },
];

// Concrete steps and money routines
const STEPS = [
  { id: 'goal-s-profit', projectId: 'goal-biz', title: 'Выгрузить доходы и расходы по объектам за октябрь, посчитать прибыль с каждого', date: '2026-11-03', time: '18:00', duration: 60, priority: 3 },
  { id: 'goal-s-avito', projectId: 'goal-biz', title: 'Написать 5 исполнительницам на Авито по готовому тексту', date: '2026-11-05', time: '09:00', duration: 20, priority: 2 },
  { id: 'goal-s-land', projectId: 'goal-home', title: 'Узнать статус заявления по участку и следующий шаг', deadline: '2026-11-06', duration: 30 },
  { id: 'goal-r-vacation', projectId: 'goal-fin', title: 'Перевести 15 тыс. со «Слоя 2» на «Отпуск»', date: '2026-11-05', repeat: 'monthly', duration: 15 },
  { id: 'goal-r-kids', projectId: 'goal-fin', title: 'Доплатить в копилки Агате и Радомиру (по 510 ₽)', date: '2026-11-05', repeat: 'monthly', duration: 15 },
  { id: 'goal-r-vtb', projectId: 'goal-fin', title: 'Взнос в капитал ВТБ: 12 тыс. (с января 20 тыс.)', date: '2026-11-05', repeat: 'monthly', duration: 15 },
  { id: 'goal-r-fdr', projectId: 'goal-fin', title: 'Итог месяца по ФДР: остаток перевести на «Пристройку»', date: '2026-11-30', repeat: 'monthly', duration: 30 },
  { id: 'goal-r-review', projectId: 'goal-self', title: 'Обзор недели: что сделано, светофор финансов, 3–5 задач на следующую неделю', date: '2026-10-30', time: '17:00', duration: 30, repeat: 'weekly', priority: 3 },
];

export const GOAL_HABITS = [{ id: 'goal-h-sport', name: 'Утренняя тренировка', emoji: '🏋️', color: '#5cc97b', log: {}, createdAt: '2026-11-02' }];

export function goalsPlan() {
  const projects = PROJECTS.map(({ goals, ...p }) => ({
    view: 'list',
    archived: false,
    sort: 'manual',
    ...p,
    sections: Q.map(([k, name]) => ({ id: `${p.id}-${k}`, name })),
  }));
  const tasks = [];
  let order = 1;
  for (const p of PROJECTS)
    for (const [k, , end] of Q)
      (p.goals[k] || []).forEach((title, i) => tasks.push({ id: `${p.id}-${k}-${i}`, projectId: p.id, sectionId: `${p.id}-${k}`, title, deadline: end, order: order++ }));
  STEPS.forEach((s) => tasks.push({ ...s, order: order++ }));
  return { projects, tasks, habits: GOAL_HABITS };
}
