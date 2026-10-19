const img = (id, w = 760) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=82`;

const products = [
  {
    id: "classic", name: "Le Classique G&K", category: "Sandwichs", cuisine: "Burger", time: "15 min", discount: "20% OFF",
    description: "Burger smash de bœuf, cheddar fondant, salade croquante et sauce maison.",
    price: 55, rating: "4.9", reviews: "1.2k", image: img("photo-1568901346375-23c9450c58cd"),
    sizes: [{ name: "Simple", delta: 0 }, { name: "Double", delta: 18 }, { name: "XL", delta: 26 }],
    extras: [{ name: "Cheddar", price: 6 }, { name: "Bacon croustillant", price: 8 }, { name: "Sauce maison", price: 4 }]
  },
  {
    id: "fries", name: "Frites Maison", category: "Accompagnements", cuisine: "Snack", time: "10 min", discount: "",
    description: "Pommes de terre dorées, persil frais et fleur de sel.",
    price: 20, rating: "4.8", reviews: "860", image: img("photo-1573080496219-bb080dd4f877"),
    sizes: [{ name: "Petite", delta: 0 }, { name: "Moyenne", delta: 5 }, { name: "Grande", delta: 10 }],
    extras: [{ name: "Sauce cheddar", price: 6 }, { name: "Sauce maison", price: 4 }]
  },
  {
    id: "chicken", name: "Crispy Chicken", category: "Sandwichs", cuisine: "Burger", time: "15 min", discount: "10% OFF",
    description: "Burger de poulet croustillant, coleslaw et sauce légèrement épicée.",
    price: 48, rating: "4.8", reviews: "940", image: img("photo-1606755962773-d324e0a13086"),
    sizes: [{ name: "Simple", delta: 0 }, { name: "Double", delta: 16 }],
    extras: [{ name: "Cheddar", price: 6 }, { name: "Sauce épicée", price: 4 }]
  },
  {
    id: "pizza", name: "Pizza G&K", category: "Plats", cuisine: "Italien", time: "20 min", discount: "20% OFF",
    description: "Pâte fine, mozzarella, tomates confites et basilic.",
    price: 62, rating: "4.7", reviews: "1.1k", image: img("photo-1513104890138-7c749659a591"),
    sizes: [{ name: "Petite 8″", delta: 0 }, { name: "Moyenne 10″", delta: 14 }, { name: "Grande 12″", delta: 26 }],
    extras: [{ name: "Extra mozzarella", price: 8 }, { name: "Olives", price: 5 }, { name: "Poivrons", price: 5 }]
  },
  {
    id: "gelato", name: "Gelato Pistache", category: "Gelato", cuisine: "Dessert", time: "5 min", discount: "",
    description: "Glace artisanale à la pistache, préparée chaque jour.",
    price: 28, rating: "4.9", reviews: "700", image: img("photo-1563805042-7684c019e1cb"),
    sizes: [{ name: "1 boule", delta: 0 }, { name: "2 boules", delta: 10 }, { name: "3 boules", delta: 20 }],
    extras: [{ name: "Éclats de pistache", price: 5 }, { name: "Chantilly", price: 4 }]
  },
  {
    id: "lemonade", name: "Citronnade fraîche", category: "Boissons", cuisine: "Boisson", time: "5 min", discount: "",
    description: "Citrons frais pressés, menthe et juste ce qu'il faut de sucre.",
    price: 18, rating: "4.8", reviews: "520", image: img("photo-1513558161293-cdaf765ed2fd"),
    sizes: [{ name: "33 cl", delta: 0 }, { name: "50 cl", delta: 5 }],
    extras: [{ name: "Extra menthe", price: 3 }]
  }
];

const zones = [
  { id: "centre", name: "Centre-ville", fee: 10, min: 0, etaMin: [25, 35] },
  { id: "corniche", name: "Corniche & Plage", fee: 15, min: 40, etaMin: [30, 40] },
  { id: "peripherie", name: "Périphérie", fee: 25, min: 80, etaMin: [40, 55] }
];

const categories = [
  { id: "All", label: "Tout", icon: "sparkles" },
  { id: "Sandwichs", label: "Burgers", icon: "burger" },
  { id: "Plats", label: "Plats", icon: "utensils" },
  { id: "Gelato", label: "Gelato", icon: "iceCream" },
  { id: "Boissons", label: "Boissons", icon: "cup" },
  { id: "Favoris", label: "Favoris", icon: "heart" }
];

const iconPaths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  receipt: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z"/><path d="M9 8.5h6M9 12.5h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6"/>',
  pin: '<path d="M12 21s7-6 7-11.2a7 7 0 1 0-14 0C5 15 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.4"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  bag: '<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17Z"/><path d="M10 21.5h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 16.9l-5.2 2.9 1-5.9-4.3-4.2 5.9-.8L12 3.5Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  sparkles: '<path d="m11 3.5 1.7 4.8 4.8 1.7-4.8 1.7L11 16.5l-1.7-4.8L4.5 10l4.8-1.7L11 3.5Z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  burger: '<path d="M4 11a8 6 0 0 1 16 0H4Z"/><path d="M3.5 14.5h17"/><path d="M4.5 17.5h15v.5a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18v-.5Z"/>',
  utensils: '<path d="M7 3v7.5M4 3v5a3 3 0 0 0 6 0V3M7 10.5V21"/><path d="M17 21V3c-2.2 1.4-3.5 4-3.5 7v3H17"/>',
  iceCream: '<path d="M7.5 11a4.5 4.5 0 0 1 9 0"/><path d="M6 11h12l-6 10-6-10Z"/>',
  cup: '<path d="M6 8h12l-1.4 12.5H7.4L6 8Z"/><path d="M5 8h14M13 8l1.8-4.5H18"/>',
  fries: '<path d="M6.5 10h11L16 20.5H8L6.5 10Z"/><path d="M8.5 10V5M11 10V3.5M13.5 10V5M16 10V6"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="m5.5 16.5 3-7h5l2.5 7M8.5 9.5 7 6.5H5M13.5 9.5l-1-3H15"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 12h.01M17.5 12h.01"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.7M12 16.8h.01"/>',
  gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5C9.5 8.5 8.5 4.5 11 4.5c1.6 0 1 4 1 4Zm0 0c2.5 0 3.5-4 1-4-1.6 0-1 4-1 4Z"/>',
  phone: '<path d="M5 4.5h4l1.5 4-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4 1.5v4a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 6.5a2 2 0 0 1 2-2Z"/>',
  chat: '<path d="M4 5.5h16v11H10l-4.5 3.5v-3.5H4v-11Z"/><path d="M8 10h8M8 13h5"/>',
  tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5-8.5-8.5Z"/><circle cx="8" cy="8.5" r="1.2"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5"/>',
  navigate: '<path d="m20 4-7 16-2.5-7.5L3 10l17-6Z"/>',
  logout: '<path d="M10 4H5.5v16H10"/><path d="m15 8 4 4-4 4M19 12H9"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14"/>',
  briefcase: '<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V6h6v2M4 13h16"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>'
};

function icon(name, { filled = false } = {}) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
}
