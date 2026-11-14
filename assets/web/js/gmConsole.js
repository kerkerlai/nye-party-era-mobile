/**
 * 《跨年英雄紀元》Android GM 防劇透黑盒主控台 (gmConsole.js)
 * 專為「身兼玩家的 GM」設計：
 *   - 遮蔽他人分數、秘密大腿名單、臥底底牌與 2026/2027 分享卡答案
 *   - 支援房間指派 (Assign Rooms)、自動排程設定、一鍵延後排程、題庫線上增刪改
 *   - 內建「4 人彩排模擬跨日 08:00 刷新」與「彩排結束一鍵無痕重置」
 */

(function () {
  const CFG = window.PARTY_CONFIG;

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const SCENE_OPTIONS = [
    { v: "dining", label: "🍽️ 用餐社交 (Dining)" },
    { v: "party", label: "🎲 自由賽桌 (Party)" },
    { v: "happy_hour", label: "🔥 限時加成 (+50%)" },
    { v: "theme", label: "🎪 主題遊戲集合" },
    { v: "red_packet", label: "🧧 跨年倒數紅包" },
    { v: "viewer", label: "🏆 終局結算開獎" },
  ];

  const GMConsole = {
    subTab: "control", // control | audit | players | schedule | banks | rehearsal
    bankCategory: "pollQuestions",
    manualTargetIds: new Set(),
    auditFilter: "all", // all | party | theme | mission | gm
    auditPlayerFilter: "",
    pickerState: null, // { idx, field: 'start'|'end', dateKey, hh, mi, chainNext }

    render(ctx) {
      const { isGmUnlocked } = ctx;
      if (!isGmUnlocked) {
        return `
          <div class="section-card" style="text-align:center;padding:28px 18px;">
            <div style="font-size:38px;margin-bottom:8px;">👑</div>
            <h3>GM 主控台（主辦人專屬）</h3>
            <p class="muted-sm" style="margin:8px 0 14px;">此區僅限活動主辦人控場使用（目前已為一般玩家視角）。主辦人請輸入密碼解鎖：</p>
            <div style="display:flex;gap:8px;max-width:280px;margin:0 auto;">
              <input type="password" id="gm-pin-input" class="input-dark" placeholder="請輸入主辦人控場密碼" onkeydown="if(event.key==='Enter') GMConsole.unlock()">
              <button class="btn btn-gold" onclick="GMConsole.unlock()">解鎖</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="gm-shell">
          <div class="gm-logout-bar">
            <span>👑 <b>GM 主控模式已解鎖</b></span>
            <button class="btn btn-rose btn-xs" onclick="GMConsole.logoutGm()">🚪 登出 GM 模式（切回一般玩家視角）</button>
          </div>
          <div class="gm-nav">
            ${[
              { id: "control", label: "🎛️ 控場&開賽" },
              { id: "audit", label: "💰 發分&對帳Log" },
              { id: "players", label: "🛏️ 分房&綠燈" },
              { id: "schedule", label: "⏰ 自動排程" },
              { id: "banks", label: "📝 題庫管理" },
              { id: "rehearsal", label: "🧪 彩排&重置" },
            ]
              .map(
                (t) => `<button class="chip-btn ${this.subTab === t.id ? "active" : ""}"
                  onclick="GMConsole.subTab='${t.id}';PartyApp.render();">${t.label}</button>`
              )
              .join("")}
          </div>

          ${
            this.subTab === "control"
              ? this.renderControlTab(ctx)
              : this.subTab === "audit"
              ? this.renderAuditTab(ctx)
              : this.subTab === "players"
              ? this.renderPlayersTab(ctx)
              : this.subTab === "schedule"
              ? this.renderScheduleTab(ctx)
              : this.subTab === "banks"
              ? this.renderBanksTab(ctx)
              : this.renderRehearsalTab(ctx)
          }
        </div>
      `;
    },

    renderControlTab(ctx) {
      const { globalCfg, sceneInfo, players, schedule } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const nowEff = window.PartyEngine.getEffectiveNowMs(g, window.PartyDB.serverNowMs);
      const isAuto = !g.sceneOverride || g.sceneOverride === "auto";
      const viewerTimeLabel = sceneInfo.viewerSlot
        ? window.PartyEngine.formatDateTimeFriendly(sceneInfo.viewerSlot.startMs)
        : "排程最終時段";
      const launchTimeLabel = sceneInfo.launchAtMs
        ? window.PartyEngine.formatDateTimeFriendly(sceneInfo.launchAtMs)
        : "未設定";

      return `
        <div class="section-card">
          <div class="section-title">🚀 自動排程主狀態 ＆ 控場總覽</div>
          <div class="toast-inline" style="margin-bottom:10px;">
            模式：<b>${isAuto ? "⏰ 全自動排程切換中（推薦）" : "🖐️ 緊急手動覆寫中"}</b> ｜
            當前場景：<b class="gold-text">${esc(sceneInfo.label)}</b><br>
            排程開賽時間：<b>${esc(launchTimeLabel)}</b> ｜ 當前模擬排程時間：<b class="live-sim-clock">${esc(window.PartyEngine.formatFullClock(nowEff))}</b>
            ${(Number(g.timeTravelOffsetMinutes) || 0) !== 0 ? ` <span class="hh-tag">時光機 Offset 啟用中</span>` : ""}
          </div>

          ${
            g.seasonStatus !== "settled"
              ? `<div class="sub-label" style="margin-bottom:6px;">🎛️ 臨時切換場景（突發狀況用，按「回到排程」立刻交還自動排程）：</div>
                <div class="bet-btn-grid" style="margin-bottom:10px;">
                  ${[
                    { k: "auto", label: "⏰ 回到排程" },
                    { k: "party", label: "🎲 Party Game" },
                    { k: "dining", label: "🍽️ 吃飯" },
                    { k: "theme", label: "🎪 主題遊戲" },
                  ]
                    .map(
                      (m) => `<button class="btn ${(g.sceneOverride || "auto") === m.k ? "btn-gold" : "btn-secondary"} btn-sm"
                        onclick="GMConsole.setSceneOverride('${m.k}')">${m.label}</button>`
                    )
                    .join("")}
                </div>`
              : ""
          }

          ${
            !isAuto && g.seasonStatus !== "settled"
              ? `<button class="btn btn-gold" style="width:100%;margin-bottom:10px;" onclick="GMConsole.setSceneOverride('auto')">
                  ⏰ 一鍵恢復【依自動排程切換】（交還系統自動控場）
                </button>`
              : ""
          }

          ${
            g.seasonStatus === "settled"
              ? `<div class="my-bet-tag">🏆 已完成最終結算（Viewer 頒獎典禮公開模式）</div>`
              : `<div style="margin-bottom:8px;">
                  <div class="muted-xs" style="margin-bottom:6px;">🙈 防劇透保護中：後台不顯示秘密大腿配對名單，讓你也能當玩家！（開賽時系統會自動配對；若有新夥伴中途加入可點此重抽）</div>
                  <button class="btn btn-secondary btn-xs" style="width:100%;" onclick="GMConsole.launchSeason()">
                    🎲 重新洗牌配對全員秘密大腿／二腿 ＆ 補齊初始 ${g.initialPoints || 300} PT（目前 ${players.length} 人）
                  </button>
                </div>`
          }

          ${
            sceneInfo.scene === "theme" || sceneInfo.scene === "red_packet"
              ? `<button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="PartyApp.switchTab('stage')">
                  🎤 前往「🎮 遊戲舞台」開啟主題房當 Host 一起玩！
                </button>`
              : ""
          }

          <div class="grid-2-btns" style="margin-top:10px;">
            <button class="btn btn-secondary btn-sm" style="border-color:rgba(251,191,36,0.45);color:#fde047;" onclick="GMConsole.subTab='audit';PartyApp.render();">
              💰 發分 ＆ 對帳 Log
            </button>
            <button class="btn btn-secondary btn-sm" style="border-color:rgba(56,189,248,0.45);color:#7dd3fc;" onclick="GMConsole.subTab='rehearsal';PartyApp.render();">
              ⏩ 彩排時光機 (+1h/-1h)
            </button>
          </div>

          <div class="sub-label" style="margin-top:14px;">⏱️ 現場聚餐／行程臨時順延（整體推遲排程時間）：</div>
          <div class="host-row">
            <button class="btn btn-secondary btn-xs" onclick="GMConsole.shiftSchedule(-15)">⏪ 提前 15 分</button>
            <button class="btn btn-secondary btn-xs" onclick="GMConsole.shiftSchedule(15)">⏩ 順延 +15 分</button>
            <button class="btn btn-secondary btn-xs" onclick="GMConsole.shiftSchedule(30)">⏩ 順延 +30 分</button>
            <button class="btn btn-ghost btn-xs" onclick="GMConsole.shiftSchedule(0, true)">歸零 (${g.scheduleOffsetMinutes || 0}分)</button>
          </div>

          <details style="margin-top:14px;">
            <summary class="muted-xs" style="cursor:pointer;color:#94a3b8;font-weight:700;">
              🛠️ 其他場景（開賽前／限時加成／跨年紅包，平時無須操作）
            </summary>
            <div class="bet-btn-grid" style="margin-top:8px;">
              ${[
                { k: "pre_event", label: "⏳ 開賽前(僅填資料)" },
                { k: "happy_hour", label: "🔥 限時加成 (+50%)" },
                { k: "red_packet", label: "🧧 跨年倒數紅包" },
              ]
                .map(
                  (m) => `<button class="btn ${(g.sceneOverride || "auto") === m.k ? "btn-gold" : "btn-secondary"} btn-sm"
                    onclick="GMConsole.setSceneOverride('${m.k}')">${m.label}</button>`
                )
                .join("")}
            </div>
          </details>
        </div>

        <!-- 手機角色單機綁定鎖開關 -->
        <div class="section-card" style="margin-top:14px;">
          <div class="section-title">📱 角色單機綁定防雙登設定</div>
          <p class="muted-xs" style="margin-bottom:8px;">
            開啟後（<b>預設已開啟</b>），每個暱稱一註冊就綁定該支手機：本人同手機重開可無縫連回，但<b>其他手機輸入同名會被擋下</b>。本人換手機請到「🛏️ 分房&綠燈」按解除綁定；需要單機切多帳號測試時可暫時關閉。
          </p>
          <button class="btn ${g.enforceDeviceLock ? "btn-gold" : "btn-secondary"} btn-sm" style="width:100%;" onclick="GMConsole.toggleDeviceLock()">
            ${g.enforceDeviceLock ? "🔒 目前：正式單機綁定鎖【已開啟】（禁止2台手機登同ID）" : "🧪 目前：Web 測試彈性模式【未鎖定】（允許自由切換帳號測試）"}
          </button>
          ${
            window.NYEPartyBridge && window.NYEPartyBridge.postMessage
              ? `<button class="btn btn-ghost btn-xs" style="width:100%;margin-top:8px;" onclick="window.NYEPartyBridge.postMessage(JSON.stringify({type:'switch_server'}))">
                   🔥 設定／切換 Firebase 資料庫網址
                 </button>`
              : ""
          }
        </div>

        <div class="section-card" style="margin-top:14px;">
          <div class="section-title">🏷️ 活動名稱與分享卡題目自訂（全站動態連動）</div>
          <div style="margin-bottom:8px;">
            <label class="sub-label">🎉 活動主標題（例如：跨年英雄紀元 / 宜蘭包棟爭霸戰）</label>
            <input type="text" id="cfg-event-title" class="input-dark" value="${esc(g.eventTitle || "跨年英雄紀元")}">
          </div>
          <div class="grid-2-btns" style="margin-bottom:6px;">
            <div>
              <label class="sub-label">📘 分享卡 A 簡稱</label>
              <input type="text" id="cfg-share-label-a" class="input-dark" value="${esc(g.shareLabelA || "2026 回顧")}">
            </div>
            <div>
              <label class="sub-label">🚀 分享卡 B 簡稱</label>
              <input type="text" id="cfg-share-label-b" class="input-dark" value="${esc(g.shareLabelB || "2027 展望")}">
            </div>
          </div>
          <div style="margin-bottom:6px;">
            <label class="sub-label">📘 分享卡 Part A 完整題目</label>
            <input type="text" id="cfg-share-prompt-a" class="input-dark" value="${esc(g.sharePromptA || "2026 年最值得分享的一件事")}">
          </div>
          <div>
            <label class="sub-label">🚀 分享卡 Part B 完整題目</label>
            <input type="text" id="cfg-share-prompt-b" class="input-dark" value="${esc(g.sharePromptB || "2027 年最想完成的一件事")}">
          </div>
        </div>

        <div class="section-card" style="margin-top:14px;">
          <div class="section-title">⚖️ 全域注碼、經濟額度、PIN 碼 ＆ 民宿百寶箱</div>
          <p class="muted-xs" style="margin-bottom:8px;">修改下方數值並儲存後，玩家前台所有規則文字、按鈕金額與結算邏輯將 <b>100% 即時同步更新</b>：</p>
          <div class="grid-2-btns">
            <div>
              <label class="sub-label">⚔️ 賽桌參賽注碼 (PT)</label>
              <input type="number" id="cfg-play-stake" class="input-dark" value="${g.partyPlayStake}">
            </div>
            <div>
              <label class="sub-label">💰 場邊下注注碼 (PT)</label>
              <input type="number" id="cfg-bet-stake" class="input-dark" value="${g.partyBetStake}">
            </div>
            <div>
              <label class="sub-label">🎁 開賽初始積分 (PT)</label>
              <input type="number" id="cfg-init-pts" class="input-dark" value="${g.initialPoints}">
            </div>
            <div>
              <label class="sub-label">☀️ 08:00 低保回血線 (PT)</label>
              <input type="number" id="cfg-floor-pts" class="input-dark" value="${g.dailyFloorPoints}">
            </div>
            <div>
              <label class="sub-label">🎲 同款每日計分上限(次)</label>
              <input type="number" id="cfg-max-plays" class="input-dark" value="${g.maxScoringPlaysPerGamePerDay}">
            </div>
            <div>
              <label class="sub-label">🎯 同款每日下注上限(次)</label>
              <input type="number" id="cfg-max-bets" class="input-dark" value="${g.maxBetsPerGamePerDay}">
            </div>
            <div>
              <label class="sub-label">🕵️ 隱藏任務單張分數(PT)</label>
              <input type="number" id="cfg-mission-pts" class="input-dark" value="${g.hiddenMissionPoints}">
            </div>
            <div>
              <label class="sub-label">🧧 跨年紅包簽到分數(PT)</label>
              <input type="number" id="cfg-redpacket-pts" class="input-dark" value="${g.redPacketPoints}">
            </div>
            <div>
              <label class="sub-label">🔑 玩家登入通行 PIN 碼</label>
              <input type="text" id="cfg-join-pin" class="input-dark" value="${esc(g.partyJoinPin || "1234")}">
            </div>
            <div>
              <label class="sub-label">👑 GM 後台控場密碼</label>
              <input type="text" id="cfg-gm-pin" class="input-dark" value="${esc(g.gmPin || CFG.DEFAULT_GM_PIN)}">
            </div>
            <div>
              <label class="sub-label">📶 民宿 Wi-Fi 名稱</label>
              <input type="text" id="cfg-wifi-ssid" class="input-dark" value="${esc(g.villaInfo?.wifiSsid || "")}">
            </div>
            <div>
              <label class="sub-label">🔐 民宿 Wi-Fi 密碼</label>
              <input type="text" id="cfg-wifi-pass" class="input-dark" value="${esc(g.villaInfo?.wifiPass || "")}">
            </div>
          </div>
          <div class="grid-2-btns" style="margin-top:8px;">
            <div>
              <label class="sub-label">🚪 大門電子鎖密碼</label>
              <input type="text" id="cfg-door-code" class="input-dark" value="${esc(g.villaInfo?.doorCode || "")}" placeholder="例：1231#">
            </div>
            <div>
              <label class="sub-label">🗺️ Google Maps 導航網址</label>
              <input type="text" id="cfg-villa-map" class="input-dark" value="${esc(g.villaInfo?.mapUrl || "")}" placeholder="https://maps.app.goo.gl/...">
            </div>
          </div>
          <div style="margin-top:8px;">
            <label class="sub-label">📍 民宿地址說明</label>
            <input type="text" id="cfg-villa-addr" class="input-dark" value="${esc(g.villaInfo?.address || "")}">
          </div>
          <div style="margin-top:8px;">
            <label class="sub-label">📢 民宿貼心公告提醒（顯示於玩家民宿卡下方）</label>
            <input type="text" id="cfg-villa-notes" class="input-dark" value="${esc(g.villaInfo?.notes || "")}">
          </div>
          <button class="btn btn-primary btn-sm" style="margin-top:12px;width:100%;" onclick="GMConsole.saveGlobalParams()">💾 儲存所有活動參數與民宿資訊</button>
        </div>

        <div class="section-card" style="margin-top:14px;border-color:rgba(244,63,94,0.5);">
          <div class="section-title" style="color:#fda4af;">🏆 終局結算（依排程將於 ${esc(viewerTimeLabel)} 自動執行！）</div>
          <p class="muted-xs" style="margin-bottom:10px;">
            系統到達排程設定的【🏆 終局結算開獎】時段（<b>${esc(viewerTimeLabel)}</b>）時，會<b>全自動頒發 4 大王冠徽章 (+80 PT) 並公開秘密大腿與總冠軍</b>！下方按鈕僅供現場臨時決定提早開獎時手動使用：
          </p>
          <button class="btn btn-rose btn-sm" style="width:100%;" onclick="GMConsole.triggerFinalSettlement()">
            🖐️ 提前手動執行終局結算並公開總榜
          </button>
        </div>
      `;
    },

    formatShortTs(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${mm}/${dd} ${hh}:${mi}`;
    },

    // ==================== 💰 GM 手動發分補償 ＆ 全遊戲勝負對帳 Log ====================
    renderAuditTab(ctx) {
      const { players, ledger, tables, bets, themeSessions, scoreboard } = ctx;
      const playerMap = {};
      (players || []).forEach((p) => (playerMap[p.id] = p));

      // 整理已歸屬到「賽桌 (tables)」或「主題遊戲 (theme_sessions)」的 ledger ID，避免獨立事件重複列印
      const tableLedgerMap = {};
      const sessionLedgerMap = {};
      const claimedLedgerIds = new Set();

      const allSessions = themeSessions || [];
      (ledger || []).forEach((l) => {
        const tid = l.meta?.tableId;
        if (tid) {
          (tableLedgerMap[tid] = tableLedgerMap[tid] || []).push(l);
          claimedLedgerIds.add(l.id);
          return;
        }
        let sid = l.meta?.sessionId || "";
        if (!sid && l.category === "theme") {
          const hit = allSessions.find((s) => String(l.id || "").includes(s.id));
          if (hit) sid = hit.id;
        }
        if (sid) {
          (sessionLedgerMap[sid] = sessionLedgerMap[sid] || []).push(l);
          claimedLedgerIds.add(l.id);
        }
      });

      // 組裝全遊戲與積分事件統一時間軸 (最新在最上面)
      const events = [];
      const pFilter = this.auditPlayerFilter || "";

      // 1. Party Games 賽桌事件
      if (this.auditFilter === "all" || this.auditFilter === "party") {
        (tables || []).forEach((t) => {
          const tLedgers = tableLedgerMap[t.id] || [];
          const tBets = (bets || []).filter((b) => b.table_id === t.id);
          if (pFilter) {
            const inPart = (t.participants || []).some((p) => p.id === pFilter);
            const inBet = tBets.some((b) => b.bettor_id === pFilter);
            const inLed = tLedgers.some((l) => l.player_id === pFilter);
            if (!inPart && !inBet && !inLed) return;
          }
          events.push({
            kind: "party",
            ts: t.updated_at || t.created_at || "",
            html: this.renderPartyAuditCard(t, tLedgers, tBets, playerMap),
          });
        });
      }

      // 2. Theme Games 主題遊戲場次事件
      if (this.auditFilter === "all" || this.auditFilter === "theme") {
        allSessions.forEach((s) => {
          const sLedgers = sessionLedgerMap[s.id] || [];
          if (pFilter) {
            const inPart = (s.participants || []).includes(pFilter);
            const inLed = sLedgers.some((l) => l.player_id === pFilter);
            if (!inPart && !inLed) return;
          }
          events.push({
            kind: "theme",
            ts: s.updated_at || s.created_at || "",
            html: this.renderThemeAuditCard(s, sLedgers, playerMap),
          });
        });
      }

      // 3. 獨立積分事件（GM 手動發分、隱藏任務、神隊友打卡、自動徽章、跨年紅包、早上回血、初始分）
      (ledger || []).forEach((l) => {
        if (claimedLedgerIds.has(l.id)) return;
        if (pFilter && l.player_id !== pFilter) return;
        const isGm = l.category === "gm_adjust";
        if (this.auditFilter === "party" || this.auditFilter === "theme") return;
        if (this.auditFilter === "gm" && !isGm) return;
        if (this.auditFilter === "mission" && isGm) return;
        events.push({
          kind: isGm ? "gm" : "mission",
          ts: l.created_at || "",
          html: this.renderStandaloneAuditCard(l, playerMap),
        });
      });

      events.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

      // 計算全員分類對帳表
      const summaryRows = (players || []).map((p) => {
        const pLeds = (ledger || []).filter((l) => l.player_id === p.id);
        const sumCat = (cats) =>
          pLeds
            .filter((l) => cats.includes(l.category))
            .reduce((acc, l) => acc + (Number(l.delta) || 0), 0);
        return {
          player: p,
          total: scoreboard.byId[p.id]?.baseScore || 0,
          initFloor: sumCat(["initial", "floor_topup", "topup"]),
          partyBet: sumCat(["party_stake", "party_win", "bet_stake", "bet_payout", "bet_refund"]),
          themeRed: sumCat(["theme", "red_packet"]),
          missionBadge: sumCat(["mission", "badge"]),
          gmAdj: sumCat(["gm_adjust"]),
        };
      });

      return `
        <!-- 1. GM 手動直接發分／扣分補償面板 -->
        <div class="section-card" style="border-color:rgba(251,191,36,0.55);">
          <div class="section-title">🎁 GM 手動直接發分 ／ 扣分調整</div>
          <p class="muted-xs" style="margin-bottom:10px;">
            當現場臨時加碼獎勵、實體裁判補發、或遇到有人斷線沒拿到分數時，可在此直接勾選玩家立即加減 PT（同步寫入對帳 Log）！
          </p>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span class="sub-label" style="margin:0;">1. 勾選要發分／調整的玩家（已選 ${this.manualTargetIds.size} 人）：</span>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn btn-secondary btn-xs" onclick="GMConsole.selectAllManualTargets(true)">全選全員</button>
              <button type="button" class="btn btn-ghost btn-xs" onclick="GMConsole.selectAllManualTargets(false)">清空</button>
            </div>
          </div>
          <div class="owner-pick-grid" style="margin-bottom:10px;">
            ${(players || [])
              .map((p) => {
                const checked = this.manualTargetIds.has(p.id);
                return `<label class="chip-select ${checked ? "selected" : ""}" style="display:flex;align-items:center;gap:5px;cursor:pointer;">
                  <input type="checkbox" ${checked ? "checked" : ""} onchange="GMConsole.toggleManualTarget('${esc(p.id)}')">
                  <span>${esc(p.name)}</span>
                </label>`;
              })
              .join("") || `<span class="muted-xs">尚無已註冊玩家</span>`}
          </div>

          <label class="sub-label">2. 設定加減分數（正數為加分，負數如 -20 為扣分）：</label>
          <div class="part-chips" style="margin-bottom:8px;">
            ${[10, 20, 30, 50, 100, -10, -20]
              .map(
                (v) => `<button type="button" class="btn btn-secondary btn-xs" onclick="GMConsole.setQuickManualPts(${v})">${v > 0 ? `+${v}` : v} PT</button>`
              )
              .join("")}
          </div>
          <div class="grid-2-btns" style="margin-bottom:10px;">
            <input type="number" id="gm-adj-pts" class="input-dark" value="20" placeholder="輸入加減 PT（如 30 或 -20）">
            <input type="text" id="gm-adj-reason" class="input-dark" placeholder="發分原因（如：補償拔槍斷線 / 加碼獎）">
          </div>
          <button class="btn btn-gold" style="width:100%;" onclick="GMConsole.submitManualPoints()">
            💸 立即發放／調整積分並寫入對帳紀錄
          </button>
        </div>

        <!-- 2. 全員分類總分核對表（預設收合防誤看劇透，對帳時一鍵展開！） -->
        <div class="section-card" style="margin-top:14px;">
          <details>
            <summary style="font-weight:800;cursor:pointer;color:#fde047;">
              📊 展開【全員目前總分 ＆ 五大來源分類核對表】（共 ${players.length} 人）
            </summary>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
              ${summaryRows
                .map(
                  (r) => `<div class="audit-card" style="margin-bottom:0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <b>${esc(r.player.name)}</b>
                      <span class="gold-text" style="font-weight:900;font-size:15px;">總計 ${window.PartyEngine.fmtPt(r.total)} PT</span>
                    </div>
                    <div class="muted-xs" style="margin-top:4px;">
                      初始&回血:${r.initFloor >= 0 ? `+${r.initFloor}` : r.initFloor} ｜
                      賽桌&下注:${r.partyBet >= 0 ? `+${r.partyBet}` : r.partyBet} ｜
                      主題活動:${r.themeRed >= 0 ? `+${r.themeRed}` : r.themeRed} ｜
                      任務&徽章:${r.missionBadge >= 0 ? `+${r.missionBadge}` : r.missionBadge} ｜
                      GM調整:${r.gmAdj >= 0 ? `+${r.gmAdj}` : r.gmAdj}
                    </div>
                  </div>`
                )
                .join("")}
            </div>
          </details>
        </div>

        <!-- 3. 每個遊戲勝負 ＆ 得扣分完整對帳 Log -->
        <div class="section-card" style="margin-top:14px;">
          <div class="section-title">📜 全遊戲勝負 ＆ 得／扣分對帳 Log（共 ${events.length} 筆）</div>
          <div class="gm-nav" style="margin-bottom:8px;">
            ${[
              { id: "all", label: "全部紀錄" },
              { id: "party", label: "🎲 賽桌遊戲" },
              { id: "theme", label: "🎪 主題遊戲" },
              { id: "mission", label: "🕵️ 任務/打卡/紅包" },
              { id: "gm", label: "👑 GM手動發分" },
            ]
              .map(
                (f) => `<button class="chip-btn ${this.auditFilter === f.id ? "active" : ""}"
                  onclick="GMConsole.auditFilter='${f.id}';PartyApp.render();">${f.label}</button>`
              )
              .join("")}
          </div>

          <div style="margin-bottom:10px;">
            <select class="input-dark" style="padding:7px 10px;font-size:13px;" onchange="GMConsole.auditPlayerFilter=this.value;PartyApp.render();">
              <option value="">👥 篩選玩家：顯示全體玩家（${players.length} 人）</option>
              ${(players || [])
                .map(
                  (p) => `<option value="${esc(p.id)}" ${this.auditPlayerFilter === p.id ? "selected" : ""}>🔍 只看【${esc(p.name)}】參與／加減分的紀錄</option>`
                )
                .join("")}
            </select>
          </div>

          <div style="max-height:540px;overflow-y:auto;">
            ${
              events.length === 0
                ? `<div class="muted-sm" style="text-align:center;padding:18px 0;">尚無符合篩選條件的遊戲或積分紀錄</div>`
                : events.map((ev) => ev.html).join("")
            }
          </div>
        </div>
      `;
    },

    renderPartyAuditCard(table, tLedgers, tBets, playerMap) {
      const gm = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || { icon: "🎲", name: table.game_type };
      const parts = table.participants || [];
      const wids = table.winner_ids || [];
      const isCoopFail = wids.includes("__coop_fail__");
      const isPvpTie = wids.includes("__pvp_tie__");
      const realWinIds = wids.filter((w) => w !== "__coop_fail__" && w !== "__pvp_tie__");
      const winSet = new Set(realWinIds);
      const gs = table.game_state || {};

      let statusLabel = "⚔️ 進行中";
      if (table.is_test_run) statusLabel = `🧪 測試局(${table.status === "finished" ? "完賽0分" : "進行中"})`;
      else if (table.status === "finished") statusLabel = "🏆 已結算";
      else if (table.status === "cancelled") statusLabel = "🚫 已取消";
      else if (table.status === "open") statusLabel = "⏳ 集結中";

      // 勝負與落敗名單
      let outcomeLine = "";
      if (table.status === "finished") {
        const isCoop =
          table.game_type === "ito_numbers" ||
          (table.game_type === "soul_sync_2v2" && parts.length <= 2);
        if (isCoop) {
          outcomeLine =
            !isCoopFail && realWinIds.length > 0
              ? `🎉 合作闖關成功：${parts.map((p) => p.name).join("、")}`
              : `💥 合作挑戰失敗：${parts.map((p) => p.name).join("、")}`;
        } else if (isPvpTie || realWinIds.length === 0) {
          outcomeLine = `⚖️ 平手退回本金：${parts.map((p) => p.name).join("、")}`;
        } else {
          const winners = parts.filter((p) => winSet.has(p.id)).map((p) => p.name);
          const losers = parts.filter((p) => !winSet.has(p.id)).map((p) => p.name);
          outcomeLine = `🏆 贏家：${winners.join("、") || "無"} ｜ 💀 落敗：${losers.join("、") || "無"}`;
        }
      } else {
        outcomeLine = `參賽者：${parts.map((p) => `${p.name}${p.isScoring ? "" : "(陪玩0分)"}`).join("、")}`;
      }

      // 賽況摘要
      let detailLine = "";
      if (table.game_type === "quick_draw" && gs.times && Object.keys(gs.times).length) {
        detailLine = Object.entries(gs.times)
          .map(([pid, v]) => `${playerMap[pid]?.name || pid}:${gs.mode === "blind10" ? `${(v / 1000).toFixed(2)}s` : v < 0 ? "偷跑" : `${v}ms`}`)
          .join("、");
      } else if (table.game_type === "number_bomb" && gs.lastLog) {
        detailLine = gs.lastLog;
      } else if (table.game_type === "rps_king" && gs.lastRoundMsg) {
        detailLine = gs.lastRoundMsg;
      } else if (table.game_type === "ito_numbers" && gs.proposedOrder?.length && gs.secretNumbers) {
        detailLine =
          "翻牌：" +
          gs.proposedOrder.map((pid) => `${playerMap[pid]?.name || pid}(${gs.secretNumbers[pid]})`).join("➜");
      } else if (table.game_type === "soul_sync_2v2" && gs.scores) {
        detailLine =
          parts.length <= 2
            ? `默契命中 ${gs.scores.team_A || 0} 題`
            : `A組 ${gs.scores.team_A || 0} 分 vs B組 ${gs.scores.team_B || 0} 分`;
      } else if (table.game_type === "five_seconds" && gs.scores) {
        detailLine = parts.map((p) => `${p.name}:${gs.scores[p.id] || 0}分`).join("、");
      }

      // 計算每位相關玩家（參賽者 + 下注者）在本桌的淨得／扣分
      const netByPlayer = {};
      const roleNoteByPlayer = {};
      parts.forEach((p) => {
        netByPlayer[p.id] = 0;
        roleNoteByPlayer[p.id] = table.is_test_run ? "測試0分" : p.isScoring ? "參賽" : "陪玩0分";
      });
      tBets.forEach((b) => {
        if (netByPlayer[b.bettor_id] === undefined) netByPlayer[b.bettor_id] = 0;
        roleNoteByPlayer[b.bettor_id] = `押注(${b.pick_label})`;
      });
      tLedgers.forEach((l) => {
        netByPlayer[l.player_id] = (netByPlayer[l.player_id] || 0) + (Number(l.delta) || 0);
      });

      const chipsHtml = Object.entries(netByPlayer)
        .map(([pid, net]) => {
          const nm = playerMap[pid]?.name || parts.find((x) => x.id === pid)?.name || pid;
          const cls = net > 0 ? "pos" : net < 0 ? "neg" : "";
          const sign = net > 0 ? `+${net}` : `${net}`;
          const role = roleNoteByPlayer[pid] ? ` · ${roleNoteByPlayer[pid]}` : "";
          return `<span class="delta-chip ${cls}">${esc(nm)} ${sign} PT${esc(role)}</span>`;
        })
        .join("");

      return `
        <div class="audit-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <div>
              <span class="muted-xs">${esc(this.formatShortTs(table.updated_at || table.created_at))}</span>
              <b>${gm.icon} ${esc(table.title)}</b>
              ${table.is_happy_hour ? `<span class="hh-tag">+50%</span>` : ""}
            </div>
            <span class="q-tag ${table.status === "finished" ? "q-ok" : "q-muted"}">${esc(statusLabel)}</span>
          </div>
          <div style="font-size:13px;margin-top:4px;color:#fde047;">${esc(outcomeLine)}</div>
          ${detailLine ? `<div class="muted-xs" style="margin-top:2px;">📝 賽況：${esc(detailLine)}</div>` : ""}
          ${chipsHtml ? `<div class="audit-delta-chips">${chipsHtml}</div>` : ""}
        </div>
      `;
    },

    renderThemeAuditCard(session, sLedgers, playerMap) {
      const metaList = window.ThemeGamesUI?.THEME_LIST || [];
      const meta = metaList.find((x) => x.id === session.theme_type) || {
        icon: "🎪",
        name: session.theme_type,
      };
      const st = session.state || {};
      let summary = `參與人數：${(session.participants || []).length} 人`;
      if (session.theme_type === "undercover" && st.lastResultMsg) {
        summary = st.lastResultMsg;
      } else if (session.theme_type === "find_figurine" && st.winnerBanner) {
        summary = st.winnerBanner;
      } else if (session.theme_type === "physical_6stages" && st.stageWinners) {
        const sw = Object.entries(st.stageWinners)
          .map(([no, col]) => `第${no}關:${col === "red" ? "🔴紅勝" : "🔵藍勝"}`)
          .join("、");
        if (sw) summary = sw;
      }

      const netByPlayer = {};
      sLedgers.forEach((l) => {
        netByPlayer[l.player_id] = (netByPlayer[l.player_id] || 0) + (Number(l.delta) || 0);
      });
      const chipsHtml = Object.entries(netByPlayer)
        .map(([pid, net]) => {
          const nm = playerMap[pid]?.name || pid;
          const cls = net > 0 ? "pos" : net < 0 ? "neg" : "";
          return `<span class="delta-chip ${cls}">${esc(nm)} ${net > 0 ? `+${net}` : net} PT</span>`;
        })
        .join("");

      return `
        <div class="audit-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <div>
              <span class="muted-xs">${esc(this.formatShortTs(session.updated_at || session.created_at))}</span>
              <b>${meta.icon} 【主題】${esc(meta.name)}</b>
            </div>
            <span class="q-tag q-bet">${session.status === "finished" ? "已結束" : "進行中"}</span>
          </div>
          <div class="muted-xs" style="margin-top:4px;color:#e2e8f0;">${esc(summary)}</div>
          ${
            chipsHtml
              ? `<div class="audit-delta-chips">${chipsHtml}</div>`
              : `<div class="muted-xs" style="margin-top:4px;">（本場尚無得分入帳紀錄）</div>`
          }
          ${
            sLedgers.length > 0
              ? `<details style="margin-top:6px;">
                  <summary class="muted-xs" style="cursor:pointer;color:#7dd3fc;">▾ 展開本場逐題／逐關發分明細 (${sLedgers.length} 筆)</summary>
                  <div style="margin-top:4px;">
                    ${sLedgers
                      .map(
                        (l) => `<div class="history-row" style="font-size:12px;">
                          <span><b>${esc(playerMap[l.player_id]?.name || l.player_id)}</b> — ${esc(l.reason)}</span>
                          <b style="color:${l.delta >= 0 ? "#6ee7b7" : "#fda4af"};">${l.delta >= 0 ? `+${l.delta}` : l.delta} PT</b>
                        </div>`
                      )
                      .join("")}
                  </div>
                </details>`
              : ""
          }
        </div>
      `;
    },

    renderStandaloneAuditCard(l, playerMap) {
      const nm = playerMap[l.player_id]?.name || l.player_id;
      const isGm = l.category === "gm_adjust";
      const delta = Number(l.delta) || 0;
      return `
        <div class="audit-card ${isGm ? "audit-gm" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <span class="muted-xs">${esc(this.formatShortTs(l.created_at))}</span>
              <b>${esc(nm)}</b> — <span style="font-size:13px;">${esc(l.reason)}</span>
            </div>
            <span class="delta-chip ${delta >= 0 ? "pos" : "neg"}">${delta >= 0 ? `+${delta}` : delta} PT</span>
          </div>
        </div>
      `;
    },

    renderPlayersTab(ctx) {
      const { players, globalCfg } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const rooms = g.roomsList || CFG.DEFAULTS.roomsList;

      return `
        <div class="section-card">
          <div class="section-title">🛏️ 已登入玩家分房指派 ＆ 行前分享卡綠燈 (${players.length} 人)</div>
          <div class="muted-xs" style="margin-bottom:10px;">🙈 黑盒保護：此處僅顯示是否已填寫 2026/2027 分享卡（✅/⏳），不顯示故事內容與個人分數！</div>

          ${(players || [])
            .map((p) => {
              const ok26 = Boolean(p.share_2026 && p.share_2026.story && p.share_2026.trueFact);
              const ok27 = Boolean(p.share_2027 && p.share_2027.story && p.share_2027.trueFact);
              return `
                <div class="gm-player-row">
                  <div>
                    <b>${esc(p.name)}</b> ${p.is_gm ? `<span class="hh-tag">GM</span>` : ""}
                    <div class="muted-xs">
                      ${esc(g.shareLabelA || "2026")}卡:${ok26 ? "✅已填" : "⏳未填"} ｜ ${esc(g.shareLabelB || "2027")}卡:${ok27 ? "✅已填" : "⏳未填"} ｜ 推播:${p.push_tested ? "✅" : "⏳"}
                    </div>
                    <div class="muted-xs" style="margin-top:2px;">
                      裝置綁定：${
                        p.bound_device_id
                          ? `<span style="color:#6ee7b7;">📱 已綁定</span> <button class="btn btn-ghost btn-xs" style="padding:1px 6px;font-size:11px;" onclick="GMConsole.unbindPlayerDevice('${esc(p.id)}')">🔓 解除綁定</button>`
                          : `<span>尚未綁定</span>`
                      }
                    </div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                    <select class="input-dark" style="width:145px;padding:6px;" onchange="GMConsole.assignRoom('${p.id}', this.value)">
                      <option value="">-- 指派房號 --</option>
                      ${rooms
                        .map(
                          (r) => `<option value="${esc(r.name)}" ${p.room === r.name ? "selected" : ""}>${esc(r.name)}</option>`
                        )
                        .join("")}
                    </select>
                    ${
                      p.id === ctx.me?.id
                        ? `<span class="muted-xs">（你自己）</span>`
                        : `<button class="btn btn-danger btn-xs" onclick="GMConsole.confirmDeletePlayer('${esc(p.id)}')">🗑️ 刪除帳號</button>`
                    }
                  </div>
                </div>
              `;
            })
            .join("")}

          <div style="margin-top:14px;">
            <label class="sub-label">🏠 自訂房型清單（每行一間房名，儲存後上方下拉選單即更新）：</label>
            <textarea id="cfg-rooms-textarea" class="input-dark" rows="4">${esc(rooms.map((r) => r.name).join("\n"))}</textarea>
            <button class="btn btn-secondary btn-sm" style="margin-top:8px;width:100%;" onclick="GMConsole.saveRoomsList()">💾 更新房型清單</button>
          </div>
        </div>
      `;
    },

    renderScheduleTab(ctx) {
      const rawSlots = (ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE;
      const firstParts = window.PartyEngine.taipeiParts(
        window.PartyEngine.parseTaipeiMs(rawSlots[0]?.start || "2026-12-31T19:00")
      );

      // 依日期動態分組顯示（零 Hardcode 日期字串！）
      const groups = [];
      const groupMap = {};
      rawSlots.forEach((s, idx) => {
        const stMs = window.PartyEngine.parseTaipeiMs(s.start);
        const edMs = window.PartyEngine.parseTaipeiMs(s.end);
        const sp = window.PartyEngine.taipeiParts(stMs);
        const ep = window.PartyEngine.taipeiParts(edMs);
        const dKey = sp.dateKey;
        if (!groupMap[dKey]) {
          groupMap[dKey] = {
            dateKey: dKey,
            dayLabel: `${sp.yyyy}/${sp.mm}/${sp.dd} (週${sp.wk})`,
            items: [],
          };
          groups.push(groupMap[dKey]);
        }
        groupMap[dKey].items.push({ s, idx, sp, ep });
      });

      return `
        <div class="section-card">
          <div class="section-title">⏰ 直覺式自動排程編輯器</div>
          <p class="muted-xs" style="margin-bottom:10px;">
            點選任一時段的「🕒 時間按鈕」即可彈出大按鈕時鐘選擇器！玩家看到的行事曆、開賽倒數計時器與終局自動結算時間皆會 <b>100% 連動此表</b>。
          </p>

          <!-- 一鍵平移整套四天起始日期（超適合彩排改日期或調整出發日！） -->
          <div class="gm-inline-bar" style="margin-bottom:12px;">
            <div class="sub-label" style="margin-top:0;">📅 快速平移整套行程開賽首日（保留各時段幾點幾分，一鍵平移全部日期）：</div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
              <input type="date" id="sch-base-date" class="input-dark" style="flex:1;" value="${esc(firstParts.dateKey)}">
              <button class="btn btn-primary btn-sm" onclick="GMConsole.shiftAllScheduleBaseDate()">套用平移</button>
              <button class="btn btn-ghost btn-xs" onclick="GMConsole.resetDefaultSchedule()">恢復預設</button>
            </div>
          </div>

          ${groups
            .map(
              (grp, gIdx) => `
              <div class="sched-day-group">
                <div class="sched-day-header">📅 Day ${gIdx + 1} ｜ ${esc(grp.dayLabel)}</div>
                ${grp.items
                  .map(({ s, idx, sp, ep }) => {
                    const crossDay = ep.dateKey !== sp.dateKey ? ` (+1日 ${ep.mm}/${ep.dd})` : "";
                    const themeChoices = (window.ThemeGamesUI?.THEME_LIST || []).filter(
                      (x) => x.id !== "nye_red_packet"
                    );
                    return `
                      <div class="sched-friendly-card">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;">
                          <span class="muted-xs" style="font-weight:700;">時段 #${idx + 1}</span>
                          <div style="display:flex;gap:5px;">
                            <button type="button" class="btn btn-secondary btn-xs" style="padding:3px 8px;font-size:11.5px;" onclick="GMConsole.insertScheduleSlotBefore(${idx})">
                              ➕ 在此段上方插入時段
                            </button>
                            <button type="button" class="btn-icon" title="刪除此時段" onclick="GMConsole.deleteScheduleSlot(${idx})">🗑️</button>
                          </div>
                        </div>

                        <div class="time-range-row">
                          <button type="button" class="time-pick-btn" onclick="GMConsole.openFriendlyTimePicker(${idx}, 'start')">
                            <span>🟢 開始</span>
                            <span class="gold-text">${sp.mm}/${sp.dd} ${sp.hh}:${sp.mi} ▾</span>
                          </button>
                          <span class="muted-xs">➜</span>
                          <button type="button" class="time-pick-btn" onclick="GMConsole.openFriendlyTimePicker(${idx}, 'end')">
                            <span>🏁 結束</span>
                            <span class="cyan-text">${ep.hh}:${ep.mi}${esc(crossDay)} ▾</span>
                          </button>
                        </div>

                        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
                          <select class="input-dark" style="font-size:13px;padding:7px 10px;flex:1;min-width:150px;" onchange="GMConsole.updateSlotField(${idx}, 'scene', this.value)">
                            ${SCENE_OPTIONS.map(
                              (opt) => `<option value="${opt.v}" ${s.scene === opt.v ? "selected" : ""}>${opt.label}</option>`
                            ).join("")}
                          </select>
                          ${
                            s.scene === "theme"
                              ? `<select class="input-dark" style="font-size:12.5px;padding:7px 9px;flex:1;min-width:155px;border-color:rgba(236,72,153,0.45);" onchange="GMConsole.updateSlotField(${idx}, 'themeType', this.value)">
                                   <option value="" ${!s.themeType ? "selected" : ""}>🎪 預設主題：現場自由選</option>
                                   ${themeChoices
                                     .map(
                                       (tc) => `<option value="${tc.id}" ${s.themeType === tc.id ? "selected" : ""}>${tc.icon} 預設：${esc(tc.name)}</option>`
                                     )
                                     .join("")}
                                 </select>`
                              : ""
                          }
                        </div>

                        <div style="margin-bottom:5px;">
                          <label class="muted-xs" style="display:block;margin-bottom:2px;">📌 行程主標題（大字）：</label>
                          <input type="text" class="input-dark" style="font-size:13px;padding:7px 10px;" value="${esc(s.title)}" placeholder="輸入行程主標題" onchange="GMConsole.updateSlotField(${idx}, 'title', this.value)">
                        </div>
                        <div>
                          <label class="muted-xs" style="display:block;margin-bottom:2px;">📝 行事曆副標題補充說明（玩家行事曆灰白小字）：</label>
                          <input type="text" class="input-dark" style="font-size:12.5px;padding:6px 10px;color:#cbd5e1;" value="${esc(s.desc || "")}" placeholder="輸入灰白小字補充說明（可留空）" onchange="GMConsole.updateSlotField(${idx}, 'desc', this.value)">
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `
            )
            .join("")}

          <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:6px;" onclick="GMConsole.addScheduleSlot()">
            ➕ 新增一個排程時段
          </button>
        </div>
      `;
    },

    renderBanksTab(ctx) {
      if (this.bankCategory === "minorityQuestions") {
        this.bankCategory = "pollQuestions";
      }
      const banks = ctx.questionBanks || window.DEFAULT_QUESTION_BANKS;
      const cats = [
        { k: "pollQuestions", label: "🗳️ 匿名爆料指認" },
        { k: "undercoverPairs", label: "🕵️ 誰是臥底詞組" },
        { k: "wavelengthPrompts", label: "📡 頻率同步光譜" },
        { k: "soulSync2v2", label: "🤝 2v2 靈魂默契" },
        { k: "chillMissions", label: "🕵️ 隱藏任務" },
      ];
      const list = banks[this.bankCategory] || [];

      return `
        <div class="section-card">
          <div class="section-title">📝 線上題庫新增與微調</div>
          <div class="gm-nav" style="margin-bottom:10px;">
            ${cats
              .map(
                (c) => `<button class="chip-btn ${this.bankCategory === c.k ? "active" : ""}"
                  onclick="GMConsole.bankCategory='${c.k}';PartyApp.render();">${c.label} (${(banks[c.k] || []).length})</button>`
              )
              .join("")}
          </div>

          <div class="bank-add-box">
            ${this.renderBankAddInputs(this.bankCategory)}
            <button class="btn btn-gold btn-sm" style="width:100%;margin-top:8px;" onclick="GMConsole.addBankItem()">➕ 新增至題庫最上方</button>
          </div>

          <div class="bank-list" data-scroll-key="bank-${this.bankCategory}" style="margin-top:12px;max-height:360px;overflow-y:auto;">
            ${list
              .map(
                (item, idx) => `<div class="history-row" style="align-items:flex-start;gap:8px;">
                  <span style="font-size:13px;"><b>#${idx + 1}</b> ${esc(this.formatBankItem(this.bankCategory, item))}</span>
                  <button class="btn-icon" onclick="GMConsole.deleteBankItem(${idx})">🗑️</button>
                </div>`
              )
              .join("")}
          </div>
        </div>
      `;
    },

    renderBankAddInputs(cat) {
      if (cat === "pollQuestions") {
        return `<input id="bk-f1" class="input-dark" placeholder="輸入新爆料題（如：在場誰最會講幹話？）">`;
      }
      if (cat === "minorityQuestions") {
        return `
          <input id="bk-f1" class="input-dark" placeholder="二選一題幹" style="margin-bottom:6px;">
          <div class="grid-2-btns">
            <input id="bk-f2" class="input-dark" placeholder="選項 A">
            <input id="bk-f3" class="input-dark" placeholder="選項 B">
          </div>`;
      }
      if (cat === "undercoverPairs") {
        return `<div class="grid-2-btns">
          <input id="bk-f1" class="input-dark" placeholder="平民詞（如：豆漿）">
          <input id="bk-f2" class="input-dark" placeholder="臥底詞（如：米漿）">
        </div>`;
      }
      if (cat === "wavelengthPrompts") {
        return `<div class="grid-2-btns">
          <input id="bk-f1" class="input-dark" placeholder="0 左端極端詞">
          <input id="bk-f2" class="input-dark" placeholder="100 右端極端詞">
        </div>`;
      }
      if (cat === "soulSync2v2") {
        return `
          <input id="bk-f1" class="input-dark" placeholder="題目問題" style="margin-bottom:6px;">
          <div class="grid-2-btns">
            <input id="bk-o1" class="input-dark" placeholder="選項 A">
            <input id="bk-o2" class="input-dark" placeholder="選項 B">
            <input id="bk-o3" class="input-dark" placeholder="選項 C">
            <input id="bk-o4" class="input-dark" placeholder="選項 D">
          </div>`;
      }
      return `
        <div class="grid-2-btns" style="margin-bottom:6px;">
          <input id="bk-f1" class="input-dark" placeholder="任務代號（如：茶水天使）">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;"><input type="checkbox" id="bk-photo"> 需拍傳 LINE 相簿</label>
        </div>
        <input id="bk-f2" class="input-dark" placeholder="任務說明內容">
      `;
    },

    formatBankItem(cat, item) {
      if (cat === "pollQuestions") return item.q;
      if (cat === "minorityQuestions") return `${item.q} [A: ${item.a} | B: ${item.b}]`;
      if (cat === "undercoverPairs") return `平民：${item.civilian} ／ 臥底：${item.spy}`;
      if (cat === "wavelengthPrompts") return `0 ${item.left} ◀──▶ 100 ${item.right}`;
      if (cat === "soulSync2v2") return `${item.q} (${(item.options || []).join("/")})`;
      return `【${item.tag}】${item.text}${item.needPhoto ? " 📸" : ""}`;
    },

    renderRehearsalTab(ctx) {
      const { globalCfg, schedule, sceneInfo } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const realNowMs = window.PartyDB.serverNowMs;
      const effNowMs = window.PartyEngine.getEffectiveNowMs(g, realNowMs);
      const offsetMin = Number(g.timeTravelOffsetMinutes) || 0;
      const offsetHrStr =
        offsetMin === 0
          ? "0 小時（與真實時間同步）"
          : `${offsetMin > 0 ? "+" : ""}${(offsetMin / 60).toFixed(offsetMin % 60 === 0 ? 0 : 2)} 小時（${offsetMin > 0 ? "+" : ""}${offsetMin} 分）`;

      // 動態計算排程中的每一天日期供快速跳日測試
      const normSlots = window.PartyEngine.getNormalizedSlots(schedule, g);
      const uniqueDays = [];
      if (normSlots.length) {
        const d0 = window.PartyEngine.parseTaipeiMs(`${window.PartyEngine.taipeiParts(normSlots[0].startMs).dateKey}T00:00`);
        const d1 = window.PartyEngine.parseTaipeiMs(`${window.PartyEngine.taipeiParts(normSlots[normSlots.length - 1].endMs).dateKey}T00:00`);
        for (let ms = d0; ms <= d1 + 1000; ms += 86400000) {
          uniqueDays.push(window.PartyEngine.taipeiParts(ms));
        }
      }

      return `
        <div class="section-card">
          <div class="section-title">🧪 4 人秘密彩排・時光機快速推進器</div>
          <p class="muted-sm" style="margin-bottom:10px;">
            透過加減時間 Offset 快轉或倒退「模擬排程時間」，讓你直接測試完整的<b>自動開賽倒數、自動切換時段、跨日 08:00 回血與自動終局結算</b>！
          </p>

          <div class="clock-compare-box">
            <div class="clock-row">
              <span class="muted-xs">🌐 目前真實時間：</span>
              <b class="live-real-clock">${esc(window.PartyEngine.formatFullClock(realNowMs))}</b>
            </div>
            <div class="clock-row" style="border-top:1px dashed rgba(148,163,184,0.18);margin-top:4px;padding-top:6px;">
              <span class="cyan-text" style="font-size:12.5px;font-weight:800;">🚀 模擬排程時間：</span>
              <b class="gold-text live-sim-clock" style="font-size:15px;">${esc(window.PartyEngine.formatFullClock(effNowMs))}</b>
            </div>
            <div class="clock-row">
              <span class="muted-xs">⏱️ 時間推進 Offset：</span>
              <span class="muted-xs">${esc(offsetHrStr)}</span>
            </div>
            <div class="clock-row" style="border-top:1px dashed rgba(148,163,184,0.18);margin-top:4px;padding-top:6px;">
              <span class="muted-xs">🎬 排程自動判定場景：</span>
              <b style="color:#6ee7b7;">${esc(sceneInfo.label)}${sceneInfo.activeSlot ? `（${esc(sceneInfo.activeSlot.title)}）` : ""}</b>
            </div>
          </div>

          <div class="sub-label">1. 時光機 Offset 快轉／倒退控制（全場連線手機同步快轉！）：</div>
          <div class="bet-btn-grid" style="margin-bottom:8px;">
            <button class="btn btn-secondary btn-sm" onclick="GMConsole.shiftTimeTravel(-1440)">⏪ -1 天</button>
            <button class="btn btn-secondary btn-sm" onclick="GMConsole.shiftTimeTravel(1440)">⏩ +1 天</button>
            <button class="btn btn-secondary btn-sm" onclick="GMConsole.shiftTimeTravel(-60)">⏪ -1 小時</button>
            <button class="btn btn-gold btn-sm" onclick="GMConsole.shiftTimeTravel(60)">⏩ +1 小時</button>
            <button class="btn btn-secondary btn-sm" onclick="GMConsole.shiftTimeTravel(-15)">⏪ -15 分鐘</button>
            <button class="btn btn-secondary btn-sm" onclick="GMConsole.shiftTimeTravel(15)">⏩ +15 分鐘</button>
          </div>
          <div class="grid-2-btns" style="margin-bottom:14px;">
            <button class="btn btn-primary btn-xs" onclick="GMConsole.jumpNearScheduleLaunch()">
              🎯 跳至「排程開賽前 20 秒」（測倒數開服）
            </button>
            <button class="btn btn-ghost btn-xs" onclick="GMConsole.shiftTimeTravel(0, true)">
              ↺ 歸零 Offset（回真實時間）
            </button>
          </div>

          <div class="sub-label">2. 依排程日期模擬跨日早上 08:00 刷新（重置每日 ${g.maxScoringPlaysPerGamePerDay} 次額度 ＋ 低於 ${g.dailyFloorPoints} PT 補滿）：</div>
          <div class="bet-btn-grid" style="margin-bottom:14px;">
            ${uniqueDays
              .slice(1)
              .map(
                (dp, i) => `<button class="btn btn-secondary btn-sm" onclick="GMConsole.simulateMorning('${dp.dateKey}')">☀️ 推進至 Day ${i + 2} (${dp.mm}/${dp.dd} 08:00)</button>`
              )
              .join("")}
          </div>

          <div class="sub-label">3. 模擬跨年午夜最後 8 秒煙火倒數 ＆ 簽到紅包 (+${g.redPacketPoints} PT)：</div>
          <button class="btn btn-primary btn-sm" style="width:100%;margin-bottom:16px;" onclick="GMConsole.simulateMidnight()">
            🎆 全場跳轉跨年倒數 8 秒模擬
          </button>

          <hr style="border-color:rgba(148,163,184,0.2);margin:14px 0;">

          <div class="section-title" style="color:#fda4af;">🧹 彩排結束・一鍵恢復乾淨出廠狀態</div>
          <p class="muted-xs" style="margin-bottom:10px;">
            4 人彩排確認沒 Bug 後，按下方按鈕即可清空所有彩排分數、賽桌、任務與大腿綁定，並將時光機 Offset 歸零、恢復「⏰ 依排程自動切換」！
          </p>
          <div class="grid-2-btns">
            <button class="btn btn-gold btn-sm" onclick="GMConsole.resetRehearsal(false)">
              ↺ 清空測試紀錄（保留帳號&題庫）
            </button>
            <button class="btn btn-danger btn-sm" onclick="GMConsole.resetRehearsal(true)">
              🗑️ 連同彩排測試帳號一併清空
            </button>
          </div>
        </div>
      `;
    },

    // ==================== GM Actions ====================
    unlock() {
      const inp = document.getElementById("gm-pin-input");
      const val = inp ? inp.value.trim() : "";
      const ctx = window.PartyApp.getContext();
      const expected = ctx.globalCfg?.gmPin || CFG.DEFAULT_GM_PIN;
      if (val === expected) {
        window.PartyApp.setGmUnlocked(true);
        window.PartyApp.toast("👑 GM 主控台已解鎖！");
      } else {
        window.PartyApp.toast("❌ 密碼錯誤，僅限活動主辦人進入！");
      }
    },

    logoutGm() {
      window.PartyApp.setGmUnlocked(false);
      window.PartyApp.switchTab("stage");
      window.PartyApp.toast("👤 已登出 GM 模式！現在看到的是 100% 一般玩家畫面");
    },

    async launchSeason() {
      const ctx = window.PartyApp.getContext();
      const players = ctx.players || [];
      if (players.length < 2) {
        window.PartyApp.toast("至少需要 2 位玩家登入後才能啟動配對（建議 4 人以上）！");
        return;
      }
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const normSlots = window.PartyEngine.getNormalizedSlots(ctx.schedule, g);
      const firstDayKey = normSlots.length
        ? window.PartyEngine.taipeiParts(normSlots[0].startMs).dateKey
        : "2026-12-31";
      const dayKey = g.activeDayKey || firstDayKey;
      const initPts = Number(g.initialPoints) || 300;
      const pairs = window.PartyEngine.generateBalancedThighPairs(players.map((p) => p.id));

      for (const p of players) {
        const pr = pairs[p.id] || { thigh_id: null, second_thigh_id: null };
        await window.PartyDB.update("players", `id=eq.${encodeURIComponent(p.id)}`, {
          thigh_id: pr.thigh_id,
          second_thigh_id: pr.second_thigh_id,
        });
        // 發放初始積分（冪等防重發）
        await window.PartyDB.upsert(
          "ledger",
          [
            {
              id: `init_300_${p.id}`,
              player_id: p.id,
              delta: initPts,
              category: "initial",
              reason: `🎉 《${g.eventTitle || "跨年英雄紀元"}》開賽初始基金`,
              day_key: dayKey,
            },
          ],
          { ignoreDuplicates: true }
        );
        // 發放首日 3 張隱藏任務
        const mid = `${p.id}_${dayKey}`;
        const cards = window.PartyEngine.drawMissionCards(ctx.questionBanks, [], 3);
        await window.PartyDB.upsert(
          "missions",
          [
            {
              id: mid,
              player_id: p.id,
              day_key: dayKey,
              cards,
              rerolls_used: 0,
              locked: false,
            },
          ],
          { ignoreDuplicates: true }
        );
      }

      g.seasonStatus = "active";
      g.activeDayKey = g.activeDayKey || dayKey;
      g.manualDayOverride = false;
      if (g.sceneOverride === "trial") g.sceneOverride = "auto";

      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      window.PartyFX.playTone("win");
      window.PartyApp.toast(`🎉 已完成全員 ${initPts} PT 補齊與秘密大腿／二腿雙環配對！`);
      await window.PartyApp.refreshAll();
    },

    async setSceneOverride(mode) {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      g.seasonStatus = "active";
      g.sceneOverride = mode;
      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      window.PartyFX.playTone("bell");
      await window.PartyApp.refreshAll();
    },

    async shiftSchedule(deltaMin, reset = false) {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      g.scheduleOffsetMinutes = reset ? 0 : (Number(g.scheduleOffsetMinutes) || 0) + deltaMin;
      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      window.PartyApp.toast(`排程時間偏移已設為 ${g.scheduleOffsetMinutes} 分鐘`);
      await window.PartyApp.refreshAll();
    },

    async shiftTimeTravel(deltaMin, reset = false) {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      g.timeTravelOffsetMinutes = reset ? 0 : (Number(g.timeTravelOffsetMinutes) || 0) + deltaMin;
      if (reset) g.manualDayOverride = false;
      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      const effMs = window.PartyEngine.getEffectiveNowMs(g, window.PartyDB.serverNowMs);
      window.PartyApp.toast(`🚀 模擬時間已調至：${window.PartyEngine.formatDateTimeFriendly(effMs)}`);
      await window.PartyApp.refreshAll();
    },

    async jumpNearScheduleLaunch() {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const slots = window.PartyEngine.getNormalizedSlots(ctx.schedule, g);
      if (!slots.length) return;
      const targetMs = slots[0].startMs - 20000; // 開賽前 20 秒
      const diffMin = (targetMs - window.PartyDB.serverNowMs) / 60000;
      g.timeTravelOffsetMinutes = Math.round(diffMin * 100) / 100;
      g.sceneOverride = "auto";
      g.seasonStatus = "active";
      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      window.PartyApp.toast("🎯 已跳轉至排程開賽前 20 秒！可切去「遊戲舞台」觀看倒數歸零自動開服！");
      await window.PartyApp.refreshAll();
    },

    async toggleDeviceLock() {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      g.enforceDeviceLock = !g.enforceDeviceLock;
      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      window.PartyApp.toast(
        g.enforceDeviceLock
          ? "🔒 已開啟【單機角色綁定鎖】！每個角色限綁定 1 台手機登入"
          : "🧪 已切換為【Web 測試彈性模式】！允許單機自由切換測試"
      );
      await window.PartyApp.refreshAll();
    },

    async unbindPlayerDevice(playerId) {
      await window.PartyDB.update("players", `id=eq.${encodeURIComponent(playerId)}`, {
        bound_device_id: "",
      });
      window.PartyApp.toast("🔓 已解除該角色的裝置綁定！玩家可於新手機重新登入綁定");
      await window.PartyApp.refreshAll();
    },

    confirmDeletePlayer(playerId) {
      const ctx = window.PartyApp.getContext();
      const p = (ctx.players || []).find((x) => x.id === playerId);
      if (!p) return;
      const inPlaying = (ctx.tables || []).some(
        (t) =>
          (t.status === "playing" || t.status === "settling") &&
          (t.participants || []).some((x) => x.id === playerId && !x.forfeited)
      );
      window.PartyApp.confirmModal(
        "🗑️ 刪除玩家帳號",
        `確定要永久刪除【${p.name}】嗎？\n將一併清除他的積分帳本、任務、徽章、認證申請與尚未開賽的賽桌／下注；被抽到他當秘密大腿的人會自動補抽新人選。${
          inPlaying ? "\n⚠️ 他目前正在對戰中，系統會先替他棄權。" : ""
        }\n此動作無法復原！`,
        "🗑️ 確定刪除",
        () => this.deletePlayerAccount(playerId),
        true
      );
    },

    async deletePlayerAccount(playerId) {
      return window.PartyDB.withLock(`del_player_${playerId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const victim = (ctx.players || []).find((x) => x.id === playerId);
        if (!victim || playerId === ctx.me?.id) return;
        const enc = encodeURIComponent(playerId);

        // 1. 進行中賽桌：標記棄權並視情況結算；集結中賽桌：移出座位（房主則取消賽桌）
        for (const t of ctx.tables || []) {
          const inTbl = (t.participants || []).some((x) => x.id === playerId);
          if (t.status === "open") {
            if (t.host_id === playerId) {
              const tBets = (ctx.bets || []).filter((b) => b.table_id === t.id);
              for (const b of tBets) {
                await window.PartyDB.remove("ledger", `id=eq.${encodeURIComponent(`stake_${b.id}`)}`);
                await window.PartyDB.remove("bets", `id=eq.${encodeURIComponent(b.id)}`);
              }
              await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(t.id)}`, { status: "cancelled" });
            } else if (inTbl) {
              await window.PartyDB.transactRow("tables", t.id, (cur) => {
                if (!cur || cur.status !== "open") return undefined;
                cur.participants = (cur.participants || []).filter((x) => x.id !== playerId);
                return cur;
              });
            }
          } else if ((t.status === "playing" || t.status === "settling") && inTbl) {
            const tx = await window.PartyDB.transactRow("tables", t.id, (cur) => {
              if (!cur || (cur.status !== "playing" && cur.status !== "settling")) return undefined;
              cur.participants = (cur.participants || []).map((x) =>
                x.id === playerId ? { ...x, forfeited: true } : x
              );
              if (cur.game_type === "number_bomb" && cur.game_state) {
                cur.game_state.aliveIds = (cur.game_state.aliveIds || []).filter((id) => id !== playerId);
                cur.game_state.turnIdx = (cur.game_state.turnIdx || 0) % Math.max(1, cur.game_state.aliveIds.length);
              }
              return cur;
            });
            const snap = tx.snapshot;
            const remaining = ((snap && snap.participants) || []).filter((x) => !x.forfeited);
            if (snap && remaining.length <= 1) {
              await window.PartyEngine.settlePartyTable(
                snap,
                remaining.length ? [remaining[0].id] : ["__pvp_tie__"],
                ctx.bets,
                ctx.globalCfg
              );
            }
          }
        }

        // 2. 清除下注（僅限尚未結算）、帳本、任務、徽章、認證
        const openBets = (ctx.bets || []).filter((b) => b.bettor_id === playerId && b.status === "locked");
        for (const b of openBets) {
          await window.PartyDB.remove("bets", `id=eq.${encodeURIComponent(b.id)}`);
        }
        await window.PartyDB.remove("ledger", `player_id=eq.${enc}`);
        await window.PartyDB.remove("missions", `player_id=eq.${enc}`);
        await window.PartyDB.remove("badges_awarded", `player_id=eq.${enc}`);
        const myClaims = (ctx.claims || []).filter((c) => c.applicant_id === playerId);
        for (const c of myClaims) {
          await window.PartyDB.remove("claim_approvals", `claim_id=eq.${encodeURIComponent(c.id)}`);
          await window.PartyDB.remove("claims", `id=eq.${encodeURIComponent(c.id)}`);
        }
        await window.PartyDB.remove("claim_approvals", `approver_id=eq.${enc}`);

        // 3. 主題房移出參與名單
        for (const s of ctx.themeSessions || []) {
          if (s.status !== "finished" && (s.participants || []).includes(playerId)) {
            await window.PartyDB.transactRow("theme_sessions", s.id, (cur) => {
              if (!cur) return undefined;
              cur.participants = (cur.participants || []).filter((id) => id !== playerId);
              return cur;
            });
          }
        }

        // 4. 刪除玩家本體
        await window.PartyDB.remove("players", `id=eq.${enc}`);

        // 5. 被抽到他當大腿／二腿的玩家：只替受影響者補抽新人選（不打亂其他人的配對）
        const survivors = (ctx.players || []).filter((x) => x.id !== playerId);
        for (const p of survivors) {
          const patch = {};
          const pool = survivors.filter((c) => c.id !== p.id);
          const pickOther = (avoid) => {
            const opts = pool.filter((c) => !avoid.includes(c.id));
            if (!opts.length) return null;
            return opts[Math.floor(Math.random() * opts.length)].id;
          };
          if (p.thigh_id === playerId) patch.thigh_id = pickOther([p.second_thigh_id]);
          if (p.second_thigh_id === playerId) {
            patch.second_thigh_id = pickOther([patch.thigh_id ?? p.thigh_id]);
          }
          if (Object.keys(patch).length) {
            await window.PartyDB.update("players", `id=eq.${encodeURIComponent(p.id)}`, patch);
          }
        }

        this.manualTargetIds.delete(playerId);
        window.PartyFX.playTone("bell");
        window.PartyApp.toast(`🗑️ 已刪除帳號【${victim.name}】並清理相關紀錄！`);
        await window.PartyApp.refreshAll();
      });
    },

    async saveGlobalParams() {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const txt = (id, fallback) => {
        const el = document.getElementById(id);
        if (!el) return fallback;
        return el.value.trim() || fallback;
      };
      const num = (id, minV, fallback) => {
        const el = document.getElementById(id);
        if (!el) return fallback;
        const v = Math.round(Number(el.value));
        return Number.isFinite(v) && v >= minV ? v : fallback;
      };

      g.eventTitle = txt("cfg-event-title", g.eventTitle || "跨年英雄紀元");
      g.shareLabelA = txt("cfg-share-label-a", g.shareLabelA || "2026 回顧");
      g.shareLabelB = txt("cfg-share-label-b", g.shareLabelB || "2027 展望");
      g.sharePromptA = txt("cfg-share-prompt-a", g.sharePromptA || "2026 年最值得分享的一件事");
      g.sharePromptB = txt("cfg-share-prompt-b", g.sharePromptB || "2027 年最想完成的一件事");

      g.partyPlayStake = num("cfg-play-stake", 5, g.partyPlayStake || 20);
      g.partyBetStake = num("cfg-bet-stake", 5, g.partyBetStake || 10);
      g.initialPoints = num("cfg-init-pts", 50, g.initialPoints || 300);
      g.dailyFloorPoints = num("cfg-floor-pts", 0, g.dailyFloorPoints ?? 300);
      g.maxScoringPlaysPerGamePerDay = num("cfg-max-plays", 1, g.maxScoringPlaysPerGamePerDay || 3);
      g.maxBetsPerGamePerDay = num("cfg-max-bets", 1, g.maxBetsPerGamePerDay || 3);
      g.hiddenMissionPoints = num("cfg-mission-pts", 5, g.hiddenMissionPoints || 35);
      g.redPacketPoints = num("cfg-redpacket-pts", 5, g.redPacketPoints || 50);

      const newJoinPin = document.getElementById("cfg-join-pin")?.value.trim();
      if (newJoinPin) g.partyJoinPin = newJoinPin;
      const newPin = document.getElementById("cfg-gm-pin")?.value.trim();
      if (newPin) g.gmPin = newPin;

      g.villaInfo = {
        ...(g.villaInfo || {}),
        wifiSsid: document.getElementById("cfg-wifi-ssid")?.value.trim() ?? g.villaInfo?.wifiSsid ?? "",
        wifiPass: document.getElementById("cfg-wifi-pass")?.value.trim() ?? g.villaInfo?.wifiPass ?? "",
        doorCode: document.getElementById("cfg-door-code")?.value.trim() ?? g.villaInfo?.doorCode ?? "",
        mapUrl: document.getElementById("cfg-villa-map")?.value.trim() ?? g.villaInfo?.mapUrl ?? "",
        address: document.getElementById("cfg-villa-addr")?.value.trim() ?? g.villaInfo?.address ?? "",
        notes: document.getElementById("cfg-villa-notes")?.value.trim() ?? g.villaInfo?.notes ?? "",
      };

      document.querySelectorAll("[data-dirty]").forEach((el) => delete el.dataset.dirty);
      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      window.PartyApp.toast("✅ 全域參數、活動標題、額度與民宿資訊已同步更新！");
      await window.PartyApp.refreshAll();
    },

    async assignRoom(playerId, roomName) {
      await window.PartyDB.update("players", `id=eq.${encodeURIComponent(playerId)}`, {
        room: roomName,
      });
      window.PartyApp.toast(`已指派房間：${roomName || "未分配"}`);
      await window.PartyApp.refreshAll();
    },

    async saveRoomsList() {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const raw = document.getElementById("cfg-rooms-textarea")?.value || "";
      const names = raw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length > 0) {
        g.roomsList = names.map((name, idx) => ({ id: `R${idx + 1}`, name }));
        await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
        window.PartyApp.toast("✅ 房型清單已更新！");
        await window.PartyApp.refreshAll();
      }
    },

    // ==================== 友善時鐘排程選擇器 (Friendly Date & Time Picker) ====================
    openFriendlyTimePicker(idx, field) {
      const ctx = window.PartyApp.getContext();
      const slots = (ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE;
      const slot = slots[idx];
      if (!slot) return;
      const curMs = window.PartyEngine.parseTaipeiMs(field === "start" ? slot.start : slot.end);
      const parts = window.PartyEngine.taipeiParts(curMs);
      this.pickerState = {
        idx,
        field,
        dateKey: parts.dateKey,
        hh: parts.hh,
        mi: parts.mi,
        chainNext: field === "end" && idx + 1 < slots.length,
        slotTitle: slot.title,
      };
      this.renderFriendlyTimePickerModal();
    },

    renderFriendlyTimePickerModal() {
      const st = this.pickerState;
      if (!st) return;
      const ctx = window.PartyApp.getContext();
      const slots = (ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE;
      const firstDateKey = window.PartyEngine.taipeiParts(
        window.PartyEngine.parseTaipeiMs(slots[0]?.start || st.dateKey)
      ).dateKey;
      const baseDayMs = window.PartyEngine.parseTaipeiMs(`${firstDateKey}T00:00`);
      const quickDays = [0, 1, 2, 3].map((d) =>
        window.PartyEngine.taipeiParts(baseDayMs + d * 86400000)
      );

      const modal = document.getElementById("party-modal");
      const box = document.getElementById("party-modal-body");
      if (!modal || !box) return;
      modal.classList.remove("hidden");

      const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
      const mins = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

      box.innerHTML = `
        <div class="modal-head">
          <h3>🕒 設定${st.field === "start" ? "開始" : "結束"}時間</h3>
          <button class="btn-close" onclick="PartyGamesUI.closeModal()">✕</button>
        </div>
        <div class="toast-inline" style="margin-bottom:10px;">
          時段：<b>${esc(st.slotTitle)}</b><br>
          已選時間：<b class="gold-text" style="font-size:16px;">${esc(st.dateKey)} ${esc(st.hh)}:${esc(st.mi)}</b>
        </div>

        <label class="sub-label">1. 快速點選活動天數（或手動選擇其他日期）：</label>
        <div class="grid-2-btns" style="margin-bottom:6px;">
          ${quickDays
            .map(
              (dp, i) => `<button type="button" class="btn ${st.dateKey === dp.dateKey ? "btn-gold" : "btn-secondary"} btn-xs"
                onclick="GMConsole.pickTpDate('${dp.dateKey}')">
                Day ${i + 1} (${dp.mm}/${dp.dd} 週${dp.wk})
              </button>`
            )
            .join("")}
        </div>
        <input type="date" class="input-dark" style="margin-bottom:10px;padding:6px 10px;" value="${esc(st.dateKey)}" onchange="GMConsole.pickTpDate(this.value)">

        <label class="sub-label">2. 點選小時 (00 ～ 23)：</label>
        <div class="tp-hour-grid" style="margin-bottom:10px;">
          ${hours
            .map(
              (h) => `<div class="tp-cell ${st.hh === h ? "active" : ""}" onclick="GMConsole.pickTpHour('${h}')">${h}時</div>`
            )
            .join("")}
        </div>

        <label class="sub-label">3. 點選分鐘：</label>
        <div class="tp-min-grid" style="margin-bottom:10px;">
          ${mins
            .map(
              (m) => `<div class="tp-cell ${st.mi === m ? "active" : ""}" onclick="GMConsole.pickTpMin('${m}')">${m}分</div>`
            )
            .join("")}
        </div>

        ${
          st.field === "end" && st.idx + 1 < slots.length
            ? `<label class="line-check-box" style="margin-bottom:10px;">
                 <input type="checkbox" ${st.chainNext ? "checked" : ""} onchange="GMConsole.pickerState.chainNext=this.checked">
                 <span>🔗 若下一段原本緊接在此時段後，一併自動對齊下一段的開始時間</span>
               </label>`
            : ""
        }

        <button class="btn btn-gold" style="width:100%;" onclick="GMConsole.applyFriendlyTimePicker()">
          ✅ 確定套用時間 (${esc(st.dateKey.slice(5).replace("-", "/"))} ${esc(st.hh)}:${esc(st.mi)})
        </button>
      `;
    },

    pickTpDate(dateKey) {
      if (!this.pickerState || !dateKey) return;
      this.pickerState.dateKey = dateKey;
      this.renderFriendlyTimePickerModal();
    },

    pickTpHour(hh) {
      if (!this.pickerState) return;
      this.pickerState.hh = hh;
      this.renderFriendlyTimePickerModal();
    },

    pickTpMin(mi) {
      if (!this.pickerState) return;
      this.pickerState.mi = mi;
      this.renderFriendlyTimePickerModal();
    },

    async applyFriendlyTimePicker() {
      const st = this.pickerState;
      if (!st) return;
      const ctx = window.PartyApp.getContext();
      const next = JSON.parse(
        JSON.stringify((ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE)
      );
      const item = next[st.idx];
      if (!item) return;

      const oldEnd = item.end;
      const newIso = `${st.dateKey}T${st.hh}:${st.mi}`;
      if (st.field === "start") {
        const oldStartMs = window.PartyEngine.parseTaipeiMs(item.start);
        const oldEndMs = window.PartyEngine.parseTaipeiMs(item.end);
        const newStartMs = window.PartyEngine.parseTaipeiMs(newIso);
        item.start = newIso;
        if (newStartMs >= oldEndMs) {
          const durMs = Math.max(30 * 60000, oldEndMs - oldStartMs);
          item.end = window.PartyEngine.taipeiParts(newStartMs + durMs).isoLocal;
        }
        item.day = window.PartyEngine.formatShortDateWeek(newStartMs);
      } else {
        const startMs = window.PartyEngine.parseTaipeiMs(item.start);
        let newEndMs = window.PartyEngine.parseTaipeiMs(newIso);
        if (newEndMs <= startMs) {
          // 若選了跨午夜如 23:55 -> 00:15，自動進位 +1 天！
          newEndMs += 86400000;
        }
        const fixedEndIso = window.PartyEngine.taipeiParts(newEndMs).isoLocal;
        item.end = fixedEndIso;
        if (st.chainNext && next[st.idx + 1] && next[st.idx + 1].start === oldEnd) {
          next[st.idx + 1].start = fixedEndIso;
          next[st.idx + 1].day = window.PartyEngine.formatShortDateWeek(newEndMs);
        }
      }

      next.sort(
        (a, b) => window.PartyEngine.parseTaipeiMs(a.start) - window.PartyEngine.parseTaipeiMs(b.start)
      );
      this.pickerState = null;
      window.PartyGamesUI.closeModal();
      await window.PartyDB.upsert("config", [{ key: "schedule", value: next }]);
      window.PartyFX.haptic("medium");
      window.PartyApp.toast("✅ 時段時間已更新並同步全場行事曆！");
      await window.PartyApp.refreshAll();
    },

    async updateSlotField(idx, field, val) {
      const ctx = window.PartyApp.getContext();
      const next = JSON.parse(
        JSON.stringify((ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE)
      );
      if (!next[idx]) return;
      if (field === "title") {
        next[idx].title = String(val || "").trim() || next[idx].title;
      } else if (field === "desc") {
        next[idx].desc = String(val ?? "").trim();
      } else if (field === "scene") {
        next[idx].scene = val;
        if (val === "red_packet") next[idx].themeType = "nye_red_packet";
        else if (val !== "theme") next[idx].themeType = "";
      } else {
        next[idx][field] = val;
      }
      document.querySelectorAll("[data-dirty]").forEach((el) => delete el.dataset.dirty);
      await window.PartyDB.upsert("config", [{ key: "schedule", value: next }]);
      window.PartyApp.toast("✅ 排程已自動儲存並同步玩家行事曆！");
      await window.PartyApp.refreshAll();
    },

    async insertScheduleSlotBefore(idx) {
      const ctx = window.PartyApp.getContext();
      const next = JSON.parse(
        JSON.stringify((ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE)
      );
      if (idx < 0 || idx >= next.length) return this.addScheduleSlot();

      const round5Min = (ms) => Math.round(ms / (5 * 60000)) * (5 * 60000);
      const cur = next[idx];
      const curStartMs = window.PartyEngine.parseTaipeiMs(cur.start);
      const curEndMs = window.PartyEngine.parseTaipeiMs(cur.end);

      let newStartMs;
      let newEndMs;

      if (idx === 0) {
        newStartMs = curStartMs - 60 * 60000;
        newEndMs = curStartMs;
      } else {
        const prev = next[idx - 1];
        const prevStartMs = window.PartyEngine.parseTaipeiMs(prev.start);
        const prevEndMs = window.PartyEngine.parseTaipeiMs(prev.end);
        if (curStartMs - prevEndMs >= 15 * 60000) {
          // 兩段之間原本就有空檔，直接填入空檔
          newStartMs = prevEndMs;
          newEndMs = curStartMs;
        } else if (prevEndMs - prevStartMs >= 40 * 60000) {
          // 自動切分前一時段後半段，不影響目標時段開始時間！
          const splitMs = round5Min(
            prevEndMs - Math.min(60 * 60000, Math.floor((prevEndMs - prevStartMs) / 2))
          );
          prev.end = window.PartyEngine.taipeiParts(splitMs).isoLocal;
          newStartMs = splitMs;
          newEndMs = curStartMs;
        } else {
          // 前一時段較短時，自動切分當前時段前半段
          const splitMs = round5Min(
            curStartMs + Math.max(15 * 60000, Math.floor((curEndMs - curStartMs) / 2))
          );
          newStartMs = curStartMs;
          newEndMs = splitMs;
          cur.start = window.PartyEngine.taipeiParts(splitMs).isoLocal;
          cur.day = window.PartyEngine.formatShortDateWeek(splitMs);
        }
      }

      const sp = window.PartyEngine.taipeiParts(newStartMs);
      const ep = window.PartyEngine.taipeiParts(newEndMs);
      const inserted = {
        id: `s_ins_${Date.now()}`,
        day: `${sp.mm}/${sp.dd} (${sp.wk})`,
        start: sp.isoLocal,
        end: ep.isoLocal,
        scene: "party",
        themeType: "",
        title: "🎲 自由賽桌暖場時段",
        desc: "自由開 1～3 分鐘賽桌對決與場邊下注！",
      };
      next.splice(idx, 0, inserted);
      await window.PartyDB.upsert("config", [{ key: "schedule", value: next }]);
      window.PartyFX.haptic("medium");
      window.PartyApp.toast("➕ 已在上方插入新時段！可直接修改標題、灰白副標題與時間");
      await window.PartyApp.refreshAll();
    },

    async addScheduleSlot() {
      const ctx = window.PartyApp.getContext();
      const next = JSON.parse(
        JSON.stringify((ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE)
      );
      const last = next[next.length - 1];
      const baseMs = last
        ? window.PartyEngine.parseTaipeiMs(last.end)
        : window.PartyEngine.parseTaipeiMs("2026-12-31T19:00");
      const startParts = window.PartyEngine.taipeiParts(baseMs);
      const endParts = window.PartyEngine.taipeiParts(baseMs + 90 * 60000);
      next.push({
        id: `s_custom_${Date.now()}`,
        day: `${startParts.mm}/${startParts.dd} (${startParts.wk})`,
        start: startParts.isoLocal,
        end: endParts.isoLocal,
        scene: "party",
        themeType: "",
        title: "🎲 新增自由賽桌／活動時段",
        desc: "依排程自動切換",
      });
      await window.PartyDB.upsert("config", [{ key: "schedule", value: next }]);
      window.PartyApp.toast("➕ 已新增時段！可點擊時間按鈕調整時段");
      await window.PartyApp.refreshAll();
    },

    async deleteScheduleSlot(idx) {
      const ctx = window.PartyApp.getContext();
      const next = JSON.parse(
        JSON.stringify((ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE)
      );
      if (next.length <= 1) {
        window.PartyApp.toast("至少需保留 1 個排程時段喔！");
        return;
      }
      next.splice(idx, 1);
      await window.PartyDB.upsert("config", [{ key: "schedule", value: next }]);
      window.PartyApp.toast("🗑️ 已刪除該排程時段");
      await window.PartyApp.refreshAll();
    },

    async shiftAllScheduleBaseDate() {
      const targetDate = document.getElementById("sch-base-date")?.value || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        window.PartyApp.toast("請選擇有效的開賽首日日期！");
        return;
      }
      const ctx = window.PartyApp.getContext();
      const cur = JSON.parse(
        JSON.stringify((ctx.schedule && ctx.schedule.length) ? ctx.schedule : CFG.DEFAULT_SCHEDULE)
      );
      if (!cur.length) return;
      const oldFirstDate = window.PartyEngine.taipeiParts(
        window.PartyEngine.parseTaipeiMs(cur[0].start)
      ).dateKey;
      const dayDeltaMs =
        window.PartyEngine.parseTaipeiMs(`${targetDate}T00:00`) -
        window.PartyEngine.parseTaipeiMs(`${oldFirstDate}T00:00`);

      const shifted = cur.map((s) => {
        const newStMs = window.PartyEngine.parseTaipeiMs(s.start) + dayDeltaMs;
        const newEdMs = window.PartyEngine.parseTaipeiMs(s.end) + dayDeltaMs;
        const sp = window.PartyEngine.taipeiParts(newStMs);
        const ep = window.PartyEngine.taipeiParts(newEdMs);
        return {
          ...s,
          day: `${sp.mm}/${sp.dd} (${sp.wk})`,
          start: sp.isoLocal,
          end: ep.isoLocal,
        };
      });

      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}), activeDayKey: targetDate };
      await window.PartyDB.upsert("config", [
        { key: "schedule", value: shifted },
        { key: "global", value: g },
      ]);
      window.PartyFX.playTone("bell");
      window.PartyApp.toast(`📅 已將整套四天排程平移至 ${targetDate} 開賽！`);
      await window.PartyApp.refreshAll();
    },

    async resetDefaultSchedule() {
      await window.PartyDB.upsert("config", [
        { key: "schedule", value: CFG.DEFAULT_SCHEDULE },
      ]);
      window.PartyApp.toast("↺ 已恢復預設 2026/12/31 ～ 2027/01/03 排程！");
      await window.PartyApp.refreshAll();
    },

    async addBankItem() {
      const ctx = window.PartyApp.getContext();
      const banks = JSON.parse(JSON.stringify(ctx.questionBanks || window.DEFAULT_QUESTION_BANKS));
      const cat = this.bankCategory;
      const id = `custom_${Date.now()}`;
      const v = (eid) => document.getElementById(eid)?.value.trim() || "";

      let item = null;
      if (cat === "pollQuestions" && v("bk-f1")) {
        item = { id, q: v("bk-f1") };
      } else if (cat === "minorityQuestions" && v("bk-f1") && v("bk-f2") && v("bk-f3")) {
        item = { id, q: v("bk-f1"), a: v("bk-f2"), b: v("bk-f3") };
      } else if (cat === "undercoverPairs" && v("bk-f1") && v("bk-f2")) {
        item = { id, civilian: v("bk-f1"), spy: v("bk-f2") };
      } else if (cat === "wavelengthPrompts" && v("bk-f1") && v("bk-f2")) {
        item = { id, left: v("bk-f1"), right: v("bk-f2") };
      } else if (cat === "soulSync2v2" && v("bk-f1") && v("bk-o1") && v("bk-o2")) {
        item = {
          id,
          q: v("bk-f1"),
          options: [v("bk-o1"), v("bk-o2"), v("bk-o3") || "以上皆非", v("bk-o4") || "看心情"],
        };
      } else if (cat === "chillMissions" && v("bk-f1") && v("bk-f2")) {
        item = {
          id,
          tag: v("bk-f1"),
          text: v("bk-f2"),
          needPhoto: Boolean(document.getElementById("bk-photo")?.checked),
        };
      }

      if (!item) {
        window.PartyApp.toast("請完整填寫題目欄位！");
        return;
      }
      banks[cat] = [item, ...(banks[cat] || [])];
      await window.PartyDB.upsert("config", [{ key: "question_banks", value: banks }]);
      document.querySelectorAll("[data-dirty]").forEach((el) => delete el.dataset.dirty);
      window.PartyApp.toast("✅ 已新增題目！");
      await window.PartyApp.refreshAll();
    },

    toggleManualTarget(pid) {
      if (this.manualTargetIds.has(pid)) this.manualTargetIds.delete(pid);
      else this.manualTargetIds.add(pid);
      window.PartyApp.render();
    },

    selectAllManualTargets(selectAll) {
      const ctx = window.PartyApp.getContext();
      if (selectAll) {
        (ctx.players || []).forEach((p) => this.manualTargetIds.add(p.id));
      } else {
        this.manualTargetIds.clear();
      }
      window.PartyApp.render();
    },

    setQuickManualPts(val) {
      const inp = document.getElementById("gm-adj-pts");
      if (inp) {
        inp.value = String(val);
        inp.dataset.dirty = "1";
      }
    },

    async submitManualPoints() {
      const ctx = window.PartyApp.getContext();
      const targetIds = [...this.manualTargetIds].filter((id) =>
        (ctx.players || []).some((p) => p.id === id)
      );
      if (targetIds.length === 0) {
        window.PartyApp.toast("請先勾選至少 1 位要發分／調整的玩家！");
        return;
      }
      const ptsInp = document.getElementById("gm-adj-pts");
      const reasonInp = document.getElementById("gm-adj-reason");
      const delta = Math.round(Number(ptsInp?.value || 0));
      if (!Number.isFinite(delta) || delta === 0) {
        window.PartyApp.toast("請輸入非 0 的加減整數 PT（如 20 或 -20）！");
        return;
      }
      const rawReason = reasonInp?.value.trim() || "現場補償／加碼調整";
      const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";
      const batchTs = Date.now();

      const rows = targetIds.map((pid) => ({
        id: `gm_adj_${batchTs}_${pid}`,
        player_id: pid,
        delta,
        category: "gm_adjust",
        reason: `👑 GM 手動${delta > 0 ? "發分" : "扣分"}：${rawReason}`,
        day_key: dayKey,
        meta: { gmManual: true, by: ctx.me?.name || "GM" },
      }));

      await window.PartyDB.upsert("ledger", rows);
      if (reasonInp) {
        reasonInp.value = "";
        delete reasonInp.dataset.dirty;
      }
      this.manualTargetIds.clear();
      window.PartyFX.playTone(delta > 0 ? "win" : "bell");
      window.PartyApp.toast(
        `✅ 已為 ${targetIds.length} 位玩家手動${delta > 0 ? `發放 +${delta}` : `調整 ${delta}`} PT！`
      );
      await window.PartyApp.refreshAll();
    },

    async deleteBankItem(idx) {
      const ctx = window.PartyApp.getContext();
      const banks = JSON.parse(JSON.stringify(ctx.questionBanks || window.DEFAULT_QUESTION_BANKS));
      banks[this.bankCategory].splice(idx, 1);
      await window.PartyDB.upsert("config", [{ key: "question_banks", value: banks }]);
      await window.PartyApp.refreshAll();
    },

    async simulateMorning(newDayKey) {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const res = await window.PartyEngine.executeDailyMorningRefresh(newDayKey, ctx, { manual: true });
      window.PartyFX.playTone("bell");
      window.PartyApp.toast(
        `☀️ 已切換至 ${newDayKey} 早上 08:00！重置每日 ${g.maxScoringPlaysPerGamePerDay} 次參賽/${g.maxBetsPerGamePerDay} 次下注額度，並為 ${res.toppedUpCount} 位低於 ${g.dailyFloorPoints} PT 玩家回血補滿！`
      );
      await window.PartyApp.refreshAll();
    },

    async simulateMidnight() {
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}), sceneOverride: "theme" };
      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      await window.ThemeGamesUI.triggerMockCountdown();
      window.PartyApp.switchTab("stage");
    },

    triggerFinalSettlement() {
      const ctx = window.PartyApp.getContext();
      const vSlot = ctx.sceneInfo?.viewerSlot;
      const schedHint = vSlot
        ? `（排程原訂於 ${window.PartyEngine.formatDateTimeFriendly(vSlot.startMs)} 自動開獎）`
        : "";
      window.PartyApp.confirmModal(
        "🏆 執行終局結算開獎",
        `確定要立即執行【終局結算】嗎？${schedHint}\n執行後全場將永久鎖定轉為 Viewer 模式，自動頒發 4 大王冠徽章並公開所有人的秘密大腿與最終總冠軍！`,
        "🏆 確定結算公開",
        async () => {
          const latestCtx = window.PartyApp.getContext();
          await window.PartyEngine.executeFinalSettlement(latestCtx);
          window.PartyFX.playTone("win");
          window.PartyApp.switchTab("stage");
          await window.PartyApp.refreshAll();
        },
        true
      );
    },

    resetRehearsal(wipePlayers) {
      const msg = wipePlayers
        ? "確定要清空所有紀錄「連同測試玩家帳號」一併刪除，回到全新出廠狀態嗎？"
        : "確定要清空所有彩排積分、賽桌、任務與大腿綁定，並將時光機 Offset 歸零、恢復「⏰ 依排程自動切換」狀態嗎？（將保留已註冊帳號、房號與題庫）";
      window.PartyApp.confirmModal(
        "🧹 彩排資料清除確認",
        msg,
        wipePlayers ? "🗑️ 確定全部清空" : "↺ 確定清空紀錄",
        async () => {
          const ctx = window.PartyApp.getContext();
          await window.PartyDB.resetRehearsal(wipePlayers);
          const firstSlotDate = window.PartyEngine.taipeiParts(
            window.PartyEngine.parseTaipeiMs((ctx.schedule?.[0]?.start) || "2026-12-31T19:00")
          ).dateKey;
          const cleanGlobal = {
            ...CFG.DEFAULTS,
            gmPin: ctx.globalCfg?.gmPin || CFG.DEFAULT_GM_PIN,
            partyJoinPin: ctx.globalCfg?.partyJoinPin || "1234",
            enforceDeviceLock: Boolean(ctx.globalCfg?.enforceDeviceLock),
            villaInfo: ctx.globalCfg?.villaInfo || CFG.DEFAULTS.villaInfo,
            roomsList: ctx.globalCfg?.roomsList || CFG.DEFAULTS.roomsList,
            seasonStatus: "active",
            sceneOverride: "auto",
            activeDayKey: firstSlotDate,
            manualDayOverride: false,
            scheduleOffsetMinutes: 0,
            timeTravelOffsetMinutes: 0,
          };
          await window.PartyDB.upsert("config", [{ key: "global", value: cleanGlobal }]);
          if (wipePlayers) {
            localStorage.removeItem("nye_party_player_id");
            location.reload();
            return;
          }
          window.PartyApp.toast("🧹 已清空彩排紀錄、歸零 Offset 並切回依排程自動切換！");
          await window.PartyApp.refreshAll();
        },
        wipePlayers
      );
    },
  };

  window.GMConsole = GMConsole;
})();
