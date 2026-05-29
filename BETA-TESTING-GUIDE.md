# POSGK POS - Beta Testing Quick Start Guide

## 🎯 What is POSGK?

POSGK is a modern Point-of-Sale (POS) system designed for restaurants. It provides separate interfaces for Waiters, Cashiers, and Managers to manage orders, process payments, and track sales.

**Status:** Beta Phase 1 - Ready for testing  
**Build Date:** May 29, 2026

---

## 🚀 Quick Start - 5 Minutes

### For Local Testing

#### 1. Install Dependencies
```bash
cd "c:\Users\admin\Desktop\POSGK"
npm install
```

#### 2. Start Development Server
```bash
npm run dev
```
Your browser should open to `http://localhost:5173`

#### 3. Try It Out
- Login with PIN **1111** to be Waiter "Alex"
- Select a table, add menu items, and submit an order
- Login with PIN **0000** to see it in the Cashier Dashboard

---

## 👥 User Roles & Demo Logins

### 1. Waiter
**PIN:** 1111 or 2222  
**Name:** Alex or Maria  
**Tasks:**
- Select dining tables
- Browse menu by category
- Add items to orders
- Submit orders to cashier
- See order confirmation

**How to Test:**
1. Login with PIN 1111
2. Click on "Table 1" through "Table 12"
3. Click menu items to add (can mix categories)
4. Review order total in cart
5. Click "Send Order to Cashier"

### 2. Cashier
**PIN:** 0000  
**Access:** Full Admin Dashboard  
**Tasks:**
- View all pending orders
- Mark orders ready for serving
- Process payments
- Manage staff (add/edit/remove waiters)
- Configure menu items
- Track daily tables
- Share orders via WhatsApp

**How to Test:**
1. Login with PIN 0000
2. See "Live Orders" tab shows waiter's orders
3. Click WhatsApp icon to share order details
4. Mark order as "Ready" and "Paid"
5. Go to "Menu Builder" to edit items
6. Add a new waiter or edit existing ones

### 3. Manager
**PIN:** 9999  
**Access:** Business Analytics & Operations  
**Tasks:**
- View sales analytics (7, 15, 30 days)
- Track staff performance metrics
- Manage all menu items and categories
- Perform daily cash register closing (Font de Caisse)
- View closure history

**How to Test:**
1. Login with PIN 9999
2. Review Dashboard overview
3. Check Sales Analytics for different periods
4. View Staff Performance metrics
5. Go to Font de Caisse and simulate daily closing
6. Add notes and confirm closure

---

## 📋 Test Workflow (Complete Order Path)

### Step 1: Waiter Takes Order
```
1. Login as Waiter (PIN: 1111)
2. Select Table 5
3. Add:
   - Margherita Pizza (14.00 MAD)
   - Fresh Lemonade (5.50 MAD)
   - Tiramisu (7.50 MAD)
4. Total: 27.00 MAD
5. Click "Send Order to Cashier"
```

### Step 2: Cashier Processes Order
```
1. Login as Cashier (PIN: 0000)
2. See order in "Live Orders"
3. Review order details and total
4. Click "Ready" to mark order prepared
5. Click "Paid" to close the order
```

### Step 3: Manager Tracks Sales
```
1. Login as Manager (PIN: 9999)
2. Go to "Sales Analytics"
3. Order should appear in today's figures
4. Check revenue metrics
5. Verify staff order count updated
```

### Step 4: Daily Closing
```
1. Login as Manager (PIN: 9999)
2. Go to "Font de Caisse" tab
3. Review all closed orders
4. Add optional closing notes
5. Click "Close Register"
6. Verify closure record saved
```

---

## 🧪 Features to Test

### ✅ Critical Features (Must Test)
- [ ] Login works with all three demo PINs
- [ ] Waiters can select table and add items
- [ ] Orders appear in Cashier dashboard
- [ ] Payment status changes correctly
- [ ] Data persists after page refresh
- [ ] Menu items display with prices in MAD

### ✅ Important Features (Should Test)
- [ ] WhatsApp button shares order details
- [ ] Sales analytics calculate correctly
- [ ] Staff performance shows correct order counts
- [ ] Menu items can be edited (prices, names)
- [ ] New menu items can be added
- [ ] Daily closing saves records

