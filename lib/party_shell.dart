import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'config.dart';
import 'local_asset_server.dart';

abstract class PartyNativeAdapter {
  Future<void> setWakelock(bool enabled);
  Future<void> triggerHaptic(String style);
  Future<void> requestNotificationPermission();
  Future<void> showNotification(int id, String title, String body);
  Future<void> launchExternalUrl(Uri uri);
  Future<void> exitApp();
  Future<String> startEmbeddedServer({
    required String firebaseDbUrl,
    required String nativeDeviceId,
  });
  void updateEmbeddedServerFirebaseUrl(String firebaseDbUrl);
  Future<void> stopEmbeddedServer();
  Future<PartyWebSession> createWebSession({
    required String initialUrl,
    required void Function(int progress) onProgress,
    required VoidCallback onPageStarted,
    required VoidCallback onPageFinished,
    required void Function(bool isMainFrame) onError,
    required bool Function(String url, bool isMainFrame) onNavigationRequest,
    required void Function(String message) onBridgeMessage,
    required Future<List<String>> Function() onPickAvatarFile,
  });
}

abstract class PartyWebSession {
  Widget buildView();
  Future<void> loadUrl(String url);
  Future<void> reload();
  Future<void> runJs(String script);
  Future<Object> runJsWithResult(String script);
  Future<bool> canGoBack();
  Future<void> goBack();
}

class RealPartyWebSession implements PartyWebSession {
  final WebViewController controller;
  RealPartyWebSession(this.controller);

  @override
  Widget buildView() => WebViewWidget(controller: controller);

  @override
  Future<void> loadUrl(String url) => controller.loadRequest(Uri.parse(url));

  @override
  Future<void> reload() => controller.reload();

  @override
  Future<void> runJs(String script) => controller.runJavaScript(script);

  @override
  Future<Object> runJsWithResult(String script) =>
      controller.runJavaScriptReturningResult(script);

  @override
  Future<bool> canGoBack() => controller.canGoBack();

  @override
  Future<void> goBack() => controller.goBack();
}

class RealPartyNativeAdapter implements PartyNativeAdapter {
  final FlutterLocalNotificationsPlugin notifications;
  LocalAssetServer? _assetServer;

  RealPartyNativeAdapter(this.notifications);

  @override
  Future<void> setWakelock(bool enabled) async {
    if (enabled) {
      await WakelockPlus.enable();
    } else {
      await WakelockPlus.disable();
    }
  }

  @override
  Future<void> triggerHaptic(String style) async {
    if (style == 'heavy') {
      await HapticFeedback.heavyImpact();
    } else {
      await HapticFeedback.mediumImpact();
    }
  }

