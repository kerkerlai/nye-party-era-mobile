/**
 * 《跨年英雄紀元》Party Game 自由賽桌大廳 ＆ 8 款互動小遊戲引擎 (partyGames.js)
 * 嚴格執行：
 *   - 桌長可選 1 / 2 / 3 分鐘開盤集結倒數
 *   - 同遊戲「參賽計分上限 3 次」（第 4 次起可繼續開房暢玩，但 0 押注 0 得分）
 *   - 同遊戲「場邊下注上限 3 次」（獨立計算！超過後去任何人的同款遊戲房皆鎖定下注）
 *   - 雙邊有人對賭才成立彩池，單邊流盤或無人猜中全額退費防洗分！
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

  function avatarHtml(player, size = 34) {
    const name = player ? player.name : "?";
    const ch = [...name][0] || "?";
    const raw = player && player.avatar && !String(player.avatar).includes("dicebear.com")
      ? String(player.avatar).trim()
      : "";
    if (raw && !raw.startsWith("data:") && !raw.startsWith("http") && !raw.startsWith("/")) {
      return `<span class="avatar-emoji" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.58)}px;">${esc(raw)}</span>`;
    }
    if (raw) {
      return `<img src="${esc(raw)}" alt="${esc(name)}" class="avatar-img" style="width:${size}px;height:${size}px;" onerror="this.outerHTML='<span class=\\'avatar-fallback\\' style=\\'width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px;\\'>${esc(ch)}</span>'">`;
    }
    return `<span class="avatar-fallback" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px;">${esc(ch)}</span>`;
  }

  const PartyGamesUI = {
    activeModalGame: "switch_free",
    activeCountdownMin: 2,
    activeModalTestMode: false,
    forceModalTestOnly: false,
    activeRoomTableId: null,
    minimizedRoomIds: new Set(),
    lastAutoOpenedStatus: {},
    quickDrawTimers: {},
    localDrawState: {},
    blindStopwatchStart: {},
    fiveSecTimer: null,

    getMyActiveTable(playerId, tables) {
      if (!playerId) return null;
      return (
        (tables || []).find(
          (t) =>
            (t.status === "open" || t.status === "playing" || t.status === "settling") &&
            (t.participants || []).some((p) => p.id === playerId && !p.forfeited)
        ) || null
      );
    },

    openRoomWindow(tableId) {
      if (!tableId) return;
      this.activeRoomTableId = tableId;
      this.minimizedRoomIds.delete(tableId);
      window.PartyApp.render();
    },

    minimizeRoomWindow() {
      if (this.activeRoomTableId) {
        this.minimizedRoomIds.add(this.activeRoomTableId);
        this.activeRoomTableId = null;
      }
      const overlay = document.getElementById("game-room-overlay");
      if (overlay) overlay.classList.add("hidden");
      window.PartyApp.render();
    },

    syncRoomOverlay(ctx) {
      const overlay = document.getElementById("game-room-overlay");
      const sheet = document.getElementById("game-room-sheet");
      if (!overlay || !sheet) return;

      if (!ctx || !ctx.me || ctx.sceneInfo?.scene === "pre_event" || ctx.sceneInfo?.scene === "viewer") {
        this.activeRoomTableId = null;
        overlay.classList.add("hidden");
        return;
      }

      const tables = ctx.tables || [];
      const myActive = this.getMyActiveTable(ctx.me.id, tables);
      if (myActive) {
        const prevSt = this.lastAutoOpenedStatus[myActive.id];
        // 若房間剛從集結進入正式開戰 (playing)，自動幫參賽者彈開獨立對戰視窗！
        if (prevSt && prevSt !== myActive.status && myActive.status === "playing") {
          this.minimizedRoomIds.delete(myActive.id);
        }
        this.lastAutoOpenedStatus[myActive.id] = myActive.status;
        if (!this.activeRoomTableId && !this.minimizedRoomIds.has(myActive.id)) {
          this.activeRoomTableId = myActive.id;
        }
      }

      // 檢查當前視窗指定的賽桌是否仍在進行中（若已完賽或取消則自動關閉視窗！）
      const targetTable = this.activeRoomTableId
        ? tables.find(
            (t) =>
              t.id === this.activeRoomTableId &&
              (t.status === "open" || t.status === "playing" || t.status === "settling")
          )
        : null;

      if (!targetTable) {
        this.activeRoomTableId = null;
        overlay.classList.add("hidden");
        return;
      }

      // 保存對戰視窗內的捲軸、展開折疊框與輸入草稿（如終極密碼數字框）
      const prevBody = sheet.querySelector(".game-room-body");
      const prevScroll = prevBody ? prevBody.scrollTop : 0;
      const savedDrafts = {};
      const activeId = document.activeElement?.id || "";
      sheet.querySelectorAll("input[id], textarea[id], select[id]").forEach((el) => {
        if (el.type === "file" || el.type === "checkbox" || el.type === "radio") return;
        if (el.dataset.dirty === "1" || el === document.activeElement) {
          savedDrafts[el.id] = el.value;
        }
      });
      const openDetailsIdx = [];
      sheet.querySelectorAll("details").forEach((d, idx) => {
        if (d.open) openDetailsIdx.push(idx);
      });

      const playerMap = {};
      (ctx.players || []).forEach((p) => (playerMap[p.id] = p));
      const gameMeta =
        CFG.PARTY_GAMES.find((x) => x.id === targetTable.game_type) || CFG.PARTY_GAMES[0];
      const amIn = (targetTable.participants || []).some(
        (p) => p.id === ctx.me.id && !p.forfeited
      );

      overlay.classList.remove("hidden");
      const nextSheetHtml = `
        <div class="game-room-topbar">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:900;font-size:15.5px;color:#fef08a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${gameMeta.icon} ${esc(targetTable.title)}
            </div>
            <div class="muted-xs">
              ${amIn ? "⚔️ 專屬對戰室（完賽自動結算）" : "👀 旁觀／場邊下注模式"}
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-xs" onclick="PartyGamesUI.minimizeRoomWindow()">
            ${amIn ? "🔽 縮小" : "✕ 關閉"}
          </button>
        </div>
        <div class="game-room-body">
          ${this.renderTableCard(targetTable, ctx, playerMap)}
        </div>
      `;
      if (this._lastOverlayHtml === nextSheetHtml) return;
      this._lastOverlayHtml = nextSheetHtml;
      sheet.innerHTML = nextSheetHtml;

      const nextBody = sheet.querySelector(".game-room-body");
      if (nextBody) nextBody.scrollTop = prevScroll;
      const newDetails = sheet.querySelectorAll("details");
      openDetailsIdx.forEach((idx) => {
        if (newDetails[idx]) newDetails[idx].open = true;
      });
      Object.entries(savedDrafts).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) {
          el.value = val;
          el.dataset.dirty = "1";
          if (id === activeId) el.focus();
        }
      });
    },

    renderGameRuleBlock(gameMeta, collapsible = false, defaultOpen = false, globalCfg = null) {
      if (!gameMeta) return "";
      const dynScoring =
        CFG.getDynamicScoringRule
          ? CFG.getDynamicScoringRule(gameMeta, globalCfg || window.PartyApp?.data?.globalCfg)
          : gameMeta.scoringRule || "";
      const dynAchv =
        CFG.getDynamicAchievementRule
          ? CFG.getDynamicAchievementRule(gameMeta)
          : gameMeta.achievementRule || "";
      const body = `
        <div class="rule-block-inner">
          <div><b class="cyan-text">🎯 玩法規則（${gameMeta.minPlayers}～${gameMeta.maxPlayers}人）：</b>${esc(gameMeta.howToPlay || gameMeta.desc)}</div>
          <div style="margin-top:5px;"><b class="gold-text">💰 計分獎金：</b>${esc(dynScoring)}</div>
          ${
            dynAchv
              ? `<div class="rule-achv-line"><b>🏅 專屬成就：</b>${esc(dynAchv)}</div>`
              : ""
          }
        </div>
      `;
      if (!collapsible) {
        return `<div class="rule-guide-box">${body}</div>`;
      }
      return `
        <details class="rule-guide-box" ${defaultOpen ? "open" : ""}>
          <summary>📖 查看【${esc(gameMeta.name)}】玩法 ＆ 獎金規則</summary>
          ${body}
        </details>
      `;
    },

    renderLobby(ctx, opts = {}) {
      const { me, players, tables, bets, globalCfg, sceneInfo } = ctx;
      const forceTestOnly = Boolean(opts.forceTestOnly);
      const isHappy = !forceTestOnly && sceneInfo.scene === "happy_hour";
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const dayKey = g.activeDayKey || "2026-12-31";
      const playerMap = {};
      (players || []).forEach((p) => (playerMap[p.id] = p));

      const activeTables = (tables || [])
        .filter(
          (t) =>
            (t.status === "open" || t.status === "playing" || t.status === "settling") &&
            (!forceTestOnly || t.is_test_run)
        )
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      const recentFinished = (tables || [])
        .filter(
          (t) =>
            t.status === "finished" &&
            t.day_key === dayKey &&
            (!forceTestOnly || t.is_test_run)
        )
        .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))
        .slice(0, 5);

      const myActiveTbl = this.getMyActiveTable(me.id, tables);

      return `
        ${
          myActiveTbl
            ? `<div class="active-room-return-bar" onclick="PartyGamesUI.openRoomWindow('${myActiveTbl.id}')">
                 <div>
                   <div style="font-weight:900;color:#fef08a;font-size:14.5px;">🎮 你正在房間內：【${esc(myActiveTbl.title)}】</div>
                   <div class="muted-xs">一次限參加 1 場遊戲・點此立即回到你的獨立對戰視窗！</div>
                 </div>
                 <span class="btn btn-gold btn-xs" style="flex-shrink:0;">進入房間 ▸</span>
               </div>`
            : ""
        }

        <div class="party-banner ${isHappy ? "happy-hour" : ""}" ${forceTestOnly ? 'style="border-color:rgba(56,189,248,0.55);"' : ""}>
          <div class="party-banner-top">
            <span class="scene-pill ${forceTestOnly ? "pill-cyan" : isHappy ? "pill-fire" : "pill-gold"}">
              ${
                forceTestOnly
                  ? "🧪 新手練習場（每款可免費試玩 1 次！）"
                  : isHappy
                  ? "🔥 限時加成 Happy Hour（總獎金 +50%！）"
                  : "🎲 Party Game 自由賽桌"
              }
            </span>
            ${
              myActiveTbl
                ? `<button class="btn btn-gold btn-sm" onclick="PartyGamesUI.openRoomWindow('${myActiveTbl.id}')">🎮 回到房間</button>`
                : `<button class="btn ${forceTestOnly ? "btn-primary" : "btn-gold"} btn-sm" onclick="PartyGamesUI.openCreateModal(${forceTestOnly})">
                     ${forceTestOnly ? "🧪 開測試局" : "➕ 開新賽桌"}
                   </button>`
            }
          </div>
          ${
            forceTestOnly
              ? `<p class="muted-xs" style="margin-top:7px;">
                   💡 每款小遊戲皆有 <b>1 次免費測試機會</b>（開房或加入別人的測試房皆計入），也可召喚 <b>🤖 AI 陪練員</b> 單人熟悉玩法！
                 </p>`
              : `<details class="rule-guide-box" style="margin-top:9px;margin-bottom:0;">
                  <summary>📜 賽桌計分 ＆ 下注規則（每日 08:00 重置額度）</summary>
                  <div class="rule-block-inner">
                    <div>• <b>🚪 獨立對戰室</b>：每人同時限參加 1 桌，進房自動開啟專屬視窗。</div>
                    <div style="margin-top:4px;">• <b>⚔️ 參賽與陪玩（每日 ${g.maxScoringPlaysPerGamePerDay} 次／款）</b>：前 ${g.maxScoringPlaysPerGamePerDay} 局押 <b>${g.partyPlayStake} PT</b> 搶總獎金；滿額後可免費<b>「🤝 陪玩」</b>（自己輸贏 0 分，未滿額對手照常計分）。</div>
                    <div style="margin-top:4px;">• <b>💰 場邊觀眾下注（每日 ${g.maxBetsPerGamePerDay} 次／款）</b>：開賽前可押 <b>${g.partyBetStake} PT</b> 猜贏家（開賽前皆可反悔退注）。需雙邊有人押才成立獎金，單邊或無人猜中全額退回！</div>
                    <div style="margin-top:4px;">• <b>🔥 限時加成</b>：系統額外補貼對戰總獎金 <b>+${Math.round((Number(g.happyHourBonusRate) || 0.5) * 100)}%</b>！</div>
                    <div class="rule-achv-line"><b>🏅 專屬成就：</b>🚀【破冰先鋒 +25 PT】— 每日首位成功開桌完賽正式局的桌長自動獲得！</div>
                  </div>
                </details>`
          }
        </div>

        ${
          activeTables.length === 0
            ? `<div class="empty-card">
                <div style="font-size:34px;margin-bottom:6px;">${forceTestOnly ? "🧪" : "🎯"}</div>
                <div style="font-weight:700;font-size:16px;">${forceTestOnly ? "目前沒有進行中的測試桌" : "目前沒有進行中的賽桌"}</div>
                <div class="muted-sm" style="margin:6px 0 14px;">
                  ${
                    forceTestOnly
                      ? "任選一款尚未試玩的遊戲開啟免費測試局（可揪人或補 AI 陪練員）！"
                      : "快開第一桌揪大家對決，或場邊下注贏獎金！"
                  }
                </div>
                <button class="btn ${forceTestOnly ? "btn-primary" : "btn-gold"}" onclick="PartyGamesUI.openCreateModal(${forceTestOnly})">
                  ${forceTestOnly ? "🧪 開啟免費測試局" : "➕ 建立新賽桌"}
                </button>
              </div>`
            : activeTables.map((t) => this.renderLobbyDoorCard(t, ctx, playerMap, myActiveTbl)).join("")
        }

        <div class="section-card" style="margin-top:16px;">
          <div class="section-title">📊 ${forceTestOnly ? "7 款小遊戲試玩 ＆ 規則一覽" : `今日各遊戲額度 ＆ 規則（${esc(dayKey)}）`}</div>
          <p class="muted-xs" style="margin-bottom:8px;">點擊任一遊戲可展開玩法、獎金與成就說明：</p>
          <div class="quota-grid">
            ${CFG.PARTY_GAMES.map((gm) => {
              const u = window.PartyEngine.getDailyGameUsage(me.id, gm.id, dayKey, tables, bets);
              const testUsed = window.PartyEngine.getTestHostUsage(me.id, gm.id, tables, me);
              const playFull = u.playCount >= g.maxScoringPlaysPerGamePerDay;
              const betFull = u.betCount >= g.maxBetsPerGamePerDay;
              return `
                <details class="quota-details-card">
                  <summary class="quota-item" style="border-bottom:none;cursor:pointer;list-style:none;">
                    <div class="quota-name">${gm.icon} <b>${esc(gm.name)}</b> <span class="muted-xs">▾</span></div>
                    <div class="quota-badges">
                      ${testUsed < 1 ? `<span class="q-tag q-ok">🧪 測試 0/1</span>` : ""}
                      ${
                        !forceTestOnly
                          ? `<span class="q-tag ${playFull ? "q-muted" : "q-ok"}">參賽 ${u.playCount}/${g.maxScoringPlaysPerGamePerDay}</span>
                             <span class="q-tag ${betFull ? "q-lock" : "q-bet"}">下注 ${u.betCount}/${g.maxBetsPerGamePerDay}</span>`
                          : testUsed >= 1
                          ? `<span class="q-tag q-muted">✅ 已完成試玩</span>`
                          : ""
                      }
                    </div>
                  </summary>
                  ${this.renderGameRuleBlock(gm, false)}
                </details>
              `;
            }).join("")}
          </div>
        </div>

        ${
          recentFinished.length > 0
            ? `<div class="section-card" style="margin-top:14px;">
                <div class="section-title">🏁 今日近期完賽賽桌</div>
                ${recentFinished
                  .map((t) => {
                    const rawWinners = t.winner_ids || [];
                    const isTie = rawWinners.includes("__pvp_tie__");
                    const winners = rawWinners
                      .filter((w) => w !== "__coop_fail__" && w !== "__pvp_tie__")
                      .map((id) => (playerMap[id] ? playerMap[id].name : id));
                    return `<div class="history-row">
                      <span><b>${esc(t.title)}</b></span>
                      <span class="gold-text">${isTie ? "⚖️ 平手退回本金" : winners.length ? `🏆 ${esc(winners.join("、"))}` : "💥 闖關失敗"}</span>
                    </div>`;
                  })
                  .join("")}
              </div>`
            : ""
        }
      `;
    },

    renderLobbyDoorCard(table, ctx, playerMap, myActiveTbl) {
      const { me, tables, bets, globalCfg } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      const parts = table.participants || [];
      const activeParts = parts.filter((p) => !p.forfeited);
      const amIn = activeParts.some((p) => p.id === me.id);
      const tableBets = (bets || []).filter((b) => b.table_id === table.id);
      const myBet = tableBets.find((b) => b.bettor_id === me.id);
      const usage = window.PartyEngine.getDailyGameUsage(
        me.id,
        table.game_type,
        table.day_key,
        tables,
        bets
      );
      const myTestUsed = window.PartyEngine.getTestHostUsage(me.id, table.game_type, tables, me);
      const canJoinMore = parts.length < gameMeta.maxPlayers;
      const nextIsScoring = usage.playCount < g.maxScoringPlaysPerGamePerDay;
      const busyElsewhere = Boolean(myActiveTbl && myActiveTbl.id !== table.id);

      const remainSec = Math.max(
        0,
        Math.ceil((Date.parse(table.opens_until) - window.PartyDB.serverNowMs) / 1000)
      );
      const mm = String(Math.floor(remainSec / 60)).padStart(2, "0");
      const ss = String(remainSec % 60).padStart(2, "0");
      const hostName =
        playerMap[table.host_id]?.name || table.host_name || parts[0]?.name || "桌長";
      const minNeed =
        table.game_type === "soul_sync_2v2" && parts.length === 3
          ? 1
          : Math.max(0, gameMeta.minPlayers - parts.length);

      return `
        <div class="lobby-door-card ${amIn ? "my-room-border" : table.is_happy_hour ? "hh-border" : ""}">
          <div class="table-header" style="margin-bottom:6px;">
            <div>
              <span class="game-chip">${gameMeta.icon} ${esc(table.title)}</span>
              ${
                table.is_test_run
                  ? `<span class="scene-pill pill-cyan" style="margin-left:4px;font-size:11px;">🧪 測試局(0分)</span>`
                  : table.is_happy_hour
                  ? `<span class="hh-tag">🔥 獎金+${Math.round((Number(g.happyHourBonusRate) || 0.5) * 100)}%</span>`
                  : ""
              }
              ${
                table.status === "open"
                  ? minNeed > 0
                    ? `<span class="hh-tag" style="background:linear-gradient(135deg,#f97316,#e11d48);">差 ${minNeed} 人開局</span>`
                    : canJoinMore
                    ? `<span class="q-tag q-ok" style="margin-left:4px;">🟢 可開戰</span>`
                    : `<span class="q-tag q-muted" style="margin-left:4px;">🔒 已滿</span>`
                  : ""
              }
            </div>
            <span class="status-badge st-${table.status} ${table.status === "open" ? "live-countdown" : ""}" ${table.status === "open" ? `data-until="${esc(table.opens_until)}"` : ""}>
              ${
                table.status === "open"
                  ? `⏳ 集結 ${mm}:${ss}`
                  : table.status === "playing"
                  ? "⚔️ 對戰中"
                  : "⚖️ 確認勝負"
              }
            </span>
          </div>

          <div class="muted-xs" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <span>👑 房主：<b>${esc(hostName)}</b> ｜ 🏃 選手 (${activeParts.length}/${gameMeta.maxPlayers})：<b>${activeParts.map((p) => esc(p.name)).join("、") || "等待加入"}</b></span>
            ${
              myBet
                ? `<span class="gold-text">💰 已押：${esc(myBet.pick_label)}${table.status === "open" ? " (可進房反悔)" : ""}</span>`
                : !table.is_test_run && tableBets.length > 0
                ? `<span class="cyan-text">💰 下注獎金 ${tableBets.length * (Number(table.bet_stake) || 10)} PT</span>`
                : ""
            }
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${
              amIn
                ? `<button class="btn btn-gold btn-sm" style="width:100%;" onclick="PartyGamesUI.openRoomWindow('${table.id}')">
                     🎮 進入我的對戰室
                   </button>`
                : table.status === "open"
                ? `
                    ${
                      busyElsewhere
                        ? `<button class="btn btn-secondary btn-xs" style="flex:1;" disabled>🔒 你正在另一房參賽中</button>`
                        : table.is_test_run && myTestUsed >= 1
                        ? `<button class="btn btn-secondary btn-xs" style="flex:1;" disabled>✅ 此款測試機會已用</button>`
                        : canJoinMore && !myBet
                        ? `<button class="btn btn-primary btn-sm" style="flex:1.2;" onclick="PartyGamesUI.joinTable('${table.id}')">
                             🙋 ${
                               table.is_test_run
                                 ? "加入測試(扣試玩1次)"
                                 : nextIsScoring
                                 ? `加入參賽(-${table.stake} PT)`
                                 : "🤝 陪玩參賽(0分)"
                             }
                           </button>`
                        : ""
                    }
                    <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="PartyGamesUI.openRoomWindow('${table.id}')">
                      ${table.is_test_run ? "👀 查看房間" : myBet ? "↺ 進房改注／觀戰" : `💰 進房下注 (${tableBets.length}注)`}
                    </button>
                  `
                : `<button class="btn btn-secondary btn-sm" style="width:100%;" onclick="PartyGamesUI.openRoomWindow('${table.id}')">
                     👀 進入觀戰${myBet ? `（已押：${esc(myBet.pick_label)}）` : ""}
                   </button>`
            }
          </div>
        </div>
      `;
    },

    renderTableCard(table, ctx, playerMap) {
      const { me, tables, bets, globalCfg } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      const parts = table.participants || [];
      const amIn = parts.some((p) => p.id === me.id && !p.forfeited);
      const isHost = table.host_id === me.id;
      const tableBets = (bets || []).filter((b) => b.table_id === table.id);
      const myBet = tableBets.find((b) => b.bettor_id === me.id);
      const usage = window.PartyEngine.getDailyGameUsage(
        me.id,
        table.game_type,
        table.day_key,
        tables,
        bets
      );

      const remainSec = Math.max(
        0,
        Math.ceil((Date.parse(table.opens_until) - window.PartyDB.serverNowMs) / 1000)
      );
      const mm = String(Math.floor(remainSec / 60)).padStart(2, "0");
      const ss = String(remainSec % 60).padStart(2, "0");

      return `
        <div class="table-card ${table.is_happy_hour ? "hh-border" : ""}">
          <div class="table-header">
            <div>
              <span class="game-chip">${gameMeta.icon} ${esc(table.title)}</span>
              ${
                table.is_test_run
                  ? `<span class="scene-pill pill-cyan" style="margin-left:4px;font-size:11px;">🧪 測試局 (0分)</span>`
                  : table.is_happy_hour
                  ? `<span class="hh-tag">🔥 獎金+50%</span>`
                  : ""
              }
            </div>
            <span class="status-badge st-${table.status} ${table.status === "open" ? "live-countdown" : ""}" ${table.status === "open" ? `data-until="${esc(table.opens_until)}"` : ""}>
              ${
                table.status === "open"
                  ? table.is_test_run
                    ? `⏳ 試玩集結 ${mm}:${ss}`
                    : `⏳ 集結 ${mm}:${ss}`
                  : table.status === "playing"
                  ? "⚔️ 對戰中"
                  : "⚖️ 確認勝負"
              }
            </span>
          </div>

          <!-- 遊戲玩法與計分規則說明（集結下注階段預設展開，開打後可一鍵收合查看） -->
          ${
            table.status === "open"
              ? this.renderGameRuleBlock(gameMeta, false)
              : this.renderGameRuleBlock(gameMeta, true, false)
          }

          <!-- 參賽選手列 -->
          <div class="participants-box">
            <div class="sub-label">🏃 參賽選手 (${parts.length}/${gameMeta.maxPlayers})：</div>
            <div class="part-chips">
              ${parts
                .map((p) => {
                  const pl = playerMap[p.id] || {
                    name: p.name,
                    avatar: p.isBot || String(p.id).startsWith("bot_") ? "🤖" : "",
                  };
                  const canSwapTeam =
                    table.status === "open" &&
                    p.id === me.id &&
                    table.game_type === "soul_sync_2v2";
                  return `<div class="part-chip ${p.forfeited ? "fun-only" : p.isScoring ? "scoring" : "fun-only"}" ${p.forfeited ? 'style="opacity:0.5;text-decoration:line-through;"' : ""}>
                    ${avatarHtml(pl, 24)}
                    <span>${esc(pl.name)}</span>
                    ${
                      p.team
                        ? `<em class="team-badge" ${canSwapTeam ? `style="cursor:pointer;" title="點擊切換組別" onclick="PartyGamesUI.swapMyTeam('${table.id}')"` : ""}>${esc(p.teamLabel || p.team)}${canSwapTeam ? " ⇄" : ""}</em>`
                        : ""
                    }
                    <small>${p.forfeited ? "🏳️已棄權" : table.is_test_run ? "測試0分" : p.isScoring ? `押${table.stake}` : "🤝陪玩0分"}</small>
                  </div>`;
                })
                .join("")}
            </div>
          </div>

          ${
            table.status === "open"
              ? this.renderOpenControls(table, gameMeta, me, amIn, isHost, usage, myBet, tableBets, g, remainSec, ctx)
              : this.renderPlayingArea(table, gameMeta, ctx, playerMap, amIn, isHost, tableBets, myBet)
          }
        </div>
      `;
    },

    renderOpenControls(table, gameMeta, me, amIn, isHost, usage, myBet, tableBets, g, remainSec, ctx = null) {
      const parts = table.participants || [];
      const canJoinMore = parts.length < gameMeta.maxPlayers;
      const nextIsScoring = usage.playCount < g.maxScoringPlaysPerGamePerDay;
      const betLeft = g.maxBetsPerGamePerDay - usage.betCount;
      const myTestUsed = window.PartyEngine.getTestHostUsage(
        me.id,
        table.game_type,
        ctx?.tables || window.PartyApp?.data?.tables || [],
        me
      );

      // 下注選項
      let betTargets = [];
      if (gameMeta.betMode === "coop" || (table.game_type === "soul_sync_2v2" && parts.length <= 2)) {
        betTargets = [
          { key: "coop_pass", label: "✅ 闖關成功" },
          { key: "coop_fail", label: "💥 挑戰翻車" },
        ];
      } else if (table.game_type === "soul_sync_2v2" && parts.length > 2) {
        betTargets = [
          { key: "team_A", label: "🅰️ A 組獲勝" },
          { key: "team_B", label: "🅱️ B 組獲勝" },
        ];
      } else {
        betTargets = parts.map((p) => ({ key: p.id, label: `押 ${p.name} 贏` }));
      }

      const invalidSoulCount = table.game_type === "soul_sync_2v2" && parts.length === 3;
      const canStartNow = parts.length >= gameMeta.minPlayers && !invalidSoulCount;

      return `
        <div class="open-actions">
          ${
            !amIn && canJoinMore && !myBet
              ? table.is_test_run && myTestUsed >= 1
                ? `<div class="locked-bet-msg" style="text-align:center;">✅ 你已使用過本遊戲的 1 次免費測試機會囉！</div>`
                : `<button class="btn btn-primary" onclick="PartyGamesUI.joinTable('${table.id}')">
                    🙋 加入${
                      table.is_test_run
                        ? "免費測試局（扣此款 1 次試玩機會）"
                        : nextIsScoring
                        ? `參賽（第 ${usage.playCount + 1}/${g.maxScoringPlaysPerGamePerDay} 局，押 ${table.stake} PT）`
                        : `陪玩參賽（已滿 ${g.maxScoringPlaysPerGamePerDay} 次輸贏 0 分；對手照常計分）`
                    }
                  </button>`
              : amIn && !isHost
              ? `<button class="btn btn-ghost btn-sm" onclick="PartyGamesUI.leaveTable('${table.id}')">退出參賽</button>`
              : ""
          }

          ${
            invalidSoulCount
              ? `<div class="muted-xs" style="color:#fcd34d;">🤝 靈魂默契需為「2 人合作」或「4 人對抗」，目前 3 人請再等 1 位夥伴加入！</div>`
              : ""
          }

          ${
            isHost
              ? (() => {
                  const lastNudgeAt = Number(table.game_state?.lastNudgeAt) || 0;
                  const nudgeCoolSec = Math.max(
                    0,
                    Math.ceil((lastNudgeAt + 20000 - window.PartyDB.serverNowMs) / 1000)
                  );
                  const minNeed =
                    table.game_type === "soul_sync_2v2" && parts.length === 3
                      ? 1
                      : Math.max(0, gameMeta.minPlayers - parts.length);
                  return `<div class="host-row">
                    <button class="btn btn-gold" ${!canStartNow ? "disabled" : ""} onclick="PartyGamesUI.startTable('${table.id}')">
                      🚀 ${remainSec === 0 ? "時間到！立即開賽" : `人齊開賽（${table.game_type === "soul_sync_2v2" ? "2人/4人" : `至少${gameMeta.minPlayers}人`}）`}
                    </button>
                    ${
                      !table.is_test_run && canJoinMore
                        ? `<button class="btn btn-primary btn-sm" ${nudgeCoolSec > 0 ? "disabled" : ""} onclick="PartyGamesUI.nudgeTablePlayers('${table.id}')">
                             📢 ${
                               nudgeCoolSec > 0
                                 ? `已廣播 (${nudgeCoolSec}s)`
                                 : minNeed > 0
                                 ? `廣播催人（差 ${minNeed} 人）`
                                 : "廣播揪人進房"
                             }
                           </button>`
                        : ""
                    }
                    ${
                      table.is_test_run && !canStartNow
                        ? `<button class="btn btn-primary btn-sm" onclick="PartyGamesUI.startTestWithBots('${table.id}')">
                             🤖 補 AI 陪練員單人試玩
                           </button>`
                        : ""
                    }
                    <button class="btn btn-danger btn-sm" onclick="PartyGamesUI.cancelTable('${table.id}')">取消賽桌</button>
                  </div>`;
                })()
              : remainSec === 0 && canStartNow
              ? `<button class="btn btn-gold" onclick="PartyGamesUI.startTable('${table.id}')">⏰ 集結時間到！點此開戰</button>`
              : ""
          }
        </div>

        ${
          table.is_test_run
            ? `<div class="betting-panel">
                 <div class="muted-xs" style="color:#7dd3fc;">🧪 免費測試局：0 押注、0 得分、不開放下注；開戰後將扣除參與者本遊戲的 1 次試玩機會。</div>
               </div>`
            : `<!-- 場邊觀眾下注區 -->
               <div class="betting-panel">
                 <div class="bet-header">
                   <span>💰 場邊下注總獎金（${tableBets.length} 注 / 共 ${tableBets.length * table.bet_stake} PT）</span>
                   <span class="muted-xs">開賽前可反悔退注；雙邊對賭才成立</span>
                 </div>
                 ${
                   amIn
                     ? `<div class="muted-xs">你是本局參賽選手，專心應戰！（場外觀眾可下注）</div>`
                     : myBet
                     ? `<div class="my-bet-tag bet-regret-row">
                          <span>✅ 已押：<b>${esc(myBet.pick_label)}</b>（${myBet.amount} PT，今日 ${usage.betCount}/${g.maxBetsPerGamePerDay}）</span>
                          <button type="button" class="btn btn-ghost btn-xs" style="border-color:rgba(251,191,36,0.65);color:#fde047;flex-shrink:0;" onclick="PartyGamesUI.cancelMyBet('${table.id}')">↺ 反悔退注</button>
                        </div>`
                     : betLeft <= 0
                     ? `<div class="locked-bet-msg">🔒 今日「${esc(gameMeta.name)}」下注已滿 ${g.maxBetsPerGamePerDay}/${g.maxBetsPerGamePerDay} 次（別款遊戲仍可押！）</div>`
                     : betTargets.length < 2
                     ? `<div class="muted-xs">等待至少 2 位選手入座即可開放場邊下注…</div>`
                     : `<div class="bet-btn-grid">
                         ${betTargets
                           .map(
                             (bt) => `<button class="btn btn-bet" onclick="PartyGamesUI.placeBet('${table.id}', '${esc(bt.key)}', '${esc(bt.label)}')">
                               ${esc(bt.label)} <small>(-${table.bet_stake} PT)</small>
                             </button>`
                           )
                           .join("")}
                       </div>`
                 }
               </div>`
        }
      `;
    },

    renderPlayingArea(table, gameMeta, ctx, playerMap, amIn, isHost, tableBets, myBet) {
      const { me } = ctx;
      const gs = table.game_state || {};
      let innerHtml = "";

      if (table.game_type === "quick_draw") {
        innerHtml = this.renderQuickDraw(table, gs, me, amIn, isHost, ctx);
      } else if (table.game_type === "number_bomb") {
        innerHtml = this.renderNumberBomb(table, gs, me, amIn, playerMap);
      } else if (table.game_type === "rps_king") {
        innerHtml = this.renderRpsKing(table, gs, me, amIn, playerMap, ctx);
      } else if (table.game_type === "soul_sync_2v2") {
        innerHtml = this.renderSoulSync(table, gs, me, amIn, playerMap, ctx);
      } else if (table.game_type === "ito_numbers") {
        innerHtml = this.renderIto(table, gs, me, amIn, isHost, playerMap);
      } else if (table.game_type === "five_seconds") {
        innerHtml = this.renderFiveSeconds(table, gs, me, amIn, playerMap);
      }

      // 通用結果申報與對手互認面板（Switch 與所有實體/備援結算共用）
      const settleHtml = this.renderMutualSettlementBox(table, gameMeta, me, amIn, playerMap);
      const forfeitBarHtml = amIn
        ? `<div class="forfeit-bar">
             <span class="muted-xs">對方遲遲不出牌或想提前離場？</span>
             <button type="button" class="btn btn-danger btn-xs" onclick="PartyGamesUI.confirmForfeitTable('${table.id}')">🏳️ 棄權認輸</button>
           </div>`
        : "";

      return `
        <div class="playing-stage">
          ${myBet ? `<div class="my-bet-tag" style="margin-bottom:8px;">💰 你的押注：<b>${esc(myBet.pick_label)}</b>（下注獎金 ${tableBets.length * table.bet_stake} PT）</div>` : ""}
          ${innerHtml}
          ${settleHtml}
          ${forfeitBarHtml}
        </div>
      `;
    },

    // ==================== 1. ⚡ 手機毫秒決鬥 (支援 2～16 人同時開戰！) ====================
    getMergedQdState(table, gs, themeResponses) {
      const mode = gs.mode || "draw";
      const roundSeq = gs.roundSeq || 1;
      const ready = { ...(gs.ready || {}) };
      const times = { ...(gs.times || {}) };
      const rKey = `qd_ready_${mode}_${roundSeq}`;
      const tKey = `qd_time_${mode}_${roundSeq}`;
      (themeResponses || []).forEach((r) => {
        if (r.session_id !== table.id) return;
        if (r.step_key === rKey) ready[r.player_id] = true;
        if (r.step_key === tKey && r.payload && r.payload.ms !== undefined) {
          times[r.player_id] = Number(r.payload.ms);
        }
      });
      return { mode, roundSeq, ready, times };
    },

    renderQuickDraw(table, gs, me, amIn, isHost, ctx) {
      const parts = (table.participants || []).filter((p) => !p.forfeited);
      const { mode, roundSeq, times } = this.getMergedQdState(table, gs, ctx?.themeResponses);
      const localDraw = this.localDrawState[table.id];
      const activeLocal =
        localDraw && localDraw.roundSeq === roundSeq ? localDraw : null;
      const canSwitchMode =
        isHost && !activeLocal && Object.keys(times).length === 0;
      const potPreview = table.is_test_run
        ? "0 PT (測試)"
        : `${Math.round((table.participants || []).length * (Number(table.stake) || 20) * (table.is_happy_hour ? 1.5 : 1))} PT`;

      if (mode === "draw") {
        const myTime = times[me.id];
        const tappedCnt = parts.filter((p) => times[p.id] !== undefined).length;
        const allTapped = parts.length > 0 && tappedCnt >= parts.length;
        const hasValidScore = parts.some((p) => times[p.id] !== undefined && times[p.id] >= 0);

        return `
          <div class="mini-game-box">
            <div class="ss-top" style="margin-bottom:6px;">
              <div class="mini-mode-switch" style="margin-bottom:0;">
                <button class="chip-btn active" ${!canSwitchMode ? "disabled" : ""} onclick="PartyGamesUI.switchQdMode('${table.id}','draw')">🔫 西部拔槍</button>
                <button class="chip-btn" ${!canSwitchMode ? "disabled" : ""} onclick="PartyGamesUI.switchQdMode('${table.id}','blind10')">⏱️ 盲按 10.000s</button>
              </div>
              <span class="gold-text" style="font-size:12.5px;">🏆 獨得獎金：${potPreview}</span>
            </div>
            <p class="muted-sm" style="margin:6px 0 10px;">
              各自點擊開始後，每支手機<b>獨立隨機 2.4～5.0 秒變紅</b>，單獨測量你螢幕變紅後的真實反應毫秒數，全員按完再統一開牌比快慢（絕無網路同步誤差！變紅前偷按淘汰）！
            </p>
            ${
              myTime !== undefined
                ? `<div class="locked-bet-msg" style="text-align:center;margin:10px 0;">
                    ${myTime === -2 ? "🏳️ 已棄權" : myTime < 0 ? "❌ 你偷跑犯規淘汰啦！" : `⚡ 你的純反應速度：<b class="gold-text">${myTime} ms</b>！`}
                    （已完成 ${tappedCnt}/${parts.length} 人）
                  </div>`
                : !amIn
                ? `<div class="muted-sm" style="text-align:center;margin:10px 0;">等待選手完成各自拔槍反應測試（${tappedCnt}/${parts.length}）…</div>`
                : !activeLocal
                ? `<button class="btn btn-gold" style="width:100%;" onclick="PartyGamesUI.qdStartLocalDraw('${table.id}')">
                    🔫 點擊進入拔槍待命（等變紅秒按！）
                  </button>`
                : activeLocal.phase === "armed"
                ? `<div class="qd-pad armed" onclick="PartyGamesUI.qdTap('${table.id}')">
                    <div style="font-size:26px;font-weight:800;">🤫 屏住呼吸…等螢幕變紅！</div>
                    <div class="muted-xs" style="margin-top:4px;">現在按下去算偷跑淘汰喔！</div>
                  </div>`
                : `<div class="qd-pad fired" onclick="PartyGamesUI.qdTap('${table.id}')">
                    <div style="font-size:34px;font-weight:900;">💥 BANG！快按！！</div>
                  </div>`
            }
            <div class="qd-multi-list">
              ${parts
                .map((p) => {
                  const v = times[p.id];
                  const txt =
                    v === undefined
                      ? "⏳ 待命／測速中…"
                      : allTapped || p.id === me.id
                      ? v === -2
                        ? "<span class='muted-xs'>🏳️ 棄權</span>"
                        : v < 0
                        ? "<span style='color:#fda4af;'>❌ 偷跑淘汰</span>"
                        : `<b class="gold-text">⚡ ${v} ms</b>`
                      : "🔒 已完成拔槍（等全員按完揭曉）";
                  return `<div class="qd-multi-row"><span><b>${esc(p.name)}</b></span><span>${txt}</span></div>`;
                })
                .join("")}
            </div>
            ${
              isHost && hasValidScore && tappedCnt < parts.length
                ? `<button class="btn btn-secondary btn-xs" style="width:100%;margin-top:8px;" onclick="PartyGamesUI.qdForceSettle('${table.id}')">
                    🏁 有人離席未按？截止並結算第 1 名
                  </button>`
                : ""
            }
          </div>
        `;
      } else {
        // 盲按 10.000 秒精準王 (2~16人)
        const localStart = this.blindStopwatchStart[table.id] || 0;
        const myVal = times[me.id];
        const doneCnt = parts.filter((p) => times[p.id] !== undefined).length;
        const allDone = parts.length > 0 && doneCnt >= parts.length;

        return `
          <div class="mini-game-box">
            <div class="ss-top" style="margin-bottom:6px;">
              <div class="mini-mode-switch" style="margin-bottom:0;">
                <button class="chip-btn" ${!canSwitchMode ? "disabled" : ""} onclick="PartyGamesUI.switchQdMode('${table.id}','draw')">🔫 西部拔槍</button>
                <button class="chip-btn active" ${!canSwitchMode ? "disabled" : ""} onclick="PartyGamesUI.switchQdMode('${table.id}','blind10')">⏱️ 盲按 10.000s</button>
              </div>
              <span class="gold-text" style="font-size:12.5px;">🏆 獨得獎金：${potPreview}</span>
            </div>
            <p class="muted-sm" style="margin:6px 0 10px;">各自按下開始計時，滿 3.000 秒後碼表自動蓋牌，最接近 <b>10.000 秒</b> 者獨得獎金！（已完成 ${doneCnt}/${parts.length} 人）</p>
            ${
              amIn && myVal === undefined
                ? !localStart
                  ? `<button class="btn btn-gold" style="width:100%;" onclick="PartyGamesUI.startBlind10('${table.id}')">▶️ 開始我的 10.000 秒挑戰</button>`
                  : `<div class="qd-pad fired" id="blind10-pad-${table.id}" onclick="PartyGamesUI.stopBlind10('${table.id}')">
                      <div id="blind10-display-${table.id}" style="font-size:32px;font-weight:900;">計時中…點此拍停！</div>
                      <div class="muted-xs">目標：10.000 秒</div>
                    </div>`
                : ""
            }
            <div class="qd-multi-list">
              ${parts
                .map((p) => {
                  const v = times[p.id];
                  const txt =
                    v === undefined
                      ? "⏳ 挑戰中…"
                      : v < 0
                      ? "<span class='muted-xs'>🏳️ 棄權</span>"
                      : allDone || p.id === me.id
                      ? `<b class="gold-text">${(v / 1000).toFixed(3)}s</b> <small class="muted-xs">(差 ${(Math.abs(v - 10000) / 1000).toFixed(3)}s)</small>`
                      : "🔒 已拍停鎖定（等全員按完揭曉）";
                  return `<div class="qd-multi-row"><span><b>${esc(p.name)}</b></span><span>${txt}</span></div>`;
                })
                .join("")}
            </div>
            ${
              isHost && doneCnt >= 1 && !allDone
                ? `<button class="btn btn-secondary btn-xs" style="width:100%;margin-top:8px;" onclick="PartyGamesUI.qdForceSettle('${table.id}')">
                    🏁 有人離席未按？截止並開獎結算
                  </button>`
                : ""
            }
          </div>
        `;
      }
    },

    // ==================== 2. 💣 終極密碼死鬥 ====================
    renderNumberBomb(table, gs, me, amIn, playerMap) {
      const alive = gs.aliveIds || table.participants.map((p) => p.id);
      const turnIdx = (gs.turnIdx || 0) % alive.length;
      const turnPlayerId = alive[turnIdx];
      const turnPlayer = playerMap[turnPlayerId] || { name: turnPlayerId };
      const low = gs.low ?? 0;
      const high = gs.high ?? 100;
      const isMyTurn = amIn && turnPlayerId === me.id;

      return `
        <div class="mini-game-box">
          <div class="bomb-range">${low} <span class="muted-sm">～</span> ? <span class="muted-sm">～</span> ${high}</div>
          <div class="muted-sm" style="text-align:center;margin-bottom:8px;">
            存活選手：${alive.map((id) => esc(playerMap[id]?.name || id)).join("、")} ｜
            目前輪到：<b class="gold-text">${esc(turnPlayer.name)}</b>
          </div>
          ${ gs.lastLog ? `<div class="toast-inline">${esc(gs.lastLog)}</div>` : "" }
          ${
            isMyTurn
              ? `<div class="bomb-input-row">
                  <input type="number" inputmode="numeric" pattern="[0-9]*" id="bomb-val-${table.id}" class="input-dark" min="${low + 1}" max="${high - 1}" placeholder="輸入 ${low + 1} ～ ${high - 1}" onkeydown="if(event.key==='Enter') PartyGamesUI.submitBombGuess('${table.id}')">
                  <button class="btn btn-gold" onclick="PartyGamesUI.submitBombGuess('${table.id}')">💣 送出</button>
                </div>`
              : ""
          }
        </div>
      `;
    },

    // ==================== 3. ✊ 猜拳連勝王 (BO5 搶三勝，防雙人同時點拳漏記) ====================
    renderRpsKing(table, gs, me, amIn, playerMap, ctx) {
      const p1 = table.participants[0];
      const p2 = table.participants[1];
      const wins = gs.wins || { [p1?.id]: 0, [p2?.id]: 0 };
      const roundSeq = gs.roundSeq || 1;
      const rKey = `rps_r${roundSeq}`;
      const moves = { ...(gs.moves || {}) };
      (ctx?.themeResponses || []).forEach((r) => {
        if (r.session_id === table.id && r.step_key === rKey && r.payload?.move) {
          moves[r.player_id] = r.payload.move;
        }
      });
      const myMove = moves[me.id];

      return `
        <div class="mini-game-box">
          <div class="rps-score">
            <span>${esc(p1?.name)} <b>${wins[p1?.id] || 0}</b></span>
            <span class="muted-sm">搶 3 勝</span>
            <span><b>${wins[p2?.id] || 0}</b> ${esc(p2?.name)}</span>
          </div>
          ${ gs.lastRoundMsg ? `<div class="toast-inline" style="text-align:center;">${esc(gs.lastRoundMsg)}</div>` : "" }
          ${
            amIn
              ? `<div class="rps-btns">
                  ${[
                    { k: "rock", label: "✊ 石頭" },
                    { k: "scissors", label: "✌️ 剪刀" },
                    { k: "paper", label: "🖐️ 布" },
                  ]
                    .map(
                      (m) => `<button class="btn ${myMove === m.k ? "btn-gold" : "btn-secondary"}" onclick="PartyGamesUI.playRps('${table.id}','${m.k}')">
                        ${m.label}
                      </button>`
                    )
                    .join("")}
                </div>
                <div class="muted-xs" style="text-align:center;margin-top:6px;">
                  ${myMove ? "✅ 已暗中出拳，等待對手出拳同步開牌…" : "請在手機上選擇這回合要出的拳，雙方選完自動開牌（搶 3 勝自動發獎金）！"}
                </div>`
              : ""
          }
        </div>
      `;
    },

    // ==================== 4. 🤝 2v2 靈魂默契快問快答 (100% 選擇題，防多人同時作答互蓋) ====================
    renderSoulSync(table, gs, me, amIn, playerMap, ctx) {
      const questions = gs.questions || [];
      const qIdx = gs.qIdx || 0;
      const curQ = questions[qIdx];
      const sKey = `ss_q${qIdx}`;
      const answers = { ...((gs.answers && gs.answers[qIdx]) || {}) };
      (ctx?.themeResponses || []).forEach((r) => {
        if (r.session_id === table.id && r.step_key === sKey && r.payload?.choice !== undefined) {
          answers[r.player_id] = Number(r.payload.choice);
        }
      });
      const scores = gs.scores || { team_A: 0, team_B: 0 };
      const isCoop2 = table.participants.length === 2;

      if (!curQ) {
        return `<div class="mini-game-box">題目載入完畢，結算中…</div>`;
      }

      const myAns = answers[me.id];
      return `
        <div class="mini-game-box">
          <div class="ss-top">
            <span class="badge-pill">第 ${qIdx + 1} / ${questions.length} 題</span>
            <span class="gold-text">
              ${
                isCoop2
                  ? `💞 默契同步：${scores.team_A || 0} 題（5~6題 +20 / 7~8題 +35 PT）`
                  : `🅰️ A組 ${scores.team_A || 0} 分 vs 🅱️ B組 ${scores.team_B || 0} 分`
              }
            </span>
          </div>
          <div class="q-title">${esc(curQ.q)}</div>
          <div class="opt-grid">
            ${curQ.options
              .map(
                (opt, idx) => `<button class="opt-btn ${myAns === idx ? "selected" : ""}" ${!amIn || myAns !== undefined ? "disabled" : ""} onclick="PartyGamesUI.answerSoulSync('${table.id}', ${idx})">
                  <b>${["A", "B", "C", "D"][idx]}.</b> ${esc(opt)}
                </button>`
              )
              .join("")}
          </div>
          <div class="muted-xs" style="margin-top:8px;">
            已作答：${table.participants
              .filter((p) => answers[p.id] !== undefined)
              .map((p) => esc(p.name))
              .join("、") || "等待作答中…"}
          </div>
        </div>
      `;
    },

    // ==================== 5. 🔢 數字順風耳 ito ====================
    renderIto(table, gs, me, amIn, isHost, playerMap) {
      const secretMap = gs.secretNumbers || {};
      const myNum = secretMap[me.id];
      const order = gs.proposedOrder || table.participants.map((p) => p.id);
      const theme = gs.theme || { title: "荒島求生物品實用度", low: "1: 廢物", high: "100: 神器" };
      const pCnt = table.participants.length;
      const baseNet = window.PartyEngine.getItoBaseNetProfit(pCnt);

      return `
        <div class="mini-game-box">
          <div class="q-title">🔢 本局主題：${esc(theme.title)}</div>
          <div class="muted-xs" style="margin-bottom:4px;color:#fcd34d;">
            🤝 ${pCnt} 人合作闖關：全員由小排到大成功每人淨賺 <b>+${baseNet} PT</b>（排錯則沒收押注）！
          </div>
          <div class="spectrum-bar">
            <span>${esc(theme.low)}</span>
            <span>◀─── 口頭舉例暗示，禁說數字！ ───▶</span>
            <span>${esc(theme.high)}</span>
          </div>

          ${
            amIn && myNum !== undefined
              ? `<div class="peek-card" onclick="this.classList.toggle('revealed')">
                  <span class="peek-hint">🙈 點擊翻開／蓋住你的秘密數字卡</span>
                  <span class="peek-secret">你的秘密數字：<b>${myNum}</b></span>
                </div>`
              : ""
          }

          <div class="sub-label" style="margin-top:10px;">👇 討論完後，由小排到大調整順序並開牌：</div>
          <div class="ito-order-list">
            ${order
              .map((pid, idx) => {
                const isBot = String(pid).startsWith("bot_");
                const pEntry = table.participants.find((x) => x.id === pid);
                const pl = playerMap[pid] || { name: pEntry?.name || pid };
                const botHintVal = isBot
                  ? Math.max(2, Math.min(99, (secretMap[pid] || 50) + (idx % 2 === 0 ? 3 : -3)))
                  : 0;
                return `<div class="ito-row">
                  <span>第 ${idx + 1} 小：<b>${esc(pl.name)}</b> ${
                    gs.revealed
                      ? `➜ 🎯 <b>${secretMap[pid]}</b>`
                      : isBot
                      ? `<small class="muted-xs">（🤖暗示：體感大約 ${botHintVal} 分左右）</small>`
                      : ""
                  }</span>
                  ${
                    isHost && !gs.revealed
                      ? `<span>
                          <button class="btn-icon" ${idx === 0 ? "disabled" : ""} onclick="PartyGamesUI.moveIto('${table.id}', ${idx}, -1)">⬆️</button>
                          <button class="btn-icon" ${idx === order.length - 1 ? "disabled" : ""} onclick="PartyGamesUI.moveIto('${table.id}', ${idx}, 1)">⬇️</button>
                        </span>`
                      : ""
                  }
                </div>`;
              })
              .join("")}
          </div>
          ${
            isHost && !gs.revealed
              ? `<button class="btn btn-gold" style="width:100%;margin-top:10px;" onclick="PartyGamesUI.revealIto('${table.id}')">🃏 鎖定順序・全員翻牌開獎！</button>`
              : ""
          }
        </div>
      `;
    },

    // ==================== 6. ⏱️ 5 秒不詞窮 ====================
    renderFiveSeconds(table, gs, me, amIn, playerMap) {
      const parts = table.participants;
      const totalTurns = parts.length * 3;
      const turn = gs.turn || 0;
      const scores = gs.scores || {};
      if (turn >= totalTurns) {
        return `<div class="mini-game-box">3 輪快嘴挑戰完成！請確認最終贏家。</div>`;
      }
      const curPlayer = parts[turn % parts.length];
      const curPrompt = (gs.prompts && gs.prompts[turn]) || "5 秒內講出 3 種水果！";
      const startedAt = gs.turnStartedAt || 0;
      const remain = startedAt
        ? Math.max(0, (5000 - (window.PartyDB.serverNowMs - startedAt)) / 1000)
        : 5.0;

      if (startedAt && remain > 0 && !this.fiveSecTimer) {
        this.fiveSecTimer = setTimeout(() => {
          this.fiveSecTimer = null;
          if (window.PartyDB.serverNowMs - startedAt >= 5000) {
            window.PartyFX.playTone("fire");
            window.PartyFX.haptic("heavy");
          }
          window.PartyApp.render();
        }, 150);
      }

      return `
        <div class="mini-game-box">
          <div class="ss-top">
            <span class="badge-pill">第 ${Math.floor(turn / parts.length) + 1}/3 輪</span>
            <span class="gold-text">${parts.map((p) => `${esc(p.name)}:${scores[p.id] || 0}`).join(" ｜ ")}</span>
          </div>
          <div style="text-align:center;margin:10px 0;">
            挑戰者：<b style="font-size:18px;color:#fbbf24;">${esc(curPlayer.name)}</b>
          </div>
          ${
            !startedAt
              ? amIn && curPlayer.id === me.id
                ? `<button class="btn btn-gold" style="width:100%;" onclick="PartyGamesUI.startFiveSecTurn('${table.id}')">🎙️ 翻開題目並啟動 5.0 秒倒數！</button>`
                : `<div class="muted-sm" style="text-align:center;">等待 ${esc(curPlayer.name)} 按下抽題倒數…</div>`
              : `<div class="q-title" style="text-align:center;font-size:19px;">${esc(curPrompt)}</div>
                 <div class="timer-giant ${remain <= 0 ? "time-up" : ""}">${remain <= 0 ? "⏰ 5 秒時間到！" : `${remain.toFixed(1)} 秒`}</div>
                 ${
                   amIn &&
                   (curPlayer.id !== me.id ||
                     parts.every((p) => p.id === me.id || String(p.id).startsWith("bot_")))
                     ? `<div class="grid-2-btns" style="margin-top:8px;">
                         <button class="btn btn-emerald" onclick="PartyGamesUI.judgeFiveSec('${table.id}', true)">✅ 成功講滿 3 個 (+1)</button>
                         <button class="btn btn-danger" onclick="PartyGamesUI.judgeFiveSec('${table.id}', false)">❌ 卡詞／超時 (+0)</button>
                       </div>`
                     : `<div class="muted-xs" style="text-align:center;">由對手判定是否成功講出 3 個答案！</div>`
                 }`
          }
        </div>
      `;
    },

    // ==================== 通用：參賽者申報與對手互認結算 ====================
    renderMutualSettlementBox(table, gameMeta, me, amIn, playerMap) {
      if (!amIn) return "";
      const proposed = table.proposed_winners;
      const confirmedBy = table.confirmed_by || [];

      if (proposed && proposed.length > 0) {
        const names = proposed
          .map((id) => (id === "__coop_fail__" ? "闖關失敗" : playerMap[id]?.name || id))
          .join("、");
        const alreadyConfirmed = confirmedBy.includes(me.id);
        return `
          <div class="settle-confirm-box">
            <div>⚖️ 待確認賽果：贏家為 <b class="gold-text">${esc(names)}</b></div>
            <div class="muted-xs" style="margin:4px 0 8px;">需另一位參賽選手按下確認，即自動發放獎金！</div>
            <div class="host-row">
              ${
                !alreadyConfirmed
                  ? `<button class="btn btn-emerald" onclick="PartyGamesUI.confirmWinner('${table.id}')">✅ 確認無誤・發放獎金</button>`
                  : `<span class="muted-sm">⏳ 已送出，等待對手按確認…</span>`
              }
              <button class="btn btn-ghost btn-sm" onclick="PartyGamesUI.resetProposal('${table.id}')">重選贏家</button>
            </div>
          </div>
        `;
      }

      // 僅針對 Switch 實體遊戲對決顯示手動點選贏家（其餘 6 款手機互動遊戲 100% 由系統自動判勝負派彩！）
      if (table.game_type !== "switch_free") return "";
      return `
        <details class="manual-settle-details" open>
          <summary>🏆 Switch 比賽結束：點選本局第 1 名贏家（對手確認即發獎金）</summary>
          <div class="bet-btn-grid" style="margin-top:8px;">
            ${table.participants
              .filter((p) => !p.forfeited)
              .map(
                (p) => `<button class="btn btn-secondary btn-sm" onclick="PartyGamesUI.proposeWinner('${table.id}', ['${p.id}'])">
                  🏆 ${esc(p.name)} 獲勝
                </button>`
              )
              .join("")}
          </div>
        </details>
      `;
    },

    // ==================== 開桌彈窗與互動 Actions ====================
    openCreateModal(forceTestOnly = false) {
      const ctx = window.PartyApp.getContext();
      const existingActive = this.getMyActiveTable(ctx.me?.id, ctx.tables);
      if (existingActive) {
        window.PartyApp.toast(
          `⚔️ 你已在【${existingActive.title}】房間內，一次限參加 1 場遊戲喔！`
        );
        this.openRoomWindow(existingActive.id);
        return;
      }
      const modal = document.getElementById("party-modal");
      if (!modal) return;
      this.forceModalTestOnly = Boolean(forceTestOnly);
      if (this.forceModalTestOnly) {
        const firstUntested = CFG.PARTY_GAMES.find(
          (gm) => window.PartyEngine.getTestHostUsage(ctx.me.id, gm.id, ctx.tables, ctx.me) < 1
        );
        if (firstUntested) this.activeModalGame = firstUntested.id;
        this.activeModalTestMode = true;
        this.activeCountdownMin = 1;
      } else {
        const testUsed = window.PartyEngine.getTestHostUsage(
          ctx.me.id,
          this.activeModalGame,
          ctx.tables,
          ctx.me
        );
        if (testUsed >= 1) this.activeModalTestMode = false;
      }
      modal.classList.remove("hidden");
      this.renderCreateModalInner();
    },

    selectModalGame(gameId) {
      this.activeModalGame = gameId;
      const ctx = window.PartyApp.getContext();
      const testUsed = window.PartyEngine.getTestHostUsage(ctx.me.id, gameId, ctx.tables, ctx.me);
      if (this.forceModalTestOnly) {
        this.activeModalTestMode = true;
      } else if (testUsed >= 1) {
        this.activeModalTestMode = false;
      }
      this.renderCreateModalInner();
    },

    closeModal() {
      const modal = document.getElementById("party-modal");
      if (modal) modal.classList.add("hidden");
    },

    renderCreateModalInner() {
      const box = document.getElementById("party-modal-body");
      if (!box) return;
      // 保存列表與彈窗捲軸位置及備註草稿，點選下方遊戲時絕不跳回最上面！
      const prevGameListEl = box.querySelector(".create-game-list");
      const prevListScroll = prevGameListEl ? prevGameListEl.scrollTop : 0;
      const prevBoxScroll = box.scrollTop;
      const prevNoteVal = document.getElementById("custom-table-note")?.value || "";

      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const dayKey = g.activeDayKey || "2026-12-31";

      const selectedMeta =
        CFG.PARTY_GAMES.find((x) => x.id === this.activeModalGame) || CFG.PARTY_GAMES[0];
      const selTestUsed = window.PartyEngine.getTestHostUsage(
        ctx.me.id,
        selectedMeta.id,
        ctx.tables,
        ctx.me
      );
      const isTestMode = this.forceModalTestOnly || (this.activeModalTestMode && selTestUsed < 1);
      const testQuotaExhausted = this.forceModalTestOnly && selTestUsed >= 1;

      box.innerHTML = `
        <div class="modal-head">
          <h3>${this.forceModalTestOnly ? "🧪 開啟新手免費測試局" : "➕ 建立 Party Game 賽桌"}</h3>
          <button class="btn-close" onclick="PartyGamesUI.closeModal()">✕</button>
        </div>
        <div class="sub-label">1. 選擇要玩的遊戲：</div>
        <div class="create-game-list">
          ${CFG.PARTY_GAMES.map((gm) => {
            const u = window.PartyEngine.getDailyGameUsage(
              ctx.me.id,
              gm.id,
              dayKey,
              ctx.tables,
              ctx.bets
            );
            const tUsed = window.PartyEngine.getTestHostUsage(ctx.me.id, gm.id, ctx.tables, ctx.me);
            const isScoring = u.playCount < g.maxScoringPlaysPerGamePerDay;
            return `
              <div class="create-game-item ${this.activeModalGame === gm.id ? "active" : ""}"
                   onclick="PartyGamesUI.selectModalGame('${gm.id}')">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                  <b>${gm.icon} ${esc(gm.name)}</b>
                  <div style="display:flex;gap:4px;">
                    ${
                      tUsed < 1
                        ? `<span class="q-tag q-ok">🧪 測試 0/1</span>`
                        : this.forceModalTestOnly
                        ? `<span class="q-tag q-muted">✅ 已完成試玩</span>`
                        : ""
                    }
                    ${
                      !this.forceModalTestOnly
                        ? `<span class="q-tag ${isScoring ? "q-bet" : "q-muted"}">
                             ${isScoring ? `計分 ${u.playCount}/${g.maxScoringPlaysPerGamePerDay}` : "🤝 陪玩 0分"}
                           </span>`
                        : ""
                    }
                  </div>
                </div>
                <div class="muted-xs" style="margin-top:3px;">${esc(gm.desc)}</div>
              </div>
            `;
          }).join("")}
        </div>

        <div style="margin-top:10px;">
          ${this.renderGameRuleBlock(selectedMeta, false)}
        </div>

        ${
          !this.forceModalTestOnly && selTestUsed < 1
            ? `<div class="sub-label" style="margin-top:10px;">2. 選擇模式（此款剩 1 次免費測試機會）：</div>
               <div class="grid-2-btns">
                 <button class="btn ${isTestMode ? "btn-primary" : "btn-secondary"} btn-sm"
                   onclick="PartyGamesUI.activeModalTestMode=true;PartyGamesUI.renderCreateModalInner();">
                   🧪 免費測試局 (0分)
                 </button>
                 <button class="btn ${!isTestMode ? "btn-gold" : "btn-secondary"} btn-sm"
                   onclick="PartyGamesUI.activeModalTestMode=false;PartyGamesUI.renderCreateModalInner();">
                   ⚔️ 正式賽桌 (${g.partyPlayStake} PT)
                 </button>
               </div>`
            : ""
        }

        <div class="sub-label" style="margin-top:12px;">${!this.forceModalTestOnly && selTestUsed < 1 ? "3." : "2."} 集結倒數時間（1～3 分鐘）：</div>
        <div class="countdown-selector">
          ${[1, 2, 3]
            .map(
              (m) => `<button class="btn ${this.activeCountdownMin === m ? "btn-gold" : "btn-secondary"}"
                onclick="PartyGamesUI.activeCountdownMin=${m};PartyGamesUI.renderCreateModalInner();">
                ⏱️ ${m} 分鐘
              </button>`
            )
            .join("")}
        </div>

        <div style="margin-top:12px;">
          <input type="text" id="custom-table-note" class="input-dark" placeholder="選填備註（例：瑪利歐賽車彩虹賽道）">
        </div>

        ${
          testQuotaExhausted
            ? `<div class="locked-bet-msg" style="margin-top:12px;text-align:center;">✅ 你已體驗過【${esc(selectedMeta.name)}】的 1 次免費測試局囉！請點上方選擇其他尚未試玩的遊戲。</div>`
            : `<button class="btn ${isTestMode ? "btn-primary" : "btn-gold"}" style="width:100%;margin-top:14px;" onclick="PartyGamesUI.confirmCreateTable()">
                 ${isTestMode ? "🧪 開啟免費測試局（可揪人或補 AI 陪練）" : "📢 開桌並推播通知全場！"}
               </button>`
        }
      `;

      // 立即還原捲軸高度與備註草稿！
      const nextGameListEl = box.querySelector(".create-game-list");
      if (nextGameListEl) nextGameListEl.scrollTop = prevListScroll;
      box.scrollTop = prevBoxScroll;
      const nextNoteEl = document.getElementById("custom-table-note");
      if (nextNoteEl && prevNoteVal) nextNoteEl.value = prevNoteVal;
    },

    async confirmCreateTable() {
      return window.PartyDB.withLock("create_table", async () => {
        const ctx = window.PartyApp.getContext();
        const existingActive = this.getMyActiveTable(ctx.me?.id, ctx.tables);
        if (existingActive) {
          this.closeModal();
          window.PartyApp.toast(
            `⚔️ 你已在【${existingActive.title}】房間內，一次限參加 1 場遊戲喔！`
          );
          this.openRoomWindow(existingActive.id);
          return;
        }
        const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
        const dayKey = g.activeDayKey || "2026-12-31";
        const gm = CFG.PARTY_GAMES.find((x) => x.id === this.activeModalGame) || CFG.PARTY_GAMES[0];
        const testUsed = window.PartyEngine.getTestHostUsage(ctx.me.id, gm.id, ctx.tables, ctx.me);
        const isTestRun = Boolean(this.forceModalTestOnly || (this.activeModalTestMode && testUsed < 1));
        if (this.forceModalTestOnly && testUsed >= 1) {
          window.PartyApp.toast(`【${gm.name}】的 1 次免費測試機會已使用過囉！`);
          return;
        }

        const noteEl = document.getElementById("custom-table-note");
        const note = noteEl ? noteEl.value.trim() : "";
        const usage = window.PartyEngine.getDailyGameUsage(
          ctx.me.id,
          gm.id,
          dayKey,
          ctx.tables,
          ctx.bets
        );
        const isScoring = isTestRun ? false : usage.playCount < g.maxScoringPlaysPerGamePerDay;
        const playStake = Number(g.partyPlayStake) || 20;
        const myScore = ctx.scoreboard.byId[ctx.me.id]?.baseScore || 0;
        if (isScoring && myScore < playStake) {
          window.PartyApp.toast(
            `💰 目前積分不足 ${playStake} PT！可先參加主題遊戲／解隱藏任務賺分，或等明早 08:00 自動補滿回 ${g.dailyFloorPoints || 300} PT！`
          );
          return;
        }
        const countdownSec = this.activeCountdownMin * 60;
        const opensUntil = new Date(window.PartyDB.serverNowMs + countdownSec * 1000).toISOString();
        const tableId = `tbl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const baseTitle = note ? `${gm.name}（${note}）` : gm.name;
        const title = isTestRun ? `[測試] ${baseTitle}` : baseTitle;
        await window.PartyDB.upsert("tables", [
          {
            id: tableId,
            game_type: gm.id,
            title,
            host_id: ctx.me.id,
            host_name: ctx.me.name,
            day_key: dayKey,
            status: "open",
            is_test_run: isTestRun,
            is_happy_hour: !isTestRun && ctx.sceneInfo.scene === "happy_hour",
            stake: isTestRun ? 0 : g.partyPlayStake || 20,
            bet_stake: g.partyBetStake || 10,
            countdown_sec: countdownSec,
            opens_until: opensUntil,
            participants: [
              {
                id: ctx.me.id,
                name: ctx.me.name,
                isScoring,
                team: gm.id === "soul_sync_2v2" ? "team_A" : "",
                teamLabel: gm.id === "soul_sync_2v2" ? "A組" : "",
              },
            ],
            game_state: {},
            confirmed_by: [],
          },
        ]);

        this.closeModal();
        this.activeRoomTableId = tableId;
        this.minimizedRoomIds.delete(tableId);
        window.PartyFX.playTone("bell");
        await window.PartyApp.refreshAll();
      });
    },

    async nudgeTablePlayers(tableId) {
      return window.PartyDB.withLock(`nudge_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        const now = window.PartyDB.serverNowMs;
        let coolLeft = 0;
        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "open") return undefined;
          const prevNudge = Number(cur.game_state?.lastNudgeAt) || 0;
          if (now - prevNudge < 18000) {
            coolLeft = Math.ceil((prevNudge + 20000 - now) / 1000);
            return undefined;
          }
          cur.game_state = {
            ...(cur.game_state || {}),
            lastNudgeAt: now,
            lastNudgeBy: ctx.me.name,
            lastNudgeHostId: ctx.me.id,
          };
          return cur;
        });
        if (!tx.committed) {
          if (coolLeft > 0) {
            window.PartyApp.toast(`⏳ 廣播冷卻中，請過 ${coolLeft} 秒再催喔！`);
          }
          return;
        }
        window.PartyFX.playTone("bell");
        window.PartyFX.haptic("medium");
        window.PartyApp.toast(`📢 已以房主【${ctx.me.name}】名義向全場發送催人推播！`);
        await window.PartyApp.refreshAll();
      });
    },

    async startTestWithBots(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || !table.is_test_run || table.status !== "open") return;
      const gm = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      const parts = [...(table.participants || [])];
      const needed =
        table.game_type === "soul_sync_2v2" && parts.length === 3
          ? 4
          : Math.max(gm.minPlayers, parts.length);
      const botNames = ["🤖 AI陪練員A", "🤖 AI陪練員B", "🤖 AI陪練員C"];
      let bIdx = 0;
      while (parts.length < needed && bIdx < botNames.length) {
        const bid = `bot_${bIdx + 1}`;
        if (!parts.some((p) => p.id === bid)) {
          const team =
            table.game_type === "soul_sync_2v2"
              ? parts.length < 2
                ? "team_A"
                : "team_B"
              : "";
          parts.push({
            id: bid,
            name: botNames[bIdx],
            isBot: true,
            isScoring: false,
            team,
            teamLabel: team === "team_A" ? "A組" : team === "team_B" ? "B組" : "",
          });
        }
        bIdx++;
      }
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        participants: parts,
      });
      await window.PartyApp.refreshAll();
      await this.startTable(tableId);
    },

    async joinTable(tableId) {
      return window.PartyDB.withLock(`join_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        const existingActive = this.getMyActiveTable(ctx.me.id, ctx.tables);
        if (existingActive && existingActive.id !== tableId) {
          window.PartyApp.toast(
            `⚔️ 你已經在【${existingActive.title}】參賽中，一次只能參加一個遊戲喔！`
          );
          return;
        }

        const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
        let abortReason = "";
        let maxP = 8;

        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "open") {
            abortReason = "closed";
            return undefined;
          }
          const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === cur.game_type) || CFG.PARTY_GAMES[0];
          maxP = gameMeta.maxPlayers;
          const parts = [...(cur.participants || [])];
          if (parts.some((p) => p.id === ctx.me.id)) {
            abortReason = "already";
            return undefined;
          }
          if (parts.length >= gameMeta.maxPlayers) {
            abortReason = "full";
            return undefined;
          }
          if (cur.is_test_run) {
            const myTestUsed = window.PartyEngine.getTestHostUsage(
              ctx.me.id,
              cur.game_type,
              ctx.tables,
              ctx.me
            );
            if (myTestUsed >= 1) {
              abortReason = `test_used:${gameMeta.name}`;
              return undefined;
            }
          }
          const usage = window.PartyEngine.getDailyGameUsage(
            ctx.me.id,
            cur.game_type,
            cur.day_key,
            ctx.tables,
            ctx.bets
          );
          const isScoring = cur.is_test_run
            ? false
            : usage.playCount < g.maxScoringPlaysPerGamePerDay;
          const reqStake = Number(cur.stake) || 20;
          const myScore = ctx.scoreboard.byId[ctx.me.id]?.baseScore || 0;
          if (isScoring && myScore < reqStake) {
            abortReason = `low_pt:${reqStake}`;
            return undefined;
          }

          let team = "";
          let teamLabel = "";
          if (cur.game_type === "soul_sync_2v2") {
            const cntA = parts.filter((p) => p.team === "team_A").length;
            team = cntA < 2 ? "team_A" : "team_B";
            teamLabel = team === "team_A" ? "A組" : "B組";
          }
          parts.push({ id: ctx.me.id, name: ctx.me.name, isScoring, team, teamLabel });
          cur.participants = parts;
          return cur;
        });

        if (!tx.committed) {
          if (abortReason === "full") {
            window.PartyApp.toast(`此賽桌已滿員（最多 ${maxP} 人）囉！`);
          } else if (abortReason === "closed") {
            window.PartyApp.toast("此賽桌已經開戰或關閉囉！");
          } else if (abortReason.startsWith("test_used:")) {
            const gmName = abortReason.split(":")[1] || "本遊戲";
            window.PartyApp.toast(`🧪 你已使用過【${gmName}】的 1 次免費測試機會，請參加正式賽桌！`);
          } else if (abortReason.startsWith("low_pt:")) {
            const req = abortReason.split(":")[1];
            window.PartyApp.toast(
              `💰 目前積分不足 ${req} PT！可等明早 08:00 自動補滿回 ${g.dailyFloorPoints || 300} PT！`
            );
          } else if (abortReason === "already") {
            this.activeRoomTableId = tableId;
            this.minimizedRoomIds.delete(tableId);
          }
          await window.PartyApp.refreshAll();
          return;
        }

        this.activeRoomTableId = tableId;
        this.minimizedRoomIds.delete(tableId);
        window.PartyFX.haptic("medium");
        await window.PartyApp.refreshAll();
      });
    },

    async swapMyTeam(tableId) {
      return window.PartyDB.withLock(`swap_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "open") return undefined;
          cur.participants = (cur.participants || []).map((p) => {
            if (p.id !== ctx.me.id) return p;
            if (cur.game_type === "soul_sync_2v2") {
              const next = p.team === "team_A" ? "team_B" : "team_A";
              return { ...p, team: next, teamLabel: next === "team_A" ? "A組" : "B組" };
            }
            return p;
          });
          return cur;
        });
        if (tx.committed) {
          window.PartyFX.haptic("medium");
          await window.PartyApp.refreshAll();
        }
      });
    },

    async leaveTable(tableId) {
      return window.PartyDB.withLock(`leave_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        if (this.activeRoomTableId === tableId) this.activeRoomTableId = null;
        await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "open") return undefined;
          cur.participants = (cur.participants || []).filter((p) => p.id !== ctx.me.id);
          return cur;
        });
        await window.PartyApp.refreshAll();
      });
    },

    async cancelTable(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "open") return;
      // 清除已下注觀眾的下注與預扣帳目（不佔用每日 3 次下注額度！）
      const tableBets = (ctx.bets || []).filter((b) => b.table_id === tableId);
      for (const b of tableBets) {
        await window.PartyDB.remove("ledger", `id=eq.${encodeURIComponent(`stake_${b.id}`)}`);
        await window.PartyDB.remove("bets", `id=eq.${encodeURIComponent(b.id)}`);
      }
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        status: "cancelled",
      });
      await window.PartyApp.refreshAll();
    },

    async cancelMyBet(tableId) {
      return window.PartyDB.withLock(`cancel_bet_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        const freshRows = await window.PartyDB.select(
          "tables",
          `id=eq.${encodeURIComponent(tableId)}`,
          { forceNetwork: true }
        );
        const liveTable = (freshRows && freshRows[0]) || (ctx.tables || []).find((t) => t.id === tableId);
        if (!liveTable || liveTable.status !== "open") {
          window.PartyApp.toast("⚠️ 賽局已經開戰，無法反悔退注囉！");
          await window.PartyApp.refreshAll();
          return;
        }
        const betId = `bet_${tableId}_${ctx.me.id}`;
        await window.PartyDB.remove("bets", `id=eq.${encodeURIComponent(betId)}`);
        await window.PartyDB.remove("ledger", `id=eq.${encodeURIComponent(`stake_${betId}`)}`);
        window.PartyFX.haptic("medium");
        window.PartyApp.toast(`↩️ 已撤回下注並退回 ${Number(liveTable.bet_stake) || 10} PT（不扣今日下注額度）！`);
        await window.PartyApp.refreshAll();
      });
    },

    async placeBet(tableId, pickKey, pickLabel) {
      return window.PartyDB.withLock(`bet_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const table = (ctx.tables || []).find((t) => t.id === tableId);
        if (!table || table.status !== "open" || table.is_test_run) return;
        const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
        const usage = window.PartyEngine.getDailyGameUsage(
          ctx.me.id,
          table.game_type,
          table.day_key,
          ctx.tables,
          ctx.bets
        );
        if (usage.betCount >= g.maxBetsPerGamePerDay) {
          window.PartyApp.toast(`此遊戲今日場邊下注已達上限 ${g.maxBetsPerGamePerDay} 次！`);
          return;
        }
        const myScore = ctx.scoreboard.byId[ctx.me.id]?.baseScore || 0;
        const amt = Number(table.bet_stake) || 10;
        if (myScore < amt) {
          window.PartyApp.toast(`目前積分不足 ${amt} PT！`);
          return;
        }

        const betId = `bet_${tableId}_${ctx.me.id}`;
        const inserted = await window.PartyDB.upsert(
          "bets",
          [
            {
              id: betId,
              table_id: tableId,
              game_type: table.game_type,
              day_key: table.day_key,
              bettor_id: ctx.me.id,
              pick_key: pickKey,
              pick_label: pickLabel,
              amount: amt,
              status: "locked",
              payout: 0,
            },
          ],
          { ignoreDuplicates: true }
        );
        if (inserted && inserted.length > 0) {
          await window.PartyDB.upsert(
            "ledger",
            [
              {
                id: `stake_${betId}`,
                player_id: ctx.me.id,
                delta: -amt,
                category: "bet_stake",
                reason: `🎲 場邊押注【${table.title}】(${pickLabel})`,
                day_key: table.day_key,
                meta: { tableId, pickKey },
              },
            ],
            { ignoreDuplicates: true }
          );
        }
        window.PartyFX.haptic("medium");
        await window.PartyApp.refreshAll();
      });
    },

    async startTable(tableId) {
      return window.PartyDB.withLock(`start_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const banks = ctx.questionBanks || window.DEFAULT_QUESTION_BANKS;
        let errMsg = "";

        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "open") return undefined;
          const parts = [...(cur.participants || [])];
          const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === cur.game_type) || CFG.PARTY_GAMES[0];
          if (parts.length < gameMeta.minPlayers) {
            errMsg = `至少需要 ${gameMeta.minPlayers} 位選手才能開賽喔！`;
            return undefined;
          }
          if (cur.game_type === "soul_sync_2v2" && parts.length !== 2 && parts.length !== 4) {
            errMsg = "🤝 靈魂默契需為「2 人合作」或「4 人雙組 2v2 對抗」才能開賽喔！";
            return undefined;
          }
          if (cur.game_type === "soul_sync_2v2" && parts.length === 2) {
            parts.forEach((p) => {
              p.team = "team_A";
              p.teamLabel = "合作組";
            });
          }
          if (cur.game_type === "soul_sync_2v2" && parts.length === 4) {
            const cntA = parts.filter((p) => p.team === "team_A").length;
            const cntB = parts.filter((p) => p.team === "team_B").length;
            if (cntA !== 2 || cntB !== 2) {
              errMsg = "🤝 4人對抗需 A組 與 B組 各 2 人喔！（點擊自己名字旁的組別即可切換）";
              return undefined;
            }
          }

          const initGs = {};
          if (cur.game_type === "quick_draw") {
            initGs.mode = "draw";
            initGs.roundSeq = 1;
            initGs.ready = {};
            parts.forEach((p) => {
              if (String(p.id).startsWith("bot_")) initGs.ready[p.id] = true;
            });
            initGs.times = {};
          } else if (cur.game_type === "number_bomb") {
            initGs.low = 0;
            initGs.high = 100;
            const salt = window.PartyEngine.cryptoRandomInt(10000, 99999);
            const secret = window.PartyEngine.cryptoRandomInt(1, 99);
            initGs.salt = salt;
            initGs.secretMask = secret ^ salt;
            const humans = window.PartyEngine.shuffle(
              parts.filter((p) => !String(p.id).startsWith("bot_")).map((p) => p.id)
            );
            const bots = parts.filter((p) => String(p.id).startsWith("bot_")).map((p) => p.id);
            initGs.aliveIds = [...humans, ...bots];
            initGs.turnIdx = 0;
          } else if (cur.game_type === "rps_king") {
            initGs.wins = {};
            initGs.moves = {};
            initGs.roundSeq = 1;
          } else if (cur.game_type === "soul_sync_2v2") {
            initGs.questions = window.PartyEngine.shuffle(banks.soulSync2v2).slice(0, 8);
            initGs.qIdx = 0;
            initGs.answers = {};
            initGs.scores = { team_A: 0, team_B: 0 };
          } else if (cur.game_type === "ito_numbers") {
            const pool = Array.from({ length: 100 }, (_, i) => i + 1);
            const picked = window.PartyEngine.shuffle(pool).slice(0, parts.length);
            initGs.secretNumbers = {};
            parts.forEach((p, idx) => {
              initGs.secretNumbers[p.id] = picked[idx];
            });
            initGs.theme = window.PartyEngine.shuffle(banks.itoThemes)[0];
            initGs.proposedOrder = parts.map((p) => p.id);
            initGs.revealed = false;
          } else if (cur.game_type === "five_seconds") {
            initGs.turn = 0;
            initGs.scores = {};
            initGs.prompts = window.PartyEngine
              .shuffle(banks.fiveSeconds)
              .slice(0, parts.length * 3 + 4)
              .map((x) => x.prompt);
          }

          cur.status = "playing";
          cur.participants = parts;
          cur.game_state = initGs;
          return cur;
        });

        if (!tx.committed) {
          if (errMsg) window.PartyApp.toast(errMsg);
          return;
        }

        const startedTbl = tx.snapshot;
        // 🧪 測試局：開戰即永久扣除所有真人參與者（房主＋加入者）本款遊戲的 1 次免費試玩機會（跨日不重置）
        if (startedTbl.is_test_run) {
          const humanIds = (startedTbl.participants || [])
            .filter((p) => !String(p.id).startsWith("bot_"))
            .map((p) => p.id);
          await Promise.all(
            humanIds.map((pid) =>
              window.PartyDB.transactRow("players", pid, (cur) => {
                if (!cur) return undefined;
                const list = Array.isArray(cur.tested_games) ? [...cur.tested_games] : [];
                if (list.includes(startedTbl.game_type)) return undefined;
                list.push(startedTbl.game_type);
                cur.tested_games = list;
                return cur;
              }).catch(() => null)
            )
          );
        }
        // 扣除計分參賽者的入場費（單次批次寫入，冪等鍵防重複扣款；陪玩者不扣分！）
        const stakeRows = (startedTbl.participants || [])
          .filter((p) => p.isScoring)
          .map((p) => ({
            id: `play_stake_${startedTbl.id}_${p.id}`,
            player_id: p.id,
            delta: -(Number(startedTbl.stake) || 20),
            category: "party_stake",
            reason: `⚔️ 參賽入場費【${startedTbl.title}】`,
            day_key: startedTbl.day_key,
            meta: { tableId: startedTbl.id, gameType: startedTbl.game_type },
          }));
        if (stakeRows.length > 0) {
          await window.PartyDB.upsert("ledger", stakeRows, { ignoreDuplicates: true });
        }

        window.PartyFX.playTone("bell");
        await window.PartyApp.refreshAll();
      });
    },

    // --- 2～16 人 手機毫秒決鬥 (西部拔槍 & 盲按 10.000s，獨立資料列防併發覆蓋！) ---
    async switchQdMode(tableId, mode) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.host_id !== ctx.me.id) return;
      delete this.blindStopwatchStart[tableId];
      this.clearLocalDraw(tableId);
      const nextRoundSeq = ((table.game_state && table.game_state.roundSeq) || 1) + 1;
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        game_state: { mode, roundSeq: nextRoundSeq, ready: {}, times: {}, fireAt: 0 },
      });
      await window.PartyApp.refreshAll();
    },

    clearLocalDraw(tableId) {
      const st = this.localDrawState[tableId];
      if (st && st.timer) clearTimeout(st.timer);
      delete this.localDrawState[tableId];
    },

    // 🔫 公平版西部拔槍：每支手機「本地獨立」隨機倒數，於本機螢幕真正變紅那一幀開始計時，只上傳純反應毫秒數！
    qdStartLocalDraw(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "playing") return;
      const roundSeq = (table.game_state && table.game_state.roundSeq) || 1;
      this.clearLocalDraw(tableId);
      window.PartyFX.unlockAudio();
      const delay = 2400 + Math.floor(Math.random() * 2600);
      const st = { roundSeq, phase: "armed", firedAt: 0, timer: null };
      st.timer = setTimeout(() => {
        const cur = this.localDrawState[tableId];
        if (!cur || cur.phase !== "armed") return;
        cur.phase = "fired";
        window.PartyApp.render();
        requestAnimationFrame(() => {
          const c2 = this.localDrawState[tableId];
          if (c2 && c2.phase === "fired" && !c2.firedAt) c2.firedAt = performance.now();
        });
        window.PartyFX.playTone("fire");
        window.PartyFX.haptic("heavy");
      }, delay);
      this.localDrawState[tableId] = st;
      window.PartyApp.render();
    },

    async qdTap(tableId) {
      const st = this.localDrawState[tableId];
      if (!st) return;
      const tapNow = performance.now();
      let myMs;
      if (st.phase === "armed") {
        myMs = -1;
      } else if (st.phase === "fired") {
        myMs = Math.max(1, Math.round(tapNow - (st.firedAt || tapNow)));
      } else {
        return;
      }
      this.clearLocalDraw(tableId);
      window.PartyFX.haptic("heavy");

      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "playing") return;
      const gs = { ...(table.game_state || {}) };
      const { mode, roundSeq, times: curTimes } = this.getMergedQdState(
        table,
        gs,
        ctx.themeResponses
      );
      if (curTimes[ctx.me.id] !== undefined) return;
      const tKey = `qd_time_${mode}_${roundSeq}`;

      const rowsToUpsert = [
        {
          id: `${tableId}_${tKey}_${ctx.me.id}`,
          session_id: tableId,
          step_key: tKey,
          player_id: ctx.me.id,
          payload: { ms: myMs },
        },
      ];
      (table.participants || []).forEach((p) => {
        if (String(p.id).startsWith("bot_") && curTimes[p.id] === undefined) {
          rowsToUpsert.push({
            id: `${tableId}_${tKey}_${p.id}`,
            session_id: tableId,
            step_key: tKey,
            player_id: p.id,
            payload: { ms: 280 + Math.floor(Math.random() * 260) },
          });
        }
      });
      await window.PartyDB.upsert("theme_responses", rowsToUpsert, { ignoreDuplicates: true });

      const freshResps = await window.PartyDB.select(
        "theme_responses",
        `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(tKey)}`,
        { forceNetwork: true }
      );
      const mergedTimes = { ...(gs.times || {}) };
      (freshResps || []).forEach((r) => {
        if (r.payload && r.payload.ms !== undefined) mergedTimes[r.player_id] = Number(r.payload.ms);
      });

      const activeParts = (table.participants || []).filter((p) => !p.forfeited);
      const allTapped = activeParts.every((p) => mergedTimes[p.id] !== undefined);
      if (allTapped) {
        await this.resolveAndFinishQd(table, "draw", mergedTimes, ctx);
      } else {
        await window.PartyApp.refreshAll();
      }
    },

    async resolveAndFinishQd(table, mode, mergedTimes, ctx) {
      const parts = (table.participants || []).filter((p) => !p.forfeited);
      let winnerIds = [];
      if (mode === "draw") {
        const valid = parts.filter((p) => mergedTimes[p.id] !== undefined && mergedTimes[p.id] >= 0);
        if (valid.length === 0) {
          const notFalse = parts.filter((p) => mergedTimes[p.id] === undefined);
          winnerIds = notFalse.length === 1 ? [notFalse[0].id] : ["__pvp_tie__"];
        } else {
          valid.sort((a, b) => mergedTimes[a.id] - mergedTimes[b.id]);
          winnerIds = [valid[0].id];
        }
      } else {
        const valid = parts.filter((p) => mergedTimes[p.id] !== undefined && mergedTimes[p.id] >= 0);
        if (valid.length === 0) return;
        valid.sort(
          (a, b) => Math.abs(mergedTimes[a.id] - 10000) - Math.abs(mergedTimes[b.id] - 10000)
        );
        winnerIds = [valid[0].id];
      }
      const nextGs = { ...(table.game_state || {}), times: mergedTimes };
      const updatedTable = { ...table, game_state: nextGs };
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(table.id)}`, {
        game_state: nextGs,
      });
      await this.autoFinishTable(updatedTable, winnerIds, ctx);
    },

    startBlind10(tableId) {
      this.blindStopwatchStart[tableId] = performance.now();
      window.PartyApp.render();
      const tick = () => {
        const start = this.blindStopwatchStart[tableId];
        if (!start) return;
        const elapsed = performance.now() - start;
        const el = document.getElementById(`blind10-display-${tableId}`);
        if (el) {
          el.textContent =
            elapsed < 3000 ? `${(elapsed / 1000).toFixed(2)} s` : "🙈 ??.?? s（憑感覺拍停！）";
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },

    async stopBlind10(tableId) {
      const start = this.blindStopwatchStart[tableId];
      if (!start) return;
      const elapsedMs = Math.round(performance.now() - start);
      delete this.blindStopwatchStart[tableId];
      window.PartyFX.haptic("heavy");

      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "playing") return;
      const gs = { ...(table.game_state || {}) };
      const { mode, roundSeq, times: curTimes } = this.getMergedQdState(
        table,
        gs,
        ctx.themeResponses
      );
      const tKey = `qd_time_${mode}_${roundSeq}`;

      const rowsToUpsert = [
        {
          id: `${tableId}_${tKey}_${ctx.me.id}`,
          session_id: tableId,
          step_key: tKey,
          player_id: ctx.me.id,
          payload: { ms: elapsedMs },
        },
      ];
      (table.participants || []).forEach((p) => {
        if (String(p.id).startsWith("bot_") && curTimes[p.id] === undefined) {
          rowsToUpsert.push({
            id: `${tableId}_${tKey}_${p.id}`,
            session_id: tableId,
            step_key: tKey,
            player_id: p.id,
            payload: { ms: 9450 + Math.floor(Math.random() * 1100) },
          });
        }
      });
      await window.PartyDB.upsert("theme_responses", rowsToUpsert, { ignoreDuplicates: true });

      const freshResps = await window.PartyDB.select(
        "theme_responses",
        `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(tKey)}`
      );
      const mergedTimes = { ...(gs.times || {}) };
      (freshResps || []).forEach((r) => {
        if (r.payload && r.payload.ms !== undefined) mergedTimes[r.player_id] = Number(r.payload.ms);
      });

      const allDone = (table.participants || [])
        .filter((p) => !p.forfeited)
        .every((p) => mergedTimes[p.id] !== undefined);
      if (allDone) {
        await this.resolveAndFinishQd(table, "blind10", mergedTimes, ctx);
      } else {
        await window.PartyApp.refreshAll();
      }
    },

    async qdForceSettle(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "playing") return;
      const { mode, times } = this.getMergedQdState(
        table,
        table.game_state || {},
        ctx.themeResponses
      );
      await this.resolveAndFinishQd(table, mode, times, ctx);
    },

    // --- 終極密碼（CSPRNG 加密級均勻隨機 + 防偷看遮罩） ---
    async submitBombGuess(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table) return;
      const gs = { ...(table.game_state || {}) };
      const inp = document.getElementById(`bomb-val-${tableId}`);
      const val = Number(inp ? inp.value : 0);
      if (!Number.isInteger(val) || val <= gs.low || val >= gs.high) {
        window.PartyApp.toast(`請輸入 ${gs.low + 1} ～ ${gs.high - 1} 之間的整數！`);
        return;
      }
      if (inp) {
        inp.value = "";
        delete inp.dataset.dirty;
      }
      const secret =
        gs.secretMask !== undefined && gs.salt !== undefined
          ? gs.secretMask ^ gs.salt
          : gs.secret;

      if (val === secret) {
        window.PartyFX.playTone("thunder");
        window.PartyFX.haptic("heavy");
        gs.lastBoom = { id: ctx.me.id, seq: Date.now(), val };
        const remaining = (gs.aliveIds || []).filter((id) => id !== ctx.me.id);
        if (remaining.length <= 1) {
          gs.aliveIds = remaining;
          gs.lastLog = `💥 ${ctx.me.name} 踩中炸彈 ${val} 淘汰！`;
          const updatedTbl = { ...table, game_state: gs };
          await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
            game_state: gs,
          });
          await this.autoFinishTable(updatedTbl, remaining, ctx);
          return;
        }
        gs.aliveIds = remaining;
        gs.lastLog = `💥 ${ctx.me.name} 踩中炸彈 ${val} 淘汰！重新抽取 0～100 新密碼開啟下一輪死鬥！`;
        gs.low = 0;
        gs.high = 100;
        const nextSalt = window.PartyEngine.cryptoRandomInt(10000, 99999);
        const nextSecret = window.PartyEngine.cryptoRandomInt(1, 99);
        gs.salt = nextSalt;
        gs.secretMask = nextSecret ^ nextSalt;
        delete gs.secret;
        gs.turnIdx = gs.turnIdx % remaining.length;
      } else {
        if (val < secret) gs.low = val;
        else gs.high = val;
        gs.lastLog = `${ctx.me.name} 喊了 ${val}，安全範圍縮小為 ${gs.low} ～ ${gs.high}`;
        gs.turnIdx = ((gs.turnIdx || 0) + 1) % gs.aliveIds.length;

        let curSecret = secret;
        while (
          gs.aliveIds.length > 1 &&
          String(gs.aliveIds[gs.turnIdx]).startsWith("bot_")
        ) {
          const botId = gs.aliveIds[gs.turnIdx];
          const botName =
            table.participants.find((p) => p.id === botId)?.name || "🤖 AI陪練員";
          const botVal = window.PartyEngine.cryptoRandomInt(gs.low + 1, gs.high - 1);
          if (botVal === curSecret) {
            const rem = gs.aliveIds.filter((id) => id !== botId);
            if (rem.length <= 1) {
              gs.aliveIds = rem;
              gs.lastLog = `💥 ${botName} 踩中炸彈 ${botVal} 淘汰！`;
              await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
                game_state: gs,
              });
              await this.autoFinishTable(table, rem, ctx);
              return;
            }
            gs.aliveIds = rem;
            gs.low = 0;
            gs.high = 100;
            const ns = window.PartyEngine.cryptoRandomInt(10000, 99999);
            curSecret = window.PartyEngine.cryptoRandomInt(1, 99);
            gs.salt = ns;
            gs.secretMask = curSecret ^ ns;
            gs.turnIdx = gs.turnIdx % rem.length;
            gs.lastLog = `💥 ${botName} 踩中炸彈 ${botVal} 淘汰！重抽新密碼繼續！`;
          } else {
            if (botVal < curSecret) gs.low = botVal;
            else gs.high = botVal;
            gs.lastLog = `${botName} 喊了 ${botVal}，安全範圍縮小為 ${gs.low} ～ ${gs.high}`;
            gs.turnIdx = (gs.turnIdx + 1) % gs.aliveIds.length;
          }
        }
      }
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        game_state: gs,
      });
      await window.PartyApp.refreshAll();
    },

    // --- 猜拳連勝王 (原子逐人寫入 theme_responses，雙人同毫秒按拳絕不互蓋！) ---
    async playRps(tableId, move) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "playing") return;
      const gs = { ...(table.game_state || {}) };
      const roundSeq = gs.roundSeq || 1;
      const rKey = `rps_r${roundSeq}`;
      gs.wins = { ...(gs.wins || {}) };

      const p1 = table.participants[0];
      const p2 = table.participants[1];
      const rows = [
        {
          id: `${tableId}_${rKey}_${ctx.me.id}`,
          session_id: tableId,
          step_key: rKey,
          player_id: ctx.me.id,
          payload: { move },
        },
      ];
      [p1, p2].filter(Boolean).forEach((p) => {
        if (String(p.id).startsWith("bot_")) {
          const opts = ["rock", "scissors", "paper"];
          rows.push({
            id: `${tableId}_${rKey}_${p.id}`,
            session_id: tableId,
            step_key: rKey,
            player_id: p.id,
            payload: { move: opts[Math.floor(Math.random() * opts.length)] },
          });
        }
      });
      await window.PartyDB.upsert("theme_responses", rows);

      const freshResps = await window.PartyDB.select(
        "theme_responses",
        `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(rKey)}`
      );
      const moves = { ...(gs.moves || {}) };
      (freshResps || []).forEach((r) => {
        if (r.payload?.move) moves[r.player_id] = r.payload.move;
      });

      if (p1 && p2 && moves[p1.id] && moves[p2.id]) {
        const m1 = moves[p1.id];
        const m2 = moves[p2.id];
        const icon = { rock: "✊", scissors: "✌️", paper: "🖐️" };
        if (m1 === m2) {
          gs.lastRoundMsg = `${p1.name} ${icon[m1]} vs ${icon[m2]} ${p2.name} ➜ 平手再來！`;
          gs.lastRound = { seq: roundSeq, winnerId: "", msg: gs.lastRoundMsg };
        } else if (
          (m1 === "rock" && m2 === "scissors") ||
          (m1 === "scissors" && m2 === "paper") ||
          (m1 === "paper" && m2 === "rock")
        ) {
          gs.wins[p1.id] = (gs.wins[p1.id] || 0) + 1;
          gs.lastRoundMsg = `${p1.name} ${icon[m1]} 贏了 ${p2.name} ${icon[m2]}！`;
          gs.lastRound = { seq: roundSeq, winnerId: p1.id, msg: gs.lastRoundMsg };
        } else {
          gs.wins[p2.id] = (gs.wins[p2.id] || 0) + 1;
          gs.lastRoundMsg = `${p2.name} ${icon[m2]} 贏了 ${p1.name} ${icon[m1]}！`;
          gs.lastRound = { seq: roundSeq, winnerId: p2.id, msg: gs.lastRoundMsg };
        }
        gs.moves = {};
        gs.roundSeq = roundSeq + 1;
        if ((gs.wins[p1.id] || 0) >= 3) {
          await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, { game_state: gs });
          return await this.autoFinishTable({ ...table, game_state: gs }, [p1.id], ctx);
        }
        if ((gs.wins[p2.id] || 0) >= 3) {
          await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, { game_state: gs });
          return await this.autoFinishTable({ ...table, game_state: gs }, [p2.id], ctx);
        }
        await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
          game_state: gs,
        });
      }
      window.PartyFX.haptic("medium");
      await window.PartyApp.refreshAll();
    },

    // --- 2v2 靈魂默契 (原子逐人寫入 theme_responses，4人同毫秒點選絕不互蓋！) ---
    async answerSoulSync(tableId, choiceIdx) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "playing") return;
      const gs = { ...(table.game_state || {}) };
      const qIdx = gs.qIdx || 0;
      const sKey = `ss_q${qIdx}`;

      const rows = [
        {
          id: `${tableId}_${sKey}_${ctx.me.id}`,
          session_id: tableId,
          step_key: sKey,
          player_id: ctx.me.id,
          payload: { choice: choiceIdx },
        },
      ];
      (table.participants || []).forEach((p) => {
        if (String(p.id).startsWith("bot_")) {
          rows.push({
            id: `${tableId}_${sKey}_${p.id}`,
            session_id: tableId,
            step_key: sKey,
            player_id: p.id,
            payload: {
              choice: Math.random() < 0.68 ? choiceIdx : Math.floor(Math.random() * 4),
            },
          });
        }
      });
      await window.PartyDB.upsert("theme_responses", rows, { ignoreDuplicates: true });

      const freshResps = await window.PartyDB.select(
        "theme_responses",
        `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(sKey)}`
      );
      const curAnswers = { ...((gs.answers && gs.answers[qIdx]) || {}) };
      (freshResps || []).forEach((r) => {
        if (r.payload?.choice !== undefined) curAnswers[r.player_id] = Number(r.payload.choice);
      });

      const allAnswered = table.participants.every(
        (p) => curAnswers[p.id] !== undefined
      );
      if (allAnswered) {
        gs.answers = { ...(gs.answers || {}), [qIdx]: curAnswers };
        gs.scores = { ...(gs.scores || { team_A: 0, team_B: 0 }) };
        const teamA = table.participants.filter((p) => p.team === "team_A");
        const teamB = table.participants.filter((p) => p.team === "team_B");
        const hitA = teamA.length === 2 && curAnswers[teamA[0].id] === curAnswers[teamA[1].id];
        const hitB = teamB.length === 2 && curAnswers[teamB[0].id] === curAnswers[teamB[1].id];
        if (hitA) gs.scores.team_A += 1;
        if (hitB) gs.scores.team_B += 1;
        gs.lastQResult = { qIdx, hitA, hitB };

        if (qIdx + 1 >= (gs.questions || []).length) {
          // 自動檢查【靈魂雙胞胎 +40 PT】里程碑徽章 (排除新手免費測試局！)
          const dayKey = table.day_key || "2026-12-31";
          if (!table.is_test_run) {
            if (teamA.length === 2 && gs.scores.team_A >= 6) {
              for (const m of teamA) {
                await window.PartyEngine.awardBadgeOnce(
                  `mile_twins_${m.id}`,
                  "mile_twins",
                  m.id,
                  40,
                  "靈魂雙胞胎",
                  `2v2 靈魂默契 8 題命中 ${gs.scores.team_A} 題`,
                  dayKey
                );
              }
            }
            if (teamB.length === 2 && gs.scores.team_B >= 6) {
              for (const m of teamB) {
                await window.PartyEngine.awardBadgeOnce(
                  `mile_twins_${m.id}`,
                  "mile_twins",
                  m.id,
                  40,
                  "靈魂雙胞胎",
                  `2v2 靈魂默契 8 題命中 ${gs.scores.team_B} 題`,
                  dayKey
                );
              }
            }
          }

          await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, { game_state: gs });
          const updatedTbl = { ...table, game_state: gs };
          if (table.participants.length === 2) {
            const winIds = gs.scores.team_A >= 5 ? teamA.map((p) => p.id) : ["__coop_fail__"];
            return await this.autoFinishTable(updatedTbl, winIds, ctx);
          } else {
            if (gs.scores.team_A === gs.scores.team_B) {
              return await this.autoFinishTable(updatedTbl, ["__pvp_tie__"], ctx);
            }
            const winners =
              gs.scores.team_A > gs.scores.team_B
                ? teamA.map((p) => p.id)
                : teamB.map((p) => p.id);
            return await this.autoFinishTable(updatedTbl, winners, ctx);
          }
        } else {
          gs.qIdx = qIdx + 1;
          await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
            game_state: gs,
          });
        }
      }

      window.PartyFX.haptic("medium");
      await window.PartyApp.refreshAll();
    },

    // --- ito 數字順風耳 ---
    async moveIto(tableId, idx, dir) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table) return;
      const gs = { ...(table.game_state || {}) };
      const arr = [...(gs.proposedOrder || table.participants.map((p) => p.id))];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      gs.proposedOrder = arr;
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        game_state: gs,
      });
      await window.PartyApp.refreshAll();
    },

    async revealIto(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table) return;
      const gs = { ...(table.game_state || {}), revealed: true };
      const nums = (gs.proposedOrder || []).map((id) => gs.secretNumbers[id]);
      let sortedOk = true;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] < nums[i - 1]) sortedOk = false;
      }
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        game_state: gs,
      });
      const winIds = sortedOk ? table.participants.map((p) => p.id) : ["__coop_fail__"];
      await this.autoFinishTable(table, winIds, ctx);
    },

    // --- 5 秒不詞窮 ---
    async startFiveSecTurn(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table) return;
      const gs = { ...(table.game_state || {}), turnStartedAt: window.PartyDB.serverNowMs };
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        game_state: gs,
      });
      await window.PartyApp.refreshAll();
    },

    async judgeFiveSec(tableId, passed) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table) return;
      const gs = { ...(table.game_state || {}) };
      const parts = table.participants;
      const curPlayer = parts[(gs.turn || 0) % parts.length];
      gs.scores = { ...(gs.scores || {}) };
      if (passed) gs.scores[curPlayer.id] = (gs.scores[curPlayer.id] || 0) + 1;
      gs.lastJudge = { turn: gs.turn || 0, playerId: curPlayer.id, passed: Boolean(passed) };
      gs.turn = (gs.turn || 0) + 1;
      gs.turnStartedAt = 0;

      while (
        gs.turn < parts.length * 3 &&
        (String(parts[gs.turn % parts.length].id).startsWith("bot_") ||
          parts[gs.turn % parts.length].forfeited)
      ) {
        const bp = parts[gs.turn % parts.length];
        if (!bp.forfeited && Math.random() < 0.65) gs.scores[bp.id] = (gs.scores[bp.id] || 0) + 1;
        gs.turn += 1;
      }

      if (gs.turn >= parts.length * 3) {
        const activeParts = parts.filter((p) => !p.forfeited);
        let best = -1;
        activeParts.forEach((p) => {
          const s = gs.scores[p.id] || 0;
          if (s > best) best = s;
        });
        const topPlayers = best > 0 ? activeParts.filter((p) => (gs.scores[p.id] || 0) === best).map((p) => p.id) : [];
        await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, { game_state: gs });
        return await this.autoFinishTable(table, topPlayers, ctx);
      }

      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        game_state: gs,
      });
      await window.PartyApp.refreshAll();
    },

    // --- 手動申報與對手互認（CAS 樂觀鎖防併發互蓋） ---
    async proposeWinner(tableId, winnerIds) {
      return window.PartyDB.withLock(`propose_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const table = (ctx.tables || []).find((t) => t.id === tableId);
        if (table && (table.participants || []).some((p) => String(p.id).startsWith("bot_"))) {
          return await this.autoFinishTable(table, winnerIds, ctx);
        }
        await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status === "finished" || cur.status === "cancelled") return undefined;
          cur.status = "settling";
          cur.proposed_winners = winnerIds;
          cur.confirmed_by = [ctx.me.id];
          return cur;
        });
        await window.PartyApp.refreshAll();
      });
    },

    async resetProposal(tableId) {
      return window.PartyDB.withLock(`reset_prop_${tableId}`, async () => {
        await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "settling") return undefined;
          cur.status = "playing";
          cur.proposed_winners = null;
          cur.confirmed_by = [];
          return cur;
        });
        await window.PartyApp.refreshAll();
      });
    },

    async confirmWinner(tableId) {
      return window.PartyDB.withLock(`confirm_win_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        let readyToSettle = false;
        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status === "finished" || !cur.proposed_winners) return undefined;
          const confirmed = new Set(cur.confirmed_by || []);
          confirmed.add(ctx.me.id);
          cur.confirmed_by = [...confirmed];
          readyToSettle = confirmed.size >= 2 || (cur.participants || []).length <= 1;
          return cur;
        });
        if (!tx.committed || !tx.snapshot) return;
        if (readyToSettle) {
          await this.autoFinishTable(tx.snapshot, tx.snapshot.proposed_winners, ctx);
        } else {
          await window.PartyApp.refreshAll();
        }
      });
    },

    async autoFinishTable(table, winnerIds, ctx) {
      window.PartyFX.playTone("win");
      await window.PartyEngine.settlePartyTable(
        table,
        winnerIds,
        ctx.bets,
        ctx.globalCfg
      );
      await window.PartyApp.refreshAll();
    },

    // ==================== 🏳️ 棄權認輸（對方不出牌卡房時可自行離場） ====================
    confirmForfeitTable(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table) return;
      const activeCnt = (table.participants || []).filter((p) => !p.forfeited).length;
      const isCoop =
        table.game_type === "ito_numbers" ||
        (table.game_type === "soul_sync_2v2" && (table.participants || []).length <= 2);
      const msg = table.is_test_run
        ? "確定要結束這場免費測試局嗎？（0 分，不影響積分）"
        : isCoop
        ? "這是合作局，你棄權後本局將直接判定「挑戰失敗」，全隊入場費不退回。\n確定要棄權嗎？"
        : activeCnt <= 2
        ? "棄權後將直接判你落敗，對手立即獲勝並拿走獎金（你的入場費不退回）。\n確定要棄權認輸嗎？"
        : "棄權後你會立即離開本局（入場費留在獎金內給其他選手爭奪）。\n確定要棄權認輸嗎？";
      window.PartyApp.confirmModal("🏳️ 棄權認輸", msg, "🏳️ 確定棄權", () => this.forfeitTable(tableId), true);
    },

    async forfeitTable(tableId) {
      return window.PartyDB.withLock(`forfeit_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        const myId = ctx.me.id;
        let finishWinners = null;

        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || (cur.status !== "playing" && cur.status !== "settling")) return undefined;
          const parts = (cur.participants || []).map((p) =>
            p.id === myId ? { ...p, forfeited: true } : p
          );
          if (!parts.some((p) => p.id === myId)) return undefined;
          cur.participants = parts;
          const remaining = parts.filter((p) => !p.forfeited);
          const gs = { ...(cur.game_state || {}) };
          gs.lastLog = `🏳️ ${ctx.me.name} 棄權離場`;

          const isCoop =
            cur.game_type === "ito_numbers" ||
            (cur.game_type === "soul_sync_2v2" && parts.length <= 2);
          if (isCoop) {
            finishWinners = ["__coop_fail__"];
          } else if (cur.game_type === "soul_sync_2v2") {
            const myTeam = parts.find((p) => p.id === myId)?.team;
            finishWinners = parts.filter((p) => p.team && p.team !== myTeam).map((p) => p.id);
          } else if (remaining.length <= 1) {
            finishWinners = remaining.length === 1 ? [remaining[0].id] : ["__pvp_tie__"];
          } else if (cur.game_type === "number_bomb") {
            const alive = (gs.aliveIds || []).filter((id) => id !== myId);
            const curTurnId = (gs.aliveIds || [])[gs.turnIdx || 0];
            gs.aliveIds = alive;
            let nextIdx = alive.indexOf(curTurnId);
            if (nextIdx < 0) nextIdx = (gs.turnIdx || 0) % Math.max(1, alive.length);
            gs.turnIdx = nextIdx;
            if (alive.length <= 1) finishWinners = alive.length ? alive : ["__pvp_tie__"];
          } else if (cur.game_type === "five_seconds") {
            const total = parts.length * 3;
            let turn = gs.turn || 0;
            while (turn < total && parts[turn % parts.length].forfeited) turn += 1;
            gs.turn = turn;
            gs.turnStartedAt = 0;
            if (turn >= total) {
              let best = -1;
              remaining.forEach((p) => {
                best = Math.max(best, (gs.scores || {})[p.id] || 0);
              });
              const top = best > 0 ? remaining.filter((p) => ((gs.scores || {})[p.id] || 0) === best).map((p) => p.id) : ["__pvp_tie__"];
              finishWinners = top;
            }
          }
          cur.game_state = gs;
          if (cur.status === "settling") {
            cur.status = "playing";
            cur.proposed_winners = null;
            cur.confirmed_by = [];
          }
          return cur;
        });

        if (!tx.committed || !tx.snapshot) {
          await window.PartyApp.refreshAll();
          return;
        }
        if (this.activeRoomTableId === tableId) this.activeRoomTableId = null;
        this.clearLocalDraw(tableId);
        delete this.blindStopwatchStart[tableId];
        window.PartyFX.haptic("medium");

        const snap = tx.snapshot;
        if (!finishWinners && snap.game_type === "quick_draw") {
          const { times } = this.getMergedQdState(snap, snap.game_state || {}, ctx.themeResponses);
          const active = (snap.participants || []).filter((p) => !p.forfeited);
          if (active.length > 0 && active.every((p) => times[p.id] !== undefined)) {
            await this.resolveAndFinishQd(snap, (snap.game_state || {}).mode || "draw", times, ctx);
            window.PartyApp.toast("🏳️ 你已棄權離場！");
            return;
          }
        }
        if (finishWinners) {
          await this.autoFinishTable(snap, finishWinners, ctx);
        } else {
          await window.PartyApp.refreshAll();
        }
        window.PartyApp.toast("🏳️ 你已棄權離場，可以回大廳開新局囉！");
      });
    },
  };

  window.PartyGamesUI = PartyGamesUI;
})();
