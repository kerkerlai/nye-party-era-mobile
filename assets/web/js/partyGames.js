/**
 * 《跨年英雄紀元》Party Game 自由賽桌大廳 ＆ 8 款互動小遊戲引擎 (partyGames.js)
 * 嚴格執行：
 *   - 桌長可選 1 / 2 / 3 分鐘開盤集結倒數
 *   - 同遊戲「參賽計分上限 3 次」（第 4 次起可繼續開房暢玩，0 門票 0 得分）
 *   - 同遊戲「場邊應援預測上限 3 次」（獨立計算！超過後同款遊戲鎖定應援預測）
 *   - 雙向不同預測才成立積分池，單向或無人命中全額退還應援分防洗分！
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
    dismissedFinishedIds: new Set(),
    lastAutoOpenedStatus: {},
    quickDrawTimers: {},
    localDrawState: {},
    blindStopwatchStart: {},
    fiveSecTimer: null,
    localSoulDraft: {},
    editingSoulKey: "",
    localSwitchWinners: {},

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

    getSpectatorsForTable(table, ctx, playerMap) {
      if (!table || !ctx) return [];
      const partSet = new Set((table.participants || []).map((p) => p.id));
      const cheerByPlayer = {};
      (ctx.cheers || []).forEach((c) => {
        if (c.table_id === table.id && c.status !== "cancelled") {
          cheerByPlayer[c.supporter_id] = c;
        }
      });
      const specMap = new Map();
      (ctx.themeResponses || []).forEach((r) => {
        if (r.session_id !== table.id || r.step_key !== "room_spectator") return;
        if (partSet.has(r.player_id)) return;
        if (r.payload && r.payload.active) {
          const pl = playerMap[r.player_id];
          specMap.set(r.player_id, {
            id: r.player_id,
            name: pl?.name || r.payload.name || r.player_id,
            avatar: pl?.avatar || "",
            cheer: cheerByPlayer[r.player_id] || null,
            watching: true,
          });
        }
      });
      Object.entries(cheerByPlayer).forEach(([pid, cheer]) => {
        if (partSet.has(pid) || specMap.has(pid)) return;
        const pl = playerMap[pid];
        specMap.set(pid, {
          id: pid,
          name: pl?.name || pid,
          avatar: pl?.avatar || "",
          cheer,
          watching: false,
        });
      });
      return [...specMap.values()];
    },

    async syncSpectatorPresence(tableId, active) {
      try {
        const ctx = window.PartyApp.getContext();
        if (!ctx?.me || !tableId) return;
        const table = (ctx.tables || []).find((t) => t.id === tableId);
        if (table && (table.participants || []).some((p) => p.id === ctx.me.id && !p.forfeited)) {
          if (active) return;
        }
        await window.PartyDB.upsert("theme_responses", [
          {
            id: `${tableId}_spec_${ctx.me.id}`,
            session_id: tableId,
            step_key: "room_spectator",
            player_id: ctx.me.id,
            payload: {
              active: Boolean(active),
              name: ctx.me.name,
              at: window.PartyDB.serverNowMs,
            },
          },
        ]);
      } catch (_) {}
    },

    openRoomWindow(tableId) {
      if (!tableId) return;
      const prevId = this.activeRoomTableId;
      if (prevId && prevId !== tableId) {
        this.syncSpectatorPresence(prevId, false);
      }
      this.activeRoomTableId = tableId;
      this.minimizedRoomIds.delete(tableId);
      this.dismissedFinishedIds.delete(tableId);
      window.PartyApp.render();
      const ctx = window.PartyApp.getContext();
      const tbl = (ctx.tables || []).find((t) => t.id === tableId);
      if (tbl && tbl.status !== "finished" && tbl.status !== "cancelled") {
        const amIn = (tbl.participants || []).some((p) => p.id === ctx.me?.id && !p.forfeited);
        if (!amIn) {
          this.syncSpectatorPresence(tableId, true).then(() => window.PartyApp.refreshAll());
        }
      }
    },

    minimizeRoomWindow() {
      const prevId = this.activeRoomTableId;
      if (prevId) {
        const ctx = window.PartyApp.getContext();
        const tbl = (ctx.tables || []).find((t) => t.id === prevId);
        if (tbl && tbl.status === "finished") {
          this.dismissedFinishedIds.add(prevId);
        } else {
          this.minimizedRoomIds.add(prevId);
          this.syncSpectatorPresence(prevId, false).then(() => window.PartyApp.refreshAll());
        }
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

      if (!ctx || !ctx.me || ctx.sceneInfo?.scene === "viewer") {
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

      // r & q1: 賽局剛結束 (finished) 時「停留在房內顯示完整結果看板」，不強制閃退關閉！只有被取消 (cancelled) 或使用者主動關閉才收起！
      const targetTable = this.activeRoomTableId
        ? tables.find(
            (t) =>
              t.id === this.activeRoomTableId &&
              (t.status === "open" ||
                t.status === "playing" ||
                t.status === "settling" ||
                (t.status === "finished" && !this.dismissedFinishedIds.has(t.id)))
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
              ${
                targetTable.status === "finished"
                  ? "🏁 賽局已完賽結算（檢視結果後可關閉返回大廳）"
                  : amIn
                  ? "⚔️ 專屬對戰室（完賽停駐顯示結果）"
                  : "👀 場邊觀戰／應援預測模式（同步觀看公開賽況）"
              }
            </div>
          </div>
          <button type="button" class="btn ${targetTable.status === "finished" ? "btn-gold" : "btn-secondary"} btn-xs" onclick="PartyGamesUI.minimizeRoomWindow()">
            ${targetTable.status === "finished" ? "✕ 關閉結果" : amIn ? "🔽 縮小" : "✕ 離開觀戰"}
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
          <div style="margin-top:5px;"><b class="gold-text">🏆 積分規則：</b>${esc(dynScoring)}</div>
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
          <summary>📖 查看【${esc(gameMeta.name)}】玩法 ＆ 積分規則</summary>
          ${body}
        </details>
      `;
    },

    renderLobby(ctx, opts = {}) {
      const { me, players, tables, cheers, globalCfg, sceneInfo } = ctx;
      const forceTestOnly = Boolean(opts.forceTestOnly);
      const unlimitedWarmup = Boolean(opts.unlimitedWarmup || sceneInfo.scene === "pre_event");
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
        .slice(0, 12);

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
                unlimitedWarmup
                  ? "🎮 派對暖身練習大廳（免費無限暢玩・可配 AI 陪練）"
                  : forceTestOnly
                  ? "🧪 新手練習場（每款可免費試玩 1 次！）"
                  : isHappy
                  ? "🔥 限時加成 Happy Hour（總榮譽池 +50%！）"
                  : "🎲 Party Game 自由賽桌"
              }
            </span>
            ${
              myActiveTbl
                ? `<button class="btn btn-gold btn-sm" onclick="PartyGamesUI.openRoomWindow('${myActiveTbl.id}')">🎮 回到房間</button>`
                : `<button class="btn ${forceTestOnly ? "btn-primary" : "btn-gold"} btn-sm" onclick="PartyGamesUI.openCreateModal(${forceTestOnly})">
                     ${unlimitedWarmup ? "🎮 開暖身練習局" : forceTestOnly ? "🧪 開測試局" : "➕ 開新賽桌"}
                   </button>`
            }
          </div>
          ${
            unlimitedWarmup
              ? `<p class="muted-xs" style="margin-top:7px;">
                   💡 正式派對開跑前，所有 7 款小遊戲皆開放<b>免費無限暖身體驗</b>（0 積分消耗，可與朋友連線或召喚 <b>🤖 AI 陪練員</b> 即時對戰）！
                 </p>`
              : forceTestOnly
              ? `<p class="muted-xs" style="margin-top:7px;">
                   💡 每款小遊戲皆有 <b>1 次免費測試機會</b>（開房或加入別人的測試房皆計入），也可召喚 <b>🤖 AI 陪練員</b> 單人熟悉玩法！
                 </p>`
              : `<details class="rule-guide-box" style="margin-top:9px;margin-bottom:0;">
                  <summary>📜 賽桌正向計分 ＆ 免費應援規則（每日 08:00 重置額度）</summary>
                  <div class="rule-block-inner">
                    <div>• <b>🚪 獨立對戰室</b>：每人同時限參加 1 桌，進房自動開啟專屬視窗。</div>
                    <div style="margin-top:4px;">• <b>⚔️ 免費參賽贏積分（每日 ${g.maxScoringPlaysPerGamePerDay} 次／款）</b>：全程免費不扣分！前 ${g.maxScoringPlaysPerGamePerDay} 局獲勝領取榮譽積分（完賽未勝亦得 <b>+${g.partyPartPts ?? 5} PT</b> 參與鼓勵分）；滿額後仍可免費<b>「🤝 陪玩」</b>（0 分，未滿額對手照常計分）。</div>
                    <div style="margin-top:4px;">• <b>📣 場邊免費預測（每日 ${g.maxCheersPerGamePerDay} 次／款）</b>：開賽前免費點選看好的贏家（隨時可改選或取消），預測命中直接領 <b>+${g.partyCheerPts || 10} PT</b>，未命中 0 分不倒扣！</div>
                    <div style="margin-top:4px;">• <b>🔥 限時加成</b>：Happy Hour 時段所有賽桌勝利獎勵額外 <b>+${Math.round((Number(g.happyHourBonusRate) || 0.5) * 100)}%</b>！</div>
                    <div class="rule-achv-line"><b>🏅 專屬成就：</b>🚀【破冰先鋒 +25 PT】— 每日首位成功開桌完賽正式局的桌長自動獲得！</div>
                  </div>
                </details>`
          }
        </div>

        ${
          activeTables.length === 0
            ? `<div class="empty-card">
                <div style="font-size:34px;margin-bottom:6px;">${forceTestOnly ? "🎮" : "🎯"}</div>
                <div style="font-weight:700;font-size:16px;">${forceTestOnly ? "目前沒有進行中的練習桌" : "目前沒有進行中的賽桌"}</div>
                <div class="muted-sm" style="margin:6px 0 14px;">
                  ${
                    unlimitedWarmup
                      ? "點下方按鈕任選一款派對小遊戲立即開局（支援召喚 AI 陪練員單人秒開戰）！"
                      : forceTestOnly
                      ? "任選一款尚未試玩的遊戲開啟免費測試局（可揪人或補 AI 陪練員）！"
                      : "快開第一桌揪大家對決，或場邊應援預測賺積分！"
                  }
                </div>
                <button class="btn ${forceTestOnly ? "btn-primary" : "btn-gold"}" onclick="PartyGamesUI.openCreateModal(${forceTestOnly})">
                  ${unlimitedWarmup ? "🎮 開啟暖身練習局" : forceTestOnly ? "🧪 開啟免費測試局" : "➕ 建立新賽桌"}
                </button>
              </div>`
            : activeTables.map((t) => this.renderLobbyDoorCard(t, ctx, playerMap, myActiveTbl)).join("")
        }

        <div class="section-card" style="margin-top:16px;">
          <div class="section-title">📊 ${forceTestOnly ? "7 款派對小遊戲玩法 ＆ 規則一覽" : `今日各遊戲額度 ＆ 規則（${esc(dayKey)}）`}</div>
          <p class="muted-xs" style="margin-bottom:8px;">點擊任一遊戲可展開玩法、積分與成就說明：</p>
          <div class="quota-grid">
            ${CFG.PARTY_GAMES.map((gm) => {
              const u = window.PartyEngine.getDailyGameUsage(me.id, gm.id, dayKey, tables, cheers);
              const testUsed = window.PartyEngine.getTestHostUsage(me.id, gm.id, tables, me);
              const playFull = u.playCount >= g.maxScoringPlaysPerGamePerDay;
              const cheerFull = u.cheerCount >= g.maxCheersPerGamePerDay;
              return `
                <details class="quota-details-card">
                  <summary class="quota-item" style="border-bottom:none;cursor:pointer;list-style:none;">
                    <div class="quota-name">${gm.icon} <b>${esc(gm.name)}</b> <span class="muted-xs">▾</span></div>
                    <div class="quota-badges">
                      ${
                        unlimitedWarmup
                          ? `<span class="q-tag q-ok">🎮 免費暢玩</span>`
                          : testUsed < 1
                          ? `<span class="q-tag q-ok">🧪 測試 0/1</span>`
                          : ""
                      }
                      ${
                        !forceTestOnly
                          ? `<span class="q-tag ${playFull ? "q-muted" : "q-ok"}">參賽 ${u.playCount}/${g.maxScoringPlaysPerGamePerDay}</span>
                             <span class="q-tag ${cheerFull ? "q-lock" : "q-cheer"}">應援 ${u.cheerCount}/${g.maxCheersPerGamePerDay}</span>`
                          : !unlimitedWarmup && testUsed >= 1
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
                <div class="section-title">🏁 今日近期完賽賽桌（點擊查看歷史回顧）</div>
                ${recentFinished
                  .map((t) => {
                    const rawWinners = t.winner_ids || [];
                    const isTie = rawWinners.includes("__pvp_tie__");
                    const winners = rawWinners
                      .filter((w) => w !== "__coop_fail__" && w !== "__pvp_tie__")
                      .map((id) => (playerMap[id] ? playerMap[id].name : id));
                    const tsParts = window.PartyEngine.taipeiParts(
                      Date.parse(t.finished_at || t.updated_at || t.created_at || "") || Date.now()
                    );
                    const timeTag = `${tsParts.hh}:${tsParts.mi}`;
                    return `<div class="history-row clickable-row" onclick="PartyApp.openTableHistoryModal('${esc(t.id)}')">
                      <div style="min-width:0;flex:1;">
                        <div><b>${esc(t.title)}</b></div>
                        <div class="muted-xs">🕒 ${esc(timeTag)} 完賽・點擊看對戰回顧</div>
                      </div>
                      <span class="gold-text" style="white-space:nowrap;">${isTie ? "⚖️ 平手完賽" : winners.length ? `🏆 ${esc(winners.join("、"))}` : "💥 闖關失敗"} ▸</span>
                    </div>`;
                  })
                  .join("")}
              </div>`
            : ""
        }
      `;
    },

    renderLobbyDoorCard(table, ctx, playerMap, myActiveTbl) {
      const { me, tables, cheers, globalCfg, sceneInfo } = ctx;
      const isWarmupScene = sceneInfo?.scene === "pre_event";
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      const parts = table.participants || [];
      const activeParts = parts.filter((p) => !p.forfeited);
      const amIn = activeParts.some((p) => p.id === me.id);
      const tableCheers = (cheers || []).filter((c) => c.table_id === table.id);
      const myCheer = tableCheers.find((c) => c.supporter_id === me.id);
      const usage = window.PartyEngine.getDailyGameUsage(
        me.id,
        table.game_type,
        table.day_key,
        tables,
        cheers
      );
      const myTestUsed = isWarmupScene ? 0 : window.PartyEngine.getTestHostUsage(me.id, table.game_type, tables, me);
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

      const spectators = this.getSpectatorsForTable(table, ctx, playerMap);
      const liveWatchers = spectators.filter((s) => s.watching);

      return `
        <div class="lobby-door-card ${amIn ? "my-room-border" : table.is_happy_hour ? "hh-border" : ""}">
          <div class="table-header" style="margin-bottom:6px;">
            <div>
              <span class="game-chip">${gameMeta.icon} ${esc(table.title)}</span>
              ${
                table.is_test_run
                  ? `<span class="scene-pill pill-cyan" style="margin-left:4px;font-size:11px;">🧪 練習局(0分)</span>`
                  : table.is_happy_hour
                  ? `<span class="hh-tag">🔥 加成+${Math.round((Number(g.happyHourBonusRate) || 0.5) * 100)}%</span>`
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
            <span>👑 房主：<b>${esc(hostName)}</b> ｜ 🏃 選手 (${activeParts.length}/${gameMeta.maxPlayers})：<b>${activeParts.map((p) => esc(p.name)).join("、") || "等待加入"}</b>${liveWatchers.length > 0 ? ` ｜ 👀 觀戰：<b>${liveWatchers.map((w) => esc(w.name)).join("、")}</b>` : ""}</span>
            ${
              myCheer
                ? `<span class="gold-text">📣 已預測：${esc(myCheer.pick_label)}${table.status === "open" ? " (可進房修改)" : ""}</span>`
                : !table.is_test_run && tableCheers.length > 0
                ? `<span class="cyan-text">📣 已有 ${tableCheers.length} 人預測 (+${Number(table.cheer_pts) || 10} PT)</span>`
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
                        : table.is_test_run && !table.is_warmup && myTestUsed >= 1
                        ? `<button class="btn btn-secondary btn-xs" style="flex:1;" disabled>✅ 此款測試機會已用</button>`
                        : canJoinMore && !myCheer
                        ? `<button class="btn btn-primary btn-sm" style="flex:1.2;" onclick="PartyGamesUI.joinTable('${table.id}')">
                             🙋 ${
                               table.is_test_run
                                 ? table.is_warmup || isWarmupScene
                                   ? "加入暖身練習(0分)"
                                   : "加入測試(扣試玩1次)"
                                 : nextIsScoring
                                 ? "加入計分賽(免費)"
                                 : "🤝 陪玩參賽(0分)"
                             }
                           </button>`
                        : ""
                    }
                    <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="PartyGamesUI.openRoomWindow('${table.id}')">
                      ${table.is_test_run ? "👀 查看房間" : myCheer ? "↺ 進房改預測／觀戰" : `📣 免費預測 (${tableCheers.length})`}
                    </button>
                  `
                : `<button class="btn btn-secondary btn-sm" style="width:100%;" onclick="PartyGamesUI.openRoomWindow('${table.id}')">
                     👀 進入觀戰${myCheer ? `（已預測：${esc(myCheer.pick_label)}）` : ""}
                   </button>`
            }
          </div>
        </div>
      `;
    },

    renderTableCard(table, ctx, playerMap) {
      const { me, tables, cheers, globalCfg } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      const parts = table.participants || [];
      const amIn = parts.some((p) => p.id === me.id && !p.forfeited);
      const isHost = table.host_id === me.id;
      const tableCheers = (cheers || []).filter((c) => c.table_id === table.id);
      const myCheer = tableCheers.find((c) => c.supporter_id === me.id);
      const usage = window.PartyEngine.getDailyGameUsage(
        me.id,
        table.game_type,
        table.day_key,
        tables,
        cheers
      );

      const remainSec = Math.max(
        0,
        Math.ceil((Date.parse(table.opens_until) - window.PartyDB.serverNowMs) / 1000)
      );
      const mm = String(Math.floor(remainSec / 60)).padStart(2, "0");
      const ss = String(remainSec % 60).padStart(2, "0");

      const spectators = this.getSpectatorsForTable(table, ctx, playerMap);

      return `
        <div class="table-card ${table.is_happy_hour ? "hh-border" : ""}">
          <div class="table-header">
            <div>
              <span class="game-chip">${gameMeta.icon} ${esc(table.title)}</span>
              ${
                table.is_test_run
                  ? `<span class="scene-pill pill-cyan" style="margin-left:4px;font-size:11px;">🧪 練習局 (0分)</span>`
                  : table.is_happy_hour
                  ? `<span class="hh-tag">🔥 加成+50%</span>`
                  : ""
              }
            </div>
            <span class="status-badge st-${table.status} ${table.status === "open" ? "live-countdown" : ""}" ${table.status === "open" ? `data-until="${esc(table.opens_until)}"` : ""}>
              ${
                table.status === "open"
                  ? table.is_test_run
                    ? `⏳ 練習集結 ${mm}:${ss}`
                    : `⏳ 集結 ${mm}:${ss}`
                  : table.status === "playing"
                  ? "⚔️ 對戰中"
                  : table.status === "finished"
                  ? "🏁 已完賽"
                  : "⚖️ 確認勝負"
              }
            </span>
          </div>

          <!-- 遊戲玩法與計分規則說明（集結階段預設展開，開打後可一鍵收合查看） -->
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
                    <small>${p.forfeited ? "🏳️已棄權" : table.is_test_run ? "練習0分" : p.isScoring ? "🏆計分局" : "🤝陪玩0分"}</small>
                  </div>`;
                })
                .join("")}
            </div>
          </div>

          <!-- 👀 場邊觀戰 ＆ 應援預測名單（房內全員同步可見！） -->
          <div class="spectators-box" style="margin-top:8px;">
            <div class="sub-label" style="margin-bottom:4px;">👀 場邊觀戰 ＆ 應援名單（${spectators.length} 人）：</div>
            ${
              spectators.length === 0
                ? `<div class="muted-xs">目前尚無場邊觀戰者</div>`
                : `<div class="part-chips">
                     ${spectators
                       .map(
                         (s) => `<div class="part-chip spec-chip">
                           ${avatarHtml({ name: s.name, avatar: s.avatar }, 20)}
                           <span>${esc(s.name)}</span>
                           <small style="color:${s.cheer ? "#fde047" : "#7dd3fc"};">${
                             s.cheer ? `📣${esc(s.cheer.pick_label)}` : "👀觀戰中"
                           }</small>
                         </div>`
                       )
                       .join("")}
                   </div>`
            }
          </div>

          ${
            table.status === "open"
              ? this.renderOpenControls(table, gameMeta, me, amIn, isHost, usage, myCheer, tableCheers, g, remainSec, ctx)
              : table.status === "finished"
              ? this.renderFinishedRoomStage(table, ctx, playerMap)
              : this.renderPlayingArea(table, gameMeta, ctx, playerMap, amIn, isHost, tableCheers, myCheer)
          }
        </div>
      `;
    },

    renderOpenControls(table, gameMeta, me, amIn, isHost, usage, myCheer, tableCheers, g, remainSec, ctx = null) {
      const parts = table.participants || [];
      const canJoinMore = parts.length < gameMeta.maxPlayers;
      const nextIsScoring = usage.playCount < g.maxScoringPlaysPerGamePerDay;
      const cheerLeft = g.maxCheersPerGamePerDay - usage.cheerCount;
      const isWarmup = Boolean(table.is_warmup || ctx?.sceneInfo?.scene === "pre_event");
      const myTestUsed = isWarmup
        ? 0
        : window.PartyEngine.getTestHostUsage(
            me.id,
            table.game_type,
            ctx?.tables || window.PartyApp?.data?.tables || [],
            me
          );

      // 應援預測選項
      let cheerTargets = [];
      if (gameMeta.cheerMode === "coop" || (table.game_type === "soul_sync_2v2" && parts.length <= 2)) {
        cheerTargets = [
          { key: "coop_pass", label: "✅ 闖關成功" },
          { key: "coop_fail", label: "💥 挑戰翻車" },
        ];
      } else if (table.game_type === "soul_sync_2v2" && parts.length > 2) {
        cheerTargets = [
          { key: "team_A", label: "🅰️ A 組獲勝" },
          { key: "team_B", label: "🅱️ B 組獲勝" },
        ];
      } else {
        cheerTargets = parts.map((p) => ({ key: p.id, label: `📣 預測 ${p.name} 贏` }));
      }

      const invalidSoulCount = table.game_type === "soul_sync_2v2" && parts.length === 3;
      const canStartNow = parts.length >= gameMeta.minPlayers && !invalidSoulCount;

      return `
        <div class="open-actions">
          ${
            !amIn && canJoinMore && !myCheer
              ? table.is_test_run && !isWarmup && myTestUsed >= 1
                ? `<div class="locked-cheer-msg" style="text-align:center;">✅ 你已使用過本遊戲的 1 次免費測試機會囉！</div>`
                : `<button class="btn btn-primary" onclick="PartyGamesUI.joinTable('${table.id}')">
                    🙋 加入${
                      table.is_test_run
                        ? isWarmup
                          ? "免費暖身練習局（0分暢玩）"
                          : "免費測試局（扣此款 1 次試玩機會）"
                        : nextIsScoring
                        ? `參賽（第 ${usage.playCount + 1}/${g.maxScoringPlaysPerGamePerDay} 場計分局，免費不扣分）`
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
            ? `<div class="cheer-panel">
                 <div class="muted-xs" style="color:#7dd3fc;">🧪 免費練習局：0 分體驗、不開放應援預測${isWarmup ? "（暖身時段無限次暢玩）" : "；開戰後將扣除參與者本遊戲的 1 次試玩機會"}。</div>
               </div>`
            : `<!-- 場邊觀眾免費應援預測區 -->
               <div class="cheer-panel">
                 <div class="cheer-header">
                   <span>📣 場邊免費應援預測（已參與 ${tableCheers.length} 人・命中 +${table.cheer_pts || 10} PT）</span>
                   <span class="muted-xs">免費參加不扣分！開賽前可隨時改選或取消</span>
                 </div>
                 ${
                   amIn
                     ? `<div class="muted-xs">你是本局參賽選手，專心應戰！（場外夥伴可免費參與預測）</div>`
                     : myCheer
                     ? `<div class="my-cheer-tag cheer-regret-row" style="margin-bottom:6px;">
                          <span>✅ 已預測：<b>${esc(myCheer.pick_label)}</b>（猜中 +${table.cheer_pts || 10} PT，今日 ${usage.cheerCount}/${g.maxCheersPerGamePerDay}）</span>
                          <button type="button" class="btn btn-ghost btn-xs" style="border-color:rgba(251,191,36,0.65);color:#fde047;flex-shrink:0;" onclick="PartyGamesUI.cancelMyCheer('${table.id}')">↺ 取消預測</button>
                        </div>
                        <div class="cheer-btn-grid">
                          ${cheerTargets
                            .map(
                              (ct) => `<button class="btn ${myCheer.pick_key === ct.key ? "btn-gold" : "btn-cheer"}" onclick="PartyGamesUI.placeCheer('${table.id}', '${esc(ct.key)}', '${esc(ct.label)}')">
                                ${myCheer.pick_key === ct.key ? "☑️ " : ""}${esc(ct.label)}
                              </button>`
                            )
                            .join("")}
                        </div>`
                     : cheerLeft <= 0
                     ? `<div class="locked-cheer-msg">🔒 今日「${esc(gameMeta.name)}」免費預測已滿 ${g.maxCheersPerGamePerDay}/${g.maxCheersPerGamePerDay} 次（別款遊戲仍可參與！）</div>`
                     : cheerTargets.length < 2
                     ? `<div class="muted-xs">等待至少 2 位選手入座即可開放場邊免費預測…</div>`
                     : `<div class="cheer-btn-grid">
                         ${cheerTargets
                           .map(
                             (ct) => `<button class="btn btn-cheer" onclick="PartyGamesUI.placeCheer('${table.id}', '${esc(ct.key)}', '${esc(ct.label)}')">
                               ${esc(ct.label)} <small>(命中 +${table.cheer_pts || 10} PT)</small>
                             </button>`
                           )
                           .join("")}
                       </div>`
                 }
               </div>`
        }
      `;
    },

    renderPlayingArea(table, gameMeta, ctx, playerMap, amIn, isHost, tableCheers, myCheer) {
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
          ${myCheer ? `<div class="my-cheer-tag" style="margin-bottom:8px;">📣 你的免費應援預測：<b>${esc(myCheer.pick_label)}</b>（命中獎勵 +${table.cheer_pts || 10} PT）</div>` : ""}
          ${innerHtml}
          ${settleHtml}
          ${forfeitBarHtml}
        </div>
      `;
    },

    renderFinishedRoomStage(table, ctx, playerMap) {
      return `
        <div class="playing-stage" style="margin-top:10px;">
          ${this.renderTableOutcomeReviewHtml(table, ctx, playerMap)}
          <button type="button" class="btn btn-gold" style="width:100%;margin-top:12px;" onclick="PartyGamesUI.minimizeRoomWindow()">
            ✅ 看完賽果・關閉房間返回大廳
          </button>
        </div>
      `;
    },

    renderTableOutcomeReviewHtml(table, ctx, playerMap = null) {
      const pMap = playerMap ? { ...playerMap } : {};
      if (!playerMap) {
        (ctx.players || []).forEach((p) => (pMap[p.id] = p));
      }
      (table.participants || []).forEach((p) => {
        if (!pMap[p.id]) pMap[p.id] = p;
      });
      const gs = table.game_state || {};
      const parts = table.participants || [];
      const wids = table.winner_ids || [];
      const isCoopFail = wids.includes("__coop_fail__");
      const isPvpTie = wids.includes("__pvp_tie__");
      const realWinIds = wids.filter((w) => w !== "__coop_fail__" && w !== "__pvp_tie__");
      const isCoop =
        table.game_type === "ito_numbers" ||
        (table.game_type === "soul_sync_2v2" && parts.length <= 2);

      let headline = "";
      if (isCoop) {
        headline =
          !isCoopFail && realWinIds.length > 0
            ? "🎉 合作闖關大成功！"
            : "💥 挑戰翻車失敗！";
      } else if (isPvpTie || realWinIds.length === 0) {
        headline = "⚖️ 平手和局（完賽獎勵）！";
      } else {
        const winNames = realWinIds.map((id) => pMap[id]?.name || id).join("、");
        headline = `🏆 獲勝贏家：${winNames}${realWinIds.length > 1 ? "（並列獲勝）" : ""}`;
      }

      const tsMs = Date.parse(table.finished_at || table.updated_at || table.created_at || "");
      const timeStr = Number.isFinite(tsMs)
        ? window.PartyEngine.formatDateTimeFriendly(tsMs)
        : "";

      // 各款遊戲完整過程與數據回顧
      let processHtml = "";
      if (table.game_type === "ito_numbers") {
        const ord = gs.proposedOrder || parts.map((p) => p.id);
        const sec = gs.secretNumbers || {};
        const theme = gs.theme || {};
        processHtml = `
          ${theme.title ? `<div class="muted-xs" style="margin-bottom:6px;">🎯 主題：<b>${esc(theme.title)}</b>（${esc(theme.low || "")} ～ ${esc(theme.high || "")}）</div>` : ""}
          <div class="sub-label">🃏 全員翻牌順序揭曉：</div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            ${ord
              .map((pid, i) => {
                const prevNum = i > 0 ? sec[ord[i - 1]] : -999;
                const curNum = sec[pid];
                const ok = curNum === undefined || curNum >= prevNum;
                return `<div class="qd-multi-row" style="${ok ? "" : "border-color:rgba(251,113,133,0.65);background:rgba(225,29,72,0.14);"}">
                  <span>第 ${i + 1} 小：<b>${esc(pMap[pid]?.name || pid)}</b></span>
                  <b class="${ok ? "gold-text" : ""}" style="${ok ? "" : "color:#fda4af;"}">🎯 ${curNum ?? "?"} ${ok ? "✅" : "❌排錯"}</b>
                </div>`;
              })
              .join("")}
          </div>
        `;
      } else if (table.game_type === "quick_draw") {
        const wins = gs.wins || {};
        const rLogs = gs.roundLogs || [];
        processHtml = `
          <div class="sub-label">⚡ 搶 2 勝總比分：${parts.map((p) => `${esc(p.name)} <b>${wins[p.id] || 0}勝</b>`).join(" ｜ ")}</div>
          ${
            rLogs.length > 0
              ? rLogs
                  .map(
                    (rl, idx) => `<div class="qd-multi-row" style="flex-direction:column;align-items:flex-start;gap:3px;margin-top:4px;">
                      <div style="font-weight:800;color:#fde047;">第 ${idx + 1} 把（${rl.mode === "blind10" ? "盲按10s" : "西部拔槍"}）${rl.winnerId ? `➜ 🏆 ${esc(pMap[rl.winnerId]?.name || rl.winnerId)} 拿 1 勝` : "➜ 重賽"}</div>
                      <div class="muted-xs">${Object.entries(rl.times || {})
                        .map(([pid, v]) => {
                          const nm = pMap[pid]?.name || pid;
                          if (rl.mode === "blind10") return v < 0 ? `${nm}:棄權` : `${nm}:${(v / 1000).toFixed(3)}s`;
                          return v < 0 ? `${nm}:偷跑` : `${nm}:${v}ms`;
                        })
                        .join(" ｜ ")}</div>
                    </div>`
                  )
                  .join("")
              : ""
          }
        `;
      } else if (table.game_type === "number_bomb") {
        const secret =
          gs.secretRevealed ??
          (gs.secretMask !== undefined && gs.salt !== undefined ? gs.secretMask ^ gs.salt : gs.secret);
        const gLogs = gs.guessLogs || [];
        processHtml = `
          <div style="font-weight:800;color:#fda4af;margin-bottom:6px;">💣 本局炸彈密碼：<b>${esc(secret ?? "?")}</b> ｜ ${esc(gs.lastLog || "")}</div>
          ${
            gLogs.length > 0
              ? `<div class="muted-xs">喊數紀錄：${gLogs.map((g) => `${esc(g.name)}(${g.boom ? `💥${g.val}` : g.val})`).join(" ➜ ")}</div>`
              : ""
          }
        `;
      } else if (table.game_type === "rps_king") {
        const wins = gs.wins || {};
        const rLogs = gs.roundLogs || [];
        processHtml = `
          <div class="sub-label">✊ 猜拳總比分：${parts.map((p) => `${esc(p.name)} <b>${wins[p.id] || 0}勝</b>`).join(" vs ")}</div>
          ${
            rLogs.length > 0
              ? `<div class="muted-xs" style="display:flex;flex-direction:column;gap:3px;">
                   ${rLogs.map((m, i) => `<div>第 ${i + 1} 拳：${esc(m)}</div>`).join("")}
                 </div>`
              : gs.lastRoundMsg
              ? `<div class="muted-xs">${esc(gs.lastRoundMsg)}</div>`
              : ""
          }
        `;
      } else if (table.game_type === "soul_sync_2v2") {
        const sc = gs.scores || {};
        const qs = gs.questions || [];
        const ansAll = gs.answers || {};
        processHtml = `
          <div class="sub-label">${parts.length <= 2 ? `💞 2人合作默契命中：<b>${sc.team_A || 0} / ${qs.length || 8} 題</b>` : `🅰️ A組 <b>${sc.team_A || 0} 分</b> vs 🅱️ B組 <b>${sc.team_B || 0} 分</b>`}</div>
          ${
            qs.length > 0
              ? `<details style="margin-top:6px;">
                   <summary class="muted-xs" style="cursor:pointer;color:#7dd3fc;">▾ 點此展開 8 題完整作答明細</summary>
                   <div style="margin-top:6px;display:flex;flex-direction:column;gap:5px;">
                     ${qs
                       .map((q, qi) => {
                         const aMap = ansAll[qi] || {};
                         const picks = parts
                           .map((p) => {
                             const c = aMap[p.id];
                             return `${esc(p.name)}:${c !== undefined ? `${["A", "B", "C", "D"][c]}(${esc(q.options?.[c] || "")})` : "-"}`;
                           })
                           .join(" ｜ ");
                         return `<div class="qd-multi-row" style="flex-direction:column;align-items:flex-start;gap:2px;">
                           <div style="font-size:12.5px;font-weight:700;">Q${qi + 1}. ${esc(q.q)}</div>
                           <div class="muted-xs">${picks}</div>
                         </div>`;
                       })
                       .join("")}
                   </div>
                 </details>`
              : ""
          }
        `;
      } else if (table.game_type === "five_seconds") {
        const sc = gs.scores || {};
        const tLogs = gs.turnLogs || [];
        processHtml = `
          <div class="sub-label">⏱️ 3 輪總得分：${parts.map((p) => `${esc(p.name)} <b>${sc[p.id] || 0}分</b>`).join(" ｜ ")}</div>
          ${
            tLogs.length > 0
              ? `<details style="margin-top:6px;">
                   <summary class="muted-xs" style="cursor:pointer;color:#7dd3fc;">▾ 展開各題挑戰與共識投票紀錄 (${tLogs.length} 題)</summary>
                   <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
                     ${tLogs
                       .map(
                         (tl, i) => `<div class="muted-xs">
                           #${i + 1} <b>${esc(pMap[tl.playerId]?.name || tl.playerId)}</b>「${esc(tl.prompt || "")}」➜ ${tl.passed ? "✅過關(+1)" : "❌失敗(+0)"}${tl.voteTxt ? `（${esc(tl.voteTxt)}）` : ""}
                         </div>`
                       )
                       .join("")}
                   </div>
                 </details>`
              : ""
          }
        `;
      }

      // 整理本桌每位參賽者與應援觀眾的積分變動
      const tLedgers = (ctx.ledger || []).filter((l) => l.meta?.tableId === table.id);
      const tCheers = (ctx.cheers || []).filter((c) => c.table_id === table.id);
      const netMap = {};
      const tagMap = {};
      parts.forEach((p) => {
        netMap[p.id] = 0;
        tagMap[p.id] = table.is_test_run ? "練習局" : p.isScoring ? "參賽" : "陪玩0分";
      });
      tCheers.forEach((c) => {
        if (netMap[c.supporter_id] === undefined) netMap[c.supporter_id] = 0;
        tagMap[c.supporter_id] = `場邊應援(${c.pick_label})`;
      });
      tLedgers.forEach((l) => {
        netMap[l.player_id] = (netMap[l.player_id] || 0) + (Number(l.delta) || 0);
      });

      return `
        <div class="reveal-card" style="border-color:rgba(251,191,36,0.6);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
            <div style="font-size:17px;font-weight:900;color:#fef08a;">${esc(headline)}</div>
            ${timeStr ? `<span class="muted-xs">🕒 ${esc(timeStr)}</span>` : ""}
          </div>
          ${processHtml ? `<div style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(148,163,184,0.25);">${processHtml}</div>` : ""}
          <div style="margin-top:10px;padding-top:8px;border-top:1px dashed rgba(148,163,184,0.25);">
            <div class="sub-label">💰 本局積分變動明細：</div>
            <div class="audit-delta-chips">
              ${Object.entries(netMap)
                .map(([pid, net]) => {
                  const nm = pMap[pid]?.name || pid;
                  const cls = net > 0 ? "pos" : net < 0 ? "neg" : "";
                  const sign = net > 0 ? `+${net}` : `${net}`;
                  return `<span class="delta-chip ${cls}">${esc(nm)} ${sign} PT · ${esc(tagMap[pid] || "")}</span>`;
                })
                .join("")}
            </div>
          </div>
        </div>
      `;
    },

    // ==================== 1. ⚡ 手機毫秒決鬥 (搶 2 勝制，支援 2～16 人同時開戰！) ====================
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
      const wins = gs.wins || {};
      const localDraw = this.localDrawState[table.id];
      const activeLocal =
        localDraw && localDraw.roundSeq === roundSeq ? localDraw : null;
      const canSwitchMode =
        isHost && !activeLocal && Object.keys(times).length === 0 && roundSeq === 1;
      const potPreview = table.is_test_run
        ? "0 PT (練習)"
        : `${Math.round((table.participants || []).length * (Number(table.entry_pts) || 20) * (table.is_happy_hour ? 1.5 : 1))} PT`;
      const playerMap = {};
      (ctx?.players || []).forEach((p) => (playerMap[p.id] = p));
      parts.forEach((p) => {
        if (!playerMap[p.id]) playerMap[p.id] = p;
      });

      const scoreBarHtml = `
        <div class="rps-score" style="margin-bottom:8px;flex-wrap:wrap;gap:6px;font-size:13.5px;">
          <span class="gold-text">🏆 搶 2 勝奪冠（第 ${roundSeq} 把）</span>
          <span>${parts.map((p) => `${esc(p.name)} <b>${wins[p.id] || 0}/2勝</b>`).join(" ｜ ")}</span>
        </div>
        ${
          gs.lastRound && gs.lastRound.msg
            ? `<div class="toast-inline" style="margin-bottom:8px;font-size:12.5px;">
                 <div><b>📣 上一把結果：</b>${esc(gs.lastRound.msg)}</div>
                 ${
                   gs.lastRound.times
                     ? `<div class="muted-xs" style="margin-top:2px;">${Object.entries(gs.lastRound.times)
                         .map(([pid, v]) => {
                           const nm = playerMap[pid]?.name || pid;
                           if (gs.lastRound.mode === "blind10") return v < 0 ? `${nm}:棄權` : `${nm}:${(v / 1000).toFixed(3)}s`;
                           return v < 0 ? `${nm}:偷跑` : `${nm}:${v}ms`;
                         })
                         .join(" ｜ ")}</div>`
                     : ""
                 }
               </div>`
            : ""
        }
      `;

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
              <span class="gold-text" style="font-size:12.5px;">🏆 總榮譽池：${potPreview}</span>
            </div>
            ${scoreBarHtml}
            <div class="muted-xs" style="margin:4px 0 8px;">
              ⚡ 等螢幕變紅秒按（偷跑淘汰）｜全員按完同步開牌，先搶 <b>2 勝</b>奪冠！
            </div>
            ${
              myTime !== undefined
                ? `<div class="locked-cheer-msg" style="text-align:center;margin:10px 0;">
                    ${myTime === -2 ? "🏳️ 已棄權" : myTime < 0 ? "❌ 這把偷跑犯規淘汰啦！" : `⚡ 這把你的純反應速度：<b class="gold-text">${myTime} ms</b>！`}
                    （本把已完成 ${tappedCnt}/${parts.length} 人）
                  </div>`
                : !amIn
                ? `<div class="muted-sm" style="text-align:center;margin:10px 0;">👀 選手正在進行第 ${roundSeq} 把拔槍反應測試（已完成 ${tappedCnt}/${parts.length} 人，全數按完自動開牌揭曉毫秒數）…</div>`
                : !activeLocal
                ? `<button class="btn btn-gold" style="width:100%;" onclick="PartyGamesUI.qdStartLocalDraw('${table.id}')">
                    🔫 點擊進入第 ${roundSeq} 把拔槍待命（等變紅秒按！）
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
                      : allTapped || (amIn && p.id === me.id)
                      ? v === -2
                        ? "<span class='muted-xs'>🏳️ 棄權</span>"
                        : v < 0
                        ? "<span style='color:#fda4af;'>❌ 偷跑淘汰</span>"
                        : `<b class="gold-text">⚡ ${v} ms</b>`
                      : "🔒 已完成拔槍（等全員按完同步開牌）";
                  return `<div class="qd-multi-row"><span><b>${esc(p.name)}</b> <small class="muted-xs">(${wins[p.id] || 0}/2勝)</small></span><span>${txt}</span></div>`;
                })
                .join("")}
            </div>
            ${
              isHost && hasValidScore && tappedCnt < parts.length
                ? `<button class="btn btn-secondary btn-xs" style="width:100%;margin-top:8px;" onclick="PartyGamesUI.qdForceSettle('${table.id}')">
                    🏁 有人離席未按？截止本把計分
                  </button>`
                : ""
            }
          </div>
        `;
      } else {
        // 盲按 10.000 秒精準王 (2~16人，搶 2 勝)
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
              <span class="gold-text" style="font-size:12.5px;">🏆 總榮譽池：${potPreview}</span>
            </div>
            ${scoreBarHtml}
            <div class="muted-xs" style="margin:4px 0 8px;">⏱️ 滿 3 秒自動蓋牌，最接近 <b>10.000 秒</b>拿 1 勝，先搶 <b>2 勝</b>奪冠！（已完成 ${doneCnt}/${parts.length} 人）</div>
            ${
              amIn && myVal === undefined
                ? !localStart
                  ? `<button class="btn btn-gold" style="width:100%;" onclick="PartyGamesUI.startBlind10('${table.id}')">▶️ 開始第 ${roundSeq} 把 10.000 秒挑戰</button>`
                  : `<div class="qd-pad fired" id="blind10-pad-${table.id}" onclick="PartyGamesUI.stopBlind10('${table.id}')">
                      <div id="blind10-display-${table.id}" style="font-size:32px;font-weight:900;">計時中…點此拍停！</div>
                      <div class="muted-xs">目標：10.000 秒</div>
                    </div>`
                : !amIn
                ? `<div class="muted-sm" style="text-align:center;margin:8px 0;">👀 選手正在盲按挑戰中（已完成 ${doneCnt}/${parts.length} 人，全數按完同步揭曉秒數）…</div>`
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
                      : allDone || (amIn && p.id === me.id)
                      ? `<b class="gold-text">${(v / 1000).toFixed(3)}s</b> <small class="muted-xs">(差 ${(Math.abs(v - 10000) / 1000).toFixed(3)}s)</small>`
                      : "🔒 已拍停鎖定（等全員按完同步開牌）";
                  return `<div class="qd-multi-row"><span><b>${esc(p.name)}</b> <small class="muted-xs">(${wins[p.id] || 0}/2勝)</small></span><span>${txt}</span></div>`;
                })
                .join("")}
            </div>
            ${
              isHost && doneCnt >= 1 && !allDone
                ? `<button class="btn btn-secondary btn-xs" style="width:100%;margin-top:8px;" onclick="PartyGamesUI.qdForceSettle('${table.id}')">
                    🏁 有人離席未按？截止本把計分
                  </button>`
                : ""
            }
          </div>
        `;
      }
    },

    // ==================== 2. 💣 終極密碼死鬥（一爆即結束！） ====================
    renderNumberBomb(table, gs, me, amIn, playerMap) {
      const alive = (gs.aliveIds || table.participants.filter((p) => !p.forfeited).map((p) => p.id)).filter(Boolean);
      const turnIdx = alive.length > 0 ? (gs.turnIdx || 0) % alive.length : 0;
      const turnPlayerId = alive[turnIdx];
      const turnPlayer = playerMap[turnPlayerId] || table.participants.find((p) => p.id === turnPlayerId) || { name: turnPlayerId };
      const low = gs.low ?? 0;
      const high = gs.high ?? 100;
      const isMyTurn = amIn && turnPlayerId === me.id;
      const onlyOneLeft = high - low === 2;
      const forcedNum = low + 1;
      const gLogs = gs.guessLogs || [];

      return `
        <div class="mini-game-box">
          <div class="bomb-range">${low} <span class="muted-sm">～</span> ? <span class="muted-sm">～</span> ${high}</div>
          <div class="muted-sm" style="text-align:center;margin-bottom:8px;">
            出牌順序：${alive
              .map((id, idx) => {
                const nm = esc(playerMap[id]?.name || table.participants.find((p) => p.id === id)?.name || id);
                return idx === turnIdx
                  ? `<b class="gold-text" style="text-decoration:underline;">👉 ${nm}</b>`
                  : nm;
              })
              .join(" ➜ ")}
          </div>
          ${ gs.lastLog ? `<div class="toast-inline" style="margin-bottom:8px;">${esc(gs.lastLog)}</div>` : "" }
          ${
            onlyOneLeft
              ? `<div class="toast-inline" style="border-color:rgba(251,113,133,0.65);color:#fda4af;text-align:center;margin-bottom:8px;">
                   😱 前後包夾！全場只剩唯一數字 <b>${forcedNum}</b>，輪到 ${esc(turnPlayer.name)} 面對命運！
                 </div>`
              : ""
          }
          ${
            isMyTurn
              ? `<div class="my-cheer-tag" style="text-align:center;margin-bottom:6px;border-color:rgba(251,191,36,0.65);color:#fde047;">
                   🔥 輪到你出數字！請輸入 <b>${low + 1} ～ ${high - 1}</b> 之間的整數
                 </div>
                 <div class="bomb-input-row">
                  <input type="number" inputmode="numeric" pattern="[0-9]*" id="bomb-val-${table.id}" class="input-dark" min="${low + 1}" max="${high - 1}" value="${onlyOneLeft ? forcedNum : ""}" placeholder="輸入 ${low + 1} ～ ${high - 1}" onkeydown="if(event.key==='Enter') PartyGamesUI.submitBombGuess('${table.id}')">
                  <button class="btn btn-gold" onclick="PartyGamesUI.submitBombGuess('${table.id}')">💣 送出</button>
                </div>`
              : `<div class="muted-xs" style="text-align:center;">⏳ 等待 <b>${esc(turnPlayer.name)}</b> 輸入 ${low + 1} ～ ${high - 1} 之間的數字…</div>`
          }
          ${
            gLogs.length > 0
              ? `<div class="muted-xs" style="margin-top:8px;padding-top:6px;border-top:1px dashed rgba(148,163,184,0.2);">
                   📜 已喊紀錄：${gLogs.slice(-6).map((g) => `${esc(g.name)}(${g.val})`).join(" ➜ ")}
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
            <span class="muted-sm">搶 3 勝（第 ${roundSeq} 拳）</span>
            <span><b>${wins[p2?.id] || 0}</b> ${esc(p2?.name)}</span>
          </div>
          ${ gs.lastRoundMsg ? `<div class="toast-inline" style="text-align:center;margin-top:6px;">${esc(gs.lastRoundMsg)}</div>` : "" }
          <div class="muted-xs" style="text-align:center;margin-top:6px;">
            本拳狀態：${esc(p1?.name)} ${moves[p1?.id] ? "✅已出拳" : "⏳思考中"} ｜ ${esc(p2?.name)} ${moves[p2?.id] ? "✅已出拳" : "⏳思考中"}
          </div>
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
                  ${myMove ? "✅ 已暗中選拳（對手出拳前點別顆可改拳），雙方選完同步開牌！" : "請在手機上選擇這回合要出的拳，雙方選完自動開牌（搶 3 勝自動發放積分）！"}
                </div>`
              : `<div class="muted-xs" style="text-align:center;margin-top:6px;">👀 雙方皆暗中選好拳後將自動開牌揭曉本拳勝負！</div>`
          }
        </div>
      `;
    },

    // ==================== 4. 🤝 2v2 靈魂默契快問快答 (鎖定前皆可改答案！) ====================
    renderSoulSync(table, gs, me, amIn, playerMap, ctx) {
      const questions = gs.questions || [];
      const qIdx = gs.qIdx || 0;
      const curQ = questions[qIdx];
      const sKey = `ss_q${qIdx}`;
      const draftKey = `${table.id}_${qIdx}`;
      const answers = { ...((gs.answers && gs.answers[qIdx]) || {}) };
      (ctx?.themeResponses || []).forEach((r) => {
        if (r.session_id === table.id && r.step_key === sKey && r.payload?.choice !== undefined && !r.payload?.unlocked) {
          answers[r.player_id] = Number(r.payload.choice);
        }
      });
      const scores = gs.scores || { team_A: 0, team_B: 0 };
      const isCoop2 = table.participants.length === 2;

      if (!curQ) {
        return `<div class="mini-game-box">題目載入完畢，結算中…</div>`;
      }

      const myLockedAns = answers[me.id];
      const isEditing = this.editingSoulKey === draftKey;
      const myDraft =
        this.localSoulDraft[draftKey] !== undefined
          ? this.localSoulDraft[draftKey]
          : myLockedAns;

      const myEntry = table.participants.find((p) => p.id === me.id);
      const teamAList = table.participants.filter((p) => p.team === "team_A");
      const teamBList = table.participants.filter((p) => p.team === "team_B");
      const myPartner =
        !isCoop2 && myEntry
          ? table.participants.find((p) => p.team === myEntry.team && p.id !== me.id)
          : null;

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
          ${
            !isCoop2
              ? `<div class="muted-xs" style="margin-top:5px;padding:5px 8px;border-radius:8px;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.16);display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
                   <span>🅰️ A組：<b>${teamAList.map((p) => esc(p.name)).join(" & ")}</b> ｜ 🅱️ B組：<b>${teamBList.map((p) => esc(p.name)).join(" & ")}</b></span>
                   ${myPartner ? `<span style="color:#fde047;">🤝 你的搭檔：<b>${esc(myPartner.name)}</b></span>` : ""}
                 </div>`
              : ""
          }
          ${
            gs.lastQResult && gs.lastQResult.summaryTxt
              ? `<div class="toast-inline" style="margin-top:6px;font-size:12px;">
                   <b>上一題開牌：</b>${esc(gs.lastQResult.summaryTxt)}
                 </div>`
              : ""
          }
          <div class="q-title">${esc(curQ.q)}</div>
          <div class="opt-grid">
            ${curQ.options
              .map((opt, idx) => {
                const selected = amIn && ((myLockedAns !== undefined && !isEditing ? myLockedAns : myDraft) === idx);
                const disabled = !amIn || (myLockedAns !== undefined && !isEditing);
                return `<button class="opt-btn ${selected ? "selected" : ""}" ${disabled ? "disabled" : ""} onclick="PartyGamesUI.pickSoulDraft('${table.id}', ${qIdx}, ${idx})">
                  <b>${["A", "B", "C", "D"][idx]}.</b> ${esc(opt)}
                </button>`;
              })
              .join("")}
          </div>
          ${
            amIn
              ? myLockedAns !== undefined && !isEditing
                ? `<div class="locked-cheer-msg" style="margin-top:10px;text-align:center;">
                     <div>🔒 你已鎖定選項 <b>${["A", "B", "C", "D"][myLockedAns]}</b>！等待其他選手鎖定中…</div>
                     <button type="button" class="btn btn-ghost btn-xs" style="margin-top:6px;border-color:rgba(251,191,36,0.55);color:#fde047;" onclick="PartyGamesUI.unlockSoulDraft('${table.id}', ${qIdx}, ${myLockedAns})">
                       ↺ 開牌前修改答案
                     </button>
                   </div>`
                : `<div style="display:flex;gap:8px;margin-top:10px;">
                     ${
                       myLockedAns !== undefined
                         ? `<button type="button" class="btn btn-ghost btn-sm" onclick="PartyGamesUI.editingSoulKey='';PartyApp.render();">取消</button>`
                         : ""
                     }
                     <button type="button" class="btn btn-gold" style="flex:1;" ${myDraft === undefined ? "disabled" : ""} onclick="PartyGamesUI.answerSoulSync('${table.id}')">
                       🔒 ${myLockedAns !== undefined ? "更新鎖定本題答案" : "確認鎖定本題答案"}
                     </button>
                   </div>`
              : `<div class="muted-xs" style="text-align:center;margin-top:8px;">👀 等待全體選手鎖定答案後自動同步開牌揭曉！</div>`
          }
          <div class="muted-xs" style="margin-top:8px;">
            已鎖定：${table.participants
              .filter((p) => answers[p.id] !== undefined)
              .map((p) => esc(p.name))
              .join("、") || "等待鎖定中…"}（${table.participants.filter((p) => answers[p.id] !== undefined).length}/${table.participants.length}）
          </div>
        </div>
      `;
    },

    // ==================== 5. 🔢 數字順風耳 ito（左／中／右三區塊清晰排版！） ====================
    renderIto(table, gs, me, amIn, isHost, playerMap) {
      const secretMap = gs.secretNumbers || {};
      const myNum = secretMap[me.id];
      const order = gs.proposedOrder || table.participants.map((p) => p.id);
      const theme = gs.theme || { title: "荒島求生物品實用度", low: "1：廢物", high: "100：神器" };
      const pCnt = table.participants.length;
      const baseNet = window.PartyEngine.getItoBaseNetProfit(pCnt);
      const cleanLow = String(theme.low || "").replace(/^1\s*[:：]\s*/, "");
      const cleanHigh = String(theme.high || "").replace(/^100\s*[:：]\s*/, "");

      return `
        <div class="mini-game-box">
          <div class="q-title">🔢 本局主題：${esc(theme.title)}</div>
          <div class="muted-xs" style="margin-bottom:6px;color:#fcd34d;">
            🤝 ${pCnt} 人合作闖關：全員由小排到大成功每人淨賺 <b>+${baseNet} PT</b>（排錯則扣除門票積分）！
          </div>

          <!-- e: 左／中／右三個獨立清晰文字區塊 -->
          <div class="spectrum-3col">
            <div class="spec-col spec-low">
              <div class="spec-tag">最小端 1</div>
              <div class="spec-txt">${esc(cleanLow || theme.low)}</div>
            </div>
            <div class="spec-col spec-mid">
              <div class="spec-tag">🗣️ 暗示規則</div>
              <div class="spec-mid-hint">口頭舉例形容<br>禁說數字<br>由小 ➔ 排到大</div>
            </div>
            <div class="spec-col spec-high">
              <div class="spec-tag">最大端 100</div>
              <div class="spec-txt">${esc(cleanHigh || theme.high)}</div>
            </div>
          </div>

          ${
            amIn && myNum !== undefined
              ? `<div class="peek-card" onclick="this.classList.toggle('revealed')">
                  <span class="peek-hint">🙈 點擊翻開／蓋住你的秘密數字卡（僅你自己可見）</span>
                  <span class="peek-secret">你的秘密數字：<b>${myNum}</b></span>
                </div>`
              : `<div class="muted-xs" style="text-align:center;margin:6px 0;">🙈 選手各自的秘密數字將於鎖定順序翻牌時同步揭曉！</div>`
          }

          <div class="sub-label" style="margin-top:10px;">
            ${
              isHost || gs.revealed
                ? "👇 討論完後，由小排到大調整順序並開牌："
                : `👇 目前暫定順序（請口頭討論，由桌長【${esc(playerMap[table.host_id]?.name || table.participants.find((x) => x.id === table.host_id)?.name || "桌長")}】調整順序並開牌）：`
            }
          </div>
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
              : !gs.revealed
              ? `<div class="muted-xs" style="text-align:center;margin-top:8px;color:#fcd34d;">👑 等待桌長 <b>${esc(playerMap[table.host_id]?.name || table.participants.find((x) => x.id === table.host_id)?.name || "桌長")}</b> 確認最終順序並按下翻牌開獎…</div>`
              : ""
          }
        </div>
      `;
    },

    cleanFiveSecPrompt(raw) {
      return String(raw || "")
        .replace(/^\s*[58]\s*秒(?:內|鐘內)?(?:快嘴)?(?:講出|說出|舉出|答出|喊出)?\s*3\s*[個種部首樣款道項位名隻件台顆條座間家]\s*/u, "")
        .replace(/^\s*(?:講出|說出|舉出)\s*3\s*[個種部首樣款道項位名隻件台顆條座間家]\s*/u, "")
        .replace(/[！!。]+$/u, "")
        .trim();
    },

    // ==================== 6. ⏱️ 8 秒不詞窮（極簡秒讀題卡 ＋ 8.0 秒倒數 ＋ 3人以上共識投票 ＋ 平票算輸！） ====================
    renderFiveSeconds(table, gs, me, amIn, playerMap) {
      const ctx = window.PartyApp.getContext();
      const parts = table.participants;
      const activeParts = parts.filter((p) => !p.forfeited);
      const totalTurns = parts.length * 3;
      const turn = gs.turn || 0;
      const scores = gs.scores || {};
      if (turn >= totalTurns) {
        return `<div class="mini-game-box">3 輪快嘴挑戰完成！正在結算最終贏家…</div>`;
      }
      const curPlayer = parts[turn % parts.length];
      const rawPrompt = (gs.prompts && gs.prompts[turn]) || "水果";
      const curPrompt = this.cleanFiveSecPrompt(rawPrompt) || String(rawPrompt);
      const startedAt = gs.turnStartedAt || 0;
      const remain = startedAt
        ? Math.max(0, (8000 - (window.PartyDB.serverNowMs - startedAt)) / 1000)
        : 8.0;

      if (startedAt && remain > 0 && !this.fiveSecTimer) {
        this.fiveSecTimer = setTimeout(() => {
          this.fiveSecTimer = null;
          if (window.PartyDB.serverNowMs - startedAt >= 8000) {
            window.PartyFX.playTone("fire");
            window.PartyFX.haptic("heavy");
          }
          window.PartyApp.render();
        }, 150);
      }

      const humanOpponents = activeParts.filter(
        (p) => p.id !== curPlayer.id && !String(p.id).startsWith("bot_")
      );
      const useConsensus = activeParts.length > 2 && humanOpponents.length >= 2;
      const vStepKey = `fs_t${turn}`;
      const voteMap = {};
      (ctx?.themeResponses || []).forEach((r) => {
        if (r.session_id === table.id && r.step_key === vStepKey && r.payload?.pass !== undefined) {
          voteMap[r.player_id] = Boolean(r.payload.pass);
        }
      });
      const myVote = voteMap[me.id];
      const votedCount = humanOpponents.filter((p) => voteMap[p.id] !== undefined).length;
      const canVote =
        amIn &&
        (curPlayer.id !== me.id ||
          activeParts.every((p) => p.id === me.id || String(p.id).startsWith("bot_")));

      return `
        <div class="mini-game-box">
          <div class="ss-top">
            <span class="badge-pill">第 ${Math.floor(turn / parts.length) + 1}/3 輪</span>
            <span class="gold-text">${parts.map((p) => `${esc(p.name)}:${scores[p.id] || 0}`).join(" ｜ ")}</span>
          </div>
          ${
            gs.lastJudge && gs.lastJudge.summary
              ? `<div class="toast-inline" style="margin-top:6px;font-size:12px;">${esc(gs.lastJudge.summary)}</div>`
              : ""
          }
          <div style="text-align:center;margin:8px 0;">
            挑戰者：<b style="font-size:18px;color:#fbbf24;">${esc(curPlayer.name)}</b>
            <span class="muted-xs" style="margin-left:6px;">（🎙️ 規則：8 秒內講滿 3 個）</span>
          </div>
          ${
            !startedAt
              ? amIn && curPlayer.id === me.id
                ? `<button class="btn btn-gold" style="width:100%;" onclick="PartyGamesUI.startFiveSecTurn('${table.id}')">🎙️ 翻開題目並啟動 8.0 秒倒數！</button>`
                : `<div class="muted-sm" style="text-align:center;">等待 ${esc(curPlayer.name)} 按下翻牌啟動 8.0 秒倒數…</div>`
              : `<div class="fs-topic-card">
                   <div class="fs-topic-rule">🎙️ 8 秒內講出 3 個：</div>
                   <div class="fs-topic-main">${esc(curPrompt)}</div>
                 </div>
                 <div class="timer-giant ${remain <= 0 ? "time-up" : ""}">${remain <= 0 ? "⏰ 8 秒時間到！" : `${remain.toFixed(1)} 秒`}</div>
                 ${
                   useConsensus
                     ? `<div style="margin-top:8px;">
                          <div class="muted-xs" style="text-align:center;margin-bottom:6px;color:#fcd34d;">
                            🗳️ 對手共識決投票（已投 ${votedCount}/${humanOpponents.length} 人｜過半投 ✅ 才得 1 分，平票算失敗 +0 分！）
                          </div>
                          ${
                            canVote
                              ? `<div class="grid-2-btns">
                                   <button class="btn ${myVote === true ? "btn-gold" : "btn-emerald"}" onclick="PartyGamesUI.voteFiveSec('${table.id}', ${turn}, true)">
                                     ${myVote === true ? "☑️ " : "✅ "}成功講滿 3 個
                                   </button>
                                   <button class="btn ${myVote === false ? "btn-gold" : "btn-danger"}" onclick="PartyGamesUI.voteFiveSec('${table.id}', ${turn}, false)">
                                     ${myVote === false ? "☑️ " : "❌ "}卡詞／超時
                                   </button>
                                 </div>
                                 ${myVote !== undefined ? `<div class="muted-xs" style="text-align:center;margin-top:4px;">✅ 已送出你的判定（其他對手投完前可改票）</div>` : ""}`
                              : `<div class="muted-xs" style="text-align:center;">等待全體對手（${humanOpponents.map((p) => `${esc(p.name)}${voteMap[p.id] !== undefined ? "✅" : "⏳"}`).join("、")}）完成共識投票！</div>`
                          }
                        </div>`
                     : canVote
                     ? `<div class="grid-2-btns" style="margin-top:8px;">
                          <button class="btn btn-emerald" onclick="PartyGamesUI.judgeFiveSec('${table.id}', true)">✅ 成功講滿 3 個 (+1)</button>
                          <button class="btn btn-danger" onclick="PartyGamesUI.judgeFiveSec('${table.id}', false)">❌ 卡詞／超時 (+0)</button>
                        </div>`
                     : `<div class="muted-xs" style="text-align:center;">由對手判定是否於 8 秒內成功講出 3 個答案！</div>`
                 }`
          }
        </div>
      `;
    },

    // ==================== 通用：參賽者申報與對手互認結算（Switch 支援複選多贏家平分榮譽池！） ====================
    toggleSwitchWinner(tableId, pid) {
      if (!this.localSwitchWinners[tableId]) {
        this.localSwitchWinners[tableId] = new Set();
      }
      const set = this.localSwitchWinners[tableId];
      if (set.has(pid)) set.delete(pid);
      else set.add(pid);
      window.PartyApp.render();
    },

    async submitSwitchWinners(tableId) {
      const picked = [...(this.localSwitchWinners[tableId] || [])];
      if (picked.length === 0) {
        window.PartyApp.toast("請至少點選 1 位本局獲勝贏家！");
        return;
      }
      delete this.localSwitchWinners[tableId];
      await this.proposeWinner(tableId, picked);
    },

    renderMutualSettlementBox(table, gameMeta, me, amIn, playerMap) {
      const proposed = table.proposed_winners;
      const confirmedBy = table.confirmed_by || [];

      if (proposed && proposed.length > 0) {
        const names = proposed
          .map((id) => (id === "__coop_fail__" ? "闖關失敗" : playerMap[id]?.name || id))
          .join("、");
        if (!amIn) {
          return `
            <div class="settle-confirm-box">
              <div>⚖️ 選手申報賽果：贏家為 <b class="gold-text">${esc(names)}</b>${proposed.length > 1 ? "（並列平分榮譽池）" : ""}</div>
              <div class="muted-xs" style="margin-top:4px;">⏳ 等待另一位參賽選手按下確認結算中…</div>
            </div>
          `;
        }
        const alreadyConfirmed = confirmedBy.includes(me.id);
        return `
          <div class="settle-confirm-box">
            <div>⚖️ 待確認賽果：贏家為 <b class="gold-text">${esc(names)}</b>${proposed.length > 1 ? `（${proposed.length} 人並列平分榮譽池）` : ""}</div>
            <div class="muted-xs" style="margin:4px 0 8px;">需另一位參賽選手按下確認，即自動發放獎勵積分！</div>
            <div class="host-row">
              ${
                !alreadyConfirmed
                  ? `<button class="btn btn-emerald" onclick="PartyGamesUI.confirmWinner('${table.id}')">✅ 確認無誤・發放獎勵積分</button>`
                  : `<span class="muted-sm">⏳ 已送出，等待對手按確認…</span>`
              }
              <button class="btn btn-ghost btn-sm" onclick="PartyGamesUI.resetProposal('${table.id}')">重選贏家</button>
            </div>
          </div>
        `;
      }

      if (table.game_type !== "switch_free") return "";
      if (!amIn) {
        return `
          <div class="mini-game-box" style="text-align:center;">
            <div style="font-size:24px;margin-bottom:4px;">🎮📺</div>
            <div style="font-weight:800;color:#fde047;">選手正在實體 Switch 主機激戰中！</div>
            <div class="muted-xs" style="margin-top:4px;">完賽後將由選手點選本局贏家並於此畫面即時揭曉結果！</div>
          </div>
        `;
      }

      const activeParts = (table.participants || []).filter((p) => !p.forfeited);
      const pickedSet = this.localSwitchWinners[table.id] || new Set();
      const hhMult = table.is_happy_hour ? 1.5 : 1;
      const fullPot = Math.round(
        Math.max(30, Math.min(8, (table.participants || []).length) * (Number(table.entry_pts) || 15)) *
          hhMult
      );
      const allSelectedAsTie =
        pickedSet.size > 0 && activeParts.length >= 2 && pickedSet.size >= activeParts.length;
      const perWinShare =
        pickedSet.size > 0
          ? Math.max(Math.round(20 * hhMult), Math.floor(fullPot / pickedSet.size))
          : fullPot;

      return `
        <details class="manual-settle-details" open>
          <summary>🏆 Switch 比賽結束：點選本局贏家（可複選多位並列第 1！）</summary>
          <div class="muted-xs" style="margin-top:6px;">點選 1 位獨得冠軍榮譽分；若多人同分並列第 1 可同時勾選多位均分：</div>
          <div class="cheer-btn-grid" style="margin-top:8px;">
            ${activeParts
              .map((p) => {
                const sel = pickedSet.has(p.id);
                return `<button type="button" class="btn ${sel ? "btn-gold" : "btn-secondary"} btn-sm" onclick="PartyGamesUI.toggleSwitchWinner('${table.id}', '${esc(p.id)}')">
                  ${sel ? "☑️ " : "⬜ "}🏆 ${esc(p.name)}
                </button>`;
              })
              .join("")}
          </div>
          <button type="button" class="btn btn-gold" style="width:100%;margin-top:10px;" ${pickedSet.size === 0 ? "disabled" : ""} onclick="PartyGamesUI.submitSwitchWinners('${table.id}')">
            ${
              pickedSet.size === 0
                ? "請先點選上方獲勝贏家"
                : allSelectedAsTie
                ? "⚖️ 全員並列平手（送出確認平手完賽）"
                : table.is_test_run
                ? `🏆 送出 ${pickedSet.size} 位贏家完賽 (練習局0分)`
                : `🏆 送出 ${pickedSet.size} 位贏家請對手確認（每人 +${perWinShare} PT）`
            }
          </button>
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
      const isWarmup = ctx.sceneInfo?.scene === "pre_event";
      this.forceModalTestOnly = Boolean(forceTestOnly || isWarmup);
      if (isWarmup) {
        this.activeModalTestMode = true;
        this.activeCountdownMin = 1;
      } else if (this.forceModalTestOnly) {
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
      const isWarmup = ctx.sceneInfo?.scene === "pre_event";
      const testUsed = isWarmup
        ? 0
        : window.PartyEngine.getTestHostUsage(ctx.me.id, gameId, ctx.tables, ctx.me);
      if (this.forceModalTestOnly || isWarmup) {
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
      const isWarmup = ctx.sceneInfo?.scene === "pre_event";

      const selectedMeta =
        CFG.PARTY_GAMES.find((x) => x.id === this.activeModalGame) || CFG.PARTY_GAMES[0];
      const selTestUsed = isWarmup
        ? 0
        : window.PartyEngine.getTestHostUsage(
            ctx.me.id,
            selectedMeta.id,
            ctx.tables,
            ctx.me
          );
      const isTestMode =
        isWarmup || this.forceModalTestOnly || (this.activeModalTestMode && selTestUsed < 1);
      const testQuotaExhausted = !isWarmup && this.forceModalTestOnly && selTestUsed >= 1;

      box.innerHTML = `
        <div class="modal-head">
          <h3>${isWarmup ? "🎮 開啟派對暖身練習局" : this.forceModalTestOnly ? "🧪 開啟新手免費測試局" : "➕ 建立 Party Game 賽桌"}</h3>
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
              ctx.cheers
            );
            const tUsed = isWarmup
              ? 0
              : window.PartyEngine.getTestHostUsage(ctx.me.id, gm.id, ctx.tables, ctx.me);
            const isScoring = u.playCount < g.maxScoringPlaysPerGamePerDay;
            return `
              <div class="create-game-item ${this.activeModalGame === gm.id ? "active" : ""}"
                   onclick="PartyGamesUI.selectModalGame('${gm.id}')">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                  <b>${gm.icon} ${esc(gm.name)}</b>
                  <div style="display:flex;gap:4px;">
                    ${
                      isWarmup
                        ? `<span class="q-tag q-ok">🎮 免費暢玩</span>`
                        : tUsed < 1
                        ? `<span class="q-tag q-ok">🧪 測試 0/1</span>`
                        : this.forceModalTestOnly
                        ? `<span class="q-tag q-muted">✅ 已完成試玩</span>`
                        : ""
                    }
                    ${
                      !this.forceModalTestOnly && !isWarmup
                        ? `<span class="q-tag ${isScoring ? "q-cheer" : "q-muted"}">
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
          !isWarmup && !this.forceModalTestOnly && selTestUsed < 1
            ? `<div class="sub-label" style="margin-top:10px;">2. 選擇模式（此款剩 1 次免費測試機會）：</div>
               <div class="grid-2-btns">
                 <button class="btn ${isTestMode ? "btn-primary" : "btn-secondary"} btn-sm"
                   onclick="PartyGamesUI.activeModalTestMode=true;PartyGamesUI.renderCreateModalInner();">
                   🧪 免費測試局 (0分)
                 </button>
                 <button class="btn ${!isTestMode ? "btn-gold" : "btn-secondary"} btn-sm"
                   onclick="PartyGamesUI.activeModalTestMode=false;PartyGamesUI.renderCreateModalInner();">
                   ⚔️ 正式計分桌 (免費參賽)
                 </button>
               </div>`
            : ""
        }

        <div class="sub-label" style="margin-top:12px;">${!isWarmup && !this.forceModalTestOnly && selTestUsed < 1 ? "3." : "2."} 集結倒數時間（1～3 分鐘）：</div>
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
          <div class="muted-xs" style="margin-bottom:4px;">💡 選填備註（例：瑪利歐賽車彩虹賽道／大亂鬥）</div>
          <input type="text" id="custom-table-note" class="input-dark" placeholder="輸入賽桌備註（選填）">
        </div>

        ${
          testQuotaExhausted
            ? `<div class="locked-cheer-msg" style="margin-top:12px;text-align:center;">✅ 你已體驗過【${esc(selectedMeta.name)}】的 1 次免費測試局囉！請點上方選擇其他尚未試玩的遊戲。</div>`
            : `<button class="btn ${isTestMode ? "btn-primary" : "btn-gold"}" style="width:100%;margin-top:14px;" onclick="PartyGamesUI.confirmCreateTable()">
                 ${isWarmup ? "🎮 開啟免費暖身局（可揪人或補 AI 陪練）" : isTestMode ? "🧪 開啟免費測試局（可揪人或補 AI 陪練）" : "📢 開桌並推播通知全場！"}
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
        const isWarmup = ctx.sceneInfo?.scene === "pre_event";
        const gm = CFG.PARTY_GAMES.find((x) => x.id === this.activeModalGame) || CFG.PARTY_GAMES[0];
        const testUsed = isWarmup
          ? 0
          : window.PartyEngine.getTestHostUsage(ctx.me.id, gm.id, ctx.tables, ctx.me);
        const isTestRun = Boolean(
          isWarmup || this.forceModalTestOnly || (this.activeModalTestMode && testUsed < 1)
        );
        if (!isWarmup && this.forceModalTestOnly && testUsed >= 1) {
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
          ctx.cheers
        );
        const isScoring = isTestRun ? false : usage.playCount < g.maxScoringPlaysPerGamePerDay;
        const entryPts = Number(g.partyEntryPts) || 15;
        const countdownSec = this.activeCountdownMin * 60;
        const opensUntil = new Date(window.PartyDB.serverNowMs + countdownSec * 1000).toISOString();
        const tableId = `tbl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        const baseTitle = note ? `${gm.name}（${note}）` : gm.name;
        const title = isWarmup ? `[暖身] ${baseTitle}` : isTestRun ? `[測試] ${baseTitle}` : baseTitle;
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
            is_warmup: isWarmup,
            is_happy_hour: !isTestRun && ctx.sceneInfo.scene === "happy_hour",
            entry_pts: isTestRun ? 0 : entryPts,
            cheer_pts: g.partyCheerPts || 10,
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
          if (cur.is_test_run && !cur.is_warmup) {
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
            ctx.cheers
          );
          const isScoring = cur.is_test_run
            ? false
            : usage.playCount < g.maxScoringPlaysPerGamePerDay;

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
        this.syncSpectatorPresence(tableId, false);
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
      const tableCheers = (ctx.cheers || []).filter((c) => c.table_id === tableId);
      for (const c of tableCheers) {
        await window.PartyDB.remove("cheers", `id=eq.${encodeURIComponent(c.id)}`);
      }
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        status: "cancelled",
      });
      await window.PartyApp.refreshAll();
    },

    async cancelMyCheer(tableId) {
      return window.PartyDB.withLock(`cancel_cheer_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        const freshRows = await window.PartyDB.select(
          "tables",
          `id=eq.${encodeURIComponent(tableId)}`,
          { forceNetwork: true }
        );
        const liveTable = (freshRows && freshRows[0]) || (ctx.tables || []).find((t) => t.id === tableId);
        if (!liveTable || liveTable.status !== "open") {
          window.PartyApp.toast("⚠️ 賽局已經開戰，無法取消應援預測囉！");
          await window.PartyApp.refreshAll();
          return;
        }
        const cheerId = `chr_${tableId}_${ctx.me.id}`;
        await window.PartyDB.remove("cheers", `id=eq.${encodeURIComponent(cheerId)}`);
        window.PartyFX.haptic("medium");
        window.PartyApp.toast("↩️ 已取消本次應援預測（不佔今日應援額度）！");
        await window.PartyApp.refreshAll();
      });
    },

    async placeCheer(tableId, pickKey, pickLabel) {
      return window.PartyDB.withLock(`cheer_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const table = (ctx.tables || []).find((t) => t.id === tableId);
        if (!table || table.status !== "open" || table.is_test_run) return;
        const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
        const cheerId = `chr_${tableId}_${ctx.me.id}`;
        const existingCheer = (ctx.cheers || []).find((c) => c.id === cheerId);
        const usage = window.PartyEngine.getDailyGameUsage(
          ctx.me.id,
          table.game_type,
          table.day_key,
          ctx.tables,
          ctx.cheers
        );
        if (!existingCheer && usage.cheerCount >= g.maxCheersPerGamePerDay) {
          window.PartyApp.toast(`此遊戲今日免費應援預測已達上限 ${g.maxCheersPerGamePerDay} 次！`);
          return;
        }

        await window.PartyDB.upsert("cheers", [
          {
            id: cheerId,
            table_id: tableId,
            game_type: table.game_type,
            day_key: table.day_key,
            supporter_id: ctx.me.id,
            pick_key: pickKey,
            pick_label: pickLabel,
            points: 0,
            status: "locked",
            reward_pts: 0,
          },
        ]);
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
            initGs.wins = {};
            initGs.roundLogs = [];
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
            initGs.guessLogs = [];
          } else if (cur.game_type === "rps_king") {
            initGs.wins = {};
            initGs.moves = {};
            initGs.roundSeq = 1;
            initGs.roundLogs = [];
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
            initGs.turnLogs = [];
            initGs.prompts = window.PartyEngine
              .shuffle(banks.fiveSeconds)
              .slice(0, parts.length * 3 + 4)
              .map((x) => String(x.prompt || "").replace(/5\s*秒內/g, "8 秒內"));
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
        // 🧪 測試局：開戰即永久扣除所有真人參與者（房主＋加入者）本款遊戲的 1 次免費試玩機會（暖身局不扣，跨日不重置）
        if (startedTbl.is_test_run && !startedTbl.is_warmup) {
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
        window.PartyFX.playTone("bell");
        await window.PartyApp.refreshAll();
      });
    },

    // --- 2～16 人 手機毫秒決鬥 (搶 2 勝制！西部拔槍 & 盲按 10.000s，獨立資料列防併發覆蓋！) ---
    async switchQdMode(tableId, mode) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.host_id !== ctx.me.id) return;
      delete this.blindStopwatchStart[tableId];
      this.clearLocalDraw(tableId);
      await window.PartyDB.transactRow("tables", tableId, (cur) => {
        if (!cur || cur.status !== "playing") return undefined;
        const gs = { ...(cur.game_state || {}) };
        if ((gs.roundSeq || 1) > 1) return undefined;
        cur.game_state = {
          ...gs,
          mode,
          roundSeq: 1,
          wins: gs.wins || {},
          roundLogs: gs.roundLogs || [],
          ready: {},
          times: {},
          fireAt: 0,
        };
        return cur;
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
      return window.PartyDB.withLock(`qd_res_${table.id}`, async () => {
        let matchWinnerIds = null;
        const tx = await window.PartyDB.transactRow("tables", table.id, (cur) => {
          if (!cur || cur.status !== "playing") return undefined;
          const gs = { ...(cur.game_state || {}) };
          const curSeq = gs.roundSeq || 1;
          const expectSeq = (table.game_state && table.game_state.roundSeq) || 1;
          if (curSeq !== expectSeq) return undefined;

          const parts = (cur.participants || []).filter((p) => !p.forfeited);
          const pName = (pid) => parts.find((p) => p.id === pid)?.name || pid;
          const wins = { ...(gs.wins || {}) };
          const roundLogs = [...(gs.roundLogs || [])];
          let roundWinnerId = "";
          let msg = "";

          if (mode === "draw") {
            const valid = parts.filter(
              (p) => mergedTimes[p.id] !== undefined && mergedTimes[p.id] >= 0
            );
            if (valid.length === 0) {
              const notFalse = parts.filter((p) => mergedTimes[p.id] === undefined);
              if (notFalse.length === 1) {
                roundWinnerId = notFalse[0].id;
                wins[roundWinnerId] = (wins[roundWinnerId] || 0) + 1;
                msg = `${pName(roundWinnerId)} 對手偷跑，拿下第 ${curSeq} 把（${wins[roundWinnerId]}/2勝）！`;
              } else {
                msg = `第 ${curSeq} 把全員偷跑犯規！無人拿分，重開下一把！`;
              }
            } else {
              valid.sort((a, b) => mergedTimes[a.id] - mergedTimes[b.id]);
              if (valid.length >= 2 && mergedTimes[valid[0].id] === mergedTimes[valid[1].id]) {
                msg = `⚡ 第 ${curSeq} 把同為 ${mergedTimes[valid[0].id]}ms 完全平手！加賽下一把！`;
              } else {
                roundWinnerId = valid[0].id;
                wins[roundWinnerId] = (wins[roundWinnerId] || 0) + 1;
                msg = `⚡ ${pName(roundWinnerId)} 以 ${mergedTimes[roundWinnerId]}ms 最快拿下第 ${curSeq} 把（目前 ${wins[roundWinnerId]}/2勝）！`;
              }
            }
          } else {
            const valid = parts.filter(
              (p) => mergedTimes[p.id] !== undefined && mergedTimes[p.id] >= 0
            );
            if (valid.length === 0) return undefined;
            valid.sort(
              (a, b) =>
                Math.abs(mergedTimes[a.id] - 10000) - Math.abs(mergedTimes[b.id] - 10000)
            );
            const d0 = Math.abs(mergedTimes[valid[0].id] - 10000);
            const d1 = valid.length >= 2 ? Math.abs(mergedTimes[valid[1].id] - 10000) : -1;
            if (valid.length >= 2 && d0 === d1) {
              msg = `⏱️ 第 ${curSeq} 把誤差完全相同平手！加賽下一把！`;
            } else {
              roundWinnerId = valid[0].id;
              wins[roundWinnerId] = (wins[roundWinnerId] || 0) + 1;
              msg = `⏱️ ${pName(roundWinnerId)} 拍出 ${(mergedTimes[roundWinnerId] / 1000).toFixed(3)}s 最準拿下第 ${curSeq} 把（目前 ${wins[roundWinnerId]}/2勝）！`;
            }
          }

          const roundEntry = {
            seq: curSeq,
            mode,
            winnerId: roundWinnerId,
            msg,
            times: mergedTimes,
          };
          roundLogs.push(roundEntry);
          gs.wins = wins;
          gs.roundLogs = roundLogs;
          gs.lastRound = roundEntry;

          if (roundWinnerId && (wins[roundWinnerId] || 0) >= 2) {
            gs.times = mergedTimes;
            matchWinnerIds = [roundWinnerId];
          } else {
            gs.roundSeq = curSeq + 1;
            gs.times = {};
          }
          cur.game_state = gs;
          return cur;
        });

        if (!tx.committed || !tx.snapshot) {
          await window.PartyApp.refreshAll();
          return;
        }
        this.clearLocalDraw(table.id);
        delete this.blindStopwatchStart[table.id];
        if (matchWinnerIds) {
          await this.autoFinishTable(tx.snapshot, matchWinnerIds, ctx);
        } else {
          window.PartyFX.playTone("bell");
          await window.PartyApp.refreshAll();
        }
      });
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
        `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(tKey)}`,
        { forceNetwork: true }
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

    // --- 終極密碼（一爆即結束 + CAS 交易鎖 + 防焦點鎖畫面！） ---
    async submitBombGuess(tableId) {
      return window.PartyDB.withLock(`bomb_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        const inp = document.getElementById(`bomb-val-${tableId}`);
        const rawVal = inp ? inp.value : "";
        if (inp) {
          inp.blur();
          delete inp.dataset.dirty;
        }
        const val = Number(String(rawVal).trim());
        if (!Number.isInteger(val)) {
          window.PartyApp.toast("請輸入有效的整數數字！");
          return;
        }

        let errMsg = "";
        let boomWinners = null;
        let exploded = false;

        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "playing") return undefined;
          const gs = { ...(cur.game_state || {}) };
          const alive = (
            gs.aliveIds ||
            (cur.participants || []).filter((p) => !p.forfeited).map((p) => p.id)
          ).filter(Boolean);
          if (!alive.length) return undefined;
          const turnIdx = (gs.turnIdx || 0) % alive.length;
          if (alive[turnIdx] !== ctx.me.id) {
            errMsg = "目前還沒輪到你出數字喔！";
            return undefined;
          }
          const low = gs.low ?? 0;
          const high = gs.high ?? 100;
          if (val <= low || val >= high) {
            errMsg = `請輸入 ${low + 1} ～ ${high - 1} 之間的整數！`;
            return undefined;
          }

          const secret =
            gs.secretMask !== undefined && gs.salt !== undefined
              ? gs.secretMask ^ gs.salt
              : gs.secret;
          const guessLogs = [...(gs.guessLogs || [])];
          guessLogs.push({ id: ctx.me.id, name: ctx.me.name, val, boom: val === secret });
          gs.guessLogs = guessLogs;

          // d (A1): 一爆即結束！只要有 1 人踩中炸彈立刻完賽結算，未踩爆的存活者平分榮譽池！
          if (val === secret) {
            exploded = true;
            const survivors = alive.filter((id) => id !== ctx.me.id);
            gs.aliveIds = survivors;
            gs.loserId = ctx.me.id;
            gs.secretRevealed = secret;
            gs.lastBoom = { id: ctx.me.id, seq: Date.now(), val };
            gs.lastLog = `💥 ${ctx.me.name} 踩中炸彈 ${val} 引爆！存活贏家：${survivors
              .map((id) => (cur.participants || []).find((p) => p.id === id)?.name || id)
              .join("、")}`;
            boomWinners = survivors.length ? survivors : ["__pvp_tie__"];
            cur.game_state = gs;
            return cur;
          }

          if (val < secret) gs.low = val;
          else gs.high = val;
          gs.lastLog = `${ctx.me.name} 喊了 ${val}，安全範圍縮小為 ${gs.low} ～ ${gs.high}`;
          gs.turnIdx = (turnIdx + 1) % alive.length;

          // 測試局 AI 陪練員自動跟著喊數
          while (alive.length > 1 && String(alive[gs.turnIdx]).startsWith("bot_")) {
            const botId = alive[gs.turnIdx];
            const botName =
              (cur.participants || []).find((p) => p.id === botId)?.name || "🤖 AI陪練員";
            const botVal = window.PartyEngine.cryptoRandomInt(gs.low + 1, gs.high - 1);
            gs.guessLogs.push({ id: botId, name: botName, val: botVal, boom: botVal === secret });
            if (botVal === secret) {
              exploded = true;
              const survivors = alive.filter((id) => id !== botId);
              gs.aliveIds = survivors;
              gs.loserId = botId;
              gs.secretRevealed = secret;
              gs.lastBoom = { id: botId, seq: Date.now(), val: botVal };
              gs.lastLog = `💥 ${botName} 踩中炸彈 ${botVal} 引爆！`;
              boomWinners = survivors.length ? survivors : ["__pvp_tie__"];
              cur.game_state = gs;
              return cur;
            }
            if (botVal < secret) gs.low = botVal;
            else gs.high = botVal;
            gs.lastLog = `${botName} 喊了 ${botVal}，安全範圍縮小為 ${gs.low} ～ ${gs.high}`;
            gs.turnIdx = (gs.turnIdx + 1) % alive.length;
          }

          cur.game_state = gs;
          return cur;
        });

        if (!tx.committed || !tx.snapshot) {
          if (errMsg) window.PartyApp.toast(errMsg);
          await window.PartyApp.refreshAll();
          return;
        }
        if (inp) inp.value = "";
        if (exploded && boomWinners) {
          window.PartyFX.playTone("thunder");
          window.PartyFX.haptic("heavy");
          await this.autoFinishTable(tx.snapshot, boomWinners, ctx);
          return;
        }
        window.PartyFX.haptic("medium");
        await window.PartyApp.refreshAll();
      });
    },

    // --- 猜拳連勝王 (原子逐人寫入 theme_responses + CAS 推進回合) ---
    async playRps(tableId, move) {
      return window.PartyDB.withLock(`rps_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const table = (ctx.tables || []).find((t) => t.id === tableId);
        if (!table || table.status !== "playing") return;
        const gsInit = table.game_state || {};
        const roundSeq = gsInit.roundSeq || 1;
        const rKey = `rps_r${roundSeq}`;

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
          `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(rKey)}`,
          { forceNetwork: true }
        );
        const moves = {};
        (freshResps || []).forEach((r) => {
          if (r.payload?.move) moves[r.player_id] = r.payload.move;
        });

        if (p1 && p2 && moves[p1.id] && moves[p2.id]) {
          let finishWin = null;
          const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
            if (!cur || cur.status !== "playing") return undefined;
            const gs = { ...(cur.game_state || {}) };
            if ((gs.roundSeq || 1) !== roundSeq) return undefined;
            gs.wins = { ...(gs.wins || {}) };
            const rLogs = [...(gs.roundLogs || [])];
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
            rLogs.push(gs.lastRoundMsg);
            gs.roundLogs = rLogs;
            gs.moves = {};
            gs.roundSeq = roundSeq + 1;
            if ((gs.wins[p1.id] || 0) >= 3) finishWin = [p1.id];
            else if ((gs.wins[p2.id] || 0) >= 3) finishWin = [p2.id];
            cur.game_state = gs;
            return cur;
          });
          if (tx.committed && tx.snapshot && finishWin) {
            return await this.autoFinishTable(tx.snapshot, finishWin, ctx);
          }
        }
        window.PartyFX.haptic("medium");
        await window.PartyApp.refreshAll();
      });
    },

    // --- 2v2 靈魂默契 (支援鎖定前自由改答案 + 開牌前解鎖修改 + CAS 防互蓋！) ---
    pickSoulDraft(tableId, qIdx, choiceIdx) {
      this.localSoulDraft[`${tableId}_${qIdx}`] = choiceIdx;
      window.PartyFX.haptic("medium");
      window.PartyApp.render();
    },

    async unlockSoulDraft(tableId, qIdx, prevChoice) {
      const ctx = window.PartyApp.getContext();
      if (!ctx.me) return;
      const draftKey = `${tableId}_${qIdx}`;
      const sKey = `ss_q${qIdx}`;
      this.localSoulDraft[draftKey] = prevChoice;
      this.editingSoulKey = draftKey;
      await window.PartyDB.upsert("theme_responses", [
        {
          id: `${tableId}_${sKey}_${ctx.me.id}`,
          session_id: tableId,
          step_key: sKey,
          player_id: ctx.me.id,
          payload: { unlocked: true },
        },
      ]);
      await window.PartyApp.refreshAll();
    },

    async answerSoulSync(tableId, explicitChoiceIdx = undefined) {
      return window.PartyDB.withLock(`ss_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const table = (ctx.tables || []).find((t) => t.id === tableId);
        if (!table || table.status !== "playing") return;
        const gsInit = table.game_state || {};
        const qIdx = gsInit.qIdx || 0;
        const sKey = `ss_q${qIdx}`;
        const draftKey = `${tableId}_${qIdx}`;
        const choiceIdx =
          explicitChoiceIdx !== undefined ? explicitChoiceIdx : this.localSoulDraft[draftKey];
        if (choiceIdx === undefined) {
          window.PartyApp.toast("請先點選一個選項再按鎖定！");
          return;
        }
        this.editingSoulKey = "";

        const rows = [
          {
            id: `${tableId}_${sKey}_${ctx.me.id}`,
            session_id: tableId,
            step_key: sKey,
            player_id: ctx.me.id,
            payload: { choice: Number(choiceIdx), unlocked: false },
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
                choice: Math.random() < 0.68 ? Number(choiceIdx) : Math.floor(Math.random() * 4),
                unlocked: false,
              },
            });
          }
        });
        await window.PartyDB.upsert("theme_responses", rows);

        const freshResps = await window.PartyDB.select(
          "theme_responses",
          `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(sKey)}`,
          { forceNetwork: true }
        );
        const curAnswers = {};
        (freshResps || []).forEach((r) => {
          if (r.payload?.choice !== undefined && !r.payload?.unlocked) {
            curAnswers[r.player_id] = Number(r.payload.choice);
          }
        });

        const activeParts = (table.participants || []).filter((p) => !p.forfeited);
        const allAnswered = activeParts.every((p) => curAnswers[p.id] !== undefined);
        if (allAnswered) {
          let finalWinIds = null;
          let badgeCheckSnap = null;
          const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
            if (!cur || cur.status !== "playing") return undefined;
            const gs = { ...(cur.game_state || {}) };
            if ((gs.qIdx || 0) !== qIdx) return undefined;
            const curQ = (gs.questions || [])[qIdx];
            gs.answers = { ...(gs.answers || {}), [qIdx]: curAnswers };
            gs.scores = { ...(gs.scores || { team_A: 0, team_B: 0 }) };
            const cParts = cur.participants || [];
            const teamA = cParts.filter((p) => p.team === "team_A");
            const teamB = cParts.filter((p) => p.team === "team_B");
            const hitA = teamA.length === 2 && curAnswers[teamA[0].id] === curAnswers[teamA[1].id];
            const hitB = teamB.length === 2 && curAnswers[teamB[0].id] === curAnswers[teamB[1].id];
            if (hitA) gs.scores.team_A += 1;
            if (hitB) gs.scores.team_B += 1;
            const pickSummary = cParts
              .map((p) => {
                const c = curAnswers[p.id];
                return `${p.name}:${c !== undefined ? `${["A", "B", "C", "D"][c]}(${curQ?.options?.[c] || ""})` : "-"}`;
              })
              .join(" ｜ ");
            gs.lastQResult = { qIdx, hitA, hitB, summaryTxt: pickSummary };

            if (qIdx + 1 >= (gs.questions || []).length) {
              badgeCheckSnap = { gs, teamA, teamB, dayKey: cur.day_key || "2026-12-31", isTest: cur.is_test_run };
              if (cParts.length === 2) {
                finalWinIds = gs.scores.team_A >= 5 ? teamA.map((p) => p.id) : ["__coop_fail__"];
              } else if (gs.scores.team_A === gs.scores.team_B) {
                finalWinIds = ["__pvp_tie__"];
              } else {
                finalWinIds =
                  gs.scores.team_A > gs.scores.team_B
                    ? teamA.map((p) => p.id)
                    : teamB.map((p) => p.id);
              }
            } else {
              gs.qIdx = qIdx + 1;
            }
            cur.game_state = gs;
            return cur;
          });

          delete this.localSoulDraft[draftKey];
          if (tx.committed && tx.snapshot) {
            if (badgeCheckSnap && !badgeCheckSnap.isTest) {
              const { gs, teamA, teamB, dayKey } = badgeCheckSnap;
              if (teamA.length === 2 && gs.scores.team_A >= 6) {
                for (const m of teamA) {
                  if (m.isScoring && !String(m.id).startsWith("bot_")) {
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
              }
              if (teamB.length === 2 && gs.scores.team_B >= 6) {
                for (const m of teamB) {
                  if (m.isScoring && !String(m.id).startsWith("bot_")) {
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
            }
            if (finalWinIds) {
              return await this.autoFinishTable(tx.snapshot, finalWinIds, ctx);
            }
          }
        }

        window.PartyFX.haptic("medium");
        await window.PartyApp.refreshAll();
      });
    },

    // --- ito 數字順風耳 ---
    async moveIto(tableId, idx, dir) {
      return window.PartyDB.withLock(`ito_mv_${tableId}`, async () => {
        await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "playing") return undefined;
          const gs = { ...(cur.game_state || {}) };
          if (gs.revealed) return undefined;
          const arr = [...(gs.proposedOrder || (cur.participants || []).map((p) => p.id))];
          const target = idx + dir;
          if (target < 0 || target >= arr.length) return undefined;
          [arr[idx], arr[target]] = [arr[target], arr[idx]];
          gs.proposedOrder = arr;
          cur.game_state = gs;
          return cur;
        });
        await window.PartyApp.refreshAll();
      });
    },

    async revealIto(tableId) {
      return window.PartyDB.withLock(`ito_rev_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        let winIds = null;
        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "playing") return undefined;
          const gs = { ...(cur.game_state || {}), revealed: true };
          const nums = (gs.proposedOrder || []).map((id) => (gs.secretNumbers || {})[id]);
          let sortedOk = true;
          for (let i = 1; i < nums.length; i++) {
            if (nums[i] < nums[i - 1]) sortedOk = false;
          }
          winIds = sortedOk ? (cur.participants || []).map((p) => p.id) : ["__coop_fail__"];
          cur.game_state = gs;
          return cur;
        });
        if (tx.committed && tx.snapshot && winIds) {
          await this.autoFinishTable(tx.snapshot, winIds, ctx);
        }
      });
    },

    // --- 8 秒不詞窮（8.0 秒倒數 ＋ 3人以上共識投票 ＋ 平手算輸！） ---
    async startFiveSecTurn(tableId) {
      return window.PartyDB.withLock(`fs_start_${tableId}`, async () => {
        await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "playing") return undefined;
          const gs = { ...(cur.game_state || {}) };
          if (gs.turnStartedAt) return undefined;
          gs.turnStartedAt = window.PartyDB.serverNowMs;
          cur.game_state = gs;
          return cur;
        });
        await window.PartyApp.refreshAll();
      });
    },

    async voteFiveSec(tableId, turn, passBool) {
      return window.PartyDB.withLock(`fs_vote_${tableId}_${turn}`, async () => {
        const ctx = window.PartyApp.getContext();
        const table = (ctx.tables || []).find((t) => t.id === tableId);
        if (!table || table.status !== "playing") return;
        const vStepKey = `fs_t${turn}`;
        await window.PartyDB.upsert("theme_responses", [
          {
            id: `${tableId}_${vStepKey}_${ctx.me.id}`,
            session_id: tableId,
            step_key: vStepKey,
            player_id: ctx.me.id,
            payload: { pass: Boolean(passBool) },
          },
        ]);

        const freshResps = await window.PartyDB.select(
          "theme_responses",
          `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(vStepKey)}`,
          { forceNetwork: true }
        );
        const voteMap = {};
        (freshResps || []).forEach((r) => {
          if (r.payload?.pass !== undefined) voteMap[r.player_id] = Boolean(r.payload.pass);
        });

        const parts = table.participants || [];
        const activeParts = parts.filter((p) => !p.forfeited);
        const curPlayer = parts[turn % parts.length];
        const humanOpponents = activeParts.filter(
          (p) => p.id !== curPlayer?.id && !String(p.id).startsWith("bot_")
        );
        const allVoted = humanOpponents.every((p) => voteMap[p.id] !== undefined);
        if (allVoted && humanOpponents.length > 0) {
          let passCnt = 0;
          let failCnt = 0;
          humanOpponents.forEach((p) => {
            if (voteMap[p.id]) passCnt += 1;
            else failCnt += 1;
          });
          // h (A2): 過半數投 ✅ 才算過關；平票（passCnt === failCnt）直接算挑戰失敗 (+0 分)！
          const passed = passCnt > failCnt;
          const voteTxt =
            passCnt === failCnt
              ? `共識票 ${passCnt}:${failCnt} 平票算輸`
              : `共識票 ${passCnt}過關 : ${failCnt}失敗`;
          await this.judgeFiveSec(tableId, passed, turn, voteTxt);
          return;
        }
        window.PartyFX.haptic("medium");
        await window.PartyApp.refreshAll();
      });
    },

    async judgeFiveSec(tableId, passed, expectedTurn = null, voteTxt = "") {
      return window.PartyDB.withLock(`fs_jdg_${tableId}`, async () => {
        const ctx = window.PartyApp.getContext();
        let finishWinners = null;

        const tx = await window.PartyDB.transactRow("tables", tableId, (cur) => {
          if (!cur || cur.status !== "playing") return undefined;
          const gs = { ...(cur.game_state || {}) };
          const curTurn = gs.turn || 0;
          if (expectedTurn !== null && curTurn !== expectedTurn) return undefined;
          const parts = cur.participants || [];
          const curPlayer = parts[curTurn % parts.length];
          if (!curPlayer) return undefined;

          gs.scores = { ...(gs.scores || {}) };
          if (passed) gs.scores[curPlayer.id] = (gs.scores[curPlayer.id] || 0) + 1;
          const promptTxt = String((gs.prompts && gs.prompts[curTurn]) || "").replace(
            /5\s*秒內/g,
            "8 秒內"
          );
          const summary = `${curPlayer.name} 本題${passed ? "✅過關 (+1)" : "❌失敗 (+0)"}${
            voteTxt ? `（${voteTxt}）` : ""
          }`;
          gs.lastJudge = {
            turn: curTurn,
            playerId: curPlayer.id,
            passed: Boolean(passed),
            summary,
          };
          gs.turnLogs = [
            ...(gs.turnLogs || []),
            {
              turn: curTurn,
              playerId: curPlayer.id,
              prompt: promptTxt,
              passed: Boolean(passed),
              voteTxt,
            },
          ];
          gs.turn = curTurn + 1;
          gs.turnStartedAt = 0;

          while (
            gs.turn < parts.length * 3 &&
            (String(parts[gs.turn % parts.length].id).startsWith("bot_") ||
              parts[gs.turn % parts.length].forfeited)
          ) {
            const bp = parts[gs.turn % parts.length];
            if (!bp.forfeited && Math.random() < 0.65) {
              gs.scores[bp.id] = (gs.scores[bp.id] || 0) + 1;
            }
            gs.turn += 1;
          }

          if (gs.turn >= parts.length * 3) {
            const activeParts = parts.filter((p) => !p.forfeited);
            let best = -1;
            activeParts.forEach((p) => {
              const s = gs.scores[p.id] || 0;
              if (s > best) best = s;
            });
            const topPlayers =
              best > 0
                ? activeParts.filter((p) => (gs.scores[p.id] || 0) === best).map((p) => p.id)
                : [];
            // h (A2): 3 輪結束若最高總分並列第一（或全員 0 分），判定平手退還參賽門票！
            finishWinners = topPlayers.length === 1 ? topPlayers : ["__pvp_tie__"];
          }

          cur.game_state = gs;
          return cur;
        });

        if (!tx.committed || !tx.snapshot) {
          await window.PartyApp.refreshAll();
          return;
        }
        if (finishWinners) {
          return await this.autoFinishTable(tx.snapshot, finishWinners, ctx);
        }
        window.PartyFX.haptic("medium");
        await window.PartyApp.refreshAll();
      });
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
        ctx.cheers,
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
        ? "確定要結束這場免費練習局嗎？（0 分，不影響積分）"
        : isCoop
        ? "這是合作局，你棄權後本局將直接判定「挑戰失敗」結束。\n確定要棄權嗎？"
        : activeCnt <= 2
        ? "棄權後將直接判對手獲勝領取本局榮譽積分（棄權者不領完賽分）。\n確定要棄權認輸嗎？"
        : "棄權後你會立即離開本局（不領完賽分，由場上其他選手繼續競賽）。\n確定要棄權認輸嗎？";
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
              const top = best > 0 ? remaining.filter((p) => ((gs.scores || {})[p.id] || 0) === best).map((p) => p.id) : [];
              finishWinners = top.length === 1 ? top : ["__pvp_tie__"];
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
