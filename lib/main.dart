import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'config.dart';
import 'firebase_background_watcher.dart';
import 'party_shell.dart';

final FlutterLocalNotificationsPlugin localNotifications =
    FlutterLocalNotificationsPlugin();

@pragma('vm:entry-point')
void onBackgroundNotificationTap(NotificationResponse response) {
  NotificationTapHub.instance.emitTap(response.payload);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(<DeviceOrientation>[
    DeviceOrientation.portraitUp,
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
    ),
  );

  const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
  const iosInit = DarwinInitializationSettings(
    requestAlertPermission: true,
    requestBadgePermission: true,
    requestSoundPermission: true,
  );
  await localNotifications.initialize(
    const InitializationSettings(android: androidInit, iOS: iosInit),
    onDidReceiveNotificationResponse: (NotificationResponse response) {
      NotificationTapHub.instance.emitTap(response.payload);
    },
    onDidReceiveBackgroundNotificationResponse: onBackgroundNotificationTap,
  );

  try {
    final launchDetails =
        await localNotifications.getNotificationAppLaunchDetails();
    if (launchDetails != null &&
        launchDetails.didNotificationLaunchApp &&
        launchDetails.notificationResponse?.payload != null) {
      NotificationTapHub.instance.emitTap(
        launchDetails.notificationResponse!.payload,
      );
    }
  } catch (_) {}

  runApp(const NyePartyApp());
}

class NyePartyApp extends StatelessWidget {
  const NyePartyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appTitle,
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        scaffoldBackgroundColor: const Color(0xFF080C16),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFFBBF24),
          secondary: Color(0xFF38BDF8),
        ),
      ),
      home: PartyShellScreen(notifications: localNotifications),
    );
  }
}