### ✅ Nice-to-Have Features (Can Test)
- [ ] UI looks good on different screen sizes
- [ ] Categories filter menu items correctly
- [ ] Icons are clear and intuitive
- [ ] Buttons respond quickly
- [ ] Text in both English and French

---

## 🐛 Bug Report Template

When you find an issue, please document it with:

```
Title: [Brief description]

Severity: Critical / High / Medium / Low

Steps to Reproduce:
1. Login as [role] with PIN [####]
2. Navigate to [section]
3. Perform action [...]
4. Observe [...]

Expected Behavior:
[What should happen]

Actual Behavior:
[What actually happened]

Device & Browser:
- Device: [Desktop/iPad/iPhone]
- OS: [Windows/Mac/iOS/Android]
- Browser: [Chrome/Firefox/Safari/Edge]
- Browser Version: [version number]

Screenshots: [Attach if helpful]

Additional Notes:
[Any other context]
```

---

## ⚙️ Customization (Manager Portal)

### Change Number of Tables
1. Login as Cashier (0000) or Manager (9999)
2. Go to "Layout Settings" tab
3. Change table count (e.g., from 12 to 15)
4. Save
5. Waiter view shows new table count

### Add New Menu Item
1. Login as Cashier (0000)
2. Go to "Menu Builder" tab
3. Fill in: Name, Category, Price, Description
4. Click "Add to Menu"
5. Waiter immediately sees it in their menu

### Change Item Price
1. Login as Cashier (0000)
2. Go to "Menu Builder" tab
3. Find item and click "Edit"
4. Update price
5. Save changes
6. New price reflects in waiter orders

---

## 📱 Testing on Different Devices

### Desktop (Recommended for Cashier/Manager)
- Works best in Chrome or Firefox
- Full screen for better visibility
- Good for analytics viewing

### Tablet/iPad (Recommended for Waiters)
- Portrait orientation works well
- Easy to carry on serving rounds
- Touch-friendly interface

### Mobile Phone (Testing Only)
- Small screen but functional
- Test responsiveness
- Note any usability issues

---

## 🔧 Troubleshooting

### Issue: Data Not Saving
**Solution:** This app uses browser LocalStorage. Check:
- Browser storage isn't full (clear cache if needed)
- Private/Incognito mode may not persist data
- Try a different browser

### Issue: WhatsApp Button Doesn't Work
**Solution:** 
- WhatsApp must be installed or web version accessible
- Some systems may block external links
- Try copying the message text manually

### Issue: Login PIN Not Accepted
**Solution:**
- Verify PIN is correct: 1111, 2222 (Waiters), 0000 (Cashier), 9999 (Manager)
- PIN must be exactly 4 digits
- Try reloading the page

### Issue: Menu Items Not Showing
**Solution:**
- Refresh the page (F5)
- Check if items were actually saved
- Try adding a new item to test

---

## 📊 Success Metrics for This Beta

Your testing helps us know if the app is ready when:
- ✅ All test workflows complete without errors
- ✅ No data is lost after page refresh
- ✅ All prices display correctly in MAD
- ✅ User feedback is positive
- ✅ Performance is acceptable (fast loading)
- ✅ No critical bugs found

---

## 🎁 What's Next After Beta?

### If Beta Goes Well → Production Release
- Backend database integration
- Secure user authentication
- Real payment processing
- Kitchen printer support

### Post-Production Roadmap
- Multi-restaurant support
- Advanced reporting
- Loyalty program integration
- Mobile app for waiters

---

## ❓ Questions?

### For Technical Issues
1. Check BETA-DEPLOYMENT.md for detailed information
2. Check the TO DO file for known limitations
3. Report bugs with the template above

### For Feature Requests
- Document clearly what you'd like to see
- Explain the business value
- Include suggested workflow

---

## 🎯 Thank You for Testing!

Your feedback is crucial for making POSGK a great POS system. 

**Testing Tips:**
- Take your time - explore all features
- Try unusual inputs (empty values, special characters)
- Test on real devices if possible
- Provide detailed feedback
- Have fun! 🚀

---

**Last Updated:** May 29, 2026  
**Version:** Beta 0.0.0-beta.1
