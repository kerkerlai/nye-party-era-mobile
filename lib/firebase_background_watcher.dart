import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// 全域推播點擊事件轉發中心（支援 App 冷啟動點擊通知 ＆ 背景喚醒點擊跳轉）
class NotificationTapHub {
  NotificationTapHub._();
  static final NotificationTapHub instance = NotificationTapHub._();

  final StreamController<String> _controller =
      StreamController<String>.broadcast();
  final List<String> _pendingPayloads = <String>[];

  Stream<String> get stream => _controller.stream;

  void emitTap(String? payload) {
    final trimmed = (payload ?? '').trim();
    if (trimmed.isEmpty) return;
    if (_controller.hasListener) {
      _controller.add(trimmed);
    } else {
      _pendingPayloads.add(trimmed);
    }
  }

  List<String> drainPending() {
    if (_pendingPayloads.isEmpty) return const <String>[];
    final copy = List<String>.from(_pendingPayloads);
    _pendingPayloads.clear();
    return copy;
  }
}

typedef BackgroundNotifyCallback = Future<void> Function(
  String title,
  String body,
  String payload,
);

/// 鎖屏／背景狀態下的原生 Firebase 即時監聽守護器
/// 解決手機螢幕鎖定時 WebView JS 被系統凍結收不到推播的問題（q2）
class FirebaseBackgroundWatcher {
  final String firebaseDbUrl;
  final String playerId;
  final BackgroundNotifyCallback onNotify;
  final HttpClient Function()? httpClientFactory;
  final Duration pollInterval;

  bool _running = false;
  bool _primed = false;
  HttpClient? _sseClient;
  StreamSubscription<String>? _sseSub;
  Timer? _pollTimer;
  Timer? _reconnectTimer;

  Map<String, dynamic> _players = <String, dynamic>{};
  Map<String, dynamic> _tables = <String, dynamic>{};
  Map<String, dynamic> _claims = <String, dynamic>{};
  Map<String, dynamic> _themes = <String, dynamic>{};

  final Set<String> _seenTableIds = <String>{};
  final Set<String> _seenNudgeKeys = <String>{};
  final Set<String> _seenClaimIds = <String>{};
  final Set<String> _seenApprovedMyClaimIds = <String>{};
  final Set<String> _seenThemeIds = <String>{};

  final Set<String> _emittedTables = <String>{};
  final Set<String> _emittedNudges = <String>{};
  final Set<String> _emittedClaims = <String>{};
  final Set<String> _emittedApprovedClaims = <String>{};
  final Set<String> _emittedThemes = <String>{};

  FirebaseBackgroundWatcher({
    required this.firebaseDbUrl,
    required this.playerId,
    required this.onNotify,
    this.httpClientFactory,
    this.pollInterval = const Duration(seconds: 10),
  });

  bool get isRunning => _running;

  String get _cleanBaseUrl => firebaseDbUrl.trim().replaceAll(RegExp(r'/+$'), '');

  HttpClient _newClient() {
    final c = httpClientFactory != null ? httpClientFactory!() : HttpClient();
    c.connectionTimeout = const Duration(seconds: 8);
    return c;
  }

  Future<void> start() async {
    if (_running || playerId.trim().isEmpty || _cleanBaseUrl.isEmpty) return;
    _running = true;
    await pollOnce();
    if (!_running) return;
    _connectSse();
    _pollTimer = Timer.periodic(pollInterval, (_) {
      if (_running) {
        pollOnce();
      }
    });
  }

  Map<String, List<String>> stopAndDrainSeenKeys() {
    _running = false;
    _pollTimer?.cancel();
    _pollTimer = null;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _sseSub?.cancel();
    _sseSub = null;
    _sseClient?.close(force: true);
    _sseClient = null;

    final out = <String, List<String>>{
      'tables': _emittedTables.toList(),
      'nudges': _emittedNudges.toList(),
      'claims': _emittedClaims.toList(),
      'approvedClaims': _emittedApprovedClaims.toList(),
      'themes': _emittedThemes.toList(),
    };
    _emittedTables.clear();
    _emittedNudges.clear();
    _emittedClaims.clear();
    _emittedApprovedClaims.clear();
    _emittedThemes.clear();
    return out;
  }

