/**
 * 《跨年英雄紀元 2026 ➜ 2027》核心規則與數學結算引擎 (engine.js)
 * 涵蓋：
 *   - 雙環平衡配對秘密大腿(×0.5)／二腿(×0.3)演算法
 *   - 盲榜個人原始積分與排名計算 ＋ 1/3 終局翻盤結算
 *   - 排程自動切換場景狀態機 (Auto-Scheduler)
 *   - 隱藏任務每日抽卡/重抽鎖定 ＋ 雙重認證(當事人+見證人)自動派分
 *   - Party Game 參賽(3次) vs 下注(3次)獨立上限 ＋ 雙邊對賭彩池結算
 *   - 全自動里程碑徽章＆傳奇唯一王冠徽章(三順位平手判定)
 *   - 每日 08:00 低於 300 PT 自動補滿回血
 */

(function () {
  const CFG = window.PARTY_CONFIG;

  /**
   * 密碼學等級無偏差真隨機整數 [min, max] (Rejection Sampling)
   */
  function cryptoRandomInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    const range = hi - lo + 1;
    if (range <= 1) return lo;
    if (window.crypto && window.crypto.getRandomValues) {
      const maxUnbiased = Math.floor(0x100000000 / range) * range - 1;
      const buf = new Uint32Array(1);
      while (true) {
        window.crypto.getRandomValues(buf);
        if (buf[0] <= maxUnbiased) {
          return lo + (buf[0] % range);
        }
      }
    }
    return lo + Math.floor(Math.random() * range);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const WEEK_CHARS = ["日", "一", "二", "三", "四", "五", "六"];

  /**
   * 統一以台灣時間 (UTC+8, Asia/Taipei) 解析無時區時間字串，確保全球瀏覽器／伺服器秒數 100% 一致
   */
  function parseTaipeiMs(str) {
    if (!str) return 0;
    const s = String(str).trim();
    if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
      return Date.parse(s) || 0;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      return Date.parse(`${s}:00+08:00`) || 0;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
      return Date.parse(`${s}+08:00`) || 0;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return Date.parse(`${s}T00:00:00+08:00`) || 0;
    }
    return Date.parse(s) || 0;
  }

  function taipeiParts(ms) {
    const d = new Date(ms + 8 * 3600 * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const wk = WEEK_CHARS[d.getUTCDay()];
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return { yyyy, mm, dd, wk, hh, mi, ss, dateKey: `${yyyy}-${mm}-${dd}`, isoLocal: `${yyyy}-${mm}-${dd}T${hh}:${mi}` };
  }

  function formatShortDateWeek(ms) {
    const p = taipeiParts(ms);
    return `${p.mm}/${p.dd} (${p.wk})`;
  }

  function formatDateTimeFriendly(ms) {
    const p = taipeiParts(ms);
    return `${p.yyyy}/${p.mm}/${p.dd} (${p.wk}) ${p.hh}:${p.mi}`;
  }

  function formatFullClock(ms) {
    const p = taipeiParts(ms);
    return `${p.yyyy}/${p.mm}/${p.dd} (${p.wk}) ${p.hh}:${p.mi}:${p.ss}`;
  }

  function getEffectiveNowMs(globalCfg, serverNowMs) {
    const offsetMin = Number(globalCfg?.timeTravelOffsetMinutes) || 0;
    return serverNowMs + offsetMin * 60000;
  }

  function getNormalizedSlots(schedule, globalCfg) {
    const schedOffsetMs = (Number(globalCfg?.scheduleOffsetMinutes) || 0) * 60000;
    const base = schedule && schedule.length ? schedule : CFG.DEFAULT_SCHEDULE;
    return base
      .map((s) => ({
        ...s,
        startMs: parseTaipeiMs(s.start) + schedOffsetMs,
        endMs: parseTaipeiMs(s.end) + schedOffsetMs,
      }))
      .sort((a, b) => a.startMs - b.startMs);
  }

  function getScheduleDateRangeLabel(schedule, globalCfg) {
    const slots = getNormalizedSlots(schedule, globalCfg);
    if (!slots.length) return "派對專屬";
    const pStart = taipeiParts(slots[0].startMs);
    const pEnd = taipeiParts(slots[slots.length - 1].endMs);
    return `${pStart.yyyy}/${pStart.mm}/${pStart.dd} ～ ${pEnd.yyyy}/${pEnd.mm}/${pEnd.dd}`;
  }

  /**
   * 依據排程實際日期與台灣時間每日早上 08:00 換日線動態計算當下派對日（零 Hardcode 日期！）
   */
  function computeNaturalPartyDayKey(nowMs, schedule, globalCfg) {
    const slots = getNormalizedSlots(schedule, globalCfg);
    if (!slots.length) {
      return taipeiParts(nowMs - 8 * 3600 * 1000).dateKey;
    }
    const firstDateKey = taipeiParts(slots[0].startMs).dateKey;
    const lastDateKey = taipeiParts(slots[slots.length - 1].endMs).dateKey;
    const startDayMs = parseTaipeiMs(`${firstDateKey}T00:00`);
    const endDayMs = parseTaipeiMs(`${lastDateKey}T00:00`);

    const dayKeys = [];
    for (let ms = startDayMs; ms <= endDayMs + 1000; ms += 86400000) {
      dayKeys.push(taipeiParts(ms).dateKey);
    }
    let currentKey = dayKeys[0] || firstDateKey;
    for (let i = 1; i < dayKeys.length; i++) {
      const eightAmMs = parseTaipeiMs(`${dayKeys[i]}T08:00`);
      if (nowMs >= eightAmMs) {
        currentKey = dayKeys[i];
      }
    }
    return currentKey;
  }

  function round1(num) {
    return Math.round(num * 10) / 10;
  }

  function fmtPt(num) {
    const r = round1(num);
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  /**
   * 雙環平衡配對演算法：
   * 對任意 N >= 3 位玩家洗牌成單一環 P：
   *   P[i] 的大腿 = P[(i+1) % N]
   *   P[i] 的二腿 = P[(i+2) % N]
   * 保證：
   *   1. 絕不抽到自己、大腿與二腿絕不重複
   *   2. 現場每個人都「剛好是 1 個人的大腿 + 另 1 個人的二腿」！
   */
  function generateBalancedThighPairs(playerIds) {
    const ids = shuffle(playerIds.filter(Boolean));
    const n = ids.length;
    const result = {};
    if (n === 0) return result;
    if (n === 1) {
      result[ids[0]] = { thigh_id: null, second_thigh_id: null };
      return result;
    }
    if (n === 2) {
      result[ids[0]] = { thigh_id: ids[1], second_thigh_id: null };
      result[ids[1]] = { thigh_id: ids[0], second_thigh_id: null };
      return result;
    }
    for (let i = 0; i < n; i++) {
      result[ids[i]] = {
        thigh_id: ids[(i + 1) % n],
        second_thigh_id: ids[(i + 2) % n],
      };
    }
    return result;
  }

  /**
   * 依據時間排程表與 GM 設定解析當前場景（統一支援模擬時間 Offset 與動態排程）
   */
  function resolveScene(globalCfg, schedule, effectiveNowMs) {
    const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
    const slots = getNormalizedSlots(schedule, g);
    const launchAtMs = slots.length ? slots[0].startMs : 0;
    const viewerSlot = slots.find((s) => s.scene === "viewer") || null;

    if (g.seasonStatus === "settled") {
      return {
        scene: "viewer",
        label: "🏆 Viewer 最終結算模式",
        activeSlot: viewerSlot,
        nextSlot: null,
        launchAtMs,
        viewerSlot,
        isAuto: false,
      };
    }
    const rawOverride = g.sceneOverride === "trial" ? "auto" : g.sceneOverride;
    if (rawOverride && rawOverride !== "auto") {
      return {
        scene: rawOverride,
        label: sceneLabel(rawOverride),
        activeSlot: null,
        nextSlot: slots.find((s) => s.startMs > effectiveNowMs) || null,
        launchAtMs,
        viewerSlot,
        isAuto: false,
      };
    }

    // 在第一段排程開始時間之前，自動處於「開賽前準備階段」，顯示網路遊戲倒數計時器並隱藏遊戲保留驚喜！
    if (slots.length > 0 && effectiveNowMs < slots[0].startMs) {
      return {
        scene: "pre_event",
        label: sceneLabel("pre_event"),
        activeSlot: null,
        nextSlot: slots[0],
        launchAtMs,
        viewerSlot,
        isAuto: true,
      };
    }

    const active = slots.find((s) => effectiveNowMs >= s.startMs && effectiveNowMs < s.endMs) || null;
    const next = slots.find((s) => s.startMs > effectiveNowMs) || null;

    if (active) {
      return {
        scene: active.scene,
        label: sceneLabel(active.scene),
        activeSlot: active,
        nextSlot: next,
        launchAtMs,
        viewerSlot,
        isAuto: true,
      };
    }
    if (slots.length > 0 && effectiveNowMs >= slots[slots.length - 1].endMs) {
      const lastScene = slots[slots.length - 1].scene || "party";
      return {
        scene: lastScene,
        label: sceneLabel(lastScene),
        activeSlot: null,
        nextSlot: null,
        launchAtMs,
        viewerSlot,
        isAuto: true,
      };
    }
    // 活動期間內之時段空檔，預設開放自由 Party Game
    return {
      scene: "party",
      label: sceneLabel("party"),
      activeSlot: null,
      nextSlot: next,
      launchAtMs,
      viewerSlot,
      isAuto: true,
    };
  }

  function findNextSlot(schedule, nowMs, offsetMin) {
    const offsetMs = (Number(offsetMin) || 0) * 60000;
    const slots = (schedule || CFG.DEFAULT_SCHEDULE).map((s) => ({
      ...s,
      startMs: Date.parse(s.start) + offsetMs,
    }));
    return slots.find((s) => s.startMs > nowMs) || null;
  }

  function sceneLabel(scene) {
    switch (scene) {
      case "pre_event":
        return "⏳ 開賽前準備";
      case "dining":
        return "🍽️ Dining 用餐社交時段";
      case "party":
        return "🎲 Party Game 自由賽桌";
      case "happy_hour":
        return "🔥 限時加成 Party Game (+50%)";
      case "theme":
        return "🎪 主題遊戲全員集合";
      case "red_packet":
        return "🧧 跨年煙火 ＆ 簽到紅包";
      case "viewer":
        return "🏆 Viewer 終局結算模式";
      default:
        return scene;
    }
  }

  /**
   * 計算每位玩家的：
   *  - baseScore (原始積分)
   *  - rawRank (原始積分私密排名)
   *  - interactionSet (互動過的不同朋友集合)
   *  - finalScore & finalRank (加計大腿×0.5 + 二腿×0.3 後之總決賽分數與排名)
   */
  function computeScoreboard(players, ledger, tables, claims, claimApprovals) {
    const scoreMap = {};
    const playerMap = {};
    const interactions = {};

    (players || []).forEach((p) => {
      playerMap[p.id] = p;
      scoreMap[p.id] = 0;
      interactions[p.id] = new Set();
    });

    (ledger || []).forEach((entry) => {
      if (scoreMap[entry.player_id] !== undefined) {
        scoreMap[entry.player_id] += Number(entry.delta) || 0;
      }
    });

    // 統計同桌互動過的不同朋友（排除純新手測試局 is_test_run 與 AI 陪練員）
    (tables || []).forEach((t) => {
      if (t.status !== "finished" || t.is_test_run) return;
      const pids = (t.participants || []).map((x) => x.id).filter((id) => interactions[id]);
      for (let i = 0; i < pids.length; i++) {
        for (let j = i + 1; j < pids.length; j++) {
          interactions[pids[i]].add(pids[j]);
          interactions[pids[j]].add(pids[i]);
        }
      }
    });

    // 統計透過隱藏任務／互助卡認證互動過的不同朋友
    const approvalsByClaim = {};
    (claimApprovals || []).forEach((ca) => {
      (approvalsByClaim[ca.claim_id] = approvalsByClaim[ca.claim_id] || []).push(ca.approver_id);
    });
    (claims || []).forEach((c) => {
      if (c.status !== "approved") return;
      const a = c.applicant_id;
      if (!interactions[a]) return;
      if (c.target_id && interactions[c.target_id] && c.target_id !== a) {
        interactions[a].add(c.target_id);
        interactions[c.target_id].add(a);
      }
      (approvalsByClaim[c.id] || []).forEach((w) => {
        if (interactions[w] && w !== a) {
          interactions[a].add(w);
          interactions[w].add(a);
        }
      });
    });

    // 計算原始排名 (Competition ranking: 1, 2, 2, 4)
    const sortedRaw = [...(players || [])].sort(
      (a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0)
    );
    const rawRankMap = {};
    sortedRaw.forEach((p, idx) => {
      if (idx > 0 && scoreMap[p.id] === scoreMap[sortedRaw[idx - 1].id]) {
        rawRankMap[p.id] = rawRankMap[sortedRaw[idx - 1].id];
      } else {
        rawRankMap[p.id] = idx + 1;
      }
    });

    // 計算終局大腿／二腿加總分數（防迴圈：嚴格只乘對方的原始積分 baseScore！）
    const finalStats = (players || []).map((p) => {
      const own = scoreMap[p.id] || 0;
      const t1 = p.thigh_id && scoreMap[p.thigh_id] !== undefined ? scoreMap[p.thigh_id] : 0;
      const t2 =
        p.second_thigh_id && scoreMap[p.second_thigh_id] !== undefined
          ? scoreMap[p.second_thigh_id]
          : 0;
      const thighBonus = round1(t1 * 0.5);
      const secondBonus = round1(t2 * 0.3);
      const finalScore = round1(own + thighBonus + secondBonus);
      return {
        player: p,
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        room: p.room,
        baseScore: own,
        rawRank: rawRankMap[p.id] || 1,
        thighId: p.thigh_id,
        thighName: p.thigh_id && playerMap[p.thigh_id] ? playerMap[p.thigh_id].name : "未抽取",
        thighBase: t1,
        thighBonus,
        secondThighId: p.second_thigh_id,
        secondThighName:
          p.second_thigh_id && playerMap[p.second_thigh_id]
            ? playerMap[p.second_thigh_id].name
            : "未抽取",
        secondThighBase: t2,
        secondBonus,
        finalScore,
        interactionCount: interactions[p.id] ? interactions[p.id].size : 0,
      };
    });

    finalStats.sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        b.interactionCount - a.interactionCount ||
        b.baseScore - a.baseScore
    );
    finalStats.forEach((item, idx) => {
      if (idx > 0 && item.finalScore === finalStats[idx - 1].finalScore) {
        item.finalRank = finalStats[idx - 1].finalRank;
      } else {
        item.finalRank = idx + 1;
      }
    });

    const byId = {};
    finalStats.forEach((s) => {
      byId[s.id] = s;
    });

    return {
      totalPlayers: (players || []).length,
      byId,
      sortedFinal: finalStats,
      sortedRaw: sortedRaw.map((p) => byId[p.id]),
    };
  }

  /**
   * 統計某玩家今日在指定 Party Game 的「計分參賽次數」與「場邊下注次數」（排除新手測試局 is_test_run）
   */
  function getDailyGameUsage(playerId, gameType, dayKey, tables, bets) {
    let playCount = 0;
    (tables || []).forEach((t) => {
      if (t.is_test_run) return;
      if (t.day_key !== dayKey || t.game_type !== gameType) return;
      if (t.status === "cancelled") return;
      const me = (t.participants || []).find((p) => p.id === playerId);
      if (me && me.isScoring) playCount += 1;
    });

    let betCount = 0;
    (bets || []).forEach((b) => {
      if (b.day_key !== dayKey || b.game_type !== gameType) return;
      if (b.bettor_id === playerId) betCount += 1;
    });

    return { playCount, betCount };
  }

  /**
   * 統計某玩家是否已使用過該款遊戲的「1 次新手免費測試開局額度」（取消的賽桌不計入）
   */
  function getTestHostUsage(playerId, gameType, tables) {
    let used = 0;
    (tables || []).forEach((t) => {
      if (!t.is_test_run || t.status === "cancelled") return;
      if (t.host_id === playerId && t.game_type === gameType) used += 1;
    });
    return used;
  }

  /**
   * 抽 3 張個人隱藏任務卡（排除該玩家已達成過的任務）
   */
  function drawMissionCards(banks, completedCardIds = [], count = 3) {
    const pool = (banks && banks.chillMissions) || window.DEFAULT_QUESTION_BANKS.chillMissions;
    const doneSet = new Set(completedCardIds);
    const available = pool.filter((m) => !doneSet.has(m.id));
    const source = available.length >= count ? available : pool;
    return shuffle(source)
      .slice(0, count)
      .map((c) => ({ ...c, claimed: false }));
  }

  /**
   *  awarding idempotent ledger + badge helper
   */
  async function awardBadgeOnce(badgeId, badgeCode, playerId, points, title, detail, dayKey) {
    const inserted = await window.PartyDB.upsert(
      "badges_awarded",
      [
        {
          id: badgeId,
          badge_code: badgeCode,
          player_id: playerId,
          points,
          title,
          detail,
        },
      ],
      { ignoreDuplicates: true }
    );
    if (inserted && inserted.length > 0) {
      await window.PartyDB.upsert(
        "ledger",
        [
          {
            id: `badge_${badgeId}`,
            player_id: playerId,
            delta: points,
            category: "badge",
            reason: `🎖️ 解鎖徽章【${title}】`,
            day_key: dayKey || "2026-12-31",
            meta: { badgeCode, detail },
          },
        ],
        { ignoreDuplicates: true }
      );
      return true;
    }
    return false;
  }

  /**
   * 即時檢查並自動頒發「遊戲里程碑 / 歡樂互助章」(100% 自動、免投票)
   */
  async function evaluateRealtimeAutoBadges(snapshot) {
    const { players, tables, bets, claims, claimApprovals, badgesAwarded, globalCfg } = snapshot;
    const dayKey = (globalCfg && globalCfg.activeDayKey) || "2026-12-31";
    const existingIds = new Set((badgesAwarded || []).map((b) => b.id));
    const totalPlayers = (players || []).length;
    let awardedAny = false;

    // 1. 🚀 破冰先鋒：當日第一個完賽正式賽桌的桌長 (+25 PT，排除新手測試局)
    const finishedToday = (tables || [])
      .filter((t) => t.status === "finished" && !t.is_test_run && t.day_key === dayKey)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (finishedToday.length > 0) {
      const firstHost = finishedToday[0].host_id;
      const bid = `fun_pioneer_${dayKey}_${firstHost}`;
      if (!existingIds.has(bid)) {
        if (await awardBadgeOnce(
          bid,
          "fun_pioneer",
          firstHost,
          25,
          "破冰先鋒",
          `${dayKey} 第一桌完賽桌長`,
          dayKey
        )) awardedAny = true;
      }
    }

    // 2. 🥂 雨露均霑：與 >=8 位不同朋友同桌玩過 Party Game (彩排 <=6 人時自動調整門檻為 N-1)
    const mingleThreshold =
      totalPlayers >= 9 ? 8 : Math.max(2, totalPlayers - 1);
    const coPlayMap = {};
    (players || []).forEach((p) => (coPlayMap[p.id] = new Set()));
    (tables || []).forEach((t) => {
      if (t.status !== "finished" || t.is_test_run) return;
      const pids = (t.participants || []).map((x) => x.id);
      pids.forEach((a) => {
        pids.forEach((b) => {
          if (a !== b && coPlayMap[a]) coPlayMap[a].add(b);
        });
      });
    });
    for (const p of players || []) {
      if (totalPlayers >= 3 && coPlayMap[p.id].size >= mingleThreshold) {
        const bid = `mile_mingle_${p.id}`;
        if (!existingIds.has(bid)) {
          if (await awardBadgeOnce(
            bid,
            "mile_mingle",
            p.id,
            40,
            "雨露均霑",
            `已與 ${coPlayMap[p.id].size} 位不同朋友同桌對戰`,
            dayKey
          )) awardedAny = true;
        }
      }
    }

    // 3. 🕯️ 反指標冥燈：場邊下注連續猜錯 5 把 (+25 PT)
    const betsByPlayer = {};
    (bets || [])
      .filter((b) => b.status === "won" || b.status === "lost")
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .forEach((b) => {
        (betsByPlayer[b.bettor_id] = betsByPlayer[b.bettor_id] || []).push(b);
      });
    for (const [pid, list] of Object.entries(betsByPlayer)) {
      let streak = 0;
      let hit5 = false;
      for (const b of list) {
        if (b.status === "lost") {
          streak += 1;
          if (streak >= 5) hit5 = true;
        } else {
          streak = 0;
        }
      }
      if (hit5) {
        const bid = `fun_jinx_${pid}`;
        if (!existingIds.has(bid)) {
          if (await awardBadgeOnce(
            bid,
            "fun_jinx",
            pid,
            25,
            "反指標冥燈",
            "場邊下注達成連輸 5 把回血補貼",
            dayKey
          )) awardedAny = true;
        }
      }
    }

    // 4. ⚖️ 最佳公證人：擔任見證人累計滿 5 次 (+25 PT)
    const approvedClaimSet = new Set(
      (claims || []).filter((c) => c.status === "approved").map((c) => c.id)
    );
    const witnessCount = {};
    (claimApprovals || []).forEach((ca) => {
      if (approvedClaimSet.has(ca.claim_id) && ca.role !== "target") {
        witnessCount[ca.approver_id] = (witnessCount[ca.approver_id] || 0) + 1;
      }
    });
    for (const [pid, cnt] of Object.entries(witnessCount)) {
      if (cnt >= 5) {
        const bid = `fun_notary_${pid}`;
        if (!existingIds.has(bid)) {
          if (await awardBadgeOnce(
            bid,
            "fun_notary",
            pid,
            25,
            "最佳公證人",
            `熱心見證滿 ${cnt} 次`,
            dayKey
          )) awardedAny = true;
        }
      }
    }
    return awardedAny;
  }

  /**
   * 計算 ito 數字順風耳 3～8 人階梯基礎淨利：3人+20, 4人+30, 5人+45, 6人+60, 7人+80, 8人+100 PT
   */
  function getItoBaseNetProfit(playerCount) {
    if (playerCount >= 8) return 100;
    if (playerCount === 7) return 80;
    if (playerCount === 6) return 60;
    if (playerCount === 5) return 45;
    if (playerCount === 4) return 30;
    return 20;
  }

  /**
   * Party Game 賽桌結算：
   *  1. 滿 3 次之陪玩選手 (isScoring === false)：全程 0 扣分、0 得分（純陪玩同樂）！
   *  2. 未滿 3 次之計分選手 (isScoring === true)：
   *     - 開賽押本金 -stake (-20 PT)
   *     - 若贏得比賽：依本桌完整參賽規模 (participants.length × stake × (1 + hhRate) / 總贏家人數) 正常領取應得獎金！
   *     - 若輸掉比賽（即使輸給純陪玩選手）：不退回本金，正常失分 (-20 PT)！
   *  3. 場邊雙邊對賭彩池：若全押同一邊無對家，或無人猜中，全額退還 10 PT 防洗分！
   */
  async function settlePartyTable(table, winnerIds, allBets, globalCfg) {
    // 🧪 若為新手免費測試局 (is_test_run)，0 押注 0 派彩，直接標記完賽！
    if (table.is_test_run) {
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(table.id)}`, {
        status: "finished",
        winner_ids: winnerIds || [],
        proposed_winners: null,
      });
      return;
    }

    const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
    const dayKey = table.day_key || g.activeDayKey;
    const winSet = new Set(winnerIds || []);
    const participants = table.participants || [];
    const scoringPlayers = participants.filter((p) => p.isScoring);
    const actualWinners = participants.filter((p) => winSet.has(p.id));
    const scoringWinners = actualWinners.filter((p) => p.isScoring);

    const stake = Number(table.stake) || g.partyPlayStake || 20;
    const hhRate = table.is_happy_hour ? Number(g.happyHourBonusRate) || 0.5 : 0;

    // 選手獎池派發（僅對 isScoring 選手發放；陪玩選手輸贏皆 0 分；落敗之 isScoring 選手不退本金正常失分！）
    if (scoringPlayers.length > 0) {
      if (winSet.has("__pvp_tie__")) {
        // 平手和局：全額退還計分參賽者本金
        for (const sp of scoringPlayers) {
          await window.PartyDB.upsert(
            "ledger",
            [
              {
                id: `table_tie_refund_${table.id}_${sp.id}`,
                player_id: sp.id,
                delta: stake,
                category: "bet_refund",
                reason: `⚖️ 賽桌平手退回本金【${table.title}】`,
                day_key: dayKey,
                meta: { tableId: table.id },
              },
            ],
            { ignoreDuplicates: true }
          );
        }
      } else if (scoringWinners.length > 0 && !winSet.has("__coop_fail__")) {
        const isItoCoop = table.game_type === "ito_numbers";
        const isSoulCoop2 = table.game_type === "soul_sync_2v2" && participants.length === 2;

        if (isItoCoop) {
          // 🔢 ito 3~8 人合作過關階梯獎勵 (+20 / +30 / +45 / +60 / +80 / +100，Happy Hour 淨利再 +50%)
          const pCnt = participants.length;
          const baseNet = getItoBaseNetProfit(pCnt);
          const finalNet = Math.round(baseNet * (1 + hhRate));
          const payout = stake + finalNet;
          for (const w of scoringWinners) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `table_win_${table.id}_${w.id}`,
                  player_id: w.id,
                  delta: payout,
                  category: "party_win",
                  reason: `🏆 ito ${pCnt}人合作過關【退回${stake}+獎金${finalNet} PT】`,
                  day_key: dayKey,
                  meta: { tableId: table.id, gameType: table.game_type },
                },
              ],
              { ignoreDuplicates: true }
            );
          }
        } else if (isSoulCoop2) {
          // 🤝 2v2 靈魂默契 (2人合作闖關)：5~6題淨賺+20，7~8題大滿貫淨賺+35 (Happy Hour 淨賺再 +50%)
          const hits = Number(table.game_state?.scores?.team_A) || 5;
          const baseNet = hits >= 7 ? 35 : 20;
          const finalNet = Math.round(baseNet * (1 + hhRate));
          const payout = stake + finalNet;
          for (const w of scoringWinners) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `table_win_${table.id}_${w.id}`,
                  player_id: w.id,
                  delta: payout,
                  category: "party_win",
                  reason: `💞 靈魂默契(${hits}/8題)${hits >= 7 ? "大滿貫" : "過關"}【退回${stake}+獎金${finalNet} PT】`,
                  day_key: dayKey,
                  meta: { tableId: table.id, gameType: table.game_type },
                },
              ],
              { ignoreDuplicates: true }
            );
          }
        } else {
          // PvP / 多人大亂鬥：以整桌參賽人數規模計算標準獎池，平分給本局所有贏家（其中僅 isScoring 贏家入帳，陪玩贏家拿 0 分！）
          const fullBasePot = participants.length * stake;
          const fullHhBonus = table.is_happy_hour ? Math.round(fullBasePot * hhRate) : 0;
          const fullTablePot = fullBasePot + fullHhBonus;
          const winnerCount = Math.max(1, actualWinners.length);
          const perWinnerShare = Math.floor(fullTablePot / winnerCount);
          for (const w of scoringWinners) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `table_win_${table.id}_${w.id}`,
                  player_id: w.id,
                  delta: perWinnerShare,
                  category: "party_win",
                  reason: `🏆 賽桌奪冠【${table.title}】${fullHhBonus > 0 ? " (含限時加成!)" : ""}`,
                  day_key: dayKey,
                  meta: { tableId: table.id, gameType: table.game_type },
                },
              ],
              { ignoreDuplicates: true }
            );
          }
        }
      }
      // 注意：若計分選手落敗（包含輸給 0 分陪玩選手，或合作翻車 __coop_fail__），不退回入場費 stake，如實失分 -20 PT！
    }

    // 場邊下注結算（雙邊對賭成立制！）
    const tableBets = (allBets || []).filter(
      (b) => b.table_id === table.id && b.status === "locked"
    );
    if (tableBets.length > 0) {
      const distinctPicks = new Set(tableBets.map((b) => b.pick_key));
      const winningBets = tableBets.filter((b) => isWinningBetPick(b.pick_key, winSet, table));

      if (distinctPicks.size < 2 || winningBets.length === 0) {
        // 單邊無對家 或 全場無人猜中 -> 全額退還原注碼！
        for (const b of tableBets) {
          await window.PartyDB.update("bets", `id=eq.${encodeURIComponent(b.id)}`, {
            status: "refunded",
            payout: b.amount,
          });
          await window.PartyDB.upsert(
            "ledger",
            [
              {
                id: `bet_refund_${b.id}`,
                player_id: b.bettor_id,
                delta: Number(b.amount) || 10,
                category: "bet_refund",
                reason:
                  distinctPicks.size < 2
                    ? `↩️ 場邊無人對賭流盤退費【${table.title}】`
                    : `↩️ 場邊無人猜中退回本金【${table.title}】`,
                day_key: dayKey,
                meta: { tableId: table.id, betId: b.id },
              },
            ],
            { ignoreDuplicates: true }
          );
        }
      } else {
        const totalPool = tableBets.reduce((acc, b) => acc + (Number(b.amount) || 10), 0);
        const eachPayout = Math.floor(totalPool / winningBets.length);
        for (const b of tableBets) {
          const won = winningBets.some((wb) => wb.id === b.id);
          await window.PartyDB.update("bets", `id=eq.${encodeURIComponent(b.id)}`, {
            status: won ? "won" : "lost",
            payout: won ? eachPayout : 0,
          });
          if (won) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `bet_win_${b.id}`,
                  player_id: b.bettor_id,
                  delta: eachPayout,
                  category: "bet_payout",
                  reason: `💰 場邊押注命中派彩【${table.title}】`,
                  day_key: dayKey,
                  meta: { tableId: table.id, betId: b.id },
                },
              ],
              { ignoreDuplicates: true }
            );
          }
        }
      }
    }

    await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(table.id)}`, {
      status: "finished",
      winner_ids: [...winSet],
    });
  }

  function isWinningBetPick(pickKey, winSet, table) {
    if (winSet.has("__pvp_tie__")) return false;
    if (winSet.has(pickKey)) return true;
    if (pickKey === "coop_pass" && !winSet.has("__coop_fail__") && winSet.size > 0) return true;
    if (pickKey === "coop_fail" && winSet.has("__coop_fail__")) return true;
    if (pickKey === "team_A" || pickKey === "team_B") {
      const teamMembers = (table.participants || []).filter((p) => p.team === pickKey);
      return teamMembers.length > 0 && teamMembers.some((p) => winSet.has(p.id));
    }
    return false;
  }

  /**
   * ☀️ 每日 08:00 早安刷新：
   *  1. 所有積分 < 300 PT 的玩家自動無償補滿至 300 PT！
   *  2. 更新 activeDayKey，為所有玩家發放新一天的 3 張隱藏任務（保留未審核 claims！）
   */
  async function executeDailyMorningRefresh(newDayKey, snapshot, opts = {}) {
    const { players, ledger, tables, claims, claimApprovals, missions, questionBanks, globalCfg } =
      snapshot;
    const floor = Number((globalCfg && globalCfg.dailyFloorPoints) || 300);
    const board = computeScoreboard(players, ledger, tables, claims, claimApprovals);

    let toppedUpCount = 0;
    for (const p of players || []) {
      const cur = board.byId[p.id] ? board.byId[p.id].baseScore : 0;
      if (cur < floor) {
        const diff = floor - cur;
        const res = await window.PartyDB.upsert(
          "ledger",
          [
            {
              id: `topup_${newDayKey}_${p.id}`,
              player_id: p.id,
              delta: diff,
              category: "topup",
              reason: `☀️ ${newDayKey} 早安低保補滿回 ${floor} PT (+${diff} PT)`,
              day_key: newDayKey,
              meta: { before: cur, after: floor },
            },
          ],
          { ignoreDuplicates: true }
        );
        if (res && res.length) toppedUpCount += 1;
      }

      // 補發當日 3 張新隱藏任務（若該日尚未發過）
      const mid = `${p.id}_${newDayKey}`;
      const already = (missions || []).find((m) => m.id === mid);
      if (!already) {
        const completedCardIds = (claims || [])
          .filter((c) => c.applicant_id === p.id && c.claim_type === "hidden_mission" && c.mission_card_id)
          .map((c) => c.mission_card_id);
        const cards = drawMissionCards(questionBanks, completedCardIds, 3);
        await window.PartyDB.upsert(
          "missions",
          [
            {
              id: mid,
              player_id: p.id,
              day_key: newDayKey,
              cards,
              rerolls_used: 0,
              locked: false,
            },
          ],
          { ignoreDuplicates: true }
        );
      }
    }

    const updatedGlobal = {
      ...(globalCfg || CFG.DEFAULTS),
      activeDayKey: newDayKey,
      manualDayOverride:
        opts.manual !== undefined ? Boolean(opts.manual) : Boolean(globalCfg?.manualDayOverride),
    };
    await window.PartyDB.upsert("config", [{ key: "global", value: updatedGlobal }]);
    return { toppedUpCount };
  }

  /**
   * 🏆 1/3 終局一鍵結算（Freeze & Reveal）：
   *  1. 自動統計並頒發 4 大【結算唯一王冠徽章 (+80 PT)】(含三順位平手判定：主數值 -> 互動人數廣度 -> 最早達成時間)
   *  2. 將 seasonStatus 鎖定為 'settled'、sceneOverride 設為 'viewer'
   */
  async function executeFinalSettlement(snapshot) {
    const { players, ledger, tables, bets, claims, claimApprovals, globalCfg, schedule } = snapshot;
    const preBoard = computeScoreboard(players, ledger, tables, claims, claimApprovals);
    const normSlots = getNormalizedSlots(schedule, globalCfg);
    const lastSlotDate = normSlots.length
      ? taipeiParts(normSlots[normSlots.length - 1].startMs).dateKey
      : "2027-01-03";
    const dayKey = globalCfg?.activeDayKey || lastSlotDate;

    // Helper: 依「1. 主指標高 -> 2. 互動廣度高 -> 3. 最早達成時間早」選出第 1 名(若完全並列則同獲獎)
    function pickCrownWinners(candidates) {
      const valid = candidates.filter((c) => c.metric > 0);
      if (!valid.length) return [];
      valid.sort((a, b) => {
        if (b.metric !== a.metric) return b.metric - a.metric;
        if (b.breadth !== a.breadth) return b.breadth - a.breadth;
        return String(a.lastAt || "").localeCompare(String(b.lastAt || ""));
      });
      const top = valid[0];
      return valid.filter(
        (c) =>
          c.metric === top.metric &&
          c.breadth === top.breadth &&
          String(c.lastAt || "") === String(top.lastAt || "")
      );
    }

    // 1. 👑 社交恐怖分子
    const socialCands = (players || []).map((p) => ({
      id: p.id,
      metric: preBoard.byId[p.id] ? preBoard.byId[p.id].interactionCount : 0,
      breadth: preBoard.byId[p.id] ? preBoard.byId[p.id].interactionCount : 0,
      lastAt: p.joined_at || "",
    }));
    for (const w of pickCrownWinners(socialCands)) {
      await awardBadgeOnce(
        `crown_social_${w.id}`,
        "crown_social",
        w.id,
        80,
        "社交恐怖分子",
        `互動遍及 ${w.metric} 位夥伴奪冠`,
        dayKey
      );
    }

    // 2. 👑 Switch 大魔王（排除新手測試局）
    const switchStats = {};
    (tables || [])
      .filter((t) => t.status === "finished" && !t.is_test_run && t.game_type === "switch_free")
      .forEach((t) => {
        (t.winner_ids || []).forEach((wid) => {
          const part = (t.participants || []).find((x) => x.id === wid);
          if (part && part.isScoring) {
            const cur = switchStats[wid] || { count: 0, lastAt: "" };
            cur.count += 1;
            cur.lastAt = t.updated_at || t.created_at || "";
            switchStats[wid] = cur;
          }
        });
      });
    const switchCands = (players || []).map((p) => ({
      id: p.id,
      metric: switchStats[p.id] ? switchStats[p.id].count : 0,
      breadth: preBoard.byId[p.id] ? preBoard.byId[p.id].interactionCount : 0,
      lastAt: switchStats[p.id] ? switchStats[p.id].lastAt : "",
    }));
    for (const w of pickCrownWinners(switchCands)) {
      await awardBadgeOnce(
        `crown_switch_${w.id}`,
        "crown_switch",
        w.id,
        80,
        "Switch 大魔王",
        `Switch 奪冠 ${w.metric} 場稱霸`,
        dayKey
      );
    }

    // 3. 👑 地下賭聖 (至少參與 3 場已開獎下注；若全場無人滿 3 場則放寬為至少 1 場以支援快速彩排)
    const resolvedByPlayer = {};
    (bets || [])
      .filter((b) => b.status === "won" || b.status === "lost")
      .forEach((b) => {
        const cur = resolvedByPlayer[b.bettor_id] || { won: 0, total: 0, lastAt: "" };
        cur.total += 1;
        if (b.status === "won") {
          cur.won += 1;
          cur.lastAt = b.created_at || "";
        }
        resolvedByPlayer[b.bettor_id] = cur;
      });
    const has3 = Object.values(resolvedByPlayer).some((x) => x.total >= 3);
    const minBets = has3 ? 3 : 1;
    const betCands = (players || []).map((p) => {
      const st = resolvedByPlayer[p.id];
      const rate = st && st.total >= minBets && st.won > 0 ? round1((st.won / st.total) * 100) : 0;
      return {
        id: p.id,
        metric: rate,
        breadth: preBoard.byId[p.id] ? preBoard.byId[p.id].interactionCount : 0,
        lastAt: st ? st.lastAt : "",
      };
    });
    for (const w of pickCrownWinners(betCands)) {
      await awardBadgeOnce(
        `crown_bettor_${w.id}`,
        "crown_bettor",
        w.id,
        80,
        "地下賭聖",
        `場邊下注命中率 ${w.metric}% 第 1 名`,
        dayKey
      );
    }

    // 4. 👑 王牌特務 (隱藏任務完成數第 1 名)
    const agentStats = {};
    (claims || [])
      .filter((c) => c.status === "approved" && c.claim_type === "hidden_mission")
      .forEach((c) => {
        const cur = agentStats[c.applicant_id] || { count: 0, lastAt: "" };
        cur.count += 1;
        cur.lastAt = c.created_at || "";
        agentStats[c.applicant_id] = cur;
      });
    const agentCands = (players || []).map((p) => ({
      id: p.id,
      metric: agentStats[p.id] ? agentStats[p.id].count : 0,
      breadth: preBoard.byId[p.id] ? preBoard.byId[p.id].interactionCount : 0,
      lastAt: agentStats[p.id] ? agentStats[p.id].lastAt : "",
    }));
    for (const w of pickCrownWinners(agentCands)) {
      await awardBadgeOnce(
        `crown_agent_${w.id}`,
        "crown_agent",
        w.id,
        80,
        "王牌特務",
        `累計破獲 ${w.metric} 件隱藏任務第 1 名`,
        dayKey
      );
    }

    // 永久凍結全服轉為 Viewer 模式（預設從頒獎典禮第 1 幕開始揭曉，若已指定幕數則保留）
    const settledCfg = {
      ...(globalCfg || CFG.DEFAULTS),
      seasonStatus: "settled",
      sceneOverride: "viewer",
      ceremonyStage: Number(globalCfg?.ceremonyStage) || 1,
    };
    await window.PartyDB.upsert("config", [{ key: "global", value: settledCfg }]);
  }

  window.PartyEngine = {
    cryptoRandomInt,
    shuffle,
    round1,
    fmtPt,
    parseTaipeiMs,
    taipeiParts,
    formatShortDateWeek,
    formatDateTimeFriendly,
    formatFullClock,
    getEffectiveNowMs,
    getNormalizedSlots,
    getScheduleDateRangeLabel,
    computeNaturalPartyDayKey,
    generateBalancedThighPairs,
    resolveScene,
    sceneLabel,
    computeScoreboard,
    getDailyGameUsage,
    getTestHostUsage,
    getItoBaseNetProfit,
    drawMissionCards,
    awardBadgeOnce,
    evaluateRealtimeAutoBadges,
    settlePartyTable,
    executeDailyMorningRefresh,
    executeFinalSettlement,
  };
})();