  @override
  Future<void> requestNotificationPermission() async {
    await notifications
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);
    await notifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();
  }

  @override
  Future<void> showNotification(int id, String title, String body) async {
    await requestNotificationPermission();
    const androidDetails = AndroidNotificationDetails(
      'nye_party_channel',
      '跨年賽桌與任務通知',
      channelDescription: '新賽桌開盤揪團、隱藏任務見證與時段自動切換通知',
      importance: Importance.max,
      priority: Priority.high,
      playSound: true,
      enableVibration: true,
    );
    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );
    await notifications.show(
      id,
      title,
      body,
      const NotificationDetails(android: androidDetails, iOS: iosDetails),
    );
  }

  @override
  Future<void> launchExternalUrl(Uri uri) async {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Future<void> exitApp() async {
    await SystemNavigator.pop();
  }

  @override
  Future<String> startEmbeddedServer({
    required String firebaseDbUrl,
    required String nativeDeviceId,
  }) async {
    _assetServer ??= LocalAssetServer(
      firebaseDbUrl: firebaseDbUrl,
      nativeDeviceId: nativeDeviceId,
    );
    _assetServer!.firebaseDbUrl = firebaseDbUrl;
    _assetServer!.nativeDeviceId = nativeDeviceId;
    return await _assetServer!.start();
  }

  @override
  void updateEmbeddedServerFirebaseUrl(String firebaseDbUrl) {
    _assetServer?.firebaseDbUrl = firebaseDbUrl;
  }

  @override
  Future<void> stopEmbeddedServer() async {
    await _assetServer?.stop();
    _assetServer = null;
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
    late final PlatformWebViewControllerCreationParams params;
    if (!kIsWeb &&
        Platform.isIOS &&
        WebViewPlatform.instance is WebKitWebViewPlatform) {
      params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
    } else {
      params = const PlatformWebViewControllerCreationParams();
    }

    final ctrl = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF080C16))
      ..addJavaScriptChannel(
        'NYEPartyBridge',
        onMessageReceived: (JavaScriptMessage msg) {
          onBridgeMessage(msg.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: onProgress,
          onPageStarted: (_) => onPageStarted(),
          onPageFinished: (_) => onPageFinished(),
          onWebResourceError: (err) => onError(err.isForMainFrame ?? true),
          onNavigationRequest: (req) =>
              onNavigationRequest(req.url, req.isMainFrame)
              ? NavigationDecision.navigate
              : NavigationDecision.prevent,
        ),
      );

    if (!kIsWeb &&
        Platform.isAndroid &&
        ctrl.platform is AndroidWebViewController) {
      final androidCtrl = ctrl.platform as AndroidWebViewController;
      await androidCtrl.setMediaPlaybackRequiresUserGesture(false);
      await androidCtrl.enableZoom(true);
      await androidCtrl.setOnShowFileSelector((_) => onPickAvatarFile());
      await androidCtrl.setOnPlatformPermissionRequest((request) {
        request.grant();
      });
    }

    await ctrl.loadRequest(Uri.parse(initialUrl));
    return RealPartyWebSession(ctrl);
  }
}

class PartyShellScreen extends StatefulWidget {
  final FlutterLocalNotificationsPlugin notifications;
  final PartyNativeAdapter? adapterOverride;
  const PartyShellScreen({
    super.key,
    required this.notifications,
    this.adapterOverride,
  });

  @override
  State<PartyShellScreen> createState() => _PartyShellScreenState();
}

class _PartyShellScreenState extends State<PartyShellScreen> {
  final ImagePicker _imagePicker = ImagePicker();
  late final PartyNativeAdapter _adapter;
  PartyWebSession? _session;
  String _embeddedOrigin = 'http://127.0.0.1:18765';
  String _activeFirebaseUrl = AppConfig.defaultFirebaseDbUrl;
  String _nativeDeviceId = '';
  bool _offline = false;
  int _progress = 0;
  int _notifSeq = 1;
  DateTime? _lastBackPressAt;

  static bool isValidHttpUrl(String raw) {
    final uri = Uri.tryParse(raw.trim());
    return uri != null &&
        (uri.scheme == 'http' || uri.scheme == 'https') &&
        uri.host.isNotEmpty;
  }

  @override
  void initState() {
    super.initState();
    _adapter =
        widget.adapterOverride ?? RealPartyNativeAdapter(widget.notifications);
    _adapter.setWakelock(true);
    _initSession();
  }

  @override
  void dispose() {
    _adapter.setWakelock(false);
    _adapter.stopEmbeddedServer();
    super.dispose();
  }

  Future<String> _ensurePersistentDeviceId(SharedPreferences prefs) async {
    var existing = prefs.getString('nye_native_device_id') ?? '';
    if (existing.trim().isEmpty) {
      final rng = Random.secure();
      final hex = List.generate(
        16,
        (_) => rng.nextInt(16).toRadixString(16),
      ).join();
      final osTag = kIsWeb ? 'web' : Platform.operatingSystem;
      existing = 'app_${osTag}_$hex';
      await prefs.setString('nye_native_device_id', existing);
    }
    return existing;
  }

