import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nye_party_era/config.dart';
import 'package:nye_party_era/local_asset_server.dart';
import 'package:nye_party_era/party_shell.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FakePartyWebSession implements PartyWebSession {
  final List<String> loadedUrls = <String>[];
  final List<String> executedJs = <String>[];
  int reloadCount = 0;
  int goBackCount = 0;
  bool mockCanGoBack = false;
  Object mockBackButtonResult = false;

  @override
  Widget buildView() => const ColoredBox(
    key: Key('fake-webview-surface'),
    color: Color(0xFF080C16),
    child: Center(child: Text('NYE Embedded WebView')),
  );

  @override
  Future<void> loadUrl(String url) async {
    loadedUrls.add(url);
  }

  @override
  Future<void> reload() async {
    reloadCount++;
  }

  @override
  Future<void> runJs(String script) async {
    executedJs.add(script);
  }

  @override
  Future<Object> runJsWithResult(String script) async {
    executedJs.add(script);
    return mockBackButtonResult;
  }

  @override
  Future<bool> canGoBack() async => mockCanGoBack;

  @override
  Future<void> goBack() async {
    goBackCount++;
  }
}

class FakePartyNativeAdapter implements PartyNativeAdapter {
  final FakePartyWebSession session = FakePartyWebSession();
  final List<bool> wakelockCalls = <bool>[];
  final List<String> haptics = <String>[];
  final List<Map<String, Object>> shownNotifications = <Map<String, Object>>[];
  final List<Uri> externalUrls = <Uri>[];
  String lastEmbeddedFirebaseUrl = '';
  int permissionRequests = 0;
  int exitAppCount = 0;
  bool serverStopped = false;

  late void Function(int progress) emitProgress;
  late VoidCallback emitPageStarted;
  late VoidCallback emitPageFinished;
  late void Function(bool isMainFrame) emitError;
  late bool Function(String url, bool isMainFrame) checkNavigation;
  late void Function(String message) emitBridgeMessage;
  late Future<List<String>> Function() triggerPickAvatarFile;

  @override
  Future<void> setWakelock(bool enabled) async {
    wakelockCalls.add(enabled);
  }

  @override
  Future<void> triggerHaptic(String style) async {
    haptics.add(style);
  }

  @override
  Future<void> requestNotificationPermission() async {
    permissionRequests++;
  }

  @override
  Future<void> showNotification(int id, String title, String body) async {
    shownNotifications.add(<String, Object>{
      'id': id,
      'title': title,
      'body': body,
    });
  }

  @override
  Future<void> launchExternalUrl(Uri uri) async {
    externalUrls.add(uri);
  }

  @override
  Future<void> exitApp() async {
    exitAppCount++;
  }

  @override
  Future<String> startEmbeddedServer({
    required String firebaseDbUrl,
    required String nativeDeviceId,
  }) async {
    lastEmbeddedFirebaseUrl = firebaseDbUrl;
    return 'http://127.0.0.1:18765';
  }

  @override
  void updateEmbeddedServerFirebaseUrl(String firebaseDbUrl) {
    lastEmbeddedFirebaseUrl = firebaseDbUrl;
  }

  @override
  Future<void> stopEmbeddedServer() async {
    serverStopped = true;
  }

  @override
  Future<PartyWebSession> createWebSession({
    required String initialUrl,
    required void Function(int progress) onProgress,
    required VoidCallback onPageStarted,
    required VoidCallback onPageFinished,
    required void Function(bool isMainFrame) onError,
    required bool Function(String url, bool isMainFrame) onNavigationRequest,
    required void Function(String message) onBridgeMessage,
    required Future<List<String>> Function() onPickAvatarFile,
  }) async {
    session.loadedUrls.add(initialUrl);
    emitProgress = onProgress;
    emitPageStarted = onPageStarted;
    emitPageFinished = onPageFinished;
    emitError = onError;
    checkNavigation = onNavigationRequest;
    emitBridgeMessage = onBridgeMessage;
    triggerPickAvatarFile = onPickAvatarFile;
    return session;
  }
}

