# Fixing QR Code and Pairing Code Generation

## Problem
Main bot was not generating QR codes or pairing codes when running `npm start`.

## Root Cause
The socket event listeners in `whatsapp.js` were using the incorrect pattern:
```javascript
EventEmitter.prototype.on.call(sock.ev, 'connection.update', handler)
```

This was causing silent failures when setting up event listeners.

## Solution Applied

### 1. **whatsapp.js** - Fixed Connection Listeners
- Removed problematic `EventEmitter.prototype.on.call()` usage
- Replaced with direct `sock.ev.on()` calls
- Simplified connection.update listener
- Removed unnecessary try-catch blocks that were silencing errors
- Cleaned up messages.upsert listener
- Pairing code generation now works correctly

### 2. **subbot-runner.js** - Fixed Subbot Event Handling
- Removed incorrect attempt to access `sock.getCurrentPairingInfo()`
- Added proper listener for `pairing_code_ready` event
- Improved QR generation and event emission

### 3. **inproc-subbots.js** - Improved Event Filtering
- Added code-based filtering in `registerSubbotListeners()`
- Wrapped handlers to check subbot code matches
- Fixed unregister to properly clean up wrapped handlers

## Testing

Run the bot:
```bash
npm start
```

Choose authentication method:
- **Option 1**: QR Code - Should display QR in terminal
- **Option 2**: Pairing Code - Should show 8-digit code in console box

Both should display immediately after socket connects.

## Key Changes Summary

| File | Change | Impact |
|------|--------|--------|
| whatsapp.js | Removed EventEmitter.prototype.on.call, simplified listeners | QR and pairing codes now appear |
| subbot-runner.js | Rewritten event handling | Subbots can properly emit events |
| inproc-subbots.js | Added code-based filtering | Events properly routed to correct subbot |

## Debug Commands

If still having issues:
```bash
SUBBOT_VERBOSE=1 npm start
```

This will show detailed logging of subbot operations.