  Future<void> _injectRuntimeGlobals(PartyWebSession sess) async {
    final safeDevId = jsonEncode(_nativeDeviceId);
    final safeFbUrl = jsonEncode(_activeFirebaseUrl);
    try {
      await sess.runJs('''
        window.__NYE_FIREBASE_DB_URL__ = $safeFbUrl;
        window.__NYE_NATIVE_DEVICE_ID__ = $safeDevId;
        try {
          localStorage.setItem('nye_device_id', $safeDevId);
          localStorage.setItem('nye_firebase_db_url', $safeFbUrl);
        } catch (_) {}
      ''');
    } catch (_) {}
  }

  bool _decideNavigation(String rawUrl, bool isMainFrame) {
    if (!isMainFrame) return true;
    final uri = Uri.tryParse(rawUrl);
    if (uri == null) return false;
    final localHost = Uri.tryParse(_embeddedOrigin)?.host ?? '127.0.0.1';
    if (uri.host == localHost ||
        uri.host == 'localhost' ||
        uri.scheme == 'about' ||
        uri.scheme == 'data' ||
        uri.scheme == 'blob') {
      return true;
    }
    _adapter.launchExternalUrl(uri);
    return false;
  }

  Future<void> _initSession() async {
    final prefs = await SharedPreferences.getInstance();
    _nativeDeviceId = await _ensurePersistentDeviceId(prefs);

    final savedFb = prefs.getString('custom_firebase_db_url');
    if (savedFb != null && isValidHttpUrl(savedFb)) {
      _activeFirebaseUrl = savedFb.trim().replaceAll(RegExp(r'/+$'), '');
    }

    _embeddedOrigin = await _adapter.startEmbeddedServer(
      firebaseDbUrl: _activeFirebaseUrl,
      nativeDeviceId: _nativeDeviceId,
    );

    late PartyWebSession created;
    created = await _adapter.createWebSession(
      initialUrl: _embeddedOrigin,
      onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      },
      onPageStarted: () {
        if (mounted) setState(() => _offline = false);
        _injectRuntimeGlobals(created);
      },
      onPageFinished: () {
        _injectRuntimeGlobals(created);
      },
      onError: (isMainFrame) {
        if (isMainFrame && mounted) {
          setState(() => _offline = true);
        }
      },
      onNavigationRequest: _decideNavigation,
      onBridgeMessage: _handleBridgeMessage,
      onPickAvatarFile: _pickAvatarFromCameraOrGallery,
    );

