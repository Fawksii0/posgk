(() => {
  "use strict";

  const GROUPS = {
    "gk-food": [
      [1, 2, 3, 4],
      [5, 6, 7, 8, 9, 10, 11],
      [12, 13, 14, 15, 16, 17]
    ]
  };

  function groups(branchId, fallbackCount) {
    if (GROUPS[branchId]) return GROUPS[branchId];
    const count = Math.max(1, Math.min(80, Number(fallbackCount) || 17));
    const rows = [];
    for (let n = 1; n <= count; n += 4) {
      const row = [];
      for (let i = n; i < n + 4 && i <= count; i += 1) row.push(i);
      rows.push(row);
    }
    return rows;
  }

  function list(branchId, fallbackCount) {
    return groups(branchId, fallbackCount).flat();
  }

  function has(branchId, table, fallbackCount) {
    return list(branchId, fallbackCount).includes(Number(table));
  }

  window.GKTables = Object.freeze({ groups, list, has });
})();
