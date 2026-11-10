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
    quickDrawTimers: {},
    blindStopwatchStart: {},
    fiveSecTimer: null,

    renderGameRuleBlock(gameMeta, collapsible = false, defaultOpen = false) {
      if (!gameMeta) return "";
      const body = `
        <div class="rule-block-inner">
          <div><b class="cyan-text">🎯 玩法規則（${gameMeta.minPlayers}～${gameMeta.maxPlayers}人）：</b>${esc(gameMeta.howToPlay || gameMeta.desc)}</div>
          <div style="margin-top:5px;"><b class="gold-text">💰 計分派彩：</b>${esc(gameMeta.scoringRule || "")}</div>
        </div>
      `;
      if (!collapsible) {
        return `<div class="rule-guide-box">${body}</div>`;
      }
      return `
        <details class="rule-guide-box" ${defaultOpen ? "open" : ""}>
          <summary>📖 點此查看【${esc(gameMeta.name)}】詳細玩法 ＆ 計分規則</summary>
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

      return `
        <div class="party-banner ${isHappy ? "happy-hour" : ""}" ${forceTestOnly ? 'style="border-color:rgba(56,189,248,0.55);"' : ""}>
          <div class="party-banner-top">
            <span class="scene-pill ${forceTestOnly ? "pill-cyan" : isHappy ? "pill-fire" : "pill-gold"}">
              ${
                forceTestOnly
                  ? "🧪 新手試玩練習場（每款遊戲皆可免費開 1 次不計分測試局！）"
                  : isHappy
                  ? "🔥 限時加成 Happy Hour（選手獎池／過關淨利 +50%！）"
                  : "🎲 Party Game 自由賽桌時段"
              }
            </span>
            <button class="btn ${forceTestOnly ? "btn-primary" : "btn-gold"} btn-sm" onclick="PartyGamesUI.openCreateModal(${forceTestOnly})">
              ${forceTestOnly ? "🧪 開免費測試局" : "➕ 開新賽桌"}
            </button>
          </div>
          ${
            forceTestOnly
              ? `<p class="muted-xs" style="margin-top:7px;">
                   💡 第一次加入的朋友可把 7 款遊戲各開 1 次「0 分測試局」熟悉操作！支援揪線上朋友一起試玩，沒人有空時也可一鍵召喚 <b>🤖 AI 陪練員</b> 單人實測！
                 </p>`
              : `<details class="rule-guide-box" style="margin-top:9px;margin-bottom:0;">
                  <summary>📜 賽桌通用計分 ＆ 場邊下注規則（每日 08:00 重置次數）</summary>
                  <div class="rule-block-inner">
                    <div>• <b>🧪 新手免費測試局（每款限開 1 次）</b>：開桌時可選「新手測試局」，全桌 0 押注、0 得分、不消耗正式額度！</div>
                    <div style="margin-top:4px;">• <b>⚔️ 參賽計分與陪玩制（每日 ${g.maxScoringPlaysPerGamePerDay} 次／款）</b>：每款遊戲每日前 ${g.maxScoringPlaysPerGamePerDay} 局押入場費 <b>${g.partyPlayStake} PT</b> 正常計分；滿 ${g.maxScoringPlaysPerGamePerDay} 次後可繼續免費<b>「🤝 陪其他人玩」</b>（你自己輸贏皆 0 分，但還沒滿 ${g.maxScoringPlaysPerGamePerDay} 次的對手仍會照常得分或失分！）。</div>
                    <div style="margin-top:4px;">• <b>💰 場邊局外人對賭（每日 ${g.maxBetsPerGamePerDay} 次／款）</b>：沒下場的觀眾可押 <b>${g.partyBetStake} PT</b> 猜贏家（與參賽次數獨立計算！）。<b>需雙邊不同選項都有人押才成立彩池</b>，猜中者平分全場賭金；若全場押同一邊無對家或無人猜中，<b>100% 全額退回本金</b>！</div>
                    <div style="margin-top:4px;">• <b>🔥 Happy Hour 限時加成</b>：系統免費額外補貼選手總獎池（或合作過關淨利）<b>+50%</b>！每日首桌完賽桌長再拿【🚀 破冰先鋒 +25 PT】。</div>
                  </div>
                </details>`
          }
        </div>

        ${
          activeTables.length === 0
            ? `<div class="empty-card">
                <div style="font-size:34px;margin-bottom:6px;">${forceTestOnly ? "🧪" : "🎯"}</div>
                <div style="font-weight:700;font-size:16px;">${forceTestOnly ? "目前沒有進行中的試玩測試桌" : "目前客廳沒有進行中的賽桌"}</div>
                <div class="muted-sm" style="margin:6px 0 14px;">
                  ${
                    forceTestOnly
                      ? "點下方按鈕任選一款遊戲開啟你的 1 次免費不計分測試局（可揪人或召喚 AI 陪練員）！"
                      : "快開第一桌揪大家過來玩（第一次玩也可選「🧪 新手測試局」先試水溫）！"
                  }
                </div>
                <button class="btn ${forceTestOnly ? "btn-primary" : "btn-gold"}" onclick="PartyGamesUI.openCreateModal(${forceTestOnly})">
                  ${forceTestOnly ? "🧪 立即開啟不計分測試局" : "➕ 立即建立賽桌（1～3 分鐘揪團）"}
                </button>
              </div>`
            : activeTables.map((t) => this.renderTableCard(t, ctx, playerMap)).join("")
        }

        <div class="section-card" style="margin-top:16px;">
          <div class="section-title">📊 ${forceTestOnly ? "7 款遊戲新手試玩額度 ＆ 玩法規則一覽" : `我今日各遊戲額度 ＆ 7 款玩法計分一覽（${esc(dayKey)}｜每日 08:00 重置）`}</div>
          <p class="muted-xs" style="margin-bottom:8px;">點擊任一款遊戲即可展開查看該遊戲的完整玩法與計分規則：</p>
          <div class="quota-grid">
            ${CFG.PARTY_GAMES.map((gm) => {
              const u = window.PartyEngine.getDailyGameUsage(me.id, gm.id, dayKey, tables, bets);
              const testUsed = window.PartyEngine.getTestHostUsage(me.id, gm.id, tables);
              const playFull = u.playCount >= g.maxScoringPlaysPerGamePerDay;
              const betFull = u.betCount >= g.maxBetsPerGamePerDay;
              return `
                <details class="quota-details-card">
                  <summary class="quota-item" style="border-bottom:none;cursor:pointer;list-style:none;">
                    <div class="quota-name">${gm.icon} <b>${esc(gm.name)}</b> <span class="muted-xs">▾規則</span></div>
                    <div class="quota-badges">
                      <span class="q-tag ${testUsed >= 1 ? "q-muted" : "q-ok"}">🧪測試 ${Math.min(1, testUsed)}/1</span>
                      ${
                        !forceTestOnly
                          ? `<span class="q-tag ${playFull ? "q-muted" : "q-ok"}">參賽 ${u.playCount}/${g.maxScoringPlaysPerGamePerDay}</span>
                             <span class="q-tag ${betFull ? "q-lock" : "q-bet"}">下注 ${u.betCount}/${g.maxBetsPerGamePerDay}</span>`
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

    renderTableCard(table, ctx, playerMap) {
      const { me, tables, bets, globalCfg } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      const parts = table.participants || [];
      const amIn = parts.some((p) => p.id === me.id);
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
                  ? `<span class="scene-pill pill-cyan" style="margin-left:4px;font-size:11px;">🧪 新手測試局 (0分)</span>`
                  : table.is_happy_hour
                  ? `<span class="hh-tag">🔥 獎池+50%</span>`
                  : ""
              }
            </div>
            <span class="status-badge st-${table.status} ${table.status === "open" ? "live-countdown" : ""}" ${table.status === "open" ? `data-until="${esc(table.opens_until)}"` : ""}>
              ${
                table.status === "open"
                  ? table.is_test_run
                    ? `⏳ 試玩集結 ${mm}:${ss}`
                    : `⏳ 集結＆下注倒數 ${mm}:${ss}`
                  : table.status === "playing"
                  ? "⚔️ 對戰進行中"
                  : "⚖️ 等待確認勝負"
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
                  return `<div class="part-chip ${p.isScoring ? "scoring" : "fun-only"}">
                    ${avatarHtml(pl, 24)}
                    <span>${esc(pl.name)}</span>
                    ${
                      p.team
                        ? `<em class="team-badge" ${canSwapTeam ? `style="cursor:pointer;" title="點擊切換組別" onclick="PartyGamesUI.swapMyTeam('${table.id}')"` : ""}>${esc(p.teamLabel || p.team)}${canSwapTeam ? " ⇄" : ""}</em>`
                        : ""
                    }
                    <small>${table.is_test_run ? "測試0分" : p.isScoring ? `押${table.stake}` : "🤝陪玩0分"}</small>
                  </div>`;
                })
                .join("")}
            </div>
          </div>

          ${
            table.status === "open"
              ? this.renderOpenControls(table, gameMeta, me, amIn, isHost, usage, myBet, tableBets, g, remainSec)
              : this.renderPlayingArea(table, gameMeta, ctx, playerMap, amIn, isHost, tableBets, myBet)
          }
        </div>
      `;
    },

    renderOpenControls(table, gameMeta, me, amIn, isHost, usage, myBet, tableBets, g, remainSec) {
      const parts = table.participants || [];
      const canJoinMore = parts.length < gameMeta.maxPlayers;
      const nextIsScoring = usage.playCount < g.maxScoringPlaysPerGamePerDay;
      const betLeft = g.maxBetsPerGamePerDay - usage.betCount;

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
              ? `<button class="btn btn-primary" onclick="PartyGamesUI.joinTable('${table.id}')">
                  🙋 加入${
                    table.is_test_run
                      ? "免費測試局（0 押注 0 得分）"
                      : nextIsScoring
                      ? `參賽（計分局 ${usage.playCount + 1}/${g.maxScoringPlaysPerGamePerDay}，押 ${table.stake} PT）`
                      : `陪玩參賽（你已滿 ${g.maxScoringPlaysPerGamePerDay} 次輸贏 0 分；未滿對手照常計分！）`
                  }
                </button>`
              : amIn && !isHost
              ? `<button class="btn btn-ghost btn-sm" onclick="PartyGamesUI.leaveTable('${table.id}')">退出參賽</button>`
              : ""
          }

          ${
            invalidSoulCount
              ? `<div class="muted-xs" style="color:#fcd34d;">🤝 靈魂默契支援「2 人合作闖關」或「4 人雙組 2v2 對抗」，目前 3 人請再等 1 位夥伴加入！</div>`
              : ""
          }

          ${
            isHost
              ? `<div class="host-row">
                  <button class="btn btn-gold" ${!canStartNow ? "disabled" : ""} onclick="PartyGamesUI.startTable('${table.id}')">
                    🚀 ${remainSec === 0 ? "時間到！立即開賽" : `人齊提前開賽（${table.game_type === "soul_sync_2v2" ? "2人合作 / 4人對抗" : `至少 ${gameMeta.minPlayers} 人`}）`}
                  </button>
                  ${
                    table.is_test_run && !canStartNow
                      ? `<button class="btn btn-primary btn-sm" onclick="PartyGamesUI.startTestWithBots('${table.id}')">
                           🤖 補齊 AI 陪練員・立即單人試玩！
                         </button>`
                      : ""
                  }
                  <button class="btn btn-danger btn-sm" onclick="PartyGamesUI.cancelTable('${table.id}')">取消賽桌</button>
                </div>`
              : remainSec === 0 && canStartNow
              ? `<button class="btn btn-gold" onclick="PartyGamesUI.startTable('${table.id}')">⏰ 集結時間到！點此啟動對戰</button>`
              : ""
          }
        </div>

        ${
          table.is_test_run
            ? `<div class="betting-panel">
                 <div class="muted-xs" style="color:#7dd3fc;">🧪 此為「新手免費測試局」：全桌 0 押注、0 得分、不開放場邊下注，也不消耗每日 3 次正式計分額度！（取消賽桌可退回測試次數）</div>
               </div>`
            : `<!-- 場邊局外人下注區 -->
               <div class="betting-panel">
                 <div class="bet-header">
                   <span>💰 場邊局外人互賭彩池（目前 ${tableBets.length} 注 / 共 ${tableBets.length * table.bet_stake} PT）</span>
                   <span class="muted-xs">需雙邊有人對賭才成立，單邊自動退費</span>
                 </div>
                 ${
                   amIn
                     ? `<div class="muted-xs">你是本局參賽選手，專心應戰！（場外觀眾可下注）</div>`
                     : myBet
                     ? `<div class="my-bet-tag">✅ 你已押注：<b>${esc(myBet.pick_label)}</b>（${myBet.amount} PT，今日此遊戲下注 ${usage.betCount}/${g.maxBetsPerGamePerDay}）</div>`
                     : betLeft <= 0
                     ? `<div class="locked-bet-msg">🔒 你今日在「${esc(gameMeta.name)}」下注已滿 ${g.maxBetsPerGamePerDay}/${g.maxBetsPerGamePerDay} 次（去別款遊戲房間仍可下注！）</div>`
                     : betTargets.length < 2
                     ? `<div class="muted-xs">等待至少 2 位選手入座後即可開放場邊押注…</div>`
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

      return `
        <div class="playing-stage">
          ${myBet ? `<div class="my-bet-tag" style="margin-bottom:8px;">💰 你的場邊押注：<b>${esc(myBet.pick_label)}</b>（總彩池 ${tableBets.length * table.bet_stake} PT）</div>` : ""}
          ${innerHtml}
          ${settleHtml}
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
      const parts = table.participants || [];
      const { mode, ready, times } = this.getMergedQdState(table, gs, ctx?.themeResponses);
      const canSwitchMode = isHost && !gs.fireAt && Object.keys(times).length === 0;
      const potPreview = table.is_test_run
        ? "0 PT (測試局)"
        : `${Math.round(parts.length * (Number(table.stake) || 20) * (table.is_happy_hour ? 1.5 : 1))} PT`;

      if (mode === "draw") {
        const fireAt = gs.fireAt || 0;
        const now = window.PartyDB.serverNowMs;
        const isArmed = fireAt > 0 && now < fireAt;
        const readyCnt = parts.filter((p) => ready[p.id]).length;
        const tappedCnt = parts.filter((p) => times[p.id] !== undefined).length;
        const hasValidScore = parts.some((p) => times[p.id] !== undefined && times[p.id] >= 0);

        if (isArmed && amIn && !this.quickDrawTimers[table.id]) {
          const wait = Math.max(10, fireAt - now);
          this.quickDrawTimers[table.id] = setTimeout(() => {
            delete this.quickDrawTimers[table.id];
            window.PartyFX.playTone("fire");
            window.PartyFX.haptic("heavy");
            window.PartyApp.render();
          }, wait);
        }

        return `
          <div class="mini-game-box">
            <div class="ss-top" style="margin-bottom:6px;">
              <div class="mini-mode-switch" style="margin-bottom:0;">
                <button class="chip-btn active" ${!canSwitchMode ? "disabled" : ""} onclick="PartyGamesUI.switchQdMode('${table.id}','draw')">🔫 西部拔槍反應</button>
                <button class="chip-btn" ${!canSwitchMode ? "disabled" : ""} onclick="PartyGamesUI.switchQdMode('${table.id}','blind10')">⏱️ 盲按 10.000 秒</button>
              </div>
              <span class="gold-text" style="font-size:12.5px;">🏆 獨得獎池：${potPreview}</span>
            </div>
            ${
              !fireAt
                ? `<p class="muted-sm" style="margin:6px 0 10px;">全員按下準備後（目前 <b>${readyCnt}/${parts.length}</b> 人），2.5～5.5 秒內螢幕隨機瞬間變紅震動，最快按下者獨吞全場獎池（變紅前偷跑直接淘汰）！</p>
                  ${
                    amIn
                      ? `<button class="btn ${ready[me.id] ? "btn-ghost" : "btn-gold"}" style="width:100%;" onclick="PartyGamesUI.qdReady('${table.id}')">
                          ${ready[me.id] ? `✅ 已準備（等待其餘夥伴 ${readyCnt}/${parts.length}…）` : "🔫 按下準備拔槍！"}
                        </button>`
                      : `<div class="muted-sm">等待 ${parts.length} 位選手準備拔槍（${readyCnt}/${parts.length}）…</div>`
                  }`
                : isArmed
                ? `<div class="qd-pad armed" onclick="${amIn ? `PartyGamesUI.qdTap('${table.id}')` : ""}">
                    <div style="font-size:28px;">🤫 屏住呼吸…等變紅色！</div>
                    <div class="muted-xs">現在按下去算偷跑淘汰喔！</div>
                  </div>`
                : times[me.id] !== undefined
                ? `<div class="locked-bet-msg" style="text-align:center;margin:10px 0;">
                    ${times[me.id] < 0 ? "❌ 你偷跑犯規淘汰啦！" : `⚡ 你的拔槍速度：<b class="gold-text">${times[me.id]} ms</b>！`}
                    （已完成 ${tappedCnt}/${parts.length} 人）
                  </div>`
                : `<div class="qd-pad fired" onclick="${amIn ? `PartyGamesUI.qdTap('${table.id}')` : ""}">
                    <div style="font-size:34px;font-weight:900;">💥 BANG！快按！！</div>
                  </div>`
            }
            <div class="qd-multi-list">
              ${parts
                .map((p) => {
                  const v = times[p.id];
                  const txt =
                    v === undefined
                      ? ready[p.id]
                        ? "🟢 已準備"
                        : "⏳ 未準備"
                      : v < 0
                      ? "<span style='color:#fda4af;'>❌ 偷跑淘汰</span>"
                      : `<b class="gold-text">⚡ ${v} ms</b>`;
                  return `<div class="qd-multi-row"><span><b>${esc(p.name)}</b></span><span>${txt}</span></div>`;
                })
                .join("")}
            </div>
            ${
              isHost && fireAt > 0 && !isArmed && hasValidScore && tappedCnt < parts.length
                ? `<button class="btn btn-secondary btn-xs" style="width:100%;margin-top:8px;" onclick="PartyGamesUI.qdForceSettle('${table.id}')">
                    🏁 有人離席未按？點此截止並立即結算第 1 名
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
        const allDone = doneCnt >= parts.length;

        return `
          <div class="mini-game-box">
            <div class="ss-top" style="margin-bottom:6px;">
              <div class="mini-mode-switch" style="margin-bottom:0;">
                <button class="chip-btn" ${!canSwitchMode ? "disabled" : ""} onclick="PartyGamesUI.switchQdMode('${table.id}','draw')">🔫 西部拔槍反應</button>
                <button class="chip-btn active" ${!canSwitchMode ? "disabled" : ""} onclick="PartyGamesUI.switchQdMode('${table.id}','blind10')">⏱️ 盲按 10.000 秒</button>
              </div>
              <span class="gold-text" style="font-size:12.5px;">🏆 獨得獎池：${potPreview}</span>
            </div>
            <p class="muted-sm" style="margin:6px 0 10px;">各自按下開始計時，滿 3.000 秒後碼表自動蓋牌，全場最接近 <b>10.000 秒</b> 者獨吞獎池！（已完成 ${doneCnt}/${parts.length} 人）</p>
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
                    🏁 有人離席未按？點此截止並立即開獎結算
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
                  ${myMove ? "✅ 已暗中出拳，等待對手出拳同步開牌…" : "請在手機上選擇這回合要出的拳，雙方選完自動開牌（搶 3 勝自動派彩）！"}
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
            <div class="muted-xs" style="margin:4px 0 8px;">需另一位參賽選手按下確認，即刻自動派彩結算！</div>
            <div class="host-row">
              ${
                !alreadyConfirmed
                  ? `<button class="btn btn-emerald" onclick="PartyGamesUI.confirmWinner('${table.id}')">✅ 確認無誤・立即派彩</button>`
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
          <summary>🏆 Switch 比賽結束：點選本局第 1 名贏家（對手確認即派彩）</summary>
          <div class="bet-btn-grid" style="margin-top:8px;">
            ${table.participants
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
      const modal = document.getElementById("party-modal");
      if (!modal) return;
      this.forceModalTestOnly = Boolean(forceTestOnly);
      const ctx = window.PartyApp.getContext();
      if (this.forceModalTestOnly) {
        const firstUntested = CFG.PARTY_GAMES.find(
          (gm) => window.PartyEngine.getTestHostUsage(ctx.me.id, gm.id, ctx.tables) < 1
        );
        if (firstUntested) this.activeModalGame = firstUntested.id;
        this.activeModalTestMode = true;
        this.activeCountdownMin = 1;
      } else {
        const testUsed = window.PartyEngine.getTestHostUsage(
          ctx.me.id,
          this.activeModalGame,
          ctx.tables
        );
        if (testUsed >= 1) this.activeModalTestMode = false;
      }
      modal.classList.remove("hidden");
      this.renderCreateModalInner();
    },

    selectModalGame(gameId) {
      this.activeModalGame = gameId;
      const ctx = window.PartyApp.getContext();
      const testUsed = window.PartyEngine.getTestHostUsage(ctx.me.id, gameId, ctx.tables);
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
        ctx.tables
      );
      const isTestMode = this.forceModalTestOnly || (this.activeModalTestMode && selTestUsed < 1);
      const testQuotaExhausted = this.forceModalTestOnly && selTestUsed >= 1;

      box.innerHTML = `
        <div class="modal-head">
          <h3>${this.forceModalTestOnly ? "🧪 開啟新手不計分測試局" : "➕ 建立 Party Game 賽桌"}</h3>
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
            const tUsed = window.PartyEngine.getTestHostUsage(ctx.me.id, gm.id, ctx.tables);
            const isScoring = u.playCount < g.maxScoringPlaysPerGamePerDay;
            return `
              <div class="create-game-item ${this.activeModalGame === gm.id ? "active" : ""}"
                   onclick="PartyGamesUI.selectModalGame('${gm.id}')">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                  <b>${gm.icon} ${esc(gm.name)}</b>
                  <div style="display:flex;gap:4px;">
                    <span class="q-tag ${tUsed < 1 ? "q-ok" : "q-muted"}">
                      ${tUsed < 1 ? "🧪 可免費試玩 1次" : "🧪 已試玩"}
                    </span>
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
            ? `<div class="sub-label" style="margin-top:10px;">2. 選擇本局計分模式（每款遊戲有 1 次新手免費測試機會）：</div>
               <div class="grid-2-btns">
                 <button class="btn ${isTestMode ? "btn-primary" : "btn-secondary"} btn-sm"
                   onclick="PartyGamesUI.activeModalTestMode=true;PartyGamesUI.renderCreateModalInner();">
                   🧪 新手測試局 (0分｜剩1次)
                 </button>
                 <button class="btn ${!isTestMode ? "btn-gold" : "btn-secondary"} btn-sm"
                   onclick="PartyGamesUI.activeModalTestMode=false;PartyGamesUI.renderCreateModalInner();">
                   ⚔️ 正式賽桌 (${g.partyPlayStake} PT)
                 </button>
               </div>`
            : ""
        }

        <div class="sub-label" style="margin-top:12px;">${!this.forceModalTestOnly && selTestUsed < 1 ? "3." : "2."} 推播揪團集結倒數時間（1～3 分鐘）：</div>
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
          <input type="text" id="custom-table-note" class="input-dark" placeholder="選填備註（例如：瑪利歐賽車彩虹賽道 4人局！）">
        </div>

        ${
          testQuotaExhausted
            ? `<div class="locked-bet-msg" style="margin-top:12px;text-align:center;">✅ 你已經體驗過【${esc(selectedMeta.name)}】的 1 次免費測試局囉！請點上方選擇其他尚未試玩的遊戲。</div>`
            : `<button class="btn ${isTestMode ? "btn-primary" : "btn-gold"}" style="width:100%;margin-top:14px;" onclick="PartyGamesUI.confirmCreateTable()">
                 ${isTestMode ? "🧪 開啟不計分測試局（可揪朋友或補 AI 陪練員）" : "📢 開桌並推播通知全場！"}
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
      const ctx = window.PartyApp.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const dayKey = g.activeDayKey || "2026-12-31";
      const gm = CFG.PARTY_GAMES.find((x) => x.id === this.activeModalGame) || CFG.PARTY_GAMES[0];
      const testUsed = window.PartyEngine.getTestHostUsage(ctx.me.id, gm.id, ctx.tables);
      const isTestRun = Boolean(this.forceModalTestOnly || (this.activeModalTestMode && testUsed < 1));
      if (this.forceModalTestOnly && testUsed >= 1) {
        window.PartyApp.toast(`【${gm.name}】的新手免費測試局（1 次）已使用過囉！`);
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
        window.PartyApp.toast(`💰 目前積分不足 ${playStake} PT！可先參加主題遊戲／解隱藏任務賺分，或等明早 08:00 自動補滿回 300 PT！`);
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
      window.PartyFX.playTone("bell");
      await window.PartyApp.refreshAll();
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
      const ctx = window.PartyApp.getContext();
      const freshRows = await window.PartyDB.select(
        "tables",
        `id=eq.${encodeURIComponent(tableId)}`
      );
      const table = (freshRows && freshRows[0]) || (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "open") return;
      const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      const parts = [...(table.participants || [])];
      if (parts.some((p) => p.id === ctx.me.id)) return;
      if (parts.length >= gameMeta.maxPlayers) {
        window.PartyApp.toast(`此賽桌已滿員（最多 ${gameMeta.maxPlayers} 人）囉！`);
        await window.PartyApp.refreshAll();
        return;
      }
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const usage = window.PartyEngine.getDailyGameUsage(
        ctx.me.id,
        table.game_type,
        table.day_key,
        ctx.tables,
        ctx.bets
      );
      const isScoring = table.is_test_run
        ? false
        : usage.playCount < g.maxScoringPlaysPerGamePerDay;
      const reqStake = Number(table.stake) || 20;
      const myScore = ctx.scoreboard.byId[ctx.me.id]?.baseScore || 0;
      if (isScoring && myScore < reqStake) {
        window.PartyApp.toast(`💰 目前積分不足 ${reqStake} PT！可等明早 08:00 自動補滿回 300 PT！`);
        return;
      }

      let team = "";
      let teamLabel = "";
      if (table.game_type === "soul_sync_2v2") {
        const cntA = parts.filter((p) => p.team === "team_A").length;
        team = cntA < 2 ? "team_A" : "team_B";
        teamLabel = team === "team_A" ? "A組" : "B組";
      }

      parts.push({ id: ctx.me.id, name: ctx.me.name, isScoring, team, teamLabel });
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        participants: parts,
      });
      window.PartyFX.haptic("medium");
      await window.PartyApp.refreshAll();
    },

    async swapMyTeam(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "open") return;
      const parts = (table.participants || []).map((p) => {
        if (p.id !== ctx.me.id) return p;
        if (table.game_type === "soul_sync_2v2") {
          const next = p.team === "team_A" ? "team_B" : "team_A";
          return { ...p, team: next, teamLabel: next === "team_A" ? "A組" : "B組" };
        }
        return p;
      });
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        participants: parts,
      });
      window.PartyFX.haptic("medium");
      await window.PartyApp.refreshAll();
    },

    async leaveTable(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "open") return;
      const parts = (table.participants || []).filter((p) => p.id !== ctx.me.id);
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        participants: parts,
      });
      await window.PartyApp.refreshAll();
    },

    async cancelTable(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "open") return;
      // 退還已下注觀眾的注碼並刪除下注紀錄（不佔用每日 3 次下注額度！）
      const tableBets = (ctx.bets || []).filter((b) => b.table_id === tableId);
      for (const b of tableBets) {
        await window.PartyDB.upsert(
          "ledger",
          [
            {
              id: `cancel_bet_refund_${b.id}`,
              player_id: b.bettor_id,
              delta: Number(b.amount) || 10,
              category: "bet_refund",
              reason: `↩️ 賽桌取消退回下注【${table.title}】`,
              day_key: table.day_key,
              meta: { tableId },
            },
          ],
          { ignoreDuplicates: true }
        );
        await window.PartyDB.remove("bets", `id=eq.${encodeURIComponent(b.id)}`);
      }
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        status: "cancelled",
      });
      await window.PartyApp.refreshAll();
    },

    async placeBet(tableId, pickKey, pickLabel) {
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
    },

    async startTable(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "open") return;
      const banks = ctx.questionBanks || window.DEFAULT_QUESTION_BANKS;
      const parts = [...(table.participants || [])];

      const gameMeta = CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      if (parts.length < gameMeta.minPlayers) {
        window.PartyApp.toast(`至少需要 ${gameMeta.minPlayers} 位選手才能開賽喔！`);
        return;
      }
      if (table.game_type === "soul_sync_2v2" && parts.length !== 2 && parts.length !== 4) {
        window.PartyApp.toast("🤝 靈魂默契需為「2 人合作」或「4 人雙組 2v2 對抗」才能開賽喔！");
        return;
      }
      if (table.game_type === "soul_sync_2v2" && parts.length === 2) {
        parts.forEach((p) => {
          p.team = "team_A";
          p.teamLabel = "合作組";
        });
      }
      if (table.game_type === "soul_sync_2v2" && parts.length === 4) {
        const cntA = parts.filter((p) => p.team === "team_A").length;
        const cntB = parts.filter((p) => p.team === "team_B").length;
        if (cntA !== 2 || cntB !== 2) {
          window.PartyApp.toast("🤝 4人對抗需 A組 與 B組 各 2 人喔！（點擊自己名字旁的組別即可切換）");
          return;
        }
      }

      // 扣除計分參賽者的入場費 (純娛樂第4次+玩家不扣分！)
      for (const p of parts) {
        if (p.isScoring) {
          await window.PartyDB.upsert(
            "ledger",
            [
              {
                id: `play_stake_${table.id}_${p.id}`,
                player_id: p.id,
                delta: -(Number(table.stake) || 20),
                category: "party_stake",
                reason: `⚔️ 參賽入場費【${table.title}】`,
                day_key: table.day_key,
                meta: { tableId: table.id, gameType: table.game_type },
              },
            ],
            { ignoreDuplicates: true }
          );
        }
      }

      // 初始化各遊戲專屬起始狀態
      const initGs = {};
      if (table.game_type === "quick_draw") {
        initGs.mode = "draw";
        initGs.roundSeq = 1;
        initGs.ready = {};
        parts.forEach((p) => {
          if (String(p.id).startsWith("bot_")) initGs.ready[p.id] = true;
        });
        initGs.times = {};
      } else if (table.game_type === "number_bomb") {
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
      } else if (table.game_type === "rps_king") {
        initGs.wins = {};
        initGs.moves = {};
        initGs.roundSeq = 1;
      } else if (table.game_type === "soul_sync_2v2") {
        // 尊重玩家自選搭檔組別；若組別人數不合規（如 2人合作局或 4人並非 2v2）則自動配平
        if (parts.length === 2) {
          parts.forEach((p) => {
            p.team = "team_A";
            p.teamLabel = "A組";
          });
        } else {
          const cntA = parts.filter((p) => p.team === "team_A").length;
          const cntB = parts.filter((p) => p.team === "team_B").length;
          if (cntA !== 2 || cntB !== 2) {
            parts.forEach((p, idx) => {
              p.team = idx < 2 ? "team_A" : "team_B";
              p.teamLabel = p.team === "team_A" ? "A組" : "B組";
            });
          }
        }
        initGs.questions = window.PartyEngine.shuffle(banks.soulSync2v2).slice(0, 8);
        initGs.qIdx = 0;
        initGs.answers = {};
        initGs.scores = { team_A: 0, team_B: 0 };
      } else if (table.game_type === "ito_numbers") {
        const pool = Array.from({ length: 100 }, (_, i) => i + 1);
        const picked = window.PartyEngine.shuffle(pool).slice(0, parts.length);
        initGs.secretNumbers = {};
        parts.forEach((p, idx) => {
          initGs.secretNumbers[p.id] = picked[idx];
        });
        initGs.theme = window.PartyEngine.shuffle(banks.itoThemes)[0];
        initGs.proposedOrder = parts.map((p) => p.id);
        initGs.revealed = false;
      } else if (table.game_type === "five_seconds") {
        initGs.turn = 0;
        initGs.scores = {};
        initGs.prompts = window.PartyEngine
          .shuffle(banks.fiveSeconds)
          .slice(0, parts.length * 3 + 4)
          .map((x) => x.prompt);
      }

      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        status: "playing",
        participants: parts,
        game_state: initGs,
      });
      window.PartyFX.playTone("bell");
      await window.PartyApp.refreshAll();
    },

    // --- 2～16 人 手機毫秒決鬥 (西部拔槍 & 盲按 10.000s，獨立資料列防併發覆蓋！) ---
    async switchQdMode(tableId, mode) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.host_id !== ctx.me.id) return;
      delete this.blindStopwatchStart[tableId];
      const nextRoundSeq = ((table.game_state && table.game_state.roundSeq) || 1) + 1;
      const ready = {};
      (table.participants || []).forEach((p) => {
        if (String(p.id).startsWith("bot_")) ready[p.id] = true;
      });
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        game_state: { mode, roundSeq: nextRoundSeq, ready, times: {}, fireAt: 0 },
      });
      await window.PartyApp.refreshAll();
    },

    async qdReady(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || table.status !== "playing") return;
      const gs = { ...(table.game_state || {}) };
      const mode = gs.mode || "draw";
      const roundSeq = gs.roundSeq || 1;
      const rKey = `qd_ready_${mode}_${roundSeq}`;

      // 寫入獨立 row 確保 16 人同時按準備絕不互相覆蓋！
      await window.PartyDB.upsert("theme_responses", [
        {
          id: `${tableId}_${rKey}_${ctx.me.id}`,
          session_id: tableId,
          step_key: rKey,
          player_id: ctx.me.id,
          payload: { ready: true },
        },
      ]);

      const freshResps = await window.PartyDB.select(
        "theme_responses",
        `session_id=eq.${encodeURIComponent(tableId)}&step_key=eq.${encodeURIComponent(rKey)}`
      );
      const mergedReady = { ...(gs.ready || {}), [ctx.me.id]: true };
      (freshResps || []).forEach((r) => (mergedReady[r.player_id] = true));

      const allReady = (table.participants || []).every((p) => mergedReady[p.id]);
      if (allReady && !gs.fireAt) {
        gs.ready = mergedReady;
        gs.fireAt = window.PartyDB.serverNowMs + 2500 + Math.floor(Math.random() * 2800);
        gs.times = {};
        await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
          game_state: gs,
        });
      }
      await window.PartyApp.refreshAll();
    },

    async resolveAndFinishQd(table, mode, mergedTimes, ctx) {
      const parts = table.participants || [];
      let winnerIds = [];
      if (mode === "draw") {
        const valid = parts.filter((p) => mergedTimes[p.id] !== undefined && mergedTimes[p.id] >= 0);
        if (valid.length === 0) {
          // 若是 2 人局其中 1 人偷跑、另 1 人尚未按，則未偷跑者直接獲勝；若全員皆偷跑則平手退費
          const notFalse = parts.filter((p) => mergedTimes[p.id] === undefined);
          winnerIds = notFalse.length === 1 ? [notFalse[0].id] : ["__pvp_tie__"];
        } else {
          valid.sort((a, b) => mergedTimes[a.id] - mergedTimes[b.id]);
          winnerIds = [valid[0].id];
        }
      } else {
        const valid = parts.filter((p) => mergedTimes[p.id] !== undefined);
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

    async qdTap(tableId) {
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

      const now = window.PartyDB.serverNowMs;
      const diff = now - (gs.fireAt || 0);
      const myMs = diff < 0 ? -1 : diff;
      const tKey = `qd_time_${mode}_${roundSeq}`;
      window.PartyFX.haptic("heavy");

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
            payload: { ms: 340 + Math.floor(Math.random() * 240) },
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

      const parts = table.participants || [];
      const nonFalseRemaining = parts.filter(
        (p) => mergedTimes[p.id] === undefined || mergedTimes[p.id] >= 0
      );
      const allTapped = parts.every((p) => mergedTimes[p.id] !== undefined);

      // 若全員皆已按下，或多人偷跑導致全場只剩唯一 1 位未犯規選手（例如 1v1 對手偷跑），立即判勝！
      if (allTapped || (myMs < 0 && nonFalseRemaining.length === 1)) {
        await this.resolveAndFinishQd(table, "draw", mergedTimes, ctx);
      } else {
        await window.PartyApp.refreshAll();
      }
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

      const allDone = (table.participants || []).every((p) => mergedTimes[p.id] !== undefined);
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
        window.PartyFX.playTone("fire");
        window.PartyFX.haptic("heavy");
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
        } else if (
          (m1 === "rock" && m2 === "scissors") ||
          (m1 === "scissors" && m2 === "paper") ||
          (m1 === "paper" && m2 === "rock")
        ) {
          gs.wins[p1.id] = (gs.wins[p1.id] || 0) + 1;
          gs.lastRoundMsg = `${p1.name} ${icon[m1]} 贏了 ${p2.name} ${icon[m2]}！`;
        } else {
          gs.wins[p2.id] = (gs.wins[p2.id] || 0) + 1;
          gs.lastRoundMsg = `${p2.name} ${icon[m2]} 贏了 ${p1.name} ${icon[m1]}！`;
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
        if (teamA.length === 2 && curAnswers[teamA[0].id] === curAnswers[teamA[1].id]) {
          gs.scores.team_A += 1;
        }
        if (teamB.length === 2 && curAnswers[teamB[0].id] === curAnswers[teamB[1].id]) {
          gs.scores.team_B += 1;
        }

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
      gs.turn = (gs.turn || 0) + 1;
      gs.turnStartedAt = 0;

      while (
        gs.turn < parts.length * 3 &&
        String(parts[gs.turn % parts.length].id).startsWith("bot_")
      ) {
        const bp = parts[gs.turn % parts.length];
        if (Math.random() < 0.65) gs.scores[bp.id] = (gs.scores[bp.id] || 0) + 1;
        gs.turn += 1;
      }

      if (gs.turn >= parts.length * 3) {
        let best = -1;
        parts.forEach((p) => {
          const s = gs.scores[p.id] || 0;
          if (s > best) best = s;
        });
        const topPlayers = best > 0 ? parts.filter((p) => (gs.scores[p.id] || 0) === best).map((p) => p.id) : [];
        await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, { game_state: gs });
        return await this.autoFinishTable(table, topPlayers, ctx);
      }

      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        game_state: gs,
      });
      await window.PartyApp.refreshAll();
    },

    // --- 手動申報與對手互認 ---
    async proposeWinner(tableId, winnerIds) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (table && (table.participants || []).some((p) => String(p.id).startsWith("bot_"))) {
        return await this.autoFinishTable(table, winnerIds, ctx);
      }
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        status: "settling",
        proposed_winners: winnerIds,
        confirmed_by: [ctx.me.id],
      });
      await window.PartyApp.refreshAll();
    },

    async resetProposal(tableId) {
      await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
        status: "playing",
        proposed_winners: null,
        confirmed_by: [],
      });
      await window.PartyApp.refreshAll();
    },

    async confirmWinner(tableId) {
      const ctx = window.PartyApp.getContext();
      const table = (ctx.tables || []).find((t) => t.id === tableId);
      if (!table || !table.proposed_winners) return;
      const confirmed = new Set(table.confirmed_by || []);
      confirmed.add(ctx.me.id);
      if (confirmed.size >= 2 || (table.participants || []).length <= 1) {
        await this.autoFinishTable(table, table.proposed_winners, ctx);
      } else {
        await window.PartyDB.update("tables", `id=eq.${encodeURIComponent(tableId)}`, {
          confirmed_by: [...confirmed],
        });
        await window.PartyApp.refreshAll();
      }
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
  };

  window.PartyGamesUI = PartyGamesUI;
})();