    if (mounted) {
      setState(() => _session = created);
      await _injectRuntimeGlobals(created);
    }
  }

  Future<List<String>> _pickAvatarFromCameraOrGallery() async {
    if (!mounted) return const <String>[];
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: const Color(0xFF111827),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                '📷 設定個人大頭貼照片',
                style: TextStyle(
                  color: Color(0xFFFDE047),
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(
                  Icons.camera_alt_rounded,
                  color: Color(0xFFFBBF24),
                ),
                title: const Text(
                  '開啟相機自拍',
                  style: TextStyle(color: Colors.white),
                ),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(
                  Icons.photo_library_rounded,
                  color: Color(0xFF38BDF8),
                ),
                title: const Text(
                  '從手機相簿挑選',
                  style: TextStyle(color: Colors.white),
                ),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text(
                  '取消',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null) return const <String>[];
    try {
      final picked = await _imagePicker.pickImage(
        source: source,
        maxWidth: 768,
        maxHeight: 768,
        imageQuality: 85,
        preferredCameraDevice: CameraDevice.front,
      );
      if (picked == null) return const <String>[];
      return <String>[Uri.file(picked.path).toString()];
    } catch (_) {
      return const <String>[];
    }
  }

  Future<void> _handleBridgeMessage(String raw) async {
    try {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      final type = data['type'] as String? ?? '';
      if (type == 'haptic') {
        final style = data['style'] as String? ?? 'medium';
        await _adapter.triggerHaptic(style);
      } else if (type == 'request_permission') {
        await _adapter.requestNotificationPermission();
      } else if (type == 'notify') {
        final title = data['title'] as String? ?? '跨年英雄紀元';
        final body = data['body'] as String? ?? '';
        await _adapter.showNotification(_notifSeq++, title, body);
      } else if (type == 'switch_server') {
        if (mounted) {
          await _openFirebaseConfigDialog();
        }
      }
    } catch (_) {}
  }

  Future<void> _handleSystemBack() async {
    final sess = _session;
    if (sess != null && !_offline) {
      try {
        final res = await sess.runJsWithResult(
          '(window.PartyApp && window.PartyApp.handleBackButton) ? window.PartyApp.handleBackButton() : false',
        );
        if (res == true || res.toString() == 'true') {
          return;
        }
        if (await sess.canGoBack()) {
          await sess.goBack();
          return;
        }
      } catch (_) {}
    }

    final now = DateTime.now();
    if (_lastBackPressAt == null ||
        now.difference(_lastBackPressAt!) > const Duration(seconds: 2)) {
      _lastBackPressAt = now;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('再按一次返回鍵離開《跨年英雄紀元》'),
            duration: Duration(seconds: 2),
          ),
        );
      }
      return;
    }
    await _adapter.exitApp();
  }

  Future<void> _openFirebaseConfigDialog() async {
    final textCtrl = TextEditingController(text: _activeFirebaseUrl);
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF111827),
        title: const Text(
          '🔥 Firebase 資料庫網址設定',
          style: TextStyle(color: Colors.white, fontSize: 18),
        ),
        content: TextField(
          key: const Key('server-url-input'),
          controller: textCtrl,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText:
                'https://nye-party-era-default-rtdb.asia-southeast1.firebasedatabase.app',
            hintStyle: TextStyle(color: Colors.white54),
          ),
        ),
        actions: [
          TextButton(
            key: const Key('btn-restore-default-url'),
            onPressed: () => Navigator.pop(ctx, AppConfig.defaultFirebaseDbUrl),
            child: const Text('恢復預設網址'),
          ),
          TextButton(
            key: const Key('btn-cancel-url'),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('取消'),
          ),
          ElevatedButton(
            key: const Key('btn-save-url'),
            onPressed: () => Navigator.pop(ctx, textCtrl.text.trim()),
            child: const Text('儲存並重新載入'),
          ),
        ],
      ),
    );
    if (next == null || next.isEmpty) return;

    if (!isValidHttpUrl(next)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('⚠️ 請輸入有效的 https://...firebasedatabase.app 網址！'),
          ),
        );
      }
      return;
    }

    final normalized = next.replaceAll(RegExp(r'/+$'), '');
    final prefs = await SharedPreferences.getInstance();
    if (normalized == AppConfig.defaultFirebaseDbUrl) {
      await prefs.remove('custom_firebase_db_url');
    } else {
      await prefs.setString('custom_firebase_db_url', normalized);
    }
    _adapter.updateEmbeddedServerFirebaseUrl(normalized);
    setState(() {
      _activeFirebaseUrl = normalized;
      _offline = false;
    });
    if (_session != null) {
      await _injectRuntimeGlobals(_session!);
      await _session!.reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          _handleSystemBack();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF080C16),
        body: SafeArea(
          top: false,
          bottom: false,
          child: Stack(
            children: [
              if (_session != null && !_offline) _session!.buildView(),
              if (_offline)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.wifi_off_rounded,
                          color: Color(0xFFFBBF24),
                          size: 56,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          '正在重新載入本機遊戲引擎',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '目前 Firebase 位址：$_activeFirebaseUrl',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 18),
                        ElevatedButton.icon(
                          key: const Key('btn-offline-reload'),
                          onPressed: () {
                            setState(() => _offline = false);
                            _session?.reload();
                          },
                          icon: const Icon(Icons.refresh),
                          label: const Text('重新整理'),
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          key: const Key('btn-offline-switch-url'),
                          onPressed: _openFirebaseConfigDialog,
                          child: const Text('設定／切換 Firebase 資料庫網址'),
                        ),
                      ],
                    ),
                  ),
                ),
              if (_progress > 0 && _progress < 100 && !_offline)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(
                    key: const Key('top-loading-bar'),
                    value: _progress / 100.0,
                    minHeight: 2,
                    color: const Color(0xFFFBBF24),
                    backgroundColor: Colors.transparent,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
