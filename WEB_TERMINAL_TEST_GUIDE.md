# Web Terminal Testing Guide

## Objective
Test the web terminal functionality in the Avika frontend to ensure agents can be accessed via terminal.

---

## Test Steps

### Step 1: Navigate to Inventory Page
1. Open your browser
2. Navigate to: **http://10.111.217.2:3000/inventory**
3. Wait for the page to fully load

**Expected Result:**
- Page displays with dark theme (black background)
- List of agents appears in a table/grid format
- Each agent shows status, metrics, and action buttons

**Screenshot Checkpoint:** Take a screenshot showing the inventory page with agents listed

---

### Step 2: Locate the Terminal Icon
1. Look at the "Actions" column for each agent
2. Find the Terminal icon (should look like a command prompt: `>_` or similar)
3. The icon should be clickable/interactive

**Expected Result:**
- Terminal icon is visible in the Actions column
- Icon has hover effect when mouse moves over it
- Icon is not grayed out or disabled

**What to look for:**
- Icon color/style indicates it's clickable
- Tooltip may appear on hover showing "Terminal" or "Web Terminal"

---

### Step 3: Click the Terminal Icon
1. Click on the Terminal icon for any agent in the list
2. Wait for response (dialog or overlay should appear)

**Expected Result:**
- A dialog/modal appears over the page
- Dialog should have dark theme styling
- Dialog shows agent information or terminal options

**Screenshot Checkpoint:** Take a screenshot of the dialog that appears

**Possible Issues:**
- ❌ Nothing happens when clicking
- ❌ Error message appears
- ❌ Dialog appears but is blank/white
- ❌ Loading spinner appears but never completes

---

### Step 4: Look for Web Terminal Button
1. In the dialog that appeared, look for a "Web Terminal" button
2. Button should be clearly labeled and styled

**Expected Result:**
- "Web Terminal" button is visible
- Button has proper dark theme styling
- Button appears clickable (not disabled)

**Alternative Scenarios:**
- Dialog may directly show terminal interface (skip to Step 6)
- Dialog may show multiple options (SSH, Web Terminal, etc.)
- Dialog may show connection settings first

---

### Step 5: Click Web Terminal Button
1. Click the "Web Terminal" button
2. Wait for terminal overlay to load

**Expected Result:**
- Terminal overlay/interface appears
- Terminal has dark background (black or dark gray)
- Terminal shows a command prompt or connection message

**Screenshot Checkpoint:** Take a screenshot of the terminal overlay

---

### Step 6: Observe Terminal Interface

#### Visual Check:
- [ ] Terminal has dark background
- [ ] Text is light colored (white/green/cyan)
- [ ] Command prompt is visible (e.g., `root@hostname:~#`)
- [ ] Cursor is blinking or visible
- [ ] Terminal fills appropriate screen area

#### Connection Check:
Look for these possible states:

**✅ Connected Successfully:**
```
Connected to agent: <agent-name>
root@nginx-agent-01:~#
```

**⚠️ Connecting:**
```
Connecting to agent...
Establishing WebSocket connection...
```

**❌ Connection Failed:**
```
Failed to connect to agent
Error: Connection refused
Error: WebSocket connection failed
Error: Agent not reachable
```

**❌ Authentication Issues:**
```
Authentication failed
Permission denied
Unauthorized access
```

---

### Step 7: Test Terminal Functionality

If terminal connected successfully, try these commands:

1. **Basic command:**
   ```bash
   whoami
   ```
   Expected: Shows current user (e.g., `root`)

2. **Check NGINX:**
   ```bash
   nginx -v
   ```
   Expected: Shows NGINX version

3. **List files:**
   ```bash
   ls -la
   ```
   Expected: Shows directory listing

4. **Check system:**
   ```bash
   uname -a
   ```
   Expected: Shows system information

**What to observe:**
- Commands execute and return output
- Output appears in terminal with proper formatting
- No lag or delay in command execution
- Terminal scrolls properly with output

---

## Error Messages to Watch For

### Frontend Errors (Browser Console)

Press **F12** to open Developer Tools and check Console tab for:

```javascript
// WebSocket connection errors
WebSocket connection to 'ws://...' failed
Error: WebSocket closed unexpectedly

// API errors
Failed to fetch terminal session
Error: 401 Unauthorized
Error: 500 Internal Server Error

// Component errors
TypeError: Cannot read property 'terminal' of undefined
Error: Terminal component failed to mount
```

### Terminal Display Errors

**Error 1: Connection Timeout**
```
Connecting to agent...
Connection timeout after 30 seconds
```
**Possible Cause:** Agent is offline or unreachable

**Error 2: WebSocket Failed**
```
WebSocket connection failed
Error: net::ERR_CONNECTION_REFUSED
```
**Possible Cause:** Backend WebSocket server not running or wrong port

**Error 3: Authentication Failed**
```
Authentication required
Error: Invalid or missing token
```
**Possible Cause:** Session expired or auth not configured

**Error 4: Agent Not Found**
```
Error: Agent not found
Agent ID: <some-id>
```
**Possible Cause:** Agent was deleted or ID is incorrect

---

## Network Tab Analysis

In Browser DevTools (F12), go to **Network** tab:

### Look for these requests:

1. **Terminal Session Creation:**
   ```
   POST /api/agents/{id}/terminal
   Status: 200 OK or 201 Created
   ```

2. **WebSocket Connection:**
   ```
   WS ws://10.111.217.2:3000/api/terminal/{sessionId}
   Status: 101 Switching Protocols
   ```

3. **Terminal Data:**
   ```
   WS messages showing terminal I/O
   Type: Binary or Text frames
   ```

### Common Network Issues:

