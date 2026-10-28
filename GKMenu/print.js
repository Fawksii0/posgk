(() => {
  "use strict";
  const MENU_URL = "https://menu.gkfood.store/";
  const grid = document.querySelector("#grid");
  const printBtn = document.querySelector("#print");
  printBtn.addEventListener("click", () => window.print());

  function card(n) {
    const url = `${MENU_URL}?table=${n}`;
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(url)}`;
    return `<article class="card">
      <img src="./assets/emblem-reference.png" alt="" class="mark" width="36" height="36">
      <strong>Table ${n}</strong>
      <img class="qr" src="${qr}" alt="QR table ${n}" width="200" height="200">
      <p>Scannez pour commander</p>
      <small>${url}</small>
    </article>`;
  }

  async function load() {
    const tables = window.GKTables?.list("gk-food") || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    grid.innerHTML = tables.map(card).join("");
  }

  load();
})();