Widget _wrapShell(FakePartyNativeAdapter adapter) {
  return MaterialApp(
    theme: ThemeData.dark(useMaterial3: true),
    home: PartyShellScreen(
      notifications: FlutterLocalNotificationsPlugin(),
      adapterOverride: adapter,
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('0. Embedded LocalAssetServer (Zero-Vercel Offline Bundle) QA', () {
    test(
      'LocalAssetServer serves index.html with injected Firebase URL + Device ID, JS/CSS assets, and blocks missing files',
      () async {
        final prevOverrides = HttpOverrides.current;
        HttpOverrides.global = null;
        final srv = LocalAssetServer(
          firebaseDbUrl:
              'https://test-nye-rtdb.asia-southeast1.firebasedatabase.app',
          nativeDeviceId: 'app_ios_11223344',
        );
        final origin = await srv.start(preferredPort: 0);
        final client = HttpClient();
        try {
          final req1 = await client.getUrl(Uri.parse('$origin/'));
          final res1 = await req1.close();
          expect(res1.statusCode, 200);
          final html = await utf8.decoder.bind(res1).join();
          expect(html.contains('跨年英雄紀元'), isTrue);
          expect(
            html.contains(
              'window.__NYE_FIREBASE_DB_URL__ = "https://test-nye-rtdb.asia-southeast1.firebasedatabase.app"',
            ),
            isTrue,
          );
          expect(
            html.contains('window.__NYE_NATIVE_DEVICE_ID__ = "app_ios_11223344"'),
            isTrue,
          );

          final reqJs = await client.getUrl(Uri.parse('$origin/js/db.js'));
          final resJs = await reqJs.close();
          expect(resJs.statusCode, 200);
          final jsTxt = await utf8.decoder.bind(resJs).join();
          expect(jsTxt.contains('isFirebase'), isTrue);

          final reqCss = await client.getUrl(Uri.parse('$origin/css/app.css'));
          final resCss = await reqCss.close();
          expect(resCss.statusCode, 200);

          final req404 = await client.getUrl(
            Uri.parse('$origin/non_existent_file.js'),
          );
          final res404 = await req404.close();
          expect(res404.statusCode, 404);
        } finally {
          client.close(force: true);
          await srv.stop();
          HttpOverrides.global = prevOverrides;
        }
      },
    );
  });

  group('1. Flutter App Shell, Lifecycle & Device Lock Injection QA', () {
    testWidgets(
      'App boots embedded server, enables Wakelock, persists native device ID, and injects Firebase + Device ID',
      (tester) async {
        SharedPreferences.setMockInitialValues(<String, Object>{});
        final adapter = FakePartyNativeAdapter();

        await tester.pumpWidget(_wrapShell(adapter));
        await tester.pumpAndSettle();

        expect(find.byKey(const Key('fake-webview-surface')), findsOneWidget);
        expect(adapter.wakelockCalls, <bool>[true]);
        expect(adapter.session.loadedUrls.first, 'http://127.0.0.1:18765');
        expect(adapter.lastEmbeddedFirebaseUrl, AppConfig.defaultFirebaseDbUrl);

        final prefs = await SharedPreferences.getInstance();
        final storedDeviceId = prefs.getString('nye_native_device_id') ?? '';
        expect(storedDeviceId.startsWith('app_'), isTrue);
        expect(
          adapter.session.executedJs.any(
            (js) =>
                js.contains('__NYE_NATIVE_DEVICE_ID__') &&
                js.contains('__NYE_FIREBASE_DB_URL__') &&
                js.contains(storedDeviceId),
          ),
          isTrue,
        );

        await tester.pumpWidget(const SizedBox.shrink());
        expect(adapter.wakelockCalls, <bool>[true, false]);
        expect(adapter.serverStopped, isTrue);
      },
    );

    testWidgets(
      'Top gold loading indicator appears during 1..99% and hides at 100%',
      (tester) async {
        SharedPreferences.setMockInitialValues(<String, Object>{});
        final adapter = FakePartyNativeAdapter();

        await tester.pumpWidget(_wrapShell(adapter));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('top-loading-bar')), findsNothing);

        adapter.emitProgress(45);
        await tester.pump();
        expect(find.byKey(const Key('top-loading-bar')), findsOneWidget);

        adapter.emitProgress(100);
        await tester.pump();
        expect(find.byKey(const Key('top-loading-bar')), findsNothing);
      },
    );
  });

  group('2. Offline Resilience & Firebase DB Switcher Dialog QA', () {
    testWidgets(
      'Subresource errors do NOT interrupt game; main-frame error reloads cleanly',
      (tester) async {
        SharedPreferences.setMockInitialValues(<String, Object>{});
        final adapter = FakePartyNativeAdapter();

        await tester.pumpWidget(_wrapShell(adapter));
        await tester.pumpAndSettle();

        adapter.emitError(false);
        await tester.pump();
        expect(find.text('正在重新載入本機遊戲引擎'), findsNothing);

        adapter.emitError(true);
        await tester.pump();
        expect(find.text('正在重新載入本機遊戲引擎'), findsOneWidget);

        await tester.tap(find.byKey(const Key('btn-offline-reload')));
        await tester.pump();
        expect(adapter.session.reloadCount, 1);
        expect(find.byKey(const Key('fake-webview-surface')), findsOneWidget);
      },
    );

    testWidgets(
      'Firebase URL dialog rejects invalid URLs, saves rehearsal Firebase URL, updates LocalAssetServer, and restores default',
      (tester) async {
        SharedPreferences.setMockInitialValues(<String, Object>{});
        final adapter = FakePartyNativeAdapter();

        await tester.pumpWidget(_wrapShell(adapter));
        await tester.pumpAndSettle();

        adapter.emitBridgeMessage('{"type":"switch_server"}');
        await tester.pumpAndSettle();
        expect(find.text('🔥 Firebase 資料庫網址設定'), findsOneWidget);

        await tester.enterText(
          find.byKey(const Key('server-url-input')),
          'not_a_valid_url',
        );
        await tester.tap(find.byKey(const Key('btn-save-url')));
        await tester.pumpAndSettle();
        expect(
          find.text('⚠️ 請輸入有效的 https://...firebasedatabase.app 網址！'),
          findsOneWidget,
        );

        adapter.emitBridgeMessage('{"type":"switch_server"}');
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const Key('server-url-input')),
          'https://rehearsal-nye-default-rtdb.asia-southeast1.firebasedatabase.app/',
        );
        await tester.tap(find.byKey(const Key('btn-save-url')));
        await tester.pumpAndSettle();

        final prefs = await SharedPreferences.getInstance();
        expect(
          prefs.getString('custom_firebase_db_url'),
          'https://rehearsal-nye-default-rtdb.asia-southeast1.firebasedatabase.app',
        );
        expect(
          adapter.lastEmbeddedFirebaseUrl,
          'https://rehearsal-nye-default-rtdb.asia-southeast1.firebasedatabase.app',
        );
        expect(adapter.session.reloadCount, 1);

        adapter.emitBridgeMessage('{"type":"switch_server"}');
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('btn-restore-default-url')));
        await tester.pumpAndSettle();
        expect(prefs.getString('custom_firebase_db_url'), isNull);
        expect(adapter.lastEmbeddedFirebaseUrl, AppConfig.defaultFirebaseDbUrl);
      },
    );
  });

  group('3. Native Bridge (Haptics, Notifications, External URLs & Avatar BottomSheet) QA', () {
    testWidgets(
      'NYEPartyBridge handles haptic, request_permission, notify sequence, and malformed JSON safely',
      (tester) async {
        SharedPreferences.setMockInitialValues(<String, Object>{});
        final adapter = FakePartyNativeAdapter();

        await tester.pumpWidget(_wrapShell(adapter));
        await tester.pumpAndSettle();

        adapter.emitBridgeMessage('{"type":"haptic","style":"medium"}');
        adapter.emitBridgeMessage('{"type":"haptic","style":"heavy"}');
        adapter.emitBridgeMessage('{"type":"request_permission"}');
        adapter.emitBridgeMessage(
          '{"type":"notify","title":"🔥 新賽桌開盤！","body":"終極密碼生死鬥集結中"}',
        );
        adapter.emitBridgeMessage(
          '{"type":"notify","title":"🕵️ 好友見證","body":"Alice 請你確認任務"}',
        );
        adapter.emitBridgeMessage('{malformed_json_will_not_crash');
        await tester.pump();

        expect(adapter.haptics, <String>['medium', 'heavy']);
        expect(adapter.permissionRequests, 1);
        expect(adapter.shownNotifications.length, 2);
        expect(adapter.shownNotifications[0]['id'], 1);
        expect(adapter.shownNotifications[1]['id'], 2);
      },
    );

    testWidgets(
      'Navigation delegate keeps 127.0.0.1 embedded pages inside WebView and opens Google Maps externally',
      (tester) async {
        SharedPreferences.setMockInitialValues(<String, Object>{});
        final adapter = FakePartyNativeAdapter();

        await tester.pumpWidget(_wrapShell(adapter));
        await tester.pumpAndSettle();

        expect(
          adapter.checkNavigation('http://127.0.0.1:18765/index.html', true),
          isTrue,
        );
        expect(adapter.checkNavigation('blob:http://127.0.0.1/1', true), isTrue);
        expect(adapter.checkNavigation('https://maps.google.com', false), isTrue);
        expect(adapter.externalUrls, isEmpty);

        expect(
          adapter.checkNavigation('https://maps.google.com/?q=Yilan', true),
          isFalse,
        );
        expect(adapter.externalUrls.length, 1);
      },
    );

    testWidgets(
      'Android avatar file selector opens Camera / Gallery bottom sheet and cancels cleanly',
      (tester) async {
        SharedPreferences.setMockInitialValues(<String, Object>{});
        final adapter = FakePartyNativeAdapter();

        await tester.pumpWidget(_wrapShell(adapter));
        await tester.pumpAndSettle();

        final futurePick = adapter.triggerPickAvatarFile();
        await tester.pumpAndSettle();

        expect(find.text('📷 設定個人大頭貼照片'), findsOneWidget);
        expect(find.text('開啟相機自拍'), findsOneWidget);
        expect(find.text('從手機相簿挑選'), findsOneWidget);

        await tester.tap(find.text('取消'));
        await tester.pumpAndSettle();
        expect(await futurePick, isEmpty);
      },
    );
  });

  group('4. Android PopScope Back-Button 3-Stage Protection Chain QA', () {
    testWidgets(
      'Back button closes WebView modals/tabs first, then WebView history, then requires double-back within 2s to exit',
      (tester) async {
        SharedPreferences.setMockInitialValues(<String, Object>{});
        final adapter = FakePartyNativeAdapter();

        await tester.pumpWidget(_wrapShell(adapter));
        await tester.pumpAndSettle();

        adapter.session.mockBackButtonResult = true;
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(find.text('再按一次返回鍵離開《跨年英雄紀元》'), findsNothing);
        expect(adapter.exitAppCount, 0);

        adapter.session.mockBackButtonResult = false;
        adapter.session.mockCanGoBack = true;
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(adapter.session.goBackCount, 1);
        expect(adapter.exitAppCount, 0);

        adapter.session.mockCanGoBack = false;
        await tester.binding.handlePopRoute();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 250));
        expect(find.text('再按一次返回鍵離開《跨年英雄紀元》'), findsOneWidget);
        expect(adapter.exitAppCount, 0);

        await tester.binding.handlePopRoute();
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(adapter.exitAppCount, 1);
      },
    );
  });

  group('5. Static Android / iOS / Codemagic Native Build & Store Compliance Audit', () {
    test('AppConfig, Bundled Web Assets, Gradle, Xcode pbxproj, and Codemagic are complete & consistent', () {
      expect(AppConfig.appTitle, '跨年英雄紀元');
      expect(AppConfig.bundleId, 'com.kerkerlai.nyepartyera');
      expect(
        AppConfig.defaultFirebaseDbUrl.startsWith('https://') &&
            !AppConfig.defaultFirebaseDbUrl.endsWith('/'),
        isTrue,
      );

      for (final rel in <String>[
        'index.html',
        'css/app.css',
        'js/config.js',
        'js/db.js',
        'js/engine.js',
        'js/partyGames.js',
        'js/themeGames.js',
        'js/gmConsole.js',
        'js/app.js',
        'js/questionBanks.js',
        'assets/app_icon_192.png',
      ]) {
        final f = File('assets/web/$rel');
        expect(f.existsSync() && f.lengthSync() > 100, isTrue, reason: rel);
      }
      expect(File('docs/privacy.html').existsSync(), isTrue);
      expect(File('firebase_rules.json').existsSync(), isTrue);

      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(gradle.contains('applicationId = "com.kerkerlai.nyepartyera"'), isTrue);

      final pbx = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
      expect(pbx.contains('PRODUCT_BUNDLE_IDENTIFIER = com.kerkerlai.nyepartyera;'), isTrue);
      expect(
        pbx.contains('PRODUCT_BUNDLE_IDENTIFIER = com.kerkerlai.nyepartyera.RunnerTests;'),
        isTrue,
      );

      final codemagic = File('codemagic.yaml').readAsStringSync();
      expect(codemagic.contains('bundle_identifier: com.kerkerlai.nyepartyera'), isTrue);
      expect(codemagic.contains('java: 21'), isTrue);
    });

    test('AndroidManifest, iOS Info.plist, AppDelegate, and RGB AppIcons meet store requirements', () {
      final manifest = File(
        'android/app/src/main/AndroidManifest.xml',
      ).readAsStringSync();
      expect(manifest.contains('android.permission.INTERNET'), isTrue);
      expect(manifest.contains('android.permission.POST_NOTIFICATIONS'), isTrue);
      expect(manifest.contains('android.permission.CAMERA'), isFalse);
      expect(manifest.contains('android.media.action.IMAGE_CAPTURE'), isTrue);

      final plist = File('ios/Runner/Info.plist').readAsStringSync();
      expect(plist.contains('<key>NSCameraUsageDescription</key>'), isTrue);
      expect(plist.contains('<key>NSPhotoLibraryUsageDescription</key>'), isTrue);

      final appDelegate = File('ios/Runner/AppDelegate.swift').readAsStringSync();
      expect(
        appDelegate.contains('UNUserNotificationCenter.current().delegate'),
        isTrue,
      );

      final iosMarketingIcon = File(
        'ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png',
      );
      final bytes = iosMarketingIcon.readAsBytesSync();
      expect(bytes[25], 2);
    });
  });
}