**Issue 1: 404 Not Found**
```
POST /api/agents/123/terminal
Status: 404 Not Found
```
**Meaning:** API endpoint doesn't exist or wrong URL

**Issue 2: 500 Internal Server Error**
```
POST /api/agents/123/terminal
Status: 500 Internal Server Error
```
**Meaning:** Backend error, check server logs

**Issue 3: WebSocket Upgrade Failed**
```
WS ws://...
Status: 400 Bad Request
```
**Meaning:** WebSocket handshake failed

---

## Test Report Template

After testing, fill out this report:

```markdown
## Web Terminal Test Report

**Date/Time:** [When you tested]
**Browser:** [Chrome/Firefox/Safari/Edge]
**URL:** http://10.111.217.2:3000/inventory

### Step 1: Inventory Page
- [ ] Page loaded successfully
- [ ] Agents are displayed
- [ ] Dark theme applied correctly
- **Screenshot:** [Attach]

### Step 2: Terminal Icon
- [ ] Terminal icon visible in Actions column
- [ ] Icon is clickable
- [ ] Hover effect works
- **Issues:** [None / Describe]

### Step 3: Click Terminal Icon
- [ ] Dialog appeared
- [ ] Dialog styled correctly (dark theme)
- [ ] No errors in console
- **Screenshot:** [Attach]
- **Issues:** [None / Describe]

### Step 4: Web Terminal Button
- [ ] Button is visible
- [ ] Button is clickable
- [ ] Button styled correctly
- **Issues:** [None / Describe]

### Step 5: Terminal Overlay
- [ ] Terminal overlay appeared
- [ ] Terminal has dark background
- [ ] Text is visible
- **Screenshot:** [Attach]
- **Issues:** [None / Describe]

### Step 6: Connection Status
- [ ] Connected successfully
- [ ] Connecting (still in progress)
- [ ] Connection failed
- **Error Message:** [If any]

### Step 7: Terminal Functionality
- [ ] Commands can be typed
- [ ] Commands execute
- [ ] Output is displayed
- [ ] Terminal scrolls properly
- **Commands Tested:** [List]
- **Issues:** [None / Describe]

### Browser Console Errors
```
[Paste any errors from F12 Console here]
```

### Network Tab Issues
```
[Paste any failed requests from F12 Network tab here]
```

### Overall Status
- [ ] ✅ Working perfectly
- [ ] ⚠️ Working with minor issues
- [ ] ❌ Not working

### Additional Notes
[Any other observations or issues]
```

---

## Expected Architecture

For reference, here's how the web terminal should work:

```
┌─────────────┐
│   Browser   │
│  (Frontend) │
└──────┬──────┘
       │ 1. Click Terminal Icon
       │ HTTP POST /api/agents/{id}/terminal
       ▼
┌─────────────┐
│   Gateway   │
│  (Backend)  │
└──────┬──────┘
       │ 2. Create Terminal Session
       │ Returns: { sessionId, wsUrl }
       ▼
┌─────────────┐
│   Browser   │
│  WebSocket  │
└──────┬──────┘
       │ 3. Connect to WebSocket
       │ WS ws://.../terminal/{sessionId}
       ▼
┌─────────────┐
│   Gateway   │
│  WS Handler │
└──────┬──────┘
       │ 4. Proxy to Agent
       │ SSH or exec connection
       ▼
┌─────────────┐
│    Agent    │
│  (NGINX)    │
└─────────────┘
```

---

## Troubleshooting Guide

### Problem: Terminal icon not visible
**Check:**
- Is the agent online/active?
- Does the agent support terminal access?
- Are permissions configured correctly?

### Problem: Dialog doesn't appear
**Check:**
- Browser console for JavaScript errors
- Network tab for failed API requests
- Check if modal/dialog CSS is loaded

### Problem: WebSocket connection fails
**Check:**
- Is the backend WebSocket server running?
- Correct port (usually 3000 or 8080)?
- Firewall blocking WebSocket connections?
- CORS configuration for WebSocket?

### Problem: Terminal shows but no prompt
**Check:**
- Is the agent reachable from backend?
- SSH credentials configured?
- Agent's SSH service running?
- Network connectivity between gateway and agent?

### Problem: Commands don't execute
**Check:**
- Terminal input is focused (click in terminal)
- WebSocket connection is active (check Network tab)
- No JavaScript errors blocking input
- Terminal emulator initialized correctly

---

## Quick Visual Test

If you're short on time, just verify these 3 things:

1. ✅ **Can you see the terminal icon?**
   - Yes = Good, proceed
   - No = Check if agents are loaded

2. ✅ **Does clicking it show something?**
   - Dialog appears = Good, proceed
   - Nothing happens = Check console for errors

3. ✅ **Can you see a terminal interface?**
   - Yes with prompt = Working!
   - Yes but no prompt = Connection issue
   - No = Check error messages

---

## Files to Check (For Debugging)

If issues are found, check these files:

### Frontend:
- `frontend/app/inventory/page.tsx` - Inventory page
- `frontend/components/TerminalDialog.tsx` - Terminal dialog (if exists)
- `frontend/components/WebTerminal.tsx` - Terminal component (if exists)

### Backend:
- `cmd/gateway/terminal.go` - Terminal handler (if exists)
- `cmd/gateway/websocket.go` - WebSocket handler (if exists)

### Configuration:
- Check if WebSocket endpoint is configured
- Check if agent SSH credentials are set
- Check if terminal feature is enabled in config

---

## Need Help?

If you encounter issues, provide:
1. **Screenshots** of each step
2. **Browser console errors** (F12 → Console)
3. **Network tab** showing failed requests (F12 → Network)
4. **Description** of what you expected vs what happened
5. **Agent status** - is the agent online and healthy?

This information will help diagnose and fix any terminal connectivity issues.
