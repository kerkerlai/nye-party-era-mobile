import AVFoundation
import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var activePlayers: [AVAudioPlayer] = []

  private func activatePlaybackAudioSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)
    } catch {
      // Ignore non-fatal audio session errors in simulator/headless runs
    }
  }

  private func playWavBase64(_ b64: String) {
    guard let data = Data(base64Encoded: b64) else { return }
    activatePlaybackAudioSession()
    activePlayers.removeAll { !$0.isPlaying }
    if let player = try? AVAudioPlayer(data: data) {
      player.volume = 0.95
      player.prepareToPlay()
      player.play()
      activePlayers.append(player)
    }
  }

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    activatePlaybackAudioSession()
    NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.activatePlaybackAudioSession()
    }
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self as? UNUserNotificationCenterDelegate
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "PartyNativeAudioBridge") {
      let channel = FlutterMethodChannel(
        name: "com.kerkerlai.nyepartyera/audio",
        binaryMessenger: registrar.messenger()
      )
      channel.setMethodCallHandler { [weak self] call, result in
        if call.method == "playWav",
           let args = call.arguments as? [String: Any],
           let b64 = args["wavBase64"] as? String {
          self?.playWavBase64(b64)
          result(true)
        } else if call.method == "activateAudio" {
          self?.activatePlaybackAudioSession()
          result(true)
        } else {
          result(FlutterMethodNotImplemented)
        }
      }
    }
  }
}
