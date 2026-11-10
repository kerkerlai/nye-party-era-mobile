import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

/// 內建於手機 App 本機 (127.0.0.1) 的極速離線資源伺服器！
/// 優點：
///   1. 完全免架 Vercel / 免外部網站，手機打開 0.03 秒瞬間載入畫面！
///   2. 固定本機 Origin (127.0.0.1:18765)，確保 localStorage 登入綁定永久保存！
///   3. 在回傳 index.html 第一時間同步注入 Firebase 網址與硬體 Device ID，零非同步競爭！
class LocalAssetServer {
  HttpServer? _server;
  String firebaseDbUrl;
  String nativeDeviceId;

  LocalAssetServer({
    required this.firebaseDbUrl,
    required this.nativeDeviceId,
  });

  int get port => _server?.port ?? 0;
  String get origin => 'http://127.0.0.1:$port';

  Future<String> start({int preferredPort = 18765}) async {
    if (_server != null) return origin;
    try {
      _server = await HttpServer.bind(
        InternetAddress.loopbackIPv4,
        preferredPort,
        shared: true,
      );
    } catch (_) {
      _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    }
    _server!.listen(_handleRequest, onError: (_) {});
    return origin;
  }

  Future<void> stop() async {
    final srv = _server;
    _server = null;
    if (srv != null) {
      await srv.close(force: true);
    }
  }

  static String contentTypeForPath(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
    if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
    if (lower.endsWith('.js')) return 'application/javascript; charset=utf-8';
    if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
  }

  Future<void> _handleRequest(HttpRequest req) async {
    try {
      var rel = Uri.decodeComponent(req.uri.path);
      if (rel.isEmpty || rel == '/') {
        rel = '/index.html';
      }
      // 防路徑穿越保護
      final cleanRel = rel
          .split('/')
          .where((seg) => seg.isNotEmpty && seg != '.' && seg != '..')
          .join('/');
      final assetKey = 'assets/web/$cleanRel';

      final data = await rootBundle.load(assetKey);
      final rawBytes = data.buffer.asUint8List(
        data.offsetInBytes,
        data.lengthInBytes,
      );

      req.response.statusCode = HttpStatus.ok;
      req.response.headers.set('Cache-Control', 'no-store');
      req.response.headers.set(
        HttpHeaders.contentTypeHeader,
        contentTypeForPath(cleanRel),
      );

      if (cleanRel == 'index.html') {
        final html = utf8.decode(rawBytes);
        final injectedScript =
            '<script>'
            'window.__NYE_FIREBASE_DB_URL__ = ${jsonEncode(firebaseDbUrl)};'
            'window.__NYE_NATIVE_DEVICE_ID__ = ${jsonEncode(nativeDeviceId)};'
            'try { localStorage.setItem("nye_device_id", ${jsonEncode(nativeDeviceId)}); } catch (_) {}'
            '</script>';
        final patched = html.replaceFirst('</head>', '$injectedScript</head>');
        final outBytes = utf8.encode(patched);
        req.response.headers.contentLength = outBytes.length;
        req.response.add(outBytes);
      } else {
        req.response.headers.contentLength = rawBytes.length;
        req.response.add(rawBytes);
      }
      await req.response.close();
    } catch (_) {
      req.response.statusCode = HttpStatus.notFound;
      req.response.write('Not found');
      await req.response.close();
    }
  }
}
