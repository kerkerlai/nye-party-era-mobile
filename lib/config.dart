/// 《跨年英雄紀元 2026 ➜ 2027》純手機 App 設定檔（免架設 Web 網站！）
/// 遊戲畫面與題庫已 100% 內建於 App 本機資源中，只需填入免費 Google Firebase Realtime Database 網址即可全員連線！
class AppConfig {
  static const String appTitle = '跨年英雄紀元';
  static const String bundleId = 'com.kerkerlai.nyepartyera';

  /// ★ 在免費 Google Firebase 建立 Realtime Database 後，將你的資料庫網址貼在下方（結尾不加 /）：
  /// 範例：'https://nye-party-era-default-rtdb.asia-southeast1.firebasedatabase.app'
  static const String defaultFirebaseDbUrl =
      'https://nye-party-era-default-rtdb.asia-southeast1.firebasedatabase.app';
}
