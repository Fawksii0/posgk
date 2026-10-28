/* Category + product + size: "Sandwich Thon", "Pizza Fruits de Mer M". */
(function (root) {
  const PREFIX = {
    Sandwichs: "Sandwich",
    Salades: "Salade",
    Pizzas: "Pizza",
    Burgers: "Burger",
    Desserts: "Dessert",
    Boissons: "Boisson",
    Plats: "Plat",
    Tacos: "Tacos",
    Jus: "Jus",
    Pasticcio: "Pasticcio",
    "Pâtes": "Pâtes",
    Pates: "Pâtes"
  };
  const SLUG_CAT = {
    sandwichs: "Sandwichs",
    tacos: "Tacos",
    pizzas: "Pizzas",
    salades: "Salades",
    pasticcio: "Pasticcio",
    pates: "Pâtes",
    burgers: "Burgers",
    plats: "Plats",
    desserts: "Desserts",
    boissons: "Boissons",
    jus: "Jus",
    tajines: "Tajines"
  };

  function categoryPrefix(category) {
    const cat = String(category || "").trim();
    if (!cat) return "";
    return PREFIX[cat] || cat.replace(/s$/i, "");
  }

  function categoryFromId(id) {
    const parts = String(id || "").split("_");
    if (parts[0] !== "p" || parts.length < 3) return "";
    return SLUG_CAT[parts[parts.length - 2]] || "";
  }

  function labeledName(name, category) {
    const product = String(name || "").trim();
    const prefix = categoryPrefix(category);
    if (!product) return prefix;
    if (!prefix) return product;
    const lower = product.toLowerCase();
    if (lower.startsWith(prefix.toLowerCase()) || lower.startsWith(String(category).trim().toLowerCase())) return product;
    return `${prefix} ${product}`;
  }

  function fromItem(item) {
    if (!item) return "";
    const category = item.category || item.categoryName || categoryFromId(item.id);
    return labeledName(item.name, category);
  }

  function ticketName(item) {
    const label = fromItem(item);
    const size = String(item?.size || "").trim();
    if (!size) return label;
    if (label.toLowerCase().endsWith(` ${size.toLowerCase()}`)) return label;
    return `${label} ${size}`;
  }

  root.GKItemName = { labeledName, fromItem, ticketName, categoryFromId, categoryPrefix };
})(typeof window !== "undefined" ? window : globalThis);
