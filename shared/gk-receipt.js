/* G&K receipts and invoices: modern HTML ticket (80 mm) and A4 invoice, shared by Admin and Cuisine.
 *
 * Expected document shape (apps adapt their own orders to it):
 * { id, seq, createdAt, mode: "delivery"|"pickup", customerName, phone, address, zone, note, promo,
 *   items: [{ qty, name, size, extras[], unit }], subtotal, fee, discount, total,
 *   payment: "cash"|"card", status, deliveredAt }
 * seller: { name, address, phone, email }   logo: image URL (resolved against the page)
 */
const GKReceipt = (() => {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ESC[c]);
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
  const money = n => `${nf.format(Math.round((Number(n) || 0) * 100) / 100)} MAD`;
  const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const absUrl = url => { try { return new URL(url, location.href).href; } catch { return url || ""; } };

  const MODE = { delivery: "Livraison", pickup: "À emporter", dinein: "Sur place" };
  const itemName = item => {
    const label = typeof GKItemName !== "undefined" ? GKItemName.ticketName(item) : (item?.name || "");
    return String(label || "").toLocaleUpperCase("fr-FR");
  };
  const optionsOf = item => (item.extras || []).filter(Boolean).map(extra => esc(String(extra).toLocaleUpperCase("fr-FR"))).join(" · ");
  const invoiceNumber = doc => `FAC-${new Date(doc.createdAt).getFullYear()}-${String(doc.seq || String(doc.id).slice(-6)).padStart(5, "0")}`;

  const CSS = `
.gkr, .gkr * { box-sizing: border-box; }
.gkr { color: #111; font: 13px/1.45 "DM Sans", "Segoe UI", system-ui, -apple-system, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.gkr.ticket { width: 80mm; max-width: 100%; margin: 0 auto; background: #fff; }
.gkr .t-head { background: #111; color: #fff; text-align: center; padding: 16px 14px 14px; }
.gkr .t-logo { width: 64px; height: 64px; object-fit: contain; display: block; margin: 0 auto 6px; }
.gkr .t-brand { font-size: 20px; font-weight: 800; letter-spacing: .14em; color: #e3a81f; }
.gkr .t-sub { font-size: 11px; color: #d8d4c8; margin-top: 3px; }
.gkr .t-body { padding: 14px 14px 6px; }
.gkr .t-order { text-align: center; }
.gkr .t-order small { display: block; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #6f6a5d; }
.gkr .t-order strong { display: block; font-size: 30px; line-height: 1.1; font-weight: 800; letter-spacing: .02em; }
.gkr .chips { display: flex; justify-content: center; gap: 6px; margin: 8px 0 2px; flex-wrap: wrap; }
.gkr .chip { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #111; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.gkr .chip.light { background: #f1eee6; color: #111; }
.gkr .meta { text-align: center; font-size: 12px; color: #55514a; margin-top: 6px; }
.gkr .sep { border: 0; border-top: 2px dashed #bdb7a6; margin: 12px 0; }
.gkr .box { background: #f6f3ea; border-radius: 12px; padding: 9px 12px; font-size: 12px; }
.gkr .box b { display: block; font-size: 13px; }
.gkr .box span { display: block; color: #55514a; }
.gkr .lines { display: grid; gap: 9px; }
.gkr .line { display: grid; grid-template-columns: 30px 1fr auto; gap: 8px; align-items: start; }
.gkr .qty { display: grid; place-items: center; height: 24px; border-radius: 7px; background: #111; color: #fff; font-weight: 800; font-size: 12px; }
.gkr .line .name { font-weight: 700; }
.gkr .line .opts { display: block; font-size: 11px; color: #6f6a5d; font-weight: 400; }
.gkr .line .amt { font-weight: 700; white-space: nowrap; }
.gkr .note { margin-top: 10px; padding: 8px 10px; border-left: 4px solid #e3a81f; background: #fdf3d6; border-radius: 6px; font-size: 12px; }
.gkr .sum { display: grid; gap: 4px; font-size: 13px; }
.gkr .sum div { display: flex; justify-content: space-between; gap: 10px; }
.gkr .sum .muted { color: #55514a; }
.gkr .total { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding: 12px 14px; background: #111; color: #fff; border-radius: 14px; }
.gkr .total span { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #e3a81f; font-weight: 700; }
.gkr .total strong { font-size: 22px; font-weight: 800; }
.gkr .pay { margin-top: 10px; text-align: center; font-weight: 800; letter-spacing: .08em; font-size: 12px; padding: 8px; border: 2px solid #111; border-radius: 12px; text-transform: uppercase; }
.gkr .t-foot { text-align: center; padding: 8px 14px 18px; }
.gkr .t-foot b { display: block; font-size: 15px; }
.gkr .t-foot span { display: block; font-size: 11px; color: #6f6a5d; margin-top: 2px; }
.gkr .dup { text-align: center; font-weight: 800; letter-spacing: .2em; font-size: 11px; color: #c93a2d; margin-top: 6px; }

.gkr.invoice { width: 100%; max-width: 794px; margin: 0 auto; background: #fff; padding: 36px 40px; font-size: 13px; }
.gkr .i-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 18px; border-bottom: 4px solid #111; }
.gkr .i-brand { display: flex; align-items: center; gap: 14px; }
.gkr .i-brand img { width: 72px; height: 72px; object-fit: contain; background: #111; border-radius: 16px; padding: 6px; }
.gkr .i-brand strong { display: block; font-size: 22px; font-weight: 800; letter-spacing: .06em; }
.gkr .i-brand span { display: block; color: #55514a; font-size: 12px; }
.gkr .i-title { text-align: right; }
.gkr .i-title h1 { margin: 0; font-size: 30px; letter-spacing: .16em; font-weight: 800; }
.gkr .i-title .num { display: inline-block; margin-top: 6px; padding: 4px 12px; border-radius: 999px; background: #e3a81f; color: #111; font-weight: 800; letter-spacing: .04em; }
.gkr .i-title .when { margin-top: 6px; color: #55514a; font-size: 12px; }
.gkr .i-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 22px 0; }
.gkr .party { background: #f6f3ea; border-radius: 14px; padding: 14px 16px; }
.gkr .party h3 { margin: 0 0 6px; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #6f6a5d; }
.gkr .party b { font-size: 14px; }
.gkr .party span { display: block; color: #3d3a33; }
.gkr table.items { width: 100%; border-collapse: collapse; }
.gkr table.items th { background: #111; color: #fff; text-align: left; padding: 9px 12px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
.gkr table.items th:first-child { border-radius: 10px 0 0 10px; }
.gkr table.items th:last-child { border-radius: 0 10px 10px 0; }
.gkr table.items td { padding: 10px 12px; border-bottom: 1px solid #ece4d0; vertical-align: top; }
.gkr table.items .r { text-align: right; white-space: nowrap; }
.gkr table.items .opts { display: block; font-size: 11px; color: #6f6a5d; }
.gkr .i-bottom { display: flex; justify-content: space-between; gap: 24px; margin-top: 20px; align-items: flex-start; }
.gkr .i-note { flex: 1; font-size: 12px; color: #55514a; }
.gkr .i-note .stamp { display: inline-block; margin-bottom: 8px; padding: 5px 14px; border: 3px solid #1f8f55; color: #1f8f55; border-radius: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; transform: rotate(-4deg); }
.gkr .i-note .stamp.due { border-color: #c77a00; color: #c77a00; }
.gkr .i-totals { width: 280px; }
.gkr .i-foot { margin-top: 34px; padding-top: 14px; border-top: 2px dashed #bdb7a6; text-align: center; color: #6f6a5d; font-size: 12px; }
.gkr .i-foot b { color: #111; font-size: 14px; }
@media (max-width: 560px) { .gkr.invoice { padding: 18px; } .gkr .i-top, .gkr .i-bottom { flex-direction: column; } .gkr .i-title { text-align: left; } .gkr .i-parties { grid-template-columns: 1fr; } .gkr .i-totals { width: 100%; } }
`;
  const THERMAL_CSS = `
@page { size: 80mm auto; margin: 0; }
html, body { margin: 0; background: #fff; color: #000; }
.escpos-ticket { width: 80mm; padding: 3mm; color: #000; background: #fff; }
.escpos-logo { display: block; width: 32mm; margin: 0 auto 2mm; filter: grayscale(1) contrast(1.4) invert(1); }
.escpos-ticket pre { margin: 0; font: 12px/1.25 ui-monospace, Consolas, "Courier New", monospace; white-space: pre-wrap; color: #000; }
.escpos-foot svg { display: block; width: 100%; height: 10mm; margin-top: 2mm; fill: #000; stroke: #000; }
`;

  const paymentLabel = doc => doc.payment === "cash" ? "Espèces" : "Carte bancaire";

  function totalsRows(doc, cls = "") {
    return `<div class="sum ${cls}">
      <div class="muted"><span>Sous-total</span><span>${esc(money(doc.subtotal))}</span></div>
      ${doc.mode === "delivery" ? `<div class="muted"><span>Livraison</span><span>${doc.fee ? esc(money(doc.fee)) : "Offerte"}</span></div>` : ""}
      ${doc.discount ? `<div class="muted"><span>Promo${doc.promo ? ` ${esc(doc.promo)}` : ""}</span><span>− ${esc(money(doc.discount))}</span></div>` : ""}
    </div>`;
  }

  function ticket(doc, { seller = {}, logo = "", reprint = false } = {}) {
    const at = new Date(doc.createdAt || Date.now());
    const addr = doc.mode === "delivery" && doc.address ? `<span>${esc(doc.address)}${doc.zone ? ` · ${esc(doc.zone)}` : ""}</span>` : "";
    const paid = doc.payment === "cash"
      ? `Espèces · à encaisser ${esc(money(doc.total))}`
      : "Payé par carte";
    return `<div class="gkr ticket">
      <div class="t-head">${logo ? `<img class="t-logo" src="${esc(absUrl(logo))}" alt="">` : ""}
        <div class="t-brand">${esc((seller.name || "G&K Food").toUpperCase())}</div>
        <div class="t-sub">${[seller.address, seller.phone].filter(Boolean).map(esc).join(" · ")}</div></div>
      <div class="t-body">
        <div class="t-order"><small>Commande</small><strong>#${esc(doc.id)}</strong></div>
        <div class="chips"><span class="chip">${MODE[doc.mode] || esc(doc.mode)}</span><span class="chip light">${esc(paymentLabel(doc))}</span></div>
        <div class="meta">${esc(shortDate.format(at))} · ${esc(timeFmt.format(at))}</div>
        ${reprint ? `<div class="dup">DUPLICATA</div>` : ""}
        <hr class="sep">
        <div class="box"><b>${esc(doc.customerName || "Client")}</b>${doc.phone ? `<span>${esc(doc.phone)}</span>` : ""}${addr}</div>
        <hr class="sep">
        <div class="lines">${(doc.items || []).map(item => `<div class="line"><div class="qty">${esc(item.qty)}×</div><div class="name">${esc(itemName(item))}${optionsOf(item) ? `<span class="opts">${optionsOf(item)}</span>` : ""}</div><div class="amt">${esc(money(item.qty * item.unit))}</div></div>`).join("")}</div>
        ${doc.note ? `<div class="note"><b>Note :</b> ${esc(doc.note)}</div>` : ""}
        <hr class="sep">
        ${totalsRows(doc)}
        <div class="total"><span>Total</span><strong>${esc(money(doc.total))}</strong></div>
        <div class="pay">${paid}</div>
      </div>
      <div class="t-foot"><b>Merci et bon appétit !</b><span>${esc(seller.name || "G&K Food")} · ${esc([seller.phone, seller.email].filter(Boolean).join(" · "))}</span></div>
    </div>`;
  }

  function invoice(doc, { seller = {}, logo = "" } = {}) {
    const at = new Date(doc.createdAt || Date.now());
    const paid = doc.status === "livree" || doc.payment === "card";
    return `<div class="gkr invoice">
      <div class="i-top">
        <div class="i-brand">${logo ? `<img src="${esc(absUrl(logo))}" alt="">` : ""}<div><strong>${esc(seller.name || "G&K Food")}</strong><span>${esc(seller.address || "")}</span><span>${[seller.phone, seller.email].filter(Boolean).map(esc).join(" · ")}</span></div></div>
        <div class="i-title"><h1>FACTURE</h1><span class="num">${esc(invoiceNumber(doc))}</span><div class="when">Émise le ${esc(dateFmt.format(at))}</div></div>
      </div>
      <div class="i-parties">
        <div class="party"><h3>Émetteur</h3><b>${esc(seller.name || "G&K Food")}</b>${seller.address ? `<span>${esc(seller.address)}</span>` : ""}${seller.phone ? `<span>${esc(seller.phone)}</span>` : ""}${seller.email ? `<span>${esc(seller.email)}</span>` : ""}</div>
        <div class="party"><h3>Facturé à</h3><b>${esc(doc.customerName || "Client")}</b>${doc.phone ? `<span>${esc(doc.phone)}</span>` : ""}${doc.mode === "delivery" && doc.address ? `<span>${esc(doc.address)}${doc.zone ? ` · ${esc(doc.zone)}` : ""}</span>` : `<span>Retrait au restaurant</span>`}<span>Commande #${esc(doc.id)} · ${MODE[doc.mode] || esc(doc.mode)}</span></div>
      </div>
      <table class="items"><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr></thead><tbody>
        ${(doc.items || []).map(item => `<tr><td>${esc(itemName(item))}${optionsOf(item) ? `<span class="opts">${optionsOf(item)}</span>` : ""}</td><td class="r">${esc(item.qty)}</td><td class="r">${esc(money(item.unit))}</td><td class="r"><b>${esc(money(item.qty * item.unit))}</b></td></tr>`).join("")}
      </tbody></table>
      <div class="i-bottom">
        <div class="i-note"><span class="stamp ${paid ? "" : "due"}">${paid ? "Payée" : "À régler"}</span><div>Mode de paiement : <b>${esc(paymentLabel(doc))}</b></div>${doc.note ? `<div>Note : ${esc(doc.note)}</div>` : ""}<div>Montants exprimés en dirhams marocains (MAD).</div></div>
        <div class="i-totals">${totalsRows(doc)}<div class="total"><span>Total</span><strong>${esc(money(doc.total))}</strong></div></div>
      </div>
      <div class="i-foot"><b>Merci pour votre confiance !</b><div>${esc(seller.name || "G&K Food")}${seller.address ? ` · ${esc(seller.address)}` : ""}</div></div>
    </div>`;
  }

  const dh = n => `${Math.round(Number(n) || 0)} DH`;
  const pad = (left, right, cols = 42) => {
    const l = String(left);
    const r = String(right);
    const room = Math.max(1, cols - r.length);
    const head = l.length >= room ? l.slice(0, Math.max(1, room - 1)) : l;
    return `${head}${"".padEnd(Math.max(1, room - head.length), ".")}${r}`;
  };
  const rule = (cols = 42) => "-".repeat(cols);

  function cloture(report, { seller = {}, logo = "" } = {}) {
    const at = new Date(report.dayStart || Date.now());
    const printed = new Date(report.printedAt || Date.now());
    const cols = 42;
    const center = text => {
      const s = String(text);
      const space = Math.max(0, Math.floor((cols - s.length) / 2));
      return `${" ".repeat(space)}${s}`;
    };
    const lines = [
      center((seller.name || "G&K FOOD").toLocaleUpperCase("fr-FR")),
      center("CLOTURE"),
      center(shortDate.format(at)),
      `Date : ${shortDate.format(at)}`,
      `Heure : ${timeFmt.format(printed)}`,
      rule(cols),
      pad("LIVRAISON", `${Number(report.byMode?.delivery?.count || 0)}  ${dh(report.byMode?.delivery?.total)}`, cols),
      pad("EMPORTE", `${Number(report.byMode?.pickup?.count || 0)}  ${dh(report.byMode?.pickup?.total)}`, cols),
      pad("SUR PLACE", `${Number(report.byMode?.dinein?.count || 0)}  ${dh(report.byMode?.dinein?.total)}`, cols),
      rule(cols),
      pad("COMMANDES", String(Number(report.orders || 0)), cols)
    ];
    if (report.cancelled) lines.push(pad("ANNULEES / REFUSEES", String(Number(report.cancelled)), cols));
    const staff = report.byStaff || [];
    if (staff.length) {
      lines.push(rule(cols), pad("PAR PERSONNE", "CA", cols));
      staff.forEach(entry => {
        const tag = entry.role === "waiter" ? "SRV " : entry.role === "cashier" ? "CAI " : "";
        lines.push(pad(`${tag}${String(entry.name || "Personnel")}`.toLocaleUpperCase("fr-FR"), `${Number(entry.count || 0)}  ${dh(entry.total)}`, cols));
      });
    }
    lines.push(rule(cols), pad("CATEGORIES", "QTE", cols));
    const categories = report.categories || report.products || [];
    if (!categories.length) lines.push("AUCUNE VENTE");
    else categories.forEach(item => lines.push(pad(String(item.name || "").toLocaleUpperCase("fr-FR"), String(item.qty), cols)));
    lines.push(rule(cols), pad("TOTAL", dh(report.total), cols));
    const logoImg = logo ? `<img class="escpos-logo" alt="G&amp;K" src="${esc(absUrl(logo))}" />` : "";
    return `<div class="escpos-ticket" style="width:80mm">${logoImg}<pre>${esc(lines.join("\n"))}</pre>
      <div class="escpos-foot"><svg viewBox="0 0 240 32" aria-hidden="true"><path fill="none" stroke="#000" stroke-width="1.3" d="M6 6h228M12 10h216"/><path fill="#000" d="M28 22 36 12l8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10zm32 0 8-10 8 10-8 10z"/></svg></div>
    </div>`;
  }

  // Prints inside an isolated iframe so app styles never leak into the document.
  function print(html, { title = "G&K", page = "80mm auto", margin = "0", css } = {}) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${page};margin:${margin}}html,body{margin:0;background:#fff;color:#000}${css || CSS}</style></head><body>${html}</body></html>`);
    doc.close();
    const run = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60000);
    };
    let started = false;
    const start = () => { if (!started) { started = true; run(); } };
    const images = [...doc.images].filter(img => !img.complete);
    if (!images.length) setTimeout(start, 80);
    else {
      let left = images.length;
      const done = () => { if (--left <= 0) start(); };
      images.forEach(img => { img.onload = done; img.onerror = done; });
      setTimeout(start, 2500);
    }
  }

  const page = body => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>html,body{margin:0;background:#ecebe7}body{padding:14px}${CSS}</style></head><body>${body}</body></html>`;
  const thermalPage = body => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}body{padding:8px}${THERMAL_CSS}</style></head><body>${body}</body></html>`;
  // Previews run in an iframe so the host app's CSS can never alter the document.
  const preview = html => `<iframe class="gkr-preview" title="Aperçu" style="width:100%;height:420px;border:0;border-radius:10px;background:#ecebe7" srcdoc="${esc(page(html))}" onload="try{this.style.height=this.contentDocument.documentElement.scrollHeight+'px'}catch(e){}"></iframe>`;
  const previewThermal = html => `<iframe class="gkr-preview" title="Aperçu" style="width:100%;height:420px;border:0;border-radius:10px;background:#fff" srcdoc="${esc(thermalPage(html))}" onload="try{this.style.height=this.contentDocument.documentElement.scrollHeight+'px'}catch(e){}"></iframe>`;

  return {
    css: CSS,
    ticket, invoice, invoiceNumber, money,
    previewTicket: (doc, opts) => preview(ticket(doc, opts)),
    previewInvoice: (doc, opts) => preview(invoice(doc, opts)),
    previewCloture: (report, opts) => previewThermal(cloture(report, opts)),
    printTicket: (doc, opts) => print(ticket(doc, opts), { title: `Ticket ${doc.id}`, page: "80mm auto", margin: "0" }),
    printInvoice: (doc, opts) => print(invoice(doc, opts), { title: invoiceNumber(doc), page: "A4", margin: "10mm" }),
    printCloture: (report, opts) => print(cloture(report, opts), { title: "Cloture", page: "80mm auto", margin: "0", css: THERMAL_CSS })
  };
})();
