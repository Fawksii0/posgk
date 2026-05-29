# Beta Deployment Environment Configuration

## Environment Variables (if needed)

No environment variables are required for the beta deployment. However, you can customize the following:

### Optional Configuration (for future use)

```env
# Backend Configuration (Future - Supabase Integration)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_KEY=your_supabase_key

# Analytics (Future)
VITE_ANALYTICS_ID=your_tracking_id

# Feature Flags
VITE_ENABLE_PRINTER=false
VITE_ENABLE_PAYMENTS=false
VITE_ENABLE_NOTIFICATIONS=false
```

## Deployment Platforms Quick Start

### Vercel (Recommended - Easiest)
```bash
npm install -g vercel
vercel deploy
```

### Netlify
1. Connect GitHub repository
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Deploy

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase init
firebase deploy
```

### GitHub Pages
```bash
npm run build
git add dist/
git commit -m "Deploy beta"
git push origin main
```

### Self-Hosted (Apache/Nginx)
```bash
npm run build
# Copy dist/* to your web server root
# Ensure .htaccess or nginx.conf handles SPA routing
```

## Testing Checklist Before Live Deployment

### Functionality Tests
- [ ] Login with all demo PINs works
- [ ] Order creation and submission works
- [ ] Cashier payment processing works
- [ ] WhatsApp sharing works
- [ ] Analytics calculations are correct
- [ ] Daily closing saves records
- [ ] Data persists after page refresh
- [ ] Currency displays correctly (MAD)

### Performance Tests
- [ ] Initial load < 2 seconds
- [ ] Menu items load smoothly
- [ ] Order submission is instant
- [ ] No memory leaks (check browser devtools)
- [ ] Works offline (via cache)

### Browser Compatibility Tests
- [ ] Desktop Chrome
- [ ] Desktop Firefox
- [ ] Safari (macOS)
- [ ] Edge
- [ ] Mobile Chrome
- [ ] Mobile Safari

### Device Tests
- [ ] Desktop (1920x1080)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)

## Monitoring (Beta Phase)

### What to Monitor
1. **Error Rate:** Browser console errors
2. **Performance:** Page load times, interaction delays
3. **Data Integrity:** Verify localStorage data consistency
4. **User Feedback:** Collect via GitHub Issues or email

### Manual Monitoring
- Check browser console (F12) for any errors
- Test all user workflows daily
- Keep track of any crashes or issues
- Document user feedback

## Rollback Plan

If critical issue is found:
1. Stop accepting new users
2. Revert deployment to previous version
3. Fix the issue locally
4. Re-test thoroughly
5. Redeploy with fix

## Post-Beta Roadmap

### Phase 2: Production Release
- Supabase backend integration
- User authentication system
- Payment gateway integration
- Kitchen printer support
- Real-time notifications

### Phase 3: Enterprise Features
- Multi-restaurant support
- Staff management system
- Advanced analytics
- Custom reporting
- API integrations

## Support Resources

- **Documentation:** See BETA-DEPLOYMENT.md
- **Code:** All source in /src folder
- **Build:** `npm run build`
- **Development:** `npm run dev`
- **Linting:** `npm run lint`
