# New UI Sandbox

This folder is a separate, isolated React + Vite workspace for developing new features and components without affecting the existing local platform or Cloudflare deployment.

## Quick Start

### Prerequisites
- Node.js 16+
- npm

### Run Locally

1. Navigate to the newui folder:
```bash
cd newui
```

2. Install dependencies:
```bash
npm install
```

3. Start dev server:
```bash
npm run dev
```

4. Open in browser: **http://localhost:5173**

### Flow
- **Login page** → Click "Continue" to proceed
- **Organization creation** → Fill form and submit to create org
- **Dashboard preview** → Confirmation page showing created organization

## Structure

- **src/main.jsx** - React entry point
- **src/App.jsx** - Main app router (login → org → preview)
- **src/components/** - React components (Login, Org, Preview)
- **src/styles.css** - Shared styles
- **assets/** - Spark logos (spark-black.png, spark-white.png)
- **package.json** - Dependencies and scripts
- **index.html** - Vite entry HTML

## Notes

- Changes here do NOT affect production or the main platform
- Fully isolated Vite + React sandbox
- Can be integrated into main app when ready
- Static HTML fallbacks available (org.html, dashboard-preview.html) if server unavailable
