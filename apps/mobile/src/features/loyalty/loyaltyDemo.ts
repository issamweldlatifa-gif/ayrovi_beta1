// Preview values only; never used to grant account points or change checkout.
export const missions = [
  { id: 'birthday', points: 10, image: 'gift' },
  { id: 'newsletter', points: 20, image: 'style' },
  { id: 'notifications', points: 20, image: 'banner' },
  { id: 'sizes', points: 50, image: 'style' },
  { id: 'sports', points: 20, image: 'banner' },
  { id: 'resale', points: 50, image: 'gift' },
] as const;
export const levels = [{ id: 'light', minimum: 0 }, { id: 'shine', minimum: 100 }, { id: 'star', minimum: 200 }] as const;
export const rewards = [
  { id: 'partners', level: 0, image: 'style' }, { id: 'offers', level: 1, image: 'gift' },
  { id: 'delivery', level: 1, image: 'style' }, { id: 'express', level: 2, image: 'style' },
  { id: 'support', level: 2, image: 'style' }, { id: 'priority', level: 2, image: 'banner' }, { id: 'events', level: 2, image: 'gift' },
  { id: 'restock', level: 2, image: 'banner' },
] as const;
export const privateRewards = [
  { id: 'privateOffers', level: 1, image: 'gift' }, { id: 'earlyOffers', level: 2, image: 'style' },
] as const;
export type Mission = typeof missions[number];
export type Reward = typeof rewards[number] | typeof privateRewards[number];
export type LoyaltyDemo = { completed: readonly Mission['id'][]; purchase: 'none' | 'pending' | 'confirmed' | 'returned'; booster: boolean };
export const emptyDemo: LoyaltyDemo = { completed: [], purchase: 'none', booster: false };
export const samplePurchasePoints = 40;
export const sampleBoosterPoints = 20;
export type DemoAction = { type: 'mission'; id: Mission['id'] } | { type: 'booster' | 'purchase' | 'confirm' | 'return' | 'reset' };
export function updateDemo(state: LoyaltyDemo, action: DemoAction): LoyaltyDemo {
  switch (action.type) {
    case 'mission': return state.completed.includes(action.id) ? state : { ...state, completed: [...state.completed, action.id] };
    case 'booster': return !state.booster && state.purchase === 'none' ? { ...state, booster: true } : state;
    case 'purchase': return state.purchase === 'none' ? { ...state, purchase: 'pending' } : state;
    case 'confirm': return state.purchase === 'pending' ? { ...state, purchase: 'confirmed' } : state;
    case 'return': return state.purchase === 'pending' ? { ...state, purchase: 'returned' } : state;
    case 'reset': return emptyDemo;
  }
}
export function loyaltyProgress(state: LoyaltyDemo) {
  const purchasePoints = samplePurchasePoints + (state.booster ? sampleBoosterPoints : 0);
  const points = missions.reduce((sum, mission) => sum + (state.completed.includes(mission.id) ? mission.points : 0), 0) +
    (state.purchase === 'confirmed' ? purchasePoints : 0);
  const pending = state.purchase === 'pending' ? purchasePoints : 0;
  const index = points >= levels[2].minimum ? 2 : points >= levels[1].minimum ? 1 : 0;
  const level = levels[index]!;
  const next = levels[index + 1];
  return { points, pending, purchasePoints, index, level, next, progress: next ? (points - level.minimum) / (next.minimum - level.minimum) : 1 };
}
