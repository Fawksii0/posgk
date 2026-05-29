# POSGK - Quick Reference Card

## 🚀 Deploy in 60 Seconds

### Vercel (Easiest)
```bash
npm install -g vercel
vercel deploy
```

### Netlify  
```bash
npm run build
# Drag dist/ folder to netlify.app
```

### Firebase
```bash
firebase init
npm run build  
firebase deploy
```

### GitHub Pages
```bash
npm run build
git add dist/ && git commit -m "Deploy"
git push
```

---

## 👥 Demo Credentials

| Role | PIN | Name |
|------|-----|------|
| Waiter | 1111 | Alex |
| Waiter | 2222 | Maria |
| Cashier | 0000 | Admin |
| Manager | 9999 | Manager |

---

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Check code quality
npm run lint

# Preview production build
npm preview
```

---

## 📋 Test Workflows (2-min each)

### Order Complete Workflow
1. Login Waiter (1111) → Select Table → Add Items → Submit
2. Login Cashier (0000) → Mark Ready → Process Payment ✅

### Analytics Check
1. Login Manager (9999) → Sales Analytics
2. Switch 7/15/30 days → Verify calculations ✅

### Daily Closing
1. Login Manager → Font de Caisse → Add Notes → Close Register ✅

### Menu Management
1. Login Cashier → Menu Builder → Edit Price → Save
2. Login Waiter → Verify change appears ✅

---

## 📊 Key Metrics

| Metric | Value | Target |
|--------|-------|--------|
| Build Time | 545ms | <1s ✅ |
| JS Bundle | 74.56 KB | <100 KB ✅ |
| Load Time | <2s | <2s ✅ |
| ESLint | 0 errors | 0 ✅ |

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Data not saving | Check localStorage isn't full |
| PIN not working | Must be 4 digits exactly |
| WhatsApp not opening | Install WhatsApp or use web version |
| Menu items missing | Refresh page (F5) |
| Slow performance | Clear browser cache |

---

## 📚 Documentation Files

| File | Purpose | Length |
|------|---------|--------|
| BETA-DEPLOYMENT.md | Full deployment guide | 6000+ words |
| BETA-TESTING-GUIDE.md | Testing procedures | 3000+ words |
| DEPLOYMENT-CONFIG.md | Platform setup | 2000+ words |
| DEPLOYMENT-SUMMARY.md | This summary | 4000+ words |
| TO DO POSGK.md | Feature status | Updated |

---

## 🎯 What to Test First

✅ **Must Test (Critical Path)**
1. Login with all 4 demo PINs
2. Complete order workflow (Waiter → Cashier → Payment)
3. Data persists after refresh
4. Currency displays as MAD

✅ **Should Test (Important)**
1. WhatsApp order sharing
2. Sales analytics calculations
3. Menu item editing
4. Daily closing

✅ **Can Test (Polish)**
1. Responsive design
2. Icon appearance
3. Load speed
4. Color scheme

---

## 📞 Support

### Quick Help
- **Can't login?** Check PIN is exactly 4 digits
- **Data lost?** Browser localStorage cleared
- **Performance slow?** Close other tabs
- **Styling weird?** Try different browser

### Report Issues
1. Document steps to reproduce
2. Include device/browser info
3. Attach screenshots
4. Create GitHub issue

---

## ✅ Pre-Deploy Checklist

- [ ] Run `npm run lint` (should pass)
- [ ] Run `npm run build` (should succeed)
- [ ] Test locally with `npm run dev`
- [ ] Try all 4 demo logins
- [ ] Complete test workflow
- [ ] Check dist/ folder exists
- [ ] Read BETA-DEPLOYMENT.md

---

## 🚀 After Deploy

1. **Verify:** App loads without errors
2. **Test:** Try demo logins
3. **Check:** Data persists
4. **Monitor:** Check browser console for errors
5. **Share:** Send link to beta testers

---

## 📈 Next Phases

**Phase 2:** Add database backend  
**Phase 3:** Real authentication  
**Phase 4:** Payment processing  
**Phase 5:** Kitchen printer  

---

**Version:** Beta 0.0.0-beta.1  
**Status:** Ready ✅  
**Last Updated:** May 29, 2026

---

## 🎁 One-Liner Commands

```bash
# Clean install & test
rm -r node_modules && npm install && npm run lint && npm run build

# Just deploy (pick one)
vercel deploy           # Vercel
firebase deploy         # Firebase

# Quick test
npm run dev            # Open http://localhost:5173 → Test
```

---

## 📞 Key Contacts

- **Issues:** GitHub Issues
- **Features:** GitHub Discussions  
- **Urgent:** Escalate to development team
- **Questions:** Check BETA-DEPLOYMENT.md first

---

**Ready to deploy? Pick your platform above and go! 🚀**
