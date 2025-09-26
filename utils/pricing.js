export const PRICE_TABLE = {
  basic:    { month:  24900, year:  24900 * 12 * 0.85 | 0 }, // 연 15% 할인
  standard: { month:  69900, year:  69900 * 12 * 0.85 | 0 },
  pro:      { month: 176000, year: 176000 * 12 * 0.85 | 0 },
};

export function resolvePlan(plan) {
  const key = String(plan || '').toLowerCase();
  if (key === 'premium') return 'pro'; // 혹시 모를 호환성
  return ['basic','standard','pro'].includes(key) ? key : 'standard'; // standard를 기본값으로
}

export function resolveCycle(cycle) {
  const key = String(cycle || '').toLowerCase();
  return ['month','year'].includes(key) ? key : 'month';
}

export function getPrice(plan, cycle) {
  const p = resolvePlan(plan);
  const c = resolveCycle(cycle);
  return PRICE_TABLE[p][c];
}