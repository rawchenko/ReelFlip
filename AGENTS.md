# ReelFlip Agent Notes

## Android + Backend Stability Runbook

### 1) Start services in this order
```bash
npm --prefix backend run start
npm run dev
npm run android
```

### 2) Quick health checks before debugging app UI
- Backend must respond:
```bash
curl http://127.0.0.1:3001/health
```
- Port check:
```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

### 3) API base URL rules
- Android emulator must use: `http://10.0.2.2:3001`
- Real Android device must use: `http://<your-mac-lan-ip>:3001`
- Do not use `localhost` inside Android app config for backend access.

### 4) Error triage rules
- `Feed unavailable` + `Network request failed` usually means backend is down/unreachable.
- Native crash (`app keeps stopping`, `IllegalViewOperationException`, missing view manager like `ExpoLinearGradient`) is a native build/runtime mismatch, not backend.
- iOS `xcrun simctl` errors are irrelevant for Android-only work.

### 5) If Android native build gets inconsistent
Run from repo root:
```bash
cd android && ./gradlew clean && cd ..
npm run android
```
If build scripts reference missing generated JNI/codegen dirs, regenerate by rebuilding app (do not debug backend first).

### 6) Known non-blocking warning
- `@noble/hashes ... not listed in exports ... ./crypto.js` is noisy and usually non-blocking for local Android dev.
