# Manual Testing Guide - Dark Theme Verification

## Quick Test Instructions

Since browser automation is not available, please follow these steps to manually test the website:

### 1. Open the Website
Navigate to: **http://10.111.217.2:3000**

### 2. Visual Inspection Checklist

#### ✅ Dark Theme Basics
- [ ] Background is **BLACK** (not white or light gray)
- [ ] Main text is **WHITE** or light colored
- [ ] Sidebar has a dark gray background (#171717)
- [ ] "Avika" logo shows gradient colors (blue → cyan → purple)

#### ✅ Dashboard Content
Look for the "Avika Insights" card and verify:
- [ ] Card background is **DARK** (not light blue)
- [ ] Card should have a dark gray background (#171717 or similar)
- [ ] Text inside the card is **READABLE** (white or light colored)
- [ ] "No data available" text is **VISIBLE** (not too dark)
- [ ] Icons and borders use appropriate dark theme colors

#### ✅ Other Dashboard Elements
- [ ] All stat cards have dark backgrounds
- [ ] Charts/graphs use dark-compatible colors
- [ ] Hover effects work and are visible
- [ ] No white or light backgrounds on cards

### 3. Take Screenshots

Please take screenshots of:

1. **Main Dashboard** - Full page view
2. **Avika Insights Card** - Close-up of this specific card
3. **Inventory Page** - Navigate to /inventory
4. **Alerts Page** - Navigate to /alerts
5. **Browser Console** - Press F12, show Console tab

### 4. Browser Console Check

Press **F12** to open Developer Tools, then:

1. **Console Tab**: Look for any red errors
2. **Elements Tab**: 
   - Find the `<html>` tag
   - Verify it has `class="dark"`
3. **Run this command in Console**:

```javascript
// Check theme variables
const root = document.documentElement;
const bg = getComputedStyle(root).getPropertyValue('--theme-background');
const text = getComputedStyle(root).getPropertyValue('--theme-text');
console.log('Background:', bg);  // Should be: 0 0 0
console.log('Text:', text);       // Should be: 255 255 255
```

### 5. Specific Issues to Check

#### Issue: Avika Insights Card with Light Blue Background
**What to look for:**
- If the card has a light blue background (like `bg-blue-50` or similar)
- This would be wrong for dark mode

**What it should be:**
- Dark background (black or dark gray)
- Blue accent colors only for borders or text
- Example: `bg-neutral-900` or `bg-neutral-800`

#### Issue: "No data available" Text Not Visible
**What to look for:**
- Text that's too dark to read against dark background
- Gray text on gray background

**What it should be:**
- Light colored text (white, light gray)
- Good contrast against dark background
- Example: `text-neutral-300` or `text-neutral-400`

### 6. Navigation Testing

Click through these pages and verify dark theme on each:

- [ ] Dashboard (/)
- [ ] Inventory (/inventory)
- [ ] Alerts (/alerts)
- [ ] AI Tuner (/optimization)
- [ ] Analytics (/analytics)
- [ ] Settings (/settings)

For each page, check:
- Dark background maintained
- Text is readable
- Cards/components have dark backgrounds
- No light-colored elements that look out of place

### 7. Expected Color Scheme

Based on the CSS analysis, here's what you should see:

**Backgrounds:**
- Main: `#000000` (pure black)
- Cards: `#171717` (dark gray)
- Sidebar: `#171717` (dark gray)

**Text:**
- Primary: `#FFFFFF` (white)
- Muted: `#A3A3A3` (light gray)

**Accents:**
- Primary (blue): `#3B82F6`
- Success (green): `#22C55E`
- Warning (amber): `#FBB924`
- Error (red): `#EF4444`

### 8. Common Issues & What They Mean

| What You See | What It Means | Status |
|--------------|---------------|--------|
| Black background, white text | ✅ Dark theme working | GOOD |
| White background, black text | ❌ Dark theme not applied | BAD |
| Light blue card backgrounds | ❌ Light mode colors used | BAD |
| Dark cards with light text | ✅ Correct dark mode styling | GOOD |
| Can't read "No data available" | ❌ Text color too dark | BAD |
| Gray text on dark background | ✅ Proper muted text | GOOD |

### 9. Report Template

After testing, please provide this information:

```
## Test Results

**Browser:** [Chrome/Firefox/Safari/Edge]
**Date/Time:** [When you tested]

### Dark Theme Status
- [ ] Working correctly
- [ ] Partially working
- [ ] Not working

### Specific Findings

**Dashboard:**
- Background color: [black/white/other]
- Text color: [white/black/other]
- Avika Insights card background: [dark/light/other]
- "No data available" visible: [yes/no]

**Inventory Page:**
- Dark theme applied: [yes/no]
- Issues found: [describe]

**Alerts Page:**
- Dark theme applied: [yes/no]
- Issues found: [describe]

### Console Errors
- [ ] No errors
- [ ] Some errors (list below)
- [ ] Many errors

**Errors found:**
```
[paste any console errors here]
```

### Screenshots
[Attach screenshots here]

### Additional Notes
[Any other observations]
```

### 10. Quick Visual Test

If you're short on time, just do this:

1. Open http://10.111.217.2:3000
2. Look at the page - is it mostly black or mostly white?
   - **Black = Good** (dark theme working)
   - **White = Bad** (dark theme not working)
3. Find the "Avika Insights" card
   - Does it have a dark background? **Good**
   - Does it have a light blue background? **Bad**
4. Can you read the text easily?
   - **Yes = Good**
   - **No = Bad** (contrast issue)

---

## Technical Details (For Reference)

### CSS Variables Being Used

The website uses these CSS variables for theming:

```css
:root {
  --theme-background: 0 0 0;           /* Black */
  --theme-surface: 23 23 23;           /* Dark gray */
  --theme-text: 255 255 255;           /* White */
  --theme-text-muted: 163 163 163;     /* Gray */
  --theme-primary: 59 130 246;         /* Blue */
}
```

These are applied using `rgb(var(--theme-background))` syntax.

### HTML Structure

The `<html>` element should have `class="dark"` which enables dark mode styles.

### Tailwind Dark Mode

The project uses Tailwind CSS with class-based dark mode. Classes like:
- `dark:bg-neutral-900` - dark background in dark mode
- `dark:text-neutral-200` - light text in dark mode
- `bg-neutral-50` - would be light (wrong for dark mode)

---

## Need Help?

If you see issues, please provide:
1. Screenshots of the problem
2. Browser console errors (F12 → Console tab)
3. Which page you're on
4. Description of what looks wrong

This will help diagnose and fix any remaining dark theme issues.
