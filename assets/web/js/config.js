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
      notes: "🔔 活動期間請打開手機通知與鈴聲！拍照任務請傳至派對群組相簿後回 App 打勾即可！"
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
    { id: "s01", day: "12/31 (四)", start: "2026-12-31T19:00", end: "2026-12-31T20:30", scene: "dining", themeType: "", title: "抵達民宿 Check-in ＆ 跨年晚餐", desc: "查看秘密神隊友搭檔、鎖定首日隱藏任務、記得打開手機鈴聲！" },
    { id: "s02", day: "12/31 (四)", start: "2026-12-31T20:30", end: "2026-12-31T22:00", scene: "theme", themeType: "poll_minority", title: "破冰團康：匿名爆料派對 ＋ 心電頻率同步", desc: "全員點擊加入主題房，趣味快問快答累積榮譽積分！" },
    { id: "s03", day: "12/31 (四)", start: "2026-12-31T22:00", end: "2026-12-31T23:55", scene: "theme", themeType: "share_2026_2027", title: "跨年重頭戲：跨年英雄紀元・分享篇", desc: "兩輪盲猜所有人的 2026 年度故事與 2027 新年願望！" },
    { id: "s04", day: "12/31 (四)", start: "2026-12-31T23:55", end: "2027-01-01T00:15", scene: "nye_gift", themeType: "nye_checkin", title: "🎆 2027 跨年煙火倒數 ＆ 新年簽到禮", desc: "全場手機同步跨年煙火，00:00 點擊領取 +50 PT 新年開運簽到禮！" },
    { id: "s05", day: "1/1 (五)", start: "2027-01-01T00:15", end: "2027-01-01T02:30", scene: "happy_hour", themeType: "", title: "🔥 2027 午夜首場 Happy Hour (+50%)", desc: "自由開 1~3 分鐘賽桌揪團挑戰與免費場邊預測！" },
    { id: "s06", day: "1/1 (五)", start: "2027-01-01T08:00", end: "2027-01-01T10:30", scene: "dining", themeType: "", title: "☀️ 元旦早餐 ＆ 08:00 每日額度刷新", desc: "每日參賽/預測次數歸零重置、早安陽光鳥打卡、抽取新隱藏任務！" },
    { id: "s07", day: "1/1 (五)", start: "2027-01-01T10:30", end: "2027-01-01T12:30", scene: "party", themeType: "", title: "🎲 元旦早場自由賽桌時間", desc: "推薦開桌：電玩派對擂台／2v2 靈魂默契／數字順風耳／終極密碼" },
    { id: "s08", day: "1/1 (五)", start: "2027-01-01T12:30", end: "2027-01-01T15:00", scene: "dining", themeType: "", title: "🍽️ 元旦午餐與午休社交", desc: "好好吃飯聊天，順便解個人 Chill 隱藏任務！" },
    { id: "s09", day: "1/1 (五)", start: "2027-01-01T15:00", end: "2027-01-01T17:00", scene: "theme", themeType: "find_figurine", title: "🏃‍♂️ 下午實體大戰：尋找真實小人雙隊攻防", desc: "上下半場藏匿提示＋找到後拍傳群組相簿打勾計時，最快隊伍每人 +100 PT！" },
    { id: "s10", day: "1/1 (五)", start: "2027-01-01T17:00", end: "2027-01-01T20:00", scene: "dining", themeType: "", title: "🍽️ 元旦晚餐社交時光", desc: "幫忙訂餐／收拾記得找 2 位朋友認證【民宿神隊友打卡】！" },
    { id: "s11", day: "1/1 (五)", start: "2027-01-01T20:00", end: "2027-01-02T01:00", scene: "happy_hour", themeType: "", title: "🔥 元旦黃金社交夜 (Happy Hour +50%)", desc: "跟超過 8 位不同朋友同桌玩可自動解鎖【雨露均霑 +40 PT】！" },
    { id: "s12", day: "1/2 (六)", start: "2027-01-02T08:00", end: "2027-01-02T10:30", scene: "dining", themeType: "", title: "☀️ 週六早餐 ＆ 08:00 每日額度刷新", desc: "每日參賽/預測次數歸零重置、早安陽光鳥打卡、抽取新隱藏任務！" },
    { id: "s13", day: "1/2 (六)", start: "2027-01-02T10:30", end: "2027-01-02T12:00", scene: "theme", themeType: "undercover", title: "🕵️ 週六午餐前推理場：誰是臥底", desc: "主辦人開房全員加入，趣味推理抓出臥底與白板！" },
    { id: "s14", day: "1/2 (六)", start: "2027-01-02T12:00", end: "2027-01-02T15:00", scene: "dining", themeType: "", title: "🍽️ 週六午餐與休息社交", desc: "吃飽喝足準備迎接下午六關實體大對抗！" },
    { id: "s15", day: "1/2 (六)", start: "2027-01-02T15:00", end: "2027-01-02T17:00", scene: "theme", themeType: "physical_6stages", title: "🏓 下午實體派對：六關紅藍雙隊大對抗", desc: "隨機平分紅藍兩隊，彈跳球／桌上冰壺／立水瓶／乒乓連線／盲拉捲尺／秤重王，每關贏家 +30 PT！" },
    { id: "s16", day: "1/2 (六)", start: "2027-01-02T17:00", end: "2027-01-02T20:00", scene: "dining", themeType: "", title: "🍽️ 最後一晚大餐社交時光", desc: "把握機會清完個人隱藏任務！" },
    { id: "s17", day: "1/2 (六)", start: "2027-01-02T20:00", end: "2027-01-03T01:30", scene: "happy_hour", themeType: "", title: "🔥 終局衝刺夜 (Happy Hour +50%)", desc: "幫你的秘密大腿／二腿助攻加分的最後黃金機會！" },
    { id: "s18", day: "1/3 (日)", start: "2027-01-03T09:30", end: "2027-01-03T11:30", scene: "viewer", themeType: "", title: "🏆 終局開牌頒獎典禮 (Viewer 結算)", desc: "全服鎖定，揭曉全員秘密大腿關係網、四大傳奇王冠徽章與總冠軍！" }
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
      desc: "支援現場電視主機賽車／亂鬥／體感派對計分，免費參賽贏取勝利榮譽積分（可複選並列第 1 均分）！",
      howToPlay: "桌長開桌可備註現場要玩的電視主機或桌面派對項目（如競速賽車、派對亂鬥、體感小遊戲）。現場比完一局後，在手機勾選「本局獲勝贏家（可複選多位並列第 1）」，經對手按確認即自動發放勝利榮譽積分！",
      scoringRule: "免費參賽不扣分！勝利總榮譽分依人數規模提升（如 2人局 +30 PT、4人局 +60 PT；🔥限時加成再 +50%），單人奪冠獨得、多位並列第 1 均分（保底 +20 PT），完賽未勝亦得 +5 PT 參與鼓勵分！",
      achievementRule: "👑【電玩大魔王 +80 PT】：不限一般或限時加成時段，活動期間「計分局」累積奪冠次數最高者（最高並列則同獲），於終局結算獲得！"
    },
    {
      id: "quick_draw",
      icon: "⚡",
      name: "手機毫秒決鬥",
      minPlayers: 2,
      maxPlayers: 16,
      cheerMode: "player",
      desc: "支援 2～16 人同場競技！內建「西部拔槍反應」與「盲按 10.000 秒」，先搶 2 勝奪冠拿高分！",
      howToPlay: "支援 2～16 人同時對決，採【搶 2 勝制】！桌長可選 2 種模式：①【🔫 西部拔槍】各自按下準備後，手機獨立隨機倒數變紅，測純反應毫秒數再統一比快慢（變紅前偷按出局）；②【⏱️ 盲按 10.000 秒】滿 3 秒自動蓋牌，比誰最接近 10.000 秒！每把第 1 名拿 1 勝，先滿 2 勝即奪冠！",
      scoringRule: "免費參賽不扣分！越多人同場榮譽獎勵越高（2人局冠軍 +30 PT、4人局 +60 PT、8人以上最高 +120 PT；🔥限時加成再 +50%），完賽未勝亦得 +5 PT 參與鼓勵分！"
    },
    {
      id: "number_bomb",
      icon: "💣",
      name: "終極密碼死鬥",
      minPlayers: 2,
      maxPlayers: 3,
      cheerMode: "player",
      desc: "精選 2～3 人快節奏推理！隨機藏數 1～99，1 人踩中即刻完賽，未踩中者獲勝加分！",
      howToPlay: "限 2～3 人參賽！系統從 1～99 隨機抽出隱藏密碼，依序輪流輸入數字縮小範圍，只要有 1 人喊中密碼當場結束本局，未喊中的存活選手獲勝！",
      scoringRule: "免費參賽不扣分！2人局贏家獨得 +30 PT；3人局 2 位存活贏家各得 +25 PT（🔥限時加成再 +50%），踩中者亦得 +5 PT 完賽鼓勵分！"
    },
    {
      id: "rps_king",
      icon: "✊",
      name: "猜拳連勝王",
      minPlayers: 2,
      maxPlayers: 2,
      cheerMode: "player",
      desc: "純手機同步暗出拳！五戰三勝（搶 3 勝），每拳即時開獎，系統全自動判勝負加分！",
      howToPlay: "五戰三勝制（先搶 3 勝者贏）！每回合雙方在各自手機秘密點選「✊石頭／✌️剪刀／🖐️布」，雙方選好後同步開牌計分，平手重出，先滿 3 勝者獲勝！",
      scoringRule: "免費參賽不扣分！搶滿 3 勝贏家獲得 +30 PT（🔥限時加成 +45 PT），完賽對手亦得 +5 PT 參與鼓勵分！"
    },
    {
      id: "soul_sync_2v2",
      icon: "🤝",
      name: "2v2 靈魂默契快問快答",
      minPlayers: 2,
      maxPlayers: 4,
      cheerMode: "team_or_coop",
      desc: "100% 手機選擇題！支援「2人合作闖關」或「4人雙組 2v2 對抗」贏取榮譽積分！",
      howToPlay: "連出 8 題四選一生活快問快答，禁止串供各自秒選！搭檔同題選中「相同選項」即得 1 分。支援「2 人合作闖關」或「4 人分 A/B 組對抗（開賽前點組別可換隊）」。",
      scoringRule: "免費參賽不扣分！①【2人合作】對 5～6 題過關每人 +25 PT、對 7～8 題大滿貫每人 +40 PT（🔥限時加成 +50%）；0～4 題得 +5 PT 鼓勵分。②【4人對抗】高分組每人 +30 PT（平手全員 +10 PT）！",
      achievementRule: "💞【靈魂雙胞胎 +40 PT】：計分局單場 8 題中，同組搭檔默契命中達 6 題以上，計分選手立即自動獲得！"
    },
    {
      id: "ito_numbers",
      icon: "🔢",
      name: "數字順風耳",
      minPlayers: 3,
      maxPlayers: 8,
      cheerMode: "coop",
      desc: "支援 3～8 人合作！手機發 1～100 暗牌，口頭暗示由小排到大翻牌，越多人過關獎勵越高！",
      howToPlay: "3～8 人合作！每人抽一張 1～100 秘密數字卡（禁說數字），依主題口頭舉例暗示大小，討論後由桌長在手機把大家名字「由小排到大」排好並翻牌！",
      scoringRule: "免費參賽不扣分！翻牌數字「完全由小到大」即過關，每人獲階梯獎勵：3人 +20、4人 +30、5人 +45、6人 +60、7人 +80、8人 +100 PT（🔥限時加成再 +50%）；排錯亦得 +5 PT 參與鼓勵分！"
    },
    {
      id: "five_seconds",
      icon: "⏱️",
      name: "8 秒不詞窮",
      minPlayers: 2,
      maxPlayers: 4,
      cheerMode: "player",
      desc: "翻牌秒讀極簡題目！8.0 秒內講滿 3 個答案，對手共識投票（平票算輸），最高分奪冠加分！",
      howToPlay: "每人輪流挑戰 3 輪！輪到你時按「翻開題目並啟動 8.0 秒倒數」，每題固定於 8.0 秒響鈴前【講滿 3 個】符合題目的答案！2 人局由對手判定；3～4 人局由全體對手同時共識投票（過半數投 ✅ 才得 1 分，票數平手算挑戰失敗 +0 分）！",
      scoringRule: "免費參賽不扣分！3 輪結束唯一最高分奪冠（2人局 +30 PT、3人局 +45 PT、4人局 +60 PT；🔥限時加成 +50%）；總分並列第一則平手每人 +10 PT！"
    }
  ],

  // 成就徽章目錄 (自動判定背景觸發 vs 個人主頁只顯示需要同伴 Check 的 6 項)
  BADGE_CATALOG: [
    // 👑 結算唯一冠 (+80 PT，終局結算自動頒發)
    { code: "crown_social", tier: "crown", icon: "👑", name: "社交恐怖分子", points: 80, auto: true, desc: "活動期間與最多「不同朋友」同桌遊戲＋互動解任務第 1 名" },
    { code: "crown_switch", tier: "crown", icon: "👑", name: "電玩大魔王", points: 80, auto: true, desc: "電玩派對擂台計分局累積奪冠次數最高者（不限時段，並列同獲）" },
    { code: "crown_prophet", tier: "crown", icon: "👑", name: "神預言家", points: 80, auto: true, desc: "場邊免費應援預測命中率最高者" },
    { code: "crown_agent", tier: "crown", icon: "👑", name: "王牌特務", points: 80, auto: true, desc: "個人 Chill 隱藏任務累計完成數第 1 名" },

    // 🥈 遊戲里程碑 (+40 PT，100% 系統自動背景入帳)
    { code: "mile_mingle", tier: "silver", icon: "🥂", name: "雨露均霑", points: 40, auto: true, desc: "與多數不同朋友同桌玩過 Party Game" },
    { code: "mile_spy", tier: "silver", icon: "🕵️", name: "影帝級臥底", points: 40, auto: true, desc: "在《誰是臥底》擔任內鬼存活獲勝" },
    { code: "mile_twins", tier: "silver", icon: "💞", name: "靈魂雙胞胎", points: 40, auto: true, desc: "在《2v2 靈魂默契》計分局單場 8 題中答出同答案達 6 題以上" },
    { code: "mile_sherlock", tier: "silver", icon: "🔍", name: "神探夏洛克", points: 40, auto: true, desc: "在《實體小人攻防戰》所屬隊伍贏得最快搜查勝利" },
    { code: "mile_mindreader", tier: "silver", icon: "🔮", name: "讀心神探", points: 40, auto: true, desc: "在分享盲猜主題賽單輪命中率達 70% 以上" },

    // 🎭 歡樂互助章 (+25 PT，100% 系統自動背景入帳)
    { code: "fun_jinx", tier: "fun", icon: "🕯️", name: "反指標冥燈", points: 25, auto: true, desc: "場邊應援預測連續未中 5 次趣味紀念獎" },
    { code: "fun_notary", tier: "fun", icon: "⚖️", name: "最佳公證人", points: 25, auto: true, desc: "幫別人擔任見證人累計滿 5 次" },
    { code: "fun_pioneer", tier: "fun", icon: "🚀", name: "破冰先鋒", points: 25, auto: true, maxPerDay: true, desc: "當日第一個成功開桌完賽的桌長" },

    // 🙌 個人主頁顯示的「6 個需要同伴 Check 互證打卡項目」 (auto: false)
    { code: "chore_food", tier: "chore", icon: "🍱", name: "外送訂餐總召", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "主動幫忙統計餐點飲料、訂餐或外出採買補給（2位朋友認證，限2次）" },
    { code: "chore_clean", tier: "chore", icon: "🧹", name: "家事小精靈", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "用餐／派對後主動收拾桌面、洗碗盤或倒垃圾（2位朋友認證，限2次）" },
    { code: "chore_chef", tier: "chore", icon: "🍳", name: "大廚備料王", points: 40, auto: false, maxCount: 2, needWitness: 2, desc: "幫忙下廚煮火鍋、烤肉、切水果或準備宵夜（2位朋友認證，限2次）" },
    { code: "chore_driver", tier: "chore", icon: "🚗", name: "平安御用司機", points: 40, auto: false, maxCount: 1, needWitness: 2, desc: "跨年行程負責開車載大家往返或採買（2位同車認證，限1次）" },
    { code: "chore_photo", tier: "chore", icon: "📸", name: "回憶攝影師", points: 30, auto: false, maxCount: 2, needWitness: 2, needLineAlbumCheck: true, desc: "幫大家拍大合照或活動側拍並傳到派對群組相簿（2位朋友認證，限2次）" },
    { code: "morning_bird", tier: "morning", icon: "🌅", name: "晨間陽光鳥", points: 30, auto: false, maxCount: 3, needWitness: 1, desc: "早上 06:30～09:00 在客廳早起並與 1 位早起夥伴互證（每自然日限1次，全程限3次）" }
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
        return `免費參賽不扣分！勝利榮譽分依人數提升（2人局 +${win2} PT、4人局 +${unit * 4} PT；🔥限時加成再 +${hhPct}%），單人奪冠獨得，多位並列第 1 均分（保底 +20 PT），完賽未勝亦得 +${partPt} PT 參與鼓勵分！`;
      case "quick_draw":
        return `免費參賽不扣分！越多人同場獎勵越高（2人局 +${win2} PT、4人局 +${unit * 4} PT、多人最高 +${unit * 8} PT；🔥限時加成再 +${hhPct}%），率先搶滿 2 勝者奪冠，完賽未勝亦得 +${partPt} PT！`;
      case "number_bomb":
        return `免費參賽不扣分！2人局贏家獲 +${win2} PT；3人局 2 位存活贏家各得 +${Math.max(25, Math.floor((unit * 3) / 2))} PT（🔥限時加成再 +${hhPct}%），踩中密碼者亦得 +${partPt} PT 參與分！`;
      case "rps_king":
        return `免費參賽不扣分！搶滿 3 勝贏家獲 +${win2} PT（🔥限時加成 +${Math.round(win2 * hhMult)} PT），完賽對手亦得 +${partPt} PT 參與分！`;
      case "soul_sync_2v2":
        return `免費參賽不扣分！①【2人合作】對 5～6 題每人 +25 PT、對 7～8 題每人 +40 PT（🔥限時加成 +${hhPct}%）；0～4 題得 +${partPt} PT 鼓勵分。②【4人對抗】高分組每人 +${win2} PT（平手全員 +${tiePt} PT）！`;
      case "ito_numbers":
        return `免費參賽不扣分！翻牌數字完全由小到大即過關，每人獲階梯獎勵：3人 +20、4人 +30、5人 +45、6人 +60、7人 +80、8人 +100 PT（🔥限時加成再 +${hhPct}%，8人高達 +${Math.round(100 * hhMult)} PT！）；排錯亦得 +${partPt} PT 鼓勵分！`;
      case "five_seconds":
        return `免費參賽不扣分！單題對手共識平票算輸(+0)，3 輪結束唯一最高分奪冠（2人局 +${win2} PT、4人局 +${unit * 4} PT；🔥限時加成 +${hhPct}%），並列第一則平手每人 +${tiePt} PT！`;
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
