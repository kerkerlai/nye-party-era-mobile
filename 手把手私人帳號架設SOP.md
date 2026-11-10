# 📱《跨年英雄紀元》私人帳號手把手架設 SOP（純手機 App ＋ 免費 Firebase）

> **架構超精簡（免架設 Web 網站、免 Vercel、免 Supabase、免綁信用卡、免 Mac 電腦）**：
> 整個遊戲畫面、音效與 300+ 題庫已 **100% 內建打包進手機 App 本機資源**，手機打開 **0.03 秒離線秒開畫面**！雲端只需要你用私人 Google 帳號開一個免費 **Firebase Realtime Database** 同步分數與房間即可。

---

## Step 1：用私人 Google 帳號開免費 Firebase 即時資料庫（約 3 分鐘，免綁卡！）

1. 用你的**私人 Google 帳號**打開 https://console.firebase.google.com/ ➜ 點 **Create a project（建立專案）**。
2. 專案名稱填 `nye-party-era` ➜ **把 Google Analytics 開關關掉**（不需要，關掉 15 秒就建好）➜ 點 **Create project**。
3. 進到專案後，點左側選單 **Build（建構）➜ Realtime Database** ➜ 點 **Create Database（建立資料庫）**。
4. **地區（Location）**：選 **`Singapore (asia-southeast1)`**（台灣連線最快）➜ 下一步選 **Start in locked mode** 按 **Enable**。
5. **⚠️ 必做防過期設定（避免預設測試模式 30 天後在 12 月中過期！）**：
   - 點資料庫上方的 **「Rules（規則）」** 分頁，把裡面原本的字全刪掉，貼上這 6 行（開放讀寫直到 **2027/03/01**，跨年結束後隨時可刪庫）：
     ```json
     {
       "rules": {
         ".read": "now < 1804003200000",
         ".write": "now < 1804003200000"
       }
     }
     ```
   - 點右上 **Publish（發布）**！
6. 切回 **「Data（資料）」** 分頁，複製畫面中間偏上方那條網址（長得像 `https://nye-party-era-default-rtdb.asia-southeast1.firebasedatabase.app`）。

---

## Step 2：把網址填進專案，傳上你的私人 GitHub（約 3 分鐘）

1. 用純文字編輯器（記事本 / VS Code）打開本資料夾裡的 **`lib/config.dart`**，把第 9 行的網址換成你剛剛複製的 Firebase 網址（**結尾不要有 `/`**）：
   ```dart
   static const String defaultFirebaseDbUrl =
       'https://你的專案代號-default-rtdb.asia-southeast1.firebasedatabase.app';
   ```
   *(💡 之後若想臨時切換另一個彩排用 Firebase 網址，不用重編 App！進 GM 後台點「🔥 設定／切換 Firebase 資料庫網址」就能直接在手機上改！)*

2. 登入你的**私人 GitHub**，到 https://github.com/new 建立新儲存庫 `nye-party-era-mobile`（Private 或 Public 皆可）。
3. 在私人電腦打開終端機（Terminal / PowerShell），把本資料夾推上去：
   ```bash
   cd nye-party-era-mobile
   git init
   git add .
   git commit -m "Initial NYE Party Era pure mobile app with Firebase"
   git branch -M main
   git remote add origin https://github.com/<你的私人GitHub帳號>/nye-party-era-mobile.git
   git push -u origin main
   ```

---

## Step 3：🤖 Android 雲端打包 APK ＆ 你的 GM 主控台設定（約 8 分鐘）

1. 用私人帳號登入 https://codemagic.io/apps ➜ **Add application** ➜ 選 GitHub 的 **`nye-party-era-mobile`** ➜ 類型選 **Flutter App (via codemagic.yaml)**。
2. 點 **Start new build** ➜ Workflow 選 **`android-apk`** ➜ **Start new build**。
3. 編譯亮綠燈後，在右側 **Artifacts** 下載 **`app-release.apk`**！
4. 裝進 Android 手機 ➜ 拍照上傳頭貼、輸入暱稱＋通行 PIN **`1234`** 登入 ➜ 點右下角 **「👑 GM控場」** 輸入初始 GM 密碼 **`2027`** 解鎖：
   - 修改 GM 後台密碼、民宿 Wi-Fi 與房間清單。
   - 大家正式用手機登入前，在 `🎛️ 控場` 開啟 **「🔒 正式單機綁定鎖」**（防雙機登同一角色；若有人手機沒電換機可在 `🛏️ 分房&綠燈` 點 `🔓 解除綁定`）。

---

## Step 4：🍎 iOS 雲端打包與 TestFlight 公開連結上線（免 Mac）

1. **隱私權網址（30 秒搞定）**：到 https://gist.github.com/ 開一個公開 Gist（貼上 `docs/privacy.html` 的文字說明），複製網址備用。
2. **Apple Developer**：到 https://developer.apple.com/account/resources/identifiers/list 新增 App ID `com.kerkerlai.nyepartyera`（不用勾任何額外權限）。
3. **App Store Connect**：到 https://appstoreconnect.apple.com/apps 新增 App `跨年英雄紀元` ➜ 填上隱私權網址 ➜ 複製純數字 **Apple ID** 貼進 `codemagic.yaml` 第 20 行 `APP_STORE_APPLE_ID`（並確認第 10 行 `app_store_connect:` 名稱與你私人 Codemagic 裡的金鑰名稱一致）後 `git commit -am "Set Apple ID" && git push`。
4. **Codemagic 一鍵編譯**：跑 **`ios-testflight`** Workflow，自動上傳至 TestFlight！
5. **外部測試送審文案**：
   - **Beta App 描述**：《跨年英雄紀元》是朋友聚會與包棟旅遊專用的行程倒數、分房查看與面對面團康計分輔助工具。不含任何付費機制、真實金流、第三方廣告或背景位置追蹤。
   - **審核登入資訊**：於首頁任意輸入測試暱稱（如 `AppReviewer`），PIN 碼填 `1234` 即可進入體驗開賽倒數看板、音效推播測試與年度分享卡填寫功能。
   - **備註**：相機與相簿權限僅在使用者主動點擊上傳個人大頭貼照片時觸發。
