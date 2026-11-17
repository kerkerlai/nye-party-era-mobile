/**
 * 《跨年英雄紀元 2026 ➜ 2027》全域設定與預設排程 / 徽章定義 (config.js)
 *
 * 📌 純親友聚會團康互動與趣味計分工具：採 100% 正向榮譽加分制（免押分、不倒扣、無金錢交易或獎品兌換）。
 */

window.PARTY_CONFIG = {
  FIREBASE_DB_URL: "",

  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // 主辦人管理專區初始通行碼（解鎖後可在後台修改）
  DEFAULT_GM_PIN: "2027",

  // 內建 24 款可愛派對 Emoji 頭貼（100% 免上傳圖片、零延遲不卡頓！）
  AVATAR_EMOJIS: [
    "🐶", "🐱", "🦊", "🐼", "🐨", "🐯", "🦁", "🐸",
    "🐧", "🐥", "🦄", "🐲", "🐙", "🦖", "🐹", "🐰",
    "🍻", "🥂", "🎮", "🚀", "👑", "💎", "🔥", "⛄"
  ],

  // 活動預設參數（排程自動切換 + 主辦人手動切換統一運作）
  DEFAULTS: {
    eventTitle: "跨年英雄紀元",
    shareLabelA: "2026 回顧",
    sharePromptA: "2026 年最值得分享的一件事",
    shareLabelB: "2027 展望",
    sharePromptB: "2027 年最想完成的一件事",
    ceremonyStage: 1, // 終局頒獎典禮揭曉階段 1~4
    seasonStatus: "active", // active | settled
    sceneOverride: "auto", // auto | pre_event | dining | party | happy_hour | theme | nye_gift | viewer
    activeDayKey: "2026-12-31",
    manualDayOverride: false,
    scheduleOffsetMinutes: 0, // 現場聚餐臨時順延排程分鐘數
    timeTravelOffsetMinutes: 0, // 彩排時光機快轉／倒退模擬時間分鐘數
    partyJoinPin: "1234", // 統一房間通行碼（主辦人後台可設定）
    enforceDeviceLock: true, // true: 預設開啟「1角色綁定1手機」防同名被別人重複登入
    deviceLockDefaultV2: true,
    initialPoints: 100, // 開賽報到紀念分（正向累積制，永不倒扣）
    dailyFloorPoints: 0, // 已改為純正向加分制，無須破產補血
    partyEntryPts: 15, // 每位參賽規模對應之基礎榮譽獎勵基數（2人局贏 +30 PT、4人局 +60 PT）
    partyPartPts: 5, // 計分局完賽參與鼓勵分（+5 PT）
    partyTiePts: 10, // 計分局平手完賽獎勵分（+10 PT）
    partyCheerPts: 10, // 場邊免費預測命中獎勵（+10 PT，未命中 0 PT 不扣分）
    happyHourBonusRate: 0.5,
    maxScoringPlaysPerGamePerDay: 3,
    maxCheersPerGamePerDay: 3,
    hiddenMissionPoints: 35,
    maxMissionRerollsPerDay: 3,
    nyeGiftPoints: 50,
    nyeGiftEnabled: true,
    villaInfo: {
      name: "跨年包棟秘密基地",
      address: "宜蘭／包棟民宿（主辦人後台可填入詳細地址）",
      mapUrl: "https://maps.google.com",
      wifiSsid: "Villa_VIP_5G",
      wifiPass: "happy2027",
      doorCode: "1231#",
      notes: "🔔 請開啟手機通知與鈴聲；拍照任務傳至派對群組相簿後打勾即可。"
    },
    roomsList: [
      { id: "R201", name: "201 雙人景觀房", floor: "2F", capacity: 2 },
      { id: "R202", name: "202 雙人陽台房", floor: "2F", capacity: 2 },
      { id: "R301", name: "301 四人派對房", floor: "3F", capacity: 4 },
      { id: "R302", name: "302 四人閣樓房", floor: "3F", capacity: 4 },
      { id: "R303", name: "303 雙人靜謐房", floor: "3F", capacity: 2 }
    ]
  },

  // 四天三夜預設自動排程表（時間一到自動切換場景！每天 08:00 自動重置賽桌與應援預測次數！）
  DEFAULT_SCHEDULE: [
    { id: "s01", day: "12/31 (四)", start: "2026-12-31T19:00", end: "2026-12-31T20:30", scene: "dining", themeType: "", title: "抵達民宿 Check-in ＆ 跨年晚餐", desc: "查看秘密搭檔、鎖定今日隱藏任務" },
    { id: "s02", day: "12/31 (四)", start: "2026-12-31T20:30", end: "2026-12-31T22:00", scene: "theme", themeType: "poll_minority", title: "破冰團康：匿名爆料 ＋ 心電頻率同步", desc: "全員進主題房，快問快答賺積分" },
    { id: "s03", day: "12/31 (四)", start: "2026-12-31T22:00", end: "2026-12-31T23:55", scene: "theme", themeType: "share_2026_2027", title: "跨年重頭戲：跨年英雄紀元・分享篇", desc: "兩輪盲猜 2026 回顧與 2027 展望" },
    { id: "s04", day: "12/31 (四)", start: "2026-12-31T23:55", end: "2027-01-01T00:15", scene: "nye_gift", themeType: "nye_checkin", title: "🎆 2027 跨年煙火倒數 ＆ 新年簽到禮", desc: "00:00 同步煙火，點擊領 +50 PT" },
    { id: "s05", day: "1/1 (五)", start: "2027-01-01T00:15", end: "2027-01-01T02:30", scene: "happy_hour", themeType: "", title: "🔥 午夜 Happy Hour (+50%)", desc: "自由開桌對決、場邊應援預測" },
    { id: "s06", day: "1/1 (五)", start: "2027-01-01T08:00", end: "2027-01-01T10:30", scene: "dining", themeType: "", title: "☀️ 元旦早餐 ＆ 08:00 額度刷新", desc: "重置每日額度、早鳥打卡、抽新任務" },
    { id: "s07", day: "1/1 (五)", start: "2027-01-01T10:30", end: "2027-01-01T12:30", scene: "party", themeType: "", title: "🎲 元旦早場自由賽桌", desc: "電玩擂台／靈魂默契／順風耳／終極密碼" },
    { id: "s08", day: "1/1 (五)", start: "2027-01-01T12:30", end: "2027-01-01T15:00", scene: "dining", themeType: "", title: "🍽️ 元旦午餐與午休社交", desc: "用餐聊天、順手解隱藏任務" },
    { id: "s09", day: "1/1 (五)", start: "2027-01-01T15:00", end: "2027-01-01T17:00", scene: "theme", themeType: "find_figurine", title: "🏃‍♂️ 實體大戰：尋找小人攻防", desc: "上下半場攻守計時，勝隊每人 +100 PT" },
    { id: "s10", day: "1/1 (五)", start: "2027-01-01T17:00", end: "2027-01-01T20:00", scene: "dining", themeType: "", title: "🍽️ 元旦晚餐社交時光", desc: "幫忙訂餐／收拾可申請神隊友打卡" },
    { id: "s11", day: "1/1 (五)", start: "2027-01-01T20:00", end: "2027-01-02T01:00", scene: "happy_hour", themeType: "", title: "🔥 元旦黃金夜 (Happy Hour +50%)", desc: "與多數夥伴同桌解鎖【雨露均霑 +40 PT】" },
    { id: "s12", day: "1/2 (六)", start: "2027-01-02T08:00", end: "2027-01-02T10:30", scene: "dining", themeType: "", title: "☀️ 週六早餐 ＆ 08:00 額度刷新", desc: "重置每日額度、早鳥打卡、抽新任務" },
    { id: "s13", day: "1/2 (六)", start: "2027-01-02T10:30", end: "2027-01-02T12:00", scene: "theme", themeType: "undercover", title: "🕵️ 週六推理場：誰是臥底", desc: "全員連線抽詞，推理抓臥底與白板" },
    { id: "s14", day: "1/2 (六)", start: "2027-01-02T12:00", end: "2027-01-02T15:00", scene: "dining", themeType: "", title: "🍽️ 週六午餐與休息", desc: "備戰下午實體六關對抗" },
    { id: "s15", day: "1/2 (六)", start: "2027-01-02T15:00", end: "2027-01-02T17:00", scene: "theme", themeType: "physical_6stages", title: "🏓 實體派對：六關紅藍對抗", desc: "紅藍分隊比 6 關，每關勝隊 +30 PT" },
    { id: "s16", day: "1/2 (六)", start: "2027-01-02T17:00", end: "2027-01-02T20:00", scene: "dining", themeType: "", title: "🍽️ 最後一晚大餐時光", desc: "衝刺完成個人隱藏任務" },
    { id: "s17", day: "1/2 (六)", start: "2027-01-02T20:00", end: "2027-01-03T01:30", scene: "happy_hour", themeType: "", title: "🔥 終局衝刺夜 (Happy Hour +50%)", desc: "決賽開牌前最後加分時段" },
    { id: "s18", day: "1/3 (日)", start: "2027-01-03T09:30", end: "2027-01-03T11:30", scene: "viewer", themeType: "", title: "🏆 終局開牌頒獎典禮", desc: "揭曉秘密大腿、四大王冠與總冠軍" }
  ],

  // Party Game 7 款精選賽桌定義（100% 免費參賽、正向加分不倒扣！）
  PARTY_GAMES: [
    {
      id: "switch_free",
      icon: "🎮",
      name: "電玩派對擂台",
      minPlayers: 2,
      maxPlayers: 8,
      cheerMode: "player",
      desc: "現場電視／桌遊對戰計分，完賽勾選贏家互認（可複選並列第 1）。",
      howToPlay: "桌長可備註比賽項目；現場比完勾選贏家（可複選並列），經對手確認即入帳。",
      scoringRule: "依人數給分（2人 +30、4人 +60 PT；🔥加成 +50%），並列均分保底 +20 PT，未勝 +5 PT。",
      achievementRule: "👑【電玩大魔王 +80 PT】：計分局累計奪冠最多者，終局結算頒發。"
    },
    {
      id: "quick_draw",
      icon: "⚡",
      name: "手機毫秒決鬥",
      minPlayers: 2,
      maxPlayers: 16,
      cheerMode: "player",
      desc: "2～16 人同場！內建「西部拔槍」與「盲按 10.000s」，搶 2 勝奪冠。",
      howToPlay: "搶 2 勝制：①【西部拔槍】等變紅秒按比毫秒（偷跑出局）；②【盲按 10s】3 秒後蓋牌，最接近 10.000s 拿 1 勝。",
      scoringRule: "2人 +30、4人 +60、8人以上 +120 PT（🔥加成 +50%），未勝 +5 PT。"
    },
    {
      id: "number_bomb",
      icon: "💣",
      name: "終極密碼死鬥",
      minPlayers: 2,
      maxPlayers: 3,
      cheerMode: "player",
      desc: "2～3 人快節奏！暗藏 1～99，1 人踩爆即結束，存活者獲勝。",
      howToPlay: "系統暗抽 1～99 密碼，輪流喊數縮範圍；1 人踩中即結束，其餘存活者獲勝。",
      scoringRule: "2人局贏家 +30 PT；3人局存活 2 人各 +25 PT（🔥加成 +50%），踩中 +5 PT。"
    },
    {
      id: "rps_king",
      icon: "✊",
      name: "猜拳連勝王",
      minPlayers: 2,
      maxPlayers: 2,
      cheerMode: "player",
      desc: "雙人手機暗出拳，五戰三勝（搶 3 勝），同步開牌計分。",
      howToPlay: "每拳各自暗選石頭／剪刀／布，雙方選妥自動開牌，平手重出，先滿 3 勝贏。",
      scoringRule: "贏家 +30 PT（🔥加成 +45 PT），完賽對手 +5 PT。"
    },
    {
      id: "soul_sync_2v2",
      icon: "🤝",
      name: "2v2 靈魂默契快問快答",
      minPlayers: 2,
      maxPlayers: 4,
      cheerMode: "team_or_coop",
      desc: "8 題四選一默契考驗，支援「2人合作」或「4人 2v2 對抗」。",
      howToPlay: "連答 8 題禁止串供，同組選相同選項得 1 分（4 人局開賽前點組別可換隊）。",
      scoringRule: "【2人合作】5～6 題 +25、7～8 題 +40 PT（未達 +5 PT）；【4人對抗】勝組 +30 PT（平手 +10 PT）。",
      achievementRule: "💞【靈魂雙胞胎 +40 PT】：計分局單場同組命中達 6 題以上立即獲得。"
    },
    {
      id: "ito_numbers",
      icon: "🔢",
      name: "數字順風耳",
      minPlayers: 3,
      maxPlayers: 8,
      cheerMode: "coop",
      desc: "3～8 人合作！每人抽 1～100 暗牌，口頭舉例由小排到大。",
      howToPlay: "每人抽 1～100 暗牌（禁說數字），依主題口頭形容大小，討論後由桌長排序翻牌。",
      scoringRule: "完全由小到大即過關：3人 +20、4人 +30、5人 +45、6人 +60、7人 +80、8人 +100 PT（🔥加成 +50%）；排錯 +5 PT。"
    },
    {
      id: "five_seconds",
      icon: "⏱️",
      name: "8 秒不詞窮",
      minPlayers: 2,
      maxPlayers: 4,
      cheerMode: "player",
      desc: "翻牌 8.0 秒內講滿 3 個答案，對手投票判定，3 輪最高分勝。",
      howToPlay: "每人輪流 3 輪，8 秒內講滿 3 個答案。3～4 人局採對手共識投票，過半數投 ✅ 才得分（平票 +0）。",
      scoringRule: "唯一最高分奪冠：2人 +30、3人 +45、4人 +60 PT（🔥加成 +50%）；並列第一平手各 +10 PT。"
    }
  ],

  // 成就徽章目錄 (自動判定背景觸發 vs 個人主頁只顯示需要同伴 Check 的 6 項)
  BADGE_CATALOG: [
    // 👑 結算唯一冠 (+80 PT，終局結算自動頒發)
    { code: "crown_social", tier: "crown", icon: "👑", name: "社交恐怖分子", points: 80, auto: true, desc: "與最多不同夥伴同桌＋互動解任務第 1 名" },
    { code: "crown_switch", tier: "crown", icon: "👑", name: "電玩大魔王", points: 80, auto: true, desc: "電玩擂台計分局奪冠次數最高（並列同獲）" },
    { code: "crown_prophet", tier: "crown", icon: "👑", name: "神預言家", points: 80, auto: true, desc: "場邊應援預測命中率最高" },
    { code: "crown_agent", tier: "crown", icon: "👑", name: "王牌特務", points: 80, auto: true, desc: "隱藏任務完成數第 1 名" },

    // 🥈 遊戲里程碑 (+40 PT，100% 系統自動背景入帳)
    { code: "mile_mingle", tier: "silver", icon: "🥂", name: "雨露均霑", points: 40, auto: true, desc: "與多數不同夥伴同桌玩過賽桌" },
    { code: "mile_spy", tier: "silver", icon: "🕵️", name: "影帝級臥底", points: 40, auto: true, desc: "《誰是臥底》擔任內鬼存活獲勝" },
    { code: "mile_twins", tier: "silver", icon: "💞", name: "靈魂雙胞胎", points: 40, auto: true, desc: "《靈魂默契》計分局單場同答案 ≥6 題" },
    { code: "mile_sherlock", tier: "silver", icon: "🔍", name: "神探夏洛克", points: 40, auto: true, desc: "《小人攻防戰》所屬隊伍獲勝" },
    { code: "mile_mindreader", tier: "silver", icon: "🔮", name: "讀心神探", points: 40, auto: true, desc: "《分享篇》單輪猜題命中率 ≥70%" },

    // 🎭 歡樂互助章 (+25 PT，100% 系統自動背景入帳)
    { code: "fun_jinx", tier: "fun", icon: "🕯️", name: "反指標冥燈", points: 25, auto: true, desc: "場邊預測連續未中 5 次" },
    { code: "fun_notary", tier: "fun", icon: "⚖️", name: "最佳公證人", points: 25, auto: true, desc: "擔任見證人累計滿 5 次" },
    { code: "fun_pioneer", tier: "fun", icon: "🚀", name: "破冰先鋒", points: 25, auto: true, maxPerDay: true, desc: "當日首位開桌完賽的桌長" },

    // 🙌 個人主頁顯示的「6 個需要同伴 Check 互證打卡項目」 (auto: false)
    { code: "chore_food", tier: "chore", icon: "🍱", name: "外送訂餐總召", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "統計餐點、訂餐或外出採買（2人見證，限2次）" },
    { code: "chore_clean", tier: "chore", icon: "🧹", name: "家事小精靈", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "收拾桌面、洗碗或倒垃圾（2人見證，限2次）" },
    { code: "chore_chef", tier: "chore", icon: "🍳", name: "大廚備料王", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "下廚煮鍋、烤肉、切水果或備宵夜（2人見證，限2次）" },
    { code: "chore_driver", tier: "chore", icon: "🚗", name: "平安御用司機", points: 40, auto: false, maxCount: 1, needWitness: 2, desc: "負責開車接送往返或採買（2人見證，限1次）" },
    { code: "chore_photo", tier: "chore", icon: "📸", name: "回憶攝影師", points: 30, auto: false, maxCount: 2, needWitness: 2, needLineAlbumCheck: true, desc: "拍合照或側拍並傳至群組相簿（2人見證，限2次）" },
    { code: "morning_bird", tier: "morning", icon: "🌅", name: "晨間陽光鳥", points: 30, auto: false, maxCount: 3, needWitness: 1, desc: "06:30～09:00 早起現身客廳互證（每日1次，限3次）" }
  ],

  // 100% 動態連動主辦人後台設定之正向計分規則產生器
  getDynamicScoringRule(gameOrId, globalCfg) {
    const g = { ...this.DEFAULTS, ...(globalCfg || {}) };
    const id = typeof gameOrId === "string" ? gameOrId : gameOrId?.id;
    const unit = Number(g.partyEntryPts) || 15;
    const partPt = Number(g.partyPartPts) ?? 5;
    const tiePt = Number(g.partyTiePts) ?? 10;
    const rate = Number(g.happyHourBonusRate) || 0.5;
    const hhPct = Math.round(rate * 100);
    const hhMult = 1 + rate;
    const win2 = Math.max(30, unit * 2);

    switch (id) {
      case "switch_free":
        return `2人 +${win2}、4人 +${unit * 4} PT（🔥+${hhPct}%）；並列均分保底 +20 PT，完賽 +${partPt} PT。`;
      case "quick_draw":
        return `2人 +${win2}、4人 +${unit * 4}、8人以上 +${unit * 8} PT（🔥+${hhPct}%），搶 2 勝奪冠，完賽 +${partPt} PT。`;
      case "number_bomb":
        return `2人局贏家 +${win2} PT；3人局存活各 +${Math.max(25, Math.floor((unit * 3) / 2))} PT（🔥+${hhPct}%），踩爆 +${partPt} PT。`;
      case "rps_king":
        return `搶 3 勝贏家 +${win2} PT（🔥+${Math.round(win2 * hhMult)} PT），完賽 +${partPt} PT。`;
      case "soul_sync_2v2":
        return `【2人合作】5～6題 +25、7～8題 +40 PT（未達 +${partPt}）；【4人對抗】勝組 +${win2} PT（平手 +${tiePt}）。`;
      case "ito_numbers":
        return `過關每人：3人 +20、4人 +30、5人 +45、6人 +60、7人 +80、8人 +100 PT（🔥+${hhPct}%）；排錯 +${partPt} PT。`;
      case "five_seconds":
        return `唯一最高分奪冠：2人 +${win2}、4人 +${unit * 4} PT（🔥+${hhPct}%）；總分並列平手各 +${tiePt} PT。`;
      default:
        return (typeof gameOrId === "object" && gameOrId?.scoringRule) || "";
    }
  },

  getDynamicAchievementRule(gameOrId) {
    const id = typeof gameOrId === "string" ? gameOrId : gameOrId?.id;
    const found = (this.PARTY_GAMES || []).find((x) => x.id === id);
    return (found && found.achievementRule) || (typeof gameOrId === "object" && gameOrId?.achievementRule) || "";
  }
};
