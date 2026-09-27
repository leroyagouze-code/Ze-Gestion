export const PAGE_SIZE = 25;

export function pageParams(page?: number | string | null, size = PAGE_SIZE) {
  const p = Math.max(1, Number(page) || 1);
  return { limit: size, offset: (p - 1) * size, page: p };
}

export type Paged<T> = { rows: T[]; total: number; page: number; pageSize: number };
