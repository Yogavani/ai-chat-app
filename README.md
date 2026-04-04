# Chattr (React Native)

Chattr is an Android-first chat application built with React Native.
It includes real-time messaging, AI tools, status updates, push notifications, and premium voice features.

## Features

- Real-time one-to-one chat
- Persistent **Chattr AI** chat contact
- AI Toolkit:
  - Ask AI
  - Generate Image
  - Text to Speech
  - Speech to Text
  - Voice Agent (Premium)
  - Document Analyzer
  - Image Understanding
  - Rewrite
  - Generate Replies
  - Summarize Chat
- WhatsApp-style status flow:
  - Upload status media
  - View recent/viewed status
  - Status viewers list with view time
- In-app and background message notifications (Android)
- Firebase Analytics event tracking
- Username/email duplicate checks on register
- Profile and settings management (image, about, theme)

## Tech Stack

- React Native
- TypeScript
- React Navigation
- Socket.io client
- Firebase Cloud Messaging + Notifee (Android notifications)
- React Native Firebase Analytics

## Project Structure

- `src/screens` - app screens (Home, Chat, AI Toolkit, Status, Settings, Premium)
- `src/services` - API, sockets, analytics, notifications, user services
- `src/navigation` - stack/tab navigation
- `src/utils` - shared helpers (media/image URL normalization)
- `android/` - native Android config (FCM, app resources)

## Prerequisites

- Node.js LTS
- JDK (compatible with your RN/Gradle setup)
- Android Studio + Android SDK
- A running backend API
- Firebase project configured for Android (`google-services.json`)

## Setup

1. Install dependencies

```bash
npm install
```

2. Add Firebase Android config

- Place `google-services.json` in:

```text
android/app/google-services.json
```

3. Configure API base URL

- Update API/base URL in `src/services/api.ts` to your backend URL.

4. Start Metro

```bash
npm start
```

5. Run Android app

```bash
npm run android
```

## Release Build (Android)

```bash
cd android
./gradlew assembleRelease
```

Generated APK path (typical):

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Notifications (Android)

- FCM token is synced from frontend to backend.
- Backend should send FCM data containing sender name/message/profile fields.
- Notifee renders WhatsApp-style messaging notifications.

## Analytics

Analytics events are logged through `src/services/analytics.ts`.

Examples already tracked:

- `app_open`
- `screen_viewed`
- `chat_opened`
- `message_sent`
- `message_received`
- `notification_received`
- `notification_opened`
- `status_uploaded`
- `status_viewed`
- `profile_image_updated`
- `about_updated`
- `theme_changed`

User properties tracked:

- `theme`
- `has_profile_image`

### Debug Analytics on Android Emulator/Device

```bash
adb -s <DEVICE_ID> shell setprop debug.firebase.analytics.app com.aichatapp
adb -s <DEVICE_ID> shell am force-stop com.aichatapp
adb -s <DEVICE_ID> shell monkey -p com.aichatapp -c android.intent.category.LAUNCHER 1
adb -s <DEVICE_ID> logcat -v time -s ReactNativeJS FA FA-SVC
```

Disable debug mode:

```bash
adb -s <DEVICE_ID> shell setprop debug.firebase.analytics.app .none.
```

## Premium (UPI)

Premium screen supports UPI payment app handoff (Google Pay / PhonePe / Any UPI app) and then manual unlock confirmation in-app.

## Notes

- This app is currently focused on **Android**.
- For backend deployment, ensure media URLs are served over HTTPS for best Android release compatibility.

## Scripts

```bash
npm start
npm run android
npm run lint
npm run test
```

## License

This project is for learning/demo/interview use unless otherwise specified.
