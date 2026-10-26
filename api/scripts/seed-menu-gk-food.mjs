// Loads the G&K Food (main branch) menu. Re-running replaces this branch's menu: node scripts/seed-menu-gk-food.mjs
// Prices are in MAD. For sized items "price" is the smallest size and each size carries its supplement.
import postgres from "postgres";

const BRANCH = "gk-food";
const url = process.env.GK_DATABASE_URL;
if (!url) throw new Error("Set GK_DATABASE_URL in the private environment first.");

const sized = (names, prices) => ({ price: prices[0], sizes: names.map((name, i) => ({ name, delta: prices[i] - prices[0] })) });

const MENU = [
  ["Salades", "", [
    ["Niçoise", 39], ["César", 52], ["Pêcheur", 59]]],
  ["Sandwichs", "Servi avec frites.", [
    ["Thon", 33], ["Poulet César", 39], ["Viande hachée", 45],
    ["Mixte", 45, "Poulet et viande hachée"], ["Monstre", 50, "Jambon, viande hachée et omelette"]]],
  ["Tacos", "Servi avec frites.", [
    ["Poulet", sized(["L", "XL"], [47, 73])], ["Viande hachée", sized(["L", "XL"], [52, 78])],
    ["Mixte", sized(["L", "XL"], [55, 81]), "Poulet et viande hachée"], ["Nugget", sized(["L", "XL"], [55, 81])],
    ["Cordon bleu", sized(["L", "XL"], [59, 85])], ["Royal", sized(["L", "XL"], [59, 85]), "Crevette et calamar"]]],
  ["Pasticcio", "", [
    ["Charcuterie", 45], ["Poulet", 46], ["Nugget", 52], ["Viande hachée", 52],
    ["Mixte", 52, "Poulet et viande hachée"], ["Fruits de mer", 59, "Crevette et calamar"]]],
  ["Pâtes", "Penne ou tagliatelle.", [
    ["Carbonara", 55], ["Végétarienne", 52], ["Arrabiata", 50], ["Bolognaise", 59],
    ["Poulet champignon", 55], ["Fruits de mer", 65]]],
  ["Burgers", "Servi avec frites.", [
    ["Chicken Burger", 49], ["Cheese Burger", 55], ["Cordon Blue", 59], ["Double Cheese", 72], ["Double Chicken", 65]]],
  ["Plats", "Accompagnement : légumes, pâtes et frites.", [
    ["Émincé de poulet", 78], ["Brochette viande hachée", 78], ["Brochette poulet", 78],
    ["Brochette mixte", 78], ["Cordon bleu", 78]]],
  ["Pizzas", "", [
    ["Margarita", sized(["P", "M", "G"], [33, 46, 65])], ["Végétarienne", sized(["P", "M", "G"], [39, 52, 72])],
    ["Thon", sized(["P", "M", "G"], [39, 52, 72])], ["Poulet", sized(["P", "M", "G"], [39, 52, 72])],
    ["Viande hachée", sized(["P", "M", "G"], [49, 65, 78])], ["Charcuterie", sized(["P", "M", "G"], [46, 59, 78])],
    ["Fruits de mer", sized(["P", "M", "G"], [65, 78, 91])], ["Quatre saisons", sized(["P", "M", "G"], [65, 78, 91])],
    ["Péperone", sized(["P", "M", "G"], [65, 78, 91])], ["Quatre fromages", sized(["P", "M", "G"], [65, 78, 91])]]],
  ["Desserts", "", [
    ["Tiramisu", 27]]],
  ["Boissons", "", [
    ["Eau minérale 33 cl", 5], ["Eau minérale 50 cl", 7], ["Eau minérale 1,5 L", 13], ["Boisson gazeuse", 9]]],
  ["Jus", "", [
    ["Jus d'orange", 25], ["Jus de pomme", 25], ["Jus de banane", 25], ["Jus de mangue", 29], ["Jus d'ananas", 29],
    ["Jus d'avocat", 30], ["Jus d'avocat orange", 30], ["Jus de dragon", 35], ["Jus panaché", 30]]]
];

const slug = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sql = postgres(url, { max: 1, prepare: false });
try {
  const counts = await sql.begin(async (tx) => {
    await tx`SELECT set_config('gk.actor_id', '', true), set_config('gk.actor_role', 'admin', true), set_config('gk.branch_id', ${BRANCH}, true)`;
    const used = await tx`SELECT count(*)::int AS n FROM public.orders WHERE branch_id = ${BRANCH}`;
    if (used[0].n) throw new Error("This branch already has orders; edit its menu from the Admin app instead.");
    await tx`DELETE FROM public.menu_items WHERE branch_id = ${BRANCH}`;
    await tx`DELETE FROM public.menu_categories WHERE branch_id = ${BRANCH}`;
    let items = 0, stamp = Date.now();
    for (const [position, [name, note, rows]] of MENU.entries()) {
      const categoryId = `c_${BRANCH}_${slug(name)}`;
      await tx`INSERT INTO public.menu_categories (id, branch_id, name, position) VALUES (${categoryId}, ${BRANCH}, ${name}, ${position + 1})`;
      for (const [itemName, priceOrSized, detail = ""] of rows) {
        const { price, sizes } = typeof priceOrSized === "number" ? { price: priceOrSized, sizes: [] } : priceOrSized;
        const description = [detail, note].filter(Boolean).join(" · ");
        stamp += 1;
        await tx`INSERT INTO public.menu_items (id, branch_id, category_id, name, description, price, discount, sizes, extras, image_url, available, visible, created_at, updated_at)
          VALUES (${`p_${BRANCH}_${slug(name)}_${slug(itemName)}`}, ${BRANCH}, ${categoryId}, ${itemName}, ${description}, ${price}, 0, ${JSON.stringify(sizes)}, '[]', '', 1, 1, ${stamp}, ${stamp})`;
        items += 1;
      }
    }
    return { categories: MENU.length, items };
  });
  console.log(`Loaded ${counts.items} items in ${counts.categories} categories for ${BRANCH}.`);
} finally {
  await sql.end();
}
