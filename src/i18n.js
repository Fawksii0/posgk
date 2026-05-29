export const translations = {
  en: {
    // Common
    logout: 'Logout',
    back: 'Back',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    confirm: 'Confirm',
    
    // Login
    enterPIN: 'Enter your 4-digit staff PIN to access',
    invalidPIN: 'Invalid PIN code. Please try again.',
    demoPINs: 'Demo PINs: Manager',
    cashier: 'Cashier',
    waiter: 'Waiter',
    
    // Header
    userBadge: (name, role) => `${name} (${role})`,
    waiterMode: 'Waiter Mode Active',
    managerPortal: 'Manager Portal',
    
    // Manager Portal
    dashboard: 'Dashboard',
    salesAnalytics: 'Sales Analytics',
    staffPerformance: 'Staff Performance',
    fontDeCaisse: 'Font de Caisse',
    todaysRevenue: "Today's Revenue",
    completedOrders: 'Completed Orders',
    pendingRevenue: 'Pending Revenue',
    unpaidOrders: 'Unpaid Orders',
    activeStaff: 'Active Staff',
    waitersOnDuty: 'Waiters on duty',
    diningTables: 'Dining Tables',
    availableCapacity: 'Available capacity',
    recentOrdersSummary: 'Recent Orders Summary',
    
    // Sales Analytics
    selectPeriod: 'Select Period:',
    last7Days: 'Last 7 Days',
    last15Days: 'Last 15 Days',
    last30Days: 'Last 30 Days',
    totalRevenue: 'Total Revenue',
    averageOrderValue: 'Average Order Value',
    dailyAverage: 'Daily Average',
    detailedSalesReport: 'Detailed Sales Report',
    orderID: 'Order ID',
    table: 'Table',
    itemsCount: 'Items Count',
    amount: 'Amount',
    time: 'Time',
    noSalesData: 'No sales data for this period',
    
    // Menu Builder
    menuBuilder: 'Menu Builder',
    menuItems: 'Menu Items',
    categories: 'Categories',
    addNewMenuItem: 'Add New Menu Item',
    editMenuItem: 'Edit Menu Item',
    itemName: 'Item Name',
    category: 'Category',
    price: 'Price (MAD)',
    description: 'Description',
    imageURL: 'Image URL',
    uploadImage: 'Upload Image',
    currentMenu: 'Current Restaurant Menu',
    addToMenu: 'Add to Menu',
    saveChanges: 'Save Changes',
    remove: 'Remove',
    
    // Font de Caisse
    registerStatus: 'Current Cash Register Status',
    readyToClose: 'Ready',
    pendingOrders: 'Pending Orders',
    closeRegister: 'Close Register (Cloture)',
    waitingForPayment: 'Waiting for all orders to be paid',
    closureRecords: 'Closure Records',
    noClosure: 'No closure records yet.',
    closingNotes: 'Closing Notes (Optional)',
    closingDateTime: 'Closing Date/Time',
    enterNotes: 'Enter any notes about this closure...',
    confirmClosure: 'Confirm Closure',
  },
  
  fr: {
    // Common
    logout: 'Déconnexion',
    back: 'Retour',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    add: 'Ajouter',
    confirm: 'Confirmer',
    
    // Login
    enterPIN: 'Entrez votre code PIN à 4 chiffres pour accéder',
    invalidPIN: 'Code PIN invalide. Veuillez réessayer.',
    demoPINs: 'PINs de démo: Manager',
    cashier: 'Caissier',
    waiter: 'Serveur',
    
    // Header
    userBadge: (name, role) => `${name} (${role})`,
    waiterMode: 'Mode Serveur Actif',
    managerPortal: 'Portail Manager',
    
    // Manager Portal
    dashboard: 'Tableau de Bord',
    salesAnalytics: 'Analyse des Ventes',
    staffPerformance: 'Performance du Personnel',
    fontDeCaisse: 'Font de Caisse',
    todaysRevenue: "Chiffre d'affaires d'aujourd'hui",
    completedOrders: 'Commandes Complétées',
    pendingRevenue: 'Chiffre d\'affaires en attente',
    unpaidOrders: 'Commandes non payées',
    activeStaff: 'Personnel Actif',
    waitersOnDuty: 'Serveurs en service',
    diningTables: 'Tables à Manger',
    availableCapacity: 'Capacité disponible',
    recentOrdersSummary: 'Résumé des Commandes Récentes',
    
    // Sales Analytics
    selectPeriod: 'Sélectionner la Période:',
    last7Days: '7 Derniers Jours',
    last15Days: '15 Derniers Jours',
    last30Days: '30 Derniers Jours',
    totalRevenue: 'Chiffre d\'affaires Total',
    averageOrderValue: 'Valeur Moyenne de Commande',
    dailyAverage: 'Moyenne Quotidienne',
    detailedSalesReport: 'Rapport de Ventes Détaillé',
    orderID: 'ID Commande',
    table: 'Table',
    itemsCount: 'Nombre d\'Articles',
    amount: 'Montant',
    time: 'Heure',
    noSalesData: 'Aucune donnée de vente pour cette période',
    
    // Menu Builder
    menuBuilder: 'Constructeur de Menu',
    menuItems: 'Articles de Menu',
    categories: 'Catégories',
    addNewMenuItem: 'Ajouter un Nouvel Article',
    editMenuItem: 'Modifier l\'Article',
    itemName: 'Nom de l\'Article',
    category: 'Catégorie',
    price: 'Prix (MAD)',
    description: 'Description',
    imageURL: 'URL de l\'Image',
    uploadImage: 'Télécharger une Image',
    currentMenu: 'Menu du Restaurant Actuel',
    addToMenu: 'Ajouter au Menu',
    saveChanges: 'Enregistrer les Modifications',
    remove: 'Supprimer',
    
    // Font de Caisse
    registerStatus: 'État Actuel du Registre de Caisse',
    readyToClose: 'Prêt',
    pendingOrders: 'Commandes en Attente',
    closeRegister: 'Fermer le Registre (Cloture)',
    waitingForPayment: 'En attente du paiement de toutes les commandes',
    closureRecords: 'Enregistrements de Fermeture',
    noClosure: 'Aucun enregistrement de fermeture pour le moment.',
    closingNotes: 'Notes de Fermeture (Optionnelles)',
    closingDateTime: 'Date/Heure de Fermeture',
    enterNotes: 'Entrez des notes sur cette fermeture...',
    confirmClosure: 'Confirmer la Fermeture',
  }
};

export const getTranslation = (key, language = 'en', ...args) => {
  const text = translations[language]?.[key] || translations['en']?.[key] || key;
  if (typeof text === 'function') {
    return text(...args);
  }
  return text;
};
