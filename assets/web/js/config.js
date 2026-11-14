/**
 * 《跨年英雄紀元 2026 ➜ 2027》全域設定與預設排程 / 徽章定義 (config.js)
 *
 * 💡 部署到雲端時：把下方 SUPABASE_URL 與 SUPABASE_ANON_KEY 填入你新建的免費 Supabase 專案資訊即可！
 * 💡 本機彩排／測試時：保持空白會自動連線至當前 server.py (100% 相同 PostgREST API + SSE 即時推播)。
 */

window.PARTY_CONFIG = {
  // ★ Google Firebase Realtime Database 網址（免費 Spark 方案，免綁卡！例如 "https://nye-party-era-default-rtdb.asia-southeast1.firebasedatabase.app"）
  // ★ 純手機 App 版可直接填在 mobile/lib/config.dart（或在 App 內切換），本機預覽留空即可！
  FIREBASE_DB_URL: "",

  // （選用舊版相容）Supabase Project URL 與 anon key
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // GM 主控台初始密碼（解鎖後可在後台修改）
  DEFAULT_GM_PIN: "2027",

  // 內建 24 款可愛派對 Emoji 頭貼（100% 免上傳圖片、零延遲不卡頓！）
  AVATAR_EMOJIS: [
    "🐶", "🐱", "🦊", "🐼", "🐨", "🐯", "🦁", "🐸",
    "🐧", "🐥", "🦄", "🐲", "🐙", "🦖", "🐹", "🐰",
    "🍻", "🥂", "🎮", "🚀", "👑", "💎", "🔥", "⛄"
  ],

  // 活動預設參數（直接以排程自動切換 + GM 手動切換統一運作，無獨立預熱模式差異）
  DEFAULTS: {
    eventTitle: "跨年英雄紀元",
    shareLabelA: "2026 回顧",
    sharePromptA: "2026 年最值得分享的一件事",
    shareLabelB: "2027 展望",
    sharePromptB: "2027 年最想完成的一件事",
    ceremonyStage: 1, // 終局頒獎典禮揭曉階段 1~4
    seasonStatus: "active", // active | settled
    sceneOverride: "auto", // auto | pre_event | dining | party | happy_hour | theme | red_packet | viewer
    activeDayKey: "2026-12-31",
    manualDayOverride: false,
    scheduleOffsetMinutes: 0, // 現場聚餐臨時順延排程分鐘數
    timeTravelOffsetMinutes: 0, // 彩排時光機快轉／倒退模擬時間分鐘數
    partyJoinPin: "1234", // 統一派對通行 PIN 碼（GM 後台可設定）
    enforceDeviceLock: true, // true: 預設開啟「1角色綁定1手機」防同名被別人重複登入；GM 後台可隨時切換或單筆解綁
    deviceLockDefaultV2: true,
    initialPoints: 300,
    dailyFloorPoints: 300,
    partyPlayStake: 20,
    partyBetStake: 10,
    happyHourBonusRate: 0.5,
    maxScoringPlaysPerGamePerDay: 3,
    maxBetsPerGamePerDay: 3,
    hiddenMissionPoints: 35,
    maxMissionRerollsPerDay: 3,
    redPacketPoints: 50,
    redPacketEnabled: true,
    villaInfo: {
      name: "跨年包棟秘密基地",
      address: "宜蘭／包棟民宿（GM 後台可填入詳細地址）",
      mapUrl: "https://maps.google.com",
      wifiSsid: "Villa_VIP_5G",
      wifiPass: "happy2027",
      doorCode: "1231#",
      notes: "🔔 開賽請務必打開手機通知與鈴聲！拍照任務請傳至 LINE 群組相簿後回 App 打勾即可！"
    },
    roomsList: [
      { id: "R201", name: "201 雙人景觀房", floor: "2F", capacity: 2 },
      { id: "R202", name: "202 雙人陽台房", floor: "2F", capacity: 2 },
      { id: "R301", name: "301 四人派對房", floor: "3F", capacity: 4 },
      { id: "R302", name: "302 四人閣樓房", floor: "3F", capacity: 4 },
      { id: "R303", name: "303 雙人靜謐房", floor: "3F", capacity: 2 }
    ]
  },

  // 四天三夜預設自動排程表（時間一到自動切換場景！每天 08:00 自動重置賽桌與下注次數！）
  DEFAULT_SCHEDULE: [
    { id: "s01", day: "12/31 (四)", start: "2026-12-31T19:00", end: "2026-12-31T20:30", scene: "dining", themeType: "", title: "抵達民宿 Check-in ＆ 跨年晚餐", desc: "解封偷看秘密大腿／二腿、鎖定首日隱藏任務、記得打開手機鈴聲！" },
    { id: "s02", day: "12/31 (四)", start: "2026-12-31T20:30", end: "2026-12-31T22:00", scene: "theme", themeType: "poll_minority", title: "破冰團康：匿名爆料派對 ＋ 頻率同步", desc: "全員點擊加入主題房，快問快答搶第一桶金！" },
    { id: "s03", day: "12/31 (四)", start: "2026-12-31T22:00", end: "2026-12-31T23:55", scene: "theme", themeType: "share_2026_2027", title: "跨年重頭戲：跨年英雄紀元・分享篇", desc: "兩輪盲猜所有人的 2026 年度故事與 2027 新年願望！" },
    { id: "s04", day: "12/31 (四)", start: "2026-12-31T23:55", end: "2027-01-01T00:15", scene: "red_packet", themeType: "nye_red_packet", title: "🎆 2027 跨年煙火倒數 ＆ 新年簽到紅包", desc: "全場手機同步跨年煙火，00:00 點擊領取 +50 PT 開運紅包！" },
    { id: "s05", day: "1/1 (五)", start: "2027-01-01T00:15", end: "2027-01-01T02:30", scene: "happy_hour", themeType: "", title: "🔥 2027 午夜首場 Happy Hour (+50%)", desc: "自由開 1~3 分鐘賽桌揪團對決與場邊下注！" },
    { id: "s06", day: "1/1 (五)", start: "2027-01-01T08:00", end: "2027-01-01T10:30", scene: "dining", themeType: "", title: "☀️ 元旦早餐 ＆ 08:00 全自動刷新回血", desc: "遊戲/下注次數歸零重置、低於 300 PT 自動補滿、早安打卡、鎖定新任務" },
    { id: "s07", day: "1/1 (五)", start: "2027-01-01T10:30", end: "2027-01-01T12:30", scene: "party", themeType: "", title: "🎲 元旦早場自由賽桌時間", desc: "推薦開桌：Switch／2v2 靈魂默契／ito 順風耳／終極密碼" },
    { id: "s08", day: "1/1 (五)", start: "2027-01-01T12:30", end: "2027-01-01T15:00", scene: "dining", themeType: "", title: "🍽️ 元旦午餐與午休社交", desc: "好好吃飯聊天，順便解個人 Chill 隱藏任務！" },
    { id: "s09", day: "1/1 (五)", start: "2027-01-01T15:00", end: "2027-01-01T17:00", scene: "theme", themeType: "find_figurine", title: "🏃‍♂️ 下午實體大戰：尋找真實小人雙隊攻防", desc: "上下半場藏匿提示＋找到後拍傳 LINE 群組打勾計時，最快隊伍每人 +100 PT！" },
    { id: "s10", day: "1/1 (五)", start: "2027-01-01T17:00", end: "2027-01-01T20:00", scene: "dining", themeType: "", title: "🍽️ 元旦晚餐社交時光", desc: "幫忙訂餐／收拾記得找 2 位朋友認證【民宿神隊友打卡】！" },
    { id: "s11", day: "1/1 (五)", start: "2027-01-01T20:00", end: "2027-01-02T01:00", scene: "happy_hour", themeType: "", title: "🔥 元旦黃金社交夜 (Happy Hour +50%)", desc: "跟超過 8 位不同朋友同桌玩可自動解鎖【雨露均霑 +40 PT】！" },
    { id: "s12", day: "1/2 (六)", start: "2027-01-02T08:00", end: "2027-01-02T10:30", scene: "dining", themeType: "", title: "☀️ 週六早餐 ＆ 08:00 全自動刷新回血", desc: "遊戲/下注次數歸零重置、低於 300 PT 自動補滿、早起打卡、鎖定新任務" },
    { id: "s13", day: "1/2 (六)", start: "2027-01-02T10:30", end: "2027-01-02T12:00", scene: "theme", themeType: "undercover", title: "🕵️ 週六午餐前推理場：誰是臥底", desc: "GM 開房全員加入，嘴砲推理抓出臥底與白板！" },
    { id: "s14", day: "1/2 (六)", start: "2027-01-02T12:00", end: "2027-01-02T15:00", scene: "dining", themeType: "", title: "🍽️ 週六午餐與休息社交", desc: "吃飽喝足準備迎接下午六關實體大對抗！" },
    { id: "s15", day: "1/2 (六)", start: "2027-01-02T15:00", end: "2027-01-02T17:00", scene: "theme", themeType: "physical_6stages", title: "🏓 下午實體派對：六關紅藍雙隊大對抗", desc: "隨機平分紅藍兩隊，彈跳球／桌上冰壺／立水瓶／乒乓連線／盲拉捲尺／秤重王，每關贏家 +30 PT！" },
    { id: "s16", day: "1/2 (六)", start: "2027-01-02T17:00", end: "2027-01-02T20:00", scene: "dining", themeType: "", title: "🍽️ 最後一晚大餐社交時光", desc: "把握機會清完個人隱藏任務！" },
    { id: "s17", day: "1/2 (六)", start: "2027-01-02T20:00", end: "2027-01-03T01:30", scene: "happy_hour", themeType: "", title: "🔥 終局衝刺夜 (Happy Hour +50%)", desc: "幫你的秘密大腿／二腿助攻賺分的最後黃金機會！" },
    { id: "s18", day: "1/3 (日)", start: "2027-01-03T09:30", end: "2027-01-03T11:30", scene: "viewer", themeType: "", title: "🏆 終局開牌頒獎典禮 (Viewer 結算)", desc: "全服鎖定，揭曉全員秘密大腿關係網、四大傳奇王冠徽章與總冠軍！" }
  ],

  // Party Game 7 款精選賽桌定義（內建完整玩法規則、獎金說明與獨立成就條件）
  PARTY_GAMES: [
    {
      id: "switch_free",
      icon: "🎮",
      name: "Switch 自由對決",
      minPlayers: 2,
      maxPlayers: 8,
      betMode: "player",
      desc: "不限遊戲（賽車／大亂鬥／派對），多人參賽由「本局第 1 名贏家」獨得全部獎金！",
      howToPlay: "桌長開桌可備註要玩的 Switch 遊戲（如瑪利歐賽車、大亂鬥、派對小遊戲）。主機實體比完一局後，在手機點選「本局第 1 名贏家」，經對手按確認即自動派發獎金！",
      scoringRule: "每位計分選手入場押 20 PT（如 4 人局總獎金 80 PT；🔥限時加成補貼 +50% 變 120 PT），由「本局唯一第 1 名贏家」獨得全部對戰獎金！",
      achievementRule: "👑【Switch 大魔王 +80 PT】：不限一般或限時加成時段，活動期間「計分局」累積奪冠次數最高者（最高並列則同獲），於終局結算獲得！"
    },
    {
      id: "quick_draw",
      icon: "⚡",
      name: "手機毫秒決鬥",
      minPlayers: 2,
      maxPlayers: 16,
      betMode: "player",
      desc: "支援 2～16 人亂鬥！內建「西部拔槍反應」與「盲按 10.000 秒」，第 1 名獨得總獎金！",
      howToPlay: "支援 2～16 人同時對決！桌長可選 2 種模式：①【🔫 西部拔槍】各自按下準備後，手機獨立隨機倒數變紅，測純反應毫秒數再統一比快慢（變紅前偷按淘汰）；②【⏱️ 盲按 10.000 秒】滿 3 秒自動蓋牌，全員按完比誰最接近 10.000 秒！",
      scoringRule: "每位計分選手入場押 20 PT，越多人玩獎金越高（如 8 人局總獎金 160 PT；🔥限時加成總獎金再 +50%），由全場最快／最準的第 1 名獨得全部獎金！"
    },
    {
      id: "number_bomb",
      icon: "💣",
      name: "終極密碼死鬥",
      minPlayers: 2,
      maxPlayers: 3,
      betMode: "player",
      desc: "精選 2～3 人快節奏死鬥！真隨機藏雷 1～99，輪流縮範圍淘汰踩雷者，存活者獨得獎金！",
      howToPlay: "限 2～3 人參賽！系統從 1～99 隨機抽出隱藏炸彈，依序輪流輸入數字縮小安全範圍，喊中炸彈當場淘汰！若 3 人局淘汰 1 人後將重抽新密碼進入 1v1 決戰！",
      scoringRule: "每位計分選手押 20 PT（2人局總獎金 40 PT、3人局 60 PT；🔥限時加成再 +50%），由最後唯一存活者獨得全部獎金！"
    },
    {
      id: "rps_king",
      icon: "✊",
      name: "猜拳連勝王",
      minPlayers: 2,
      maxPlayers: 2,
      betMode: "player",
      desc: "純手機同步暗出拳！五戰三勝（搶 3 勝），每拳即時開獎，系統全自動判勝負發獎金！",
      howToPlay: "五戰三勝制（先搶 3 勝者贏）！每回合雙方在各自手機秘密點選「✊石頭／✌️剪刀／🖐️布」，雙方選好後同步開牌計分，平手重出，先滿 3 勝者獲勝！",
      scoringRule: "雙方計分選手各押 20 PT（總獎金 40 PT＝贏家淨賺 +20 PT；🔥限時加成總獎金 60 PT＝贏家淨賺 +40 PT），搶滿 3 勝自動發放獎金！"
    },
    {
      id: "soul_sync_2v2",
      icon: "🤝",
      name: "2v2 靈魂默契快問快答",
      minPlayers: 2,
      maxPlayers: 4,
      betMode: "team_or_coop",
      desc: "100% 手機選擇題！支援「2人合作闖關」或「4人雙組 2v2 對抗」贏取獎金！",
      howToPlay: "連出 8 題四選一生活快問快答，禁止串供各自秒選！搭檔同題選中「相同選項」即得 1 分。支援「2 人合作闖關」或「4 人分 A/B 組對抗（開賽前點組別可換隊）」。",
      scoringRule: "每位計分選手押 20 PT：①【2人合作】對 0～4 題失敗沒收本金；對 5～6 題每人淨賺 +20 PT；對 7～8 題每人淨賺 +35 PT（🔥限時加成淨利 +50%）。②【4人對抗】高分組平分總獎金（平手退回本金）。",
      achievementRule: "💞【靈魂雙胞胎 +40 PT】：正式局單場 8 題中，同組搭檔默契命中達 6 題以上，雙人立即自動獲得！"
    },
    {
      id: "ito_numbers",
      icon: "🔢",
      name: "數字順風耳 ito",
      minPlayers: 3,
      maxPlayers: 8,
      betMode: "coop",
      desc: "支援 3～8 人合作！手機發 1～100 暗牌，口頭暗示由小排到大翻牌，越多人過關獎金越高！",
      howToPlay: "3～8 人合作！每人抽一張 1～100 秘密數字卡（禁說數字），依主題口頭舉例暗示大小，討論後由桌長在手機把大家名字「由小排到大」排好並翻牌！",
      scoringRule: "每位計分選手押 20 PT：翻牌數字「完全由小到大」即過關！退回本金外依人數發獎金：3人 +20、4人 +30、5人 +45、6人 +60、7人 +80、8人 +100 PT（🔥限時加成獎金再 +50%）；排錯沒收本金！"
    },
    {
      id: "five_seconds",
      icon: "⏱️",
      name: "5 秒不詞窮",
      minPlayers: 2,
      maxPlayers: 4,
      betMode: "player",
      desc: "手機抽題倒數 5.0 秒響鈴，面對面噴出 3 個答案由對手按過關，3 輪最高分獨得獎金！",
      howToPlay: "每人輪流挑戰 3 輪！輪到你時按「翻開題目並啟動 5.0 秒倒數」，響鈴前大聲講滿 3 個合理答案，由對手按「✅ 成功 (+1)」或「❌ 超時 (+0)」。",
      scoringRule: "每位計分選手押 20 PT（🔥限時加成總獎金 +50%），3 輪結束後由累積最高分者獨得全部對戰獎金（最高分並列則平分）！"
    }
  ],

  // 成就徽章目錄 (自動判定背景觸發 vs 個人主頁只顯示需要同伴 Check 的 6 項)
  BADGE_CATALOG: [
    // 👑 結算唯一冠 (+80 PT，終局結算自動頒發)
    { code: "crown_social", tier: "crown", icon: "👑", name: "社交恐怖分子", points: 80, auto: true, desc: "活動期間與最多「不同朋友」同桌遊戲＋互動解任務第 1 名" },
    { code: "crown_switch", tier: "crown", icon: "👑", name: "Switch 大魔王", points: 80, auto: true, desc: "Switch 計分局累積奪冠次數最高者（不限時段，並列同獲）" },
    { code: "crown_bettor", tier: "crown", icon: "👑", name: "地下賭聖", points: 80, auto: true, desc: "場邊下注命中率最高者" },
    { code: "crown_agent", tier: "crown", icon: "👑", name: "王牌特務", points: 80, auto: true, desc: "個人 Chill 隱藏任務累計完成數第 1 名" },

    // 🥈 遊戲里程碑 (+40 PT，100% 系統自動背景入帳)
    { code: "mile_mingle", tier: "silver", icon: "🥂", name: "雨露均霑", points: 40, auto: true, desc: "與多數不同朋友同桌玩過 Party Game" },
    { code: "mile_spy", tier: "silver", icon: "🕵️", name: "影帝級臥底", points: 40, auto: true, desc: "在《誰是臥底》擔任內鬼存活獲勝" },
    { code: "mile_twins", tier: "silver", icon: "💞", name: "靈魂雙胞胎", points: 40, auto: true, desc: "在《2v2 靈魂默契》單局 8 題中答出同答案達 6 題以上" },
    { code: "mile_sherlock", tier: "silver", icon: "🔍", name: "神探夏洛克", points: 40, auto: true, desc: "在《實體小人攻防戰》所屬隊伍贏得最快搜查勝利" },
    { code: "mile_mindreader", tier: "silver", icon: "🔮", name: "讀心神探", points: 40, auto: true, desc: "在分享盲猜主題賽單輪命中率達 70% 以上" },

    // 🎭 歡樂互助章 (+25 PT，100% 系統自動背景入帳)
    { code: "fun_jinx", tier: "fun", icon: "🕯️", name: "反指標冥燈", points: 25, auto: true, desc: "場邊下注連續猜錯 5 把安慰獎" },
    { code: "fun_notary", tier: "fun", icon: "⚖️", name: "最佳公證人", points: 25, auto: true, desc: "幫別人擔任見證人累計滿 5 次" },
    { code: "fun_pioneer", tier: "fun", icon: "🚀", name: "破冰先鋒", points: 25, auto: true, maxPerDay: true, desc: "當日第一個成功開桌完賽的桌長" },

    // 🙌 個人主頁顯示的「6 個需要同伴 Check 互證打卡項目」 (auto: false)
    { code: "chore_food", tier: "chore", icon: "🍱", name: "外送訂餐總召", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "主動幫忙統計餐點飲料、訂餐或外出採買補給（2位朋友認證，限2次）" },
    { code: "chore_clean", tier: "chore", icon: "🧹", name: "家事小精靈", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "用餐／派對後主動收拾桌面、洗碗盤或倒垃圾（2位朋友認證，限2次）" },
    { code: "chore_chef", tier: "chore", icon: "🍳", name: "大廚備料王", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "幫忙下廚煮火鍋、烤肉、切水果或準備宵夜（2位朋友認證，限2次）" },
    { code: "chore_driver", tier: "chore", icon: "🚗", name: "平安御用司機", points: 40, auto: false, maxCount: 1, needWitness: 2, desc: "跨年行程負責開車載大家往返或採買（2位同車認證，限1次）" },
    { code: "chore_photo", tier: "chore", icon: "📸", name: "回憶攝影師", points: 30, auto: false, maxCount: 2, needWitness: 2, needLineAlbumCheck: true, desc: "幫大家拍大合照或活動側拍並傳到 LINE 群組相簿（2位朋友認證，限2次）" },
    { code: "morning_bird", tier: "morning", icon: "🌅", name: "晨間陽光鳥", points: 30, auto: false, maxCount: 3, needWitness: 1, desc: "早上 06:30～09:00 在客廳早起並與 1 位早起夥伴互證（每日限1次）" }
  ],

  // 100% 動態連動 GM 後台注碼與加成倍率之規則說明產生器（獎金與專屬成就分行顯示！）
  getDynamicScoringRule(gameOrId, globalCfg) {
    const g = { ...this.DEFAULTS, ...(globalCfg || {}) };
    const id = typeof gameOrId === "string" ? gameOrId : gameOrId?.id;
    const s = Number(g.partyPlayStake) || 20;
    const rate = Number(g.happyHourBonusRate) || 0.5;
    const hhPct = Math.round(rate * 100);
    const hhMult = 1 + rate;

    switch (id) {
      case "switch_free":
        return `每位計分選手入場押 ${s} PT（如 4 人局總獎金 ${s * 4} PT；🔥限時加成補貼 +${hhPct}% 變 ${Math.round(s * 4 * hhMult)} PT），由「本局唯一第 1 名贏家」獨得全部對戰獎金！`;
      case "quick_draw":
        return `每位計分選手入場押 ${s} PT，越多人玩獎金越高（如 8 人局總獎金 ${s * 8} PT、14 人局 ${s * 14} PT；🔥限時加成總獎金再 +${hhPct}%），由全場最快／最準的第 1 名獨得全部獎金！`;
      case "number_bomb":
        return `每位計分選手押 ${s} PT（2人局總獎金 ${s * 2} PT、3人局 ${s * 3} PT；🔥限時加成再 +${hhPct}%），由最後唯一存活者獨得全部獎金！`;
      case "rps_king": {
        const hhPot = Math.round(s * 2 * hhMult);
        return `雙方計分選手各押 ${s} PT（總獎金 ${s * 2} PT＝贏家淨賺 +${s} PT；🔥限時加成總獎金 ${hhPot} PT＝贏家淨賺 +${hhPot - s} PT），搶滿 3 勝自動發放獎金！`;
      }
      case "soul_sync_2v2":
        return `每位計分選手押 ${s} PT：①【2人合作】對 0～4 題沒收本金；對 5～6 題退本金外每人淨賺 +20 PT；對 7～8 題每人淨賺 +35 PT（🔥限時加成獎金 +${hhPct}%）。②【4人對抗】高分組平分總獎金（平手退回本金）。`;
      case "ito_numbers":
        return `每位計分選手押 ${s} PT：翻牌數字「完全由小到大」即過關！退回本金外依人數發獎金：3人 +20、4人 +30、5人 +45、6人 +60、7人 +80、8人 +100 PT（🔥限時加成獎金再 +${hhPct}%，8人高達 +${Math.round(100 * hhMult)} PT！）；排錯沒收本金！`;
      case "five_seconds":
        return `每位計分選手押 ${s} PT（🔥限時加成總獎金 +${hhPct}%），3 輪結束後由累積得分最高者獨得全部對戰獎金（最高並列則平分）！`;
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
