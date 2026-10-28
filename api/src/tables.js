const GROUPS = {
  "gk-food": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
};

export function tableAllowed(branchId, table, fallbackCount = 17) {
  const n = Number(table);
  if (!Number.isInteger(n) || n < 1 || n > 80) return false;
  if (GROUPS[branchId]) return GROUPS[branchId].includes(n);
  const max = Number(fallbackCount) || 17;
  return n >= 1 && n <= max;
}
