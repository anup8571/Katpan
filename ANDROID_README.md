# Royal Katti 3D - Native Android App

This repository has been configured to build and package **Royal Katti 3D: Maang Patta Casino** into a full **Native Android Application** using **Capacitor 8** and native Android Gradle.

---

## 📱 What Was Done

1. **Native Android Platform Created (`android/`)**:
   - Package Name: `com.royalkatti.casino`
   - App Name: `Royal Katti 3D`
   - Target SDK: Android 36 (Android 15+)
   - Min SDK: Android 24 (Android 7.0+, 99.8% device coverage)
   - Hardware Acceleration: WebGL 60/120fps enabled for Three.js 3D felt table rendering.
   - App Icons & Splash: HD Royal Katti brand assets integrated across all mipmap densities (`mdpi` through `xxxhdpi`).

2. **Native Device Hardware Integrations**:
   - **Native Android Haptics (`@capacitor/haptics`)**: High-fidelity motor vibration for card flips, deck cuts, wagers, and royal wins.
   - **Native Hardware Back Button (`@capacitor/app`)**: Pressing the Android back button smoothly dismisses open modals (Profile, Settings, Multiplayer, Victory screen) or returns to the Title screen before prompting app exit.
   - **Immersive Dark Status Bar (`@capacitor/status-bar`)**: Automatically blends into the `#070a0f` casino theme.
   - **Sensory Screen Orientation (`@capacitor/screen-orientation`)**: Fluid handling of portrait and landscape views.

3. **Automated Cloud CI/CD (`.github/workflows/build-android.yml`)**:
   - Whenever you push to GitHub, a GitHub Actions runner automatically compiles and uploads an installable **Android Debug APK** (`app-debug.apk`).

---

## 🚀 How to Build & Run

### 1. Rebuild and Sync Changes (In Termux / CLI)
Whenever you make changes to React components, 3D scenes, or CSS:
```bash
npm run build:android
```
This runs Vite production compilation and automatically syncs the bundled web assets into `android/app/src/main/assets/public`.

---

### 2. Build the APK locally with Android Studio (Recommended for PC/Mac)
If you have a computer or Android Studio installed:
1. Open **Android Studio**.
2. Select **Open** and choose the `android` folder in this repo:
   ```
   katpan/android
   ```
3. Let Gradle sync dependencies.
4. Click **Run ▶** to test on an Android emulator or plugged-in Android device via USB debugging.
5. To generate a release APK or Play Store Bundle (.aab):
   - Go to **Build** -> **Generate Signed Bundle / APK**.

---

### 3. Build APK with Command Line (Gradle)
If Android SDK and Java are installed:
```bash
cd android
./gradlew assembleDebug
```
The output APK is generated at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

### 4. Build APK automatically via GitHub Actions (Zero Setup!)
If you push this repository to GitHub:
1. Push your branch to GitHub (`git push origin main`).
2. Go to your repository's **Actions** tab on GitHub.
3. Select **Build Android APK** and click **Run workflow**.
4. Once completed (approx. 2-3 minutes), download the generated **`RoyalKatti-Android-Debug-APK`** zip file, extract `app-debug.apk`, and install it directly on your Android phone!