  Future<void> pollOnce() async {
    if (!_running) return;
    final client = _newClient();
    try {
      final uri = Uri.parse('$_cleanBaseUrl/.json');
      final req = await client.getUrl(uri);
      req.headers.set(HttpHeaders.acceptHeader, 'application/json');
      final res = await req.close().timeout(const Duration(seconds: 8));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final raw = await utf8.decoder.bind(res).join();
        final decoded = jsonDecode(raw);
        if (decoded is Map) {
          await _ingestRootMap(Map<String, dynamic>.from(decoded));
        }
      }
    } catch (_) {
      // 忽略背景暫時斷網，等待下一次輪詢或 SSE 重連
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _connectSse() async {
    if (!_running) return;
    _sseSub?.cancel();
    _sseClient?.close(force: true);
    final client = _newClient();
    _sseClient = client;

    try {
      final uri = Uri.parse('$_cleanBaseUrl/.json');
      final req = await client.getUrl(uri);
      req.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
      req.headers.set(HttpHeaders.cacheControlHeader, 'no-cache');
      final res = await req.close().timeout(const Duration(seconds: 10));
      if (!_running || res.statusCode != 200) {
        _scheduleReconnect();
        return;
      }

      String currentEvent = 'message';
      final dataLines = <String>[];

      _sseSub = utf8.decoder
          .bind(res)
          .transform(const LineSplitter())
          .listen(
            (line) {
              if (!_running) return;
              if (line.isEmpty) {
                if (dataLines.isNotEmpty) {
                  final rawData = dataLines.join('\n');
                  final ev = currentEvent;
                  dataLines.clear();
                  currentEvent = 'message';
                  _handleSseFrame(ev, rawData);
                }
                return;
              }
              if (line.startsWith('event:')) {
                currentEvent = line.substring(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.add(line.substring(5).trim());
              }
            },
            onError: (_) => _scheduleReconnect(),
            onDone: _scheduleReconnect,
            cancelOnError: true,
          );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (!_running) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      if (_running) _connectSse();
    });
  }

  Future<void> _handleSseFrame(String eventType, String rawData) async {
    if (eventType != 'put' && eventType != 'patch') return;
    try {
      final decoded = jsonDecode(rawData);
      if (decoded is! Map) return;
      final path = (decoded['path'] as String?) ?? '/';
      final data = decoded['data'];
      if (path == '/') {
        if (data is Map) {
          if (eventType == 'put') {
            await _ingestRootMap(Map<String, dynamic>.from(data));
          } else {
            final merged = <String, dynamic>{
              'players': _players,
              'tables': _tables,
              'claims': _claims,
              'theme_sessions': _themes,
              ...Map<String, dynamic>.from(data),
            };
            await _ingestRootMap(merged);
          }
        }
        return;
      }

      final segs = path.split('/').where((s) => s.isNotEmpty).toList();
      if (segs.isEmpty) return;
      final col = segs[0];
      Map<String, dynamic>? targetCol;
      if (col == 'players') targetCol = _players;
      if (col == 'tables') targetCol = _tables;
      if (col == 'claims') targetCol = _claims;
      if (col == 'theme_sessions') targetCol = _themes;
      if (targetCol == null) return;

      if (segs.length == 1) {
        if (data == null && eventType == 'put') {
          targetCol.clear();
        } else if (data is Map) {
          if (eventType == 'put') targetCol.clear();
          targetCol.addAll(Map<String, dynamic>.from(data));
        }
      } else if (segs.length == 2) {
        final rowId = segs[1];
        if (data == null && eventType == 'put') {
          targetCol.remove(rowId);
        } else if (data is Map) {
          if (eventType == 'patch' && targetCol[rowId] is Map) {
            targetCol[rowId] = <String, dynamic>{
              ...Map<String, dynamic>.from(targetCol[rowId] as Map),
              ...Map<String, dynamic>.from(data),
            };
          } else {
            targetCol[rowId] = Map<String, dynamic>.from(data);
          }
        }
      } else {
        // 深層路徑更新（如 /tables/t1/game_state/lastNudgeAt）：觸發一次完整同步最安全
        await pollOnce();
        return;
      }

      await _evaluateDiffs();
    } catch (_) {}
  }

  Map<String, dynamic> _asMapCollection(dynamic raw) {
    if (raw is Map) {
      final out = <String, dynamic>{};
      raw.forEach((k, v) {
        if (v is Map) {
          final row = Map<String, dynamic>.from(v);
          final id = (row['id']?.toString() ?? k.toString());
          row['id'] = id;
          out[id] = row;
        }
      });
      return out;
    }
    if (raw is List) {
      final out = <String, dynamic>{};
      for (var i = 0; i < raw.length; i++) {
        final v = raw[i];
        if (v is Map) {
          final row = Map<String, dynamic>.from(v);
          final id = (row['id']?.toString() ?? '$i');
          row['id'] = id;
          out[id] = row;
        }
      }
      return out;
    }
    return <String, dynamic>{};
  }

  Future<void> _ingestRootMap(Map<String, dynamic> root) async {
    _players = _asMapCollection(root['players']);
    _tables = _asMapCollection(root['tables']);
    _claims = _asMapCollection(root['claims']);
    _themes = _asMapCollection(root['theme_sessions']);
    await _evaluateDiffs();
  }

  String _playerName(String? id, [String fallback = '夥伴']) {
    if (id == null || id.isEmpty) return fallback;
    final p = _players[id];
    if (p is Map && p['name'] != null && p['name'].toString().trim().isNotEmpty) {
      return p['name'].toString().trim();
    }
    return fallback;
  }

  Future<void> _evaluateDiffs() async {
    if (!_primed) {
      for (final entry in _tables.entries) {
        final id = entry.key;
        final t = entry.value as Map<String, dynamic>;
        _seenTableIds.add(id);
        final gs = t['game_state'];
        if (gs is Map && gs['lastNudgeAt'] != null) {
          _seenNudgeKeys.add('${playerId}_${id}_${gs['lastNudgeAt']}');
        }
      }
      for (final entry in _claims.entries) {
        final id = entry.key;
        final c = entry.value as Map<String, dynamic>;
        _seenClaimIds.add(id);
        if (c['applicant_id']?.toString() == playerId &&
            c['status']?.toString() == 'approved') {
          _seenApprovedMyClaimIds.add(id);
        }
      }
      for (final id in _themes.keys) {
        _seenThemeIds.add(id);
      }
      _primed = true;
      return;
    }

    // 1. 新賽桌開盤 ＆ 房主廣播催人
    for (final entry in _tables.entries) {
      final id = entry.key;
      final t = entry.value as Map<String, dynamic>;
      final status = t['status']?.toString() ?? '';
      final hostId = t['host_id']?.toString() ?? '';
      final title = t['title']?.toString() ?? '自由賽桌';
      final hostName = _playerName(
        hostId,
        t['host_name']?.toString() ?? '夥伴',
      );
      final gs = t['game_state'] is Map
          ? Map<String, dynamic>.from(t['game_state'] as Map)
          : const <String, dynamic>{};

      final rawParts = t['participants'];
      final amIn = rawParts is List &&
          rawParts.any((p) => p is Map && p['id']?.toString() == playerId);

      if (!_seenTableIds.contains(id)) {
        _seenTableIds.add(id);
        if (gs['lastNudgeAt'] != null) {
          _seenNudgeKeys.add('${playerId}_${id}_${gs['lastNudgeAt']}');
        }
        if (status == 'open' && hostId != playerId) {
          _emittedTables.add(id);
          await onNotify(
            '🔥 房主【$hostName】開新賽桌囉！',
            '【$hostName】正在揪團玩「$title」，點此直接進房參賽或應援預測！',
            jsonEncode(<String, String>{
              'action': 'open_table',
              'tableId': id,
            }),
          );
        }
      } else if (status == 'open' && gs['lastNudgeAt'] != null) {
        final nudgeKey = '${playerId}_${id}_${gs['lastNudgeAt']}';
        if (!_seenNudgeKeys.contains(nudgeKey)) {
          _seenNudgeKeys.add(nudgeKey);
          if (hostId != playerId && !amIn) {
            _emittedNudges.add(nudgeKey);
            final nudger = gs['lastNudgeBy']?.toString() ?? hostName;
            await onNotify(
              '📢 房主【$nudger】緊急催人進房！',
              '【$nudger】在「$title」呼喚大家加入，點此直達房間！',
              jsonEncode(<String, String>{
                'action': 'open_table',
                'tableId': id,
              }),
            );
          }
        }
      }
    }

    // 2. 好友認證邀請 ＆ 我的任務剛通過入帳
    for (final entry in _claims.entries) {
      final id = entry.key;
      final c = entry.value as Map<String, dynamic>;
      final status = c['status']?.toString() ?? '';
      final targetId = c['target_id']?.toString() ?? '';
      final applicantId = c['applicant_id']?.toString() ?? '';
      final claimTitle = c['title']?.toString() ?? '任務認證';
      final pts = c['points']?.toString() ?? '35';
      final wits = c['witness_ids'] is List
          ? (c['witness_ids'] as List).map((e) => e.toString()).toSet()
          : const <String>{};

      if (!_seenClaimIds.contains(id)) {
        _seenClaimIds.add(id);
        final needMe =
            status == 'pending' &&
            (targetId == playerId || wits.contains(playerId));
        if (needMe) {
          _emittedClaims.add(id);
          final appName = _playerName(applicantId, '朋友');
          await onNotify(
            '🕵️ 收到好友認證請求！',
            '$appName 請你幫忙確認「$claimTitle」，點此直接幫他認證！',
            jsonEncode(<String, String>{
              'action': 'verify_claim',
              'claimId': id,
            }),
          );
        }
      }

      if (applicantId == playerId &&
          status == 'approved' &&
          !_seenApprovedMyClaimIds.contains(id)) {
        _seenApprovedMyClaimIds.add(id);
        _emittedApprovedClaims.add(id);
        await onNotify(
          '🎉 認證通過！+$pts PT 已入帳！',
          '你的「$claimTitle」已完成見證認證，點此查看入帳與投票明細！',
          jsonEncode(<String, String>{
            'action': 'open_claim_detail',
            'claimId': id,
          }),
        );
      }
    }

    // 3. 主題團康遊戲開房通知
    for (final entry in _themes.entries) {
      final id = entry.key;
      final s = entry.value as Map<String, dynamic>;
      if (!_seenThemeIds.contains(id)) {
        _seenThemeIds.add(id);
        final status = s['status']?.toString() ?? '';
        final hostId = s['host_id']?.toString() ?? '';
        if (status != 'finished' && hostId != playerId) {
          _emittedThemes.add(id);
          await onNotify(
            '🎪 主題團康活動開房囉！',
            'Host 已開啟主題遊戲房間，點此立即前往加入！',
            jsonEncode(const <String, String>{'action': 'open_stage'}),
          );
        }
      }
    }
  }
}
