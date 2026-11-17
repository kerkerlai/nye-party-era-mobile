/**
 * 《跨年英雄紀元》7 大主題遊戲全員同步引擎 (themeGames.js)
 * GM 打開手機即可當 Host 開房，且系統採用「自動盲抽防破梗設計」讓 GM 自己也能一起下場猜謎抓鬼！
 */

(function () {
  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const THEME_LIST = [
    {
      id: "share_2026_2027",
      icon: "🌟",
      name: "跨年英雄紀元・分享篇",
      sub: "2026 回顧 & 2027 展望盲猜 (+10/+20 PT，題主 +15 PT)",
      rules: [
        "Round 1 猜【2026 回顧】，Round 2 猜【2027 展望】。",
        "每題同時盲猜：① 故事主人是誰？ ② 哪個選項才是「真實細節」？",
        "🤫 題主本人請跟著隨便點選防破梗；開獎後分享 1 分鐘真實故事。"
      ],
      scoring: [
        "🎁 題主固定獲分享獎 +15 PT；猜題者猜中主人 +10、猜中真細節 +10（雙殺 +20 PT）。"
      ],
      achievements: ["🔮【讀心神探 +40 PT】：單輪總命中率達 70% 以上自動獲得。"]
    },
    {
      id: "poll_minority",
      icon: "🗳️",
      name: "匿名靈魂爆料派對",
      sub: "匿名指認現場夥伴（可投自己），命中最高票 +15 PT",
      rules: [
        "每題匿名投給 1 位最符合的夥伴（可投自己）。",
        "開票僅公布前 3 高票，不公開誰投誰；Host 可隨時插播現場內梗題。"
      ],
      scoring: [
        "🗳️ 投給當題最高票得主（含並列第 1）者，每人 +15 PT。"
      ]
    },
    {
      id: "wavelength",
      icon: "📡",
      name: "心電頻率同步",
      sub: "發訊員口頭暗示刻度，全員拉 0～100 滑桿猜靶心 (+15~50 PT)",
      rules: [
        "每輪隨機指派 1 位【🎙️ 發訊員】看秘密刻度（0～100），口頭舉例暗示（禁說數字）。",
        "其餘玩家拉動 0～100 滑桿鎖定猜測，全員鎖定後開獎。"
      ],
      scoring: [
        "🎯 猜題誤差 ±4 內 +50 PT、±5～10 得 +30 PT、±11～18 得 +15 PT。",
        "🎙️ 發訊員依進圈（±18 內）人數比例獲最高 +50 PT 助攻分。"
      ]
    },
    {
      id: "undercover",
      icon: "🕵️",
      name: "誰是臥底",
      sub: "自動盲抽平民／臥底／白板，發言推理投票抓內鬼 (+20~90 PT)",
      rules: [
        "系統依人數自動發詞（5人以上含無詞白板），Host 也可一起下場玩。",
        "依序各講一句話形容（禁講詞面字、禁照抄），講完投票出局最高票（平票重投）。",
        "內鬼全出局 ➜ 平民勝；存活內鬼 ≥ 存活平民（或剩 2 人未抓完）➜ 內鬼勝。"
      ],
      scoring: [
        "🛡️ 平民勝：存活 +40／出局 +20 PT；😈 內鬼勝：存活臥底 +70（出局 +35）、存活白板 +90（出局 +30）PT。",
        "🎯 平民每次正式開票投中內鬼，當下額外 +5 PT。"
      ],
      achievements: ["🕵️【影帝級臥底 +40 PT】：擔任臥底或白板且存活獲勝自動獲得。"]
    },
    {
      id: "find_figurine",
      icon: "🏃‍♂️",
      name: "實體小人攻防戰",
      sub: "A/B 隊上下半場攻守計時，勝隊全員 +100 PT",
      rules: [
        "隨機平分 A/B 隊，上下半場攻守交換（上半 A 藏 B 找，下半 B 藏 A 找）。",
        "藏匿限公共區且須露出 1/3 身體（禁藏私人物品／馬桶／高處）。",
        "每找到 1 隻拍傳群組相簿並打勾按「✅ 打卡收繳計時」鎖定秒數。"
      ],
      scoring: [
        "⚖️ 先比尋獲總隻數，同數比總耗時短者勝；勝隊每人 +100 PT、完賽隊 +40 PT。"
      ],
      achievements: ["🔍【神探夏洛克 +40 PT】：獲勝隊伍全員自動獲得。"]
    },
    {
      id: "physical_6stages",
      icon: "🏓",
      name: "實體六關紅藍大對抗",
      sub: "隨機分紅藍兩隊，6 關獨立結算（每關勝隊 +30 PT）",
      rules: [
        "隨機平分紅藍兩隊（奇數時少人隊自動抽 1 位代表可多上場 1 次）。",
        "共比 6 道實體關卡，每關結束由 Host 點選勝隊即時發分。"
      ],
      scoring: [
        "💰 6 關獨立計分，每贏一關全隊每人 +30 PT（6 關全勝最高 +180 PT）。"
      ]
    },
    {
      id: "nye_checkin",
      icon: "🎆",
      name: "跨年煙火倒數 ＆ 新年簽到禮",
      sub: "全場同步跨年煙火倒數，歸零領簽到禮 (+50 PT)",
      rules: [
        "全場手機自動對時倒數，歸零綻放煙火並解鎖簽到按鈕。"
      ],
      scoring: [
        "🎉 點擊領取每人固定 +50 PT（限領 1 次）。"
      ]
    },
  ];

  const PHYSICAL_STAGES = [
    { no: 1, title: "🎯 指定彈跳碗", prop: "乒乓球、大碗", rule: "限時 3 分鐘接力：第 1 棒桌彈 1 下碰碗即過，下一棒變彈 2 下、3 下遞增（失敗換棒重試同下數），推進最多下者勝（+30 PT）。" },
    { no: 2, title: "📏 懸崖桌上冰壺", prop: "配重紙杯、桌緣分數線", rule: "桌尾貼 +10／+30／懸崖 +50 分區（掉落 0 分）。兩隊各 5 棒交替推杯（可撞走敵杯），總分高者勝（+30 PT）。" },
    { no: 3, title: "🍾 立水瓶快手搶球", prop: "1/3 水寶特瓶×2、乒乓球×1", rule: "BO5 搶 3 勝：雙方面對面甩立水瓶，先立穩者才准搶中央乒乓球（+30 PT）。" },
    { no: 4, title: "⭕ 九宮格乒乓連線", prop: "3×3 紙杯陣、雙色球", rule: "BO3 搶 2 勝：接力投球進 3×3 紙杯玩 OOXX，先連成一線拿 1 局（+30 PT）。" },
    { no: 5, title: "📐 盲拉捲尺精準王", prop: "捲尺×1", rule: "共 5 題：刻度朝下盲拉指定長度（如 68cm），5 題總誤差最小隊勝（+30 PT）。" },
    { no: 6, title: "⚖️ 人體電子秤重王", prop: "料理電子秤×1（遮螢幕）", rule: "BO3 搶 2 勝：公布目標克數，45 秒抓現場物品湊重（禁放手機），誤差小者拿 1 點（+30 PT）。" },
  ];

  const ThemeGamesUI = {
    selectedThemeToOpen: "share_2026_2027",
    _lastSyncedSlotId: "",
    localShareOwnerPick: "",
    localShareFactPick: -1,
    editingShareStepKey: "",
    shareRankScope: "all", // all | 2026 | 2027
    localSliderVal: 50,
    editingWlStepKey: "",
    checkedFigKeys: new Set(),
    figurineTimerHandle: null,
    nyeTimerHandle: null,

    getDynamicThemeList(globalCfg) {
      const g = { ...(window.PARTY_CONFIG?.DEFAULTS || {}), ...(globalCfg || {}) };
      const evTitle = g.eventTitle || "跨年英雄紀元";
      const lbA = g.shareLabelA || "2026 回顧";
      const lbB = g.shareLabelB || "2027 展望";
      const giftPts = Number(g.nyeGiftPoints) || 50;
      return THEME_LIST.map((item) => {
        if (item.id === "share_2026_2027") {
          return {
            ...item,
            name: `${evTitle}・分享篇`,
            sub: `${lbA} & ${lbB}兩輪盲猜 (+10/+20 PT，題主 +15 PT)`,
            rules: [
              `分兩輪進行：Round 1 猜大家預填的【${lbA}】，Round 2 猜【${lbB}】。`,
              item.rules[1],
              item.rules[2],
            ],
          };
        }
        if (item.id === "nye_checkin") {
          return {
            ...item,
            sub: `全場手機依排程時間同步煙火倒數，歸零解鎖新年簽到禮 (+${giftPts} PT)`,
            scoring: [`🎉 點擊領取新年簽到禮的在場每位夥伴，人人固定入帳新年開運積分 +${giftPts} PT（每人限領 1 次）！`],
          };
        }
        return item;
      });
    },

    toggleFigLineCheck(fullKey, checked) {
      if (checked) this.checkedFigKeys.add(fullKey);
      else this.checkedFigKeys.delete(fullKey);
    },

    getActiveSession(themeSessions) {
      return (themeSessions || [])
        .filter((s) => s.status !== "finished")
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
    },

    renderThemeRuleBox(meta, collapsible = true, defaultOpen = false) {
      if (!meta) return "";
      const inner = `
        <div class="rule-block-inner">
          <div class="cyan-text" style="font-weight:800;margin-bottom:3px;">🎯 玩法規則：</div>
          <ul class="rule-ul">
            ${(meta.rules || []).map((r) => `<li>${esc(r)}</li>`).join("")}
          </ul>
          <div class="gold-text" style="font-weight:800;margin:7px 0 3px;">💰 計分方式：</div>
          <ul class="rule-ul">
            ${(meta.scoring || []).map((s) => `<li>${esc(s)}</li>`).join("")}
          </ul>
          ${
            (meta.achievements || []).length
              ? `<div class="rule-achv-line"><b>🏅 專屬成就：</b>${(meta.achievements || []).map((a) => esc(a)).join("<br>")}</div>`
              : ""
          }
        </div>
      `;
      if (!collapsible) {
        return `<div class="rule-guide-box" style="text-align:left;">${inner}</div>`;
      }
      return `
        <details class="rule-guide-box" style="text-align:left;" ${defaultOpen ? "open" : ""}>
          <summary>📖 點此展開／收合【${esc(meta.name)}】詳細玩法 ＆ 計分規則</summary>
          ${inner}
        </details>
      `;
    },

    renderStage(ctx) {
      const { me, isGmUnlocked, themeSessions, sceneInfo, globalCfg } = ctx;
      const dynThemes = this.getDynamicThemeList(globalCfg);
      const slotId = sceneInfo.activeSlot?.id || "";
      const slotTheme = sceneInfo.activeSlot?.themeType || "";
      if (slotId && slotId !== this._lastSyncedSlotId) {
        this._lastSyncedSlotId = slotId;
        if (slotTheme && dynThemes.some((t) => t.id === slotTheme)) {
          this.selectedThemeToOpen = slotTheme;
        }
      }

      // 若排程在跨年簽到時段且尚無開啟中的主題房，直接顯示跨年煙火簽到舞台
      const active = this.getActiveSession(themeSessions);

      if (!active && sceneInfo.scene === "nye_gift") {
        return this.renderNyeCheckinStandalone(ctx);
      }

      if (!active) {
        const pickedMeta = dynThemes.find((t) => t.id === this.selectedThemeToOpen) || dynThemes[0];
        return `
          <div class="section-card" style="text-align:center;padding:22px 16px;">
            <div style="font-size:40px;margin-bottom:6px;">🎪</div>
            <h3 style="margin-bottom:6px;">主題遊戲集合時間！</h3>
            <p class="muted-sm">請聽 Host 號召準備加入房間，全場手機將同步連線開玩！</p>
            ${
              isGmUnlocked
                ? `<div class="gm-host-launcher" style="margin-top:14px;text-align:left;">
                    <div class="sub-label">👑 GM Host 快速開房器（點選查看規則並開房）：</div>
                    <div class="create-game-list">
                      ${dynThemes
                        .map(
                          (t) => `<div class="create-game-item ${this.selectedThemeToOpen === t.id ? "active" : ""}"
                                     onclick="ThemeGamesUI.selectedThemeToOpen='${t.id}';PartyApp.render();">
                            <b>${t.icon} ${esc(t.name)}</b>
                            <div class="muted-xs">${esc(t.sub)}</div>
                          </div>`
                        )
                        .join("")}
                    </div>
                    <div style="margin-top:10px;">
                      ${this.renderThemeRuleBox(pickedMeta, false)}
                    </div>
                    <button class="btn btn-gold" style="width:100%;margin-top:12px;" onclick="ThemeGamesUI.openThemeSession()">
                      🚪 開啟【${esc(pickedMeta.name)}】房間號召全員加入！
                    </button>
                  </div>`
                : `<div class="muted-xs" style="margin:10px 0 12px;">（等待 Host 開啟本場主題房間…可先點下方預覽各主題遊戲規則與計分！）</div>
                   <div style="text-align:left;">
                     ${dynThemes.map((t) => this.renderThemeRuleBox(t, true, false)).join("")}
                   </div>`
            }
          </div>
        `;
      }

      const isHost = active.host_id === me.id || isGmUnlocked;
      const joined = (active.participants || []).includes(me.id);
      const meta = dynThemes.find((x) => x.id === active.theme_type) || dynThemes[0];
      const st = active.state || {};
      const isLobbyPhase =
        active.status === "lobby" ||
        (active.theme_type === "wavelength" && !st.prompt) ||
        (active.theme_type === "undercover" && !st.roles) ||
        (active.theme_type === "find_figurine" && !st.teamA) ||
        (active.theme_type === "physical_6stages" && !st.redTeam);

      return `
        <div class="theme-stage-card">
          <div class="table-header">
            <span class="scene-pill pill-pink">${meta.icon} ${esc(meta.name)}</span>
            ${
              isHost
                ? `<button class="btn btn-ghost btn-xs" onclick="ThemeGamesUI.closeSession('${active.id}')">結束本場</button>`
                : ""
            }
          </div>

          <div style="margin:8px 0 10px;">
            ${
              !joined
                ? this.renderThemeRuleBox(meta, false)
                : this.renderThemeRuleBox(meta, true, isLobbyPhase)
            }
          </div>

          ${
            !joined && active.theme_type !== "nye_checkin"
              ? `<div style="text-align:center;padding:10px 8px 6px 8px;">
                  <p class="muted-sm" style="margin-bottom:10px;">目前已有 <b>${(active.participants || []).length}</b> 位夥伴在房間內</p>
                  <button class="btn btn-gold" style="width:100%;font-size:17px;padding:14px;" onclick="ThemeGamesUI.joinSession('${active.id}')">
                    🚪 我看懂規則了・點擊加入主題房間！
                  </button>
                </div>`
              : this.renderActiveThemeBody(active, ctx, isHost)
          }
        </div>
      `;
    },

    renderActiveThemeBody(session, ctx, isHost) {
      const playerMap = {};
      (ctx.players || []).forEach((p) => (playerMap[p.id] = p));

      switch (session.theme_type) {
        case "share_2026_2027":
          return this.renderShareGame(session, ctx, isHost, playerMap);
        case "poll_minority":
          return this.renderPollMinority(session, ctx, isHost, playerMap);
        case "wavelength":
          return this.renderWavelength(session, ctx, isHost, playerMap);
        case "undercover":
          return this.renderUndercover(session, ctx, isHost, playerMap);
        case "find_figurine":
          return this.renderFindFigurine(session, ctx, isHost, playerMap);
        case "physical_6stages":
          return this.renderPhysical6(session, ctx, isHost, playerMap);
        case "nye_checkin":
          return this.renderNyeCheckinSession(session, ctx, isHost);
        default:
          return `<div>未知主題類型</div>`;
      }
    },

    // ==================== 1. 🌟 跨年英雄紀元・分享篇 ====================
    renderShareGame(session, ctx, isHost, playerMap) {
      const { me, themeResponses, globalCfg } = ctx;
      const g = { ...(window.PARTY_CONFIG?.DEFAULTS || {}), ...(globalCfg || {}) };
      const lbA = g.shareLabelA || "2026 回顧";
      const lbB = g.shareLabelB || "2027 展望";
      const st = session.state || {};
      const joinedPlayers = (session.participants || []).map((id) => playerMap[id]).filter(Boolean);

      if (session.status === "lobby") {
        const ready2026 = joinedPlayers.filter((p) => p.share_2026 && p.share_2026.story).length;
        const ready2027 = joinedPlayers.filter((p) => p.share_2027 && p.share_2027.story).length;
        const myMissing = !me.share_2026?.story || !me.share_2027?.story;

        return `
          <div class="mini-game-box">
            <div class="q-title">🌟 集合大廳（${joinedPlayers.length} 人）</div>
            <div class="muted-xs">${esc(lbA)}已填：${ready2026}/${joinedPlayers.length} ｜ ${esc(lbB)}已填：${ready2027}/${joinedPlayers.length}</div>
            <div class="part-chips" style="margin:10px 0;">
              ${joinedPlayers
                .map((p) => {
                  const ok = Boolean(p.share_2026?.story && p.share_2027?.story);
                  return `<span class="part-chip ${ok ? "scoring" : "fun-only"}">
                    <span>${esc(p.name)}</span>
                    <small style="color:${ok ? "#6ee7b7" : "#fcd34d"};">${ok ? "✅已填" : "⏳待填"}</small>
                  </span>`;
                })
                .join("")}
            </div>
            ${
              myMissing
                ? `<div class="toast-inline">⚠️ 尚未填完分享卡，請至「🏠 個人主頁 ➜ 個人資料填寫」補填。</div>`
                : ""
            }
            ${
              isHost
                ? `<div class="grid-2-btns" style="margin-top:12px;">
                    <button class="btn btn-gold" onclick="ThemeGamesUI.startShareRound('${session.id}', '2026')">▶️ Round 1 (${esc(lbA)})</button>
                    <button class="btn btn-primary" onclick="ThemeGamesUI.startShareRound('${session.id}', '2027')">▶️ Round 2 (${esc(lbB)})</button>
                  </div>`
                : `<div class="muted-xs">等待 Host 開局…</div>`
            }
          </div>
        `;
      }

      const items = st.items || [];
      const idx = st.idx || 0;
      const cur = items[idx];
      if (!cur) {
        return this.renderShareDetectiveLeaderboard(session, ctx, isHost, playerMap, lbA, lbB);
      }

      const stepKey = `${st.year}_${idx}`;
      const resps = (themeResponses || []).filter(
        (r) => r.session_id === session.id && r.step_key === stepKey
      );
      const answeredSet = new Set(resps.map((r) => r.player_id));
      const waitingNames = joinedPlayers
        .filter((p) => !answeredSet.has(p.id))
        .map((p) => esc(p.name));
      const myResp = resps.find((r) => r.player_id === me.id);
      const isEditingShare = this.editingShareStepKey === stepKey;
      const isStoryOwner = cur.ownerId === me.id;
      const isOwnerBlocked = Boolean(
        window.PartyApp.isPlayerBlocked && window.PartyApp.isPlayerBlocked(cur.ownerId)
      );
      const isStepHidden = this.isShareStepHidden(session.id, stepKey);
      const isMasked = isOwnerBlocked || isStepHidden;
      const displayStory = isMasked ? "🚫 [已隱藏此題封鎖或不當內容]" : cur.story;
      const displayOptions = (cur.options || []).map((opt) =>
        isMasked ? "[已隱藏選項]" : opt
      );

      return `
        <div class="mini-game-box">
          <div class="ss-top">
            <span class="badge-pill">Round ${st.year === "2026" ? `1：${esc(lbA)}` : `2：${esc(lbB)}`} (${idx + 1}/${items.length})</span>
            <span class="q-tag ${resps.length >= joinedPlayers.length ? "q-ok" : "q-cheer"}">🔒 已鎖定 ${resps.length}/${joinedPlayers.length}</span>
          </div>
          ${
            !st.revealed && waitingNames.length > 0
              ? `<div class="part-chips" style="margin-top:6px;">
                   ${waitingNames
                     .map(
                       (nm) => `<span class="part-chip fun-only" style="padding:2px 8px;"><span>⏳ ${nm}</span></span>`
                     )
                     .join("")}
                 </div>`
              : ""
          }

          <div class="story-quote">「${esc(displayStory)}」</div>
          ${
            !isStoryOwner && !isMasked
              ? `<div style="display:flex;justify-content:flex-end;margin-top:4px;">
                   <button type="button" class="btn-copy" style="font-size:11px;opacity:0.8;" onclick="ThemeGamesUI.reportShareItem('${esc(session.id)}','${esc(stepKey)}')">🚩 檢舉／隱藏此題不當內容</button>
                 </div>`
              : ""
          }

          ${
            isStoryOwner && !st.revealed
              ? `<div class="stealth-owner-hint">🤫 你的題目！請隨便點選裝忙防破梗（固定獲 +15 PT 分享獎）</div>`
              : ""
          }

          ${
            !st.revealed
              ? myResp && !isEditingShare
                ? `<div class="locked-cheer-msg" style="text-align:center;">
                     <div>🔒 已鎖定（猜：<b>${esc(playerMap[myResp.payload?.ownerPick]?.name || "?")}</b> ／ 細節 <b>${["A", "B", "C", "D"][myResp.payload?.factPick] || "?"}</b>）</div>
                     <button type="button" class="btn btn-ghost btn-xs" style="margin-top:8px;border-color:rgba(251,191,36,0.55);color:#fde047;"
                       onclick="ThemeGamesUI.beginEditShareGuess('${stepKey}','${esc(myResp.payload?.ownerPick || "")}',${Number(myResp.payload?.factPick ?? -1)})">
                       ↺ 開獎前修改
                     </button>
                   </div>`
                : `
                  <div class="sub-label">Step 1：猜故事主人 (+10 PT)</div>
                  <div class="owner-pick-grid">
                    ${joinedPlayers
                      .map(
                        (p) => `<button class="chip-select ${this.localShareOwnerPick === p.id ? "selected" : ""}" title="${esc(p.name)}"
                          onclick="ThemeGamesUI.localShareOwnerPick='${p.id}';PartyApp.render();">
                          ${esc(p.name)}
                        </button>`
                      )
                      .join("")}
                  </div>

                  <div class="sub-label" style="margin-top:10px;">Step 2：猜哪個是真實細節 (+10 PT)</div>
                  <div class="opt-grid">
                    ${displayOptions
                      .map(
                        (opt, oIdx) => `<button class="opt-btn ${this.localShareFactPick === oIdx ? "selected" : ""}"
                          onclick="ThemeGamesUI.localShareFactPick=${oIdx};PartyApp.render();">
                          <b>${["A", "B", "C", "D"][oIdx]}.</b> ${esc(opt)}
                        </button>`
                      )
                      .join("")}
                  </div>

                  <div style="display:flex;gap:8px;margin-top:12px;">
                    ${
                      myResp
                        ? `<button type="button" class="btn btn-ghost btn-sm" onclick="ThemeGamesUI.editingShareStepKey='';PartyApp.render();">取消</button>`
                        : ""
                    }
                    <button class="btn btn-gold" style="flex:1;"
                      ${!this.localShareOwnerPick || this.localShareFactPick < 0 ? "disabled" : ""}
                      onclick="ThemeGamesUI.submitShareGuess('${session.id}','${stepKey}')">
                      ✅ ${myResp ? "更新鎖定" : "鎖定送出猜測"}
                    </button>
                  </div>
                `
              : `
                <div class="reveal-card">
                  <div style="font-size:18px;font-weight:800;color:#fbbf24;">
                    🎉 真相揭曉！故事主人是：【${esc(playerMap[cur.ownerId]?.name || cur.ownerId)}】（獲得分享獎 +15 PT）
                  </div>
                  <div style="margin-top:6px;color:#6ee7b7;font-weight:700;">
                    ✅ 真實細節是：${["A", "B", "C", "D"][cur.trueIdx]}. ${esc(displayOptions[cur.trueIdx])}
                  </div>
                  <div class="muted-xs" style="margin-top:8px;">
                    本題雙殺 +20 PT 神探：${
                      resps
                        .filter(
                          (r) =>
                            r.player_id !== cur.ownerId &&
                            r.payload.ownerPick === cur.ownerId &&
                            r.payload.factPick === cur.trueIdx
                        )
                        .map((r) => esc(playerMap[r.player_id]?.name || ""))
                        .join("、") || "無（太會藏啦！）"
                    }
                  </div>
                </div>
              `
          }

          ${
            isHost
              ? `<div class="host-row" style="margin-top:12px;">
                  ${
                    !st.revealed
                      ? `<button class="btn btn-primary" onclick="ThemeGamesUI.revealShareItem('${session.id}')">📣 全員選完・同步公布答案！</button>`
                      : `<button class="btn btn-gold" onclick="ThemeGamesUI.nextShareItem('${session.id}')">➡️ 下一位英雄的題目</button>`
                  }
                </div>`
              : ""
          }
        </div>
      `;
    },

    isShareStepHidden(sessionId, stepKey) {
      try {
        const raw = localStorage.getItem("nye_hidden_share_keys");
        const arr = raw ? JSON.parse(raw) : [];
        return arr.includes(`${sessionId}_${stepKey}`);
      } catch (_) {
        return false;
      }
    },

    async reportShareItem(sessionId, stepKey) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      const st = s?.state || {};
      const cur = (st.items || [])[st.idx || 0];
      if (!ctx.me || !cur) return;
      try {
        const raw = localStorage.getItem("nye_hidden_share_keys");
        const set = new Set(raw ? JSON.parse(raw) : []);
        set.add(`${sessionId}_${stepKey}`);
        localStorage.setItem("nye_hidden_share_keys", JSON.stringify([...set]));
      } catch (_) {}
      const targetPlayer = (ctx.players || []).find((p) => p.id === cur.ownerId);
      await window.PartyDB.upsert("theme_responses", [
        {
          id: `ugc_rep_${ctx.me.id}_${sessionId}_${stepKey}`,
          session_id: "ugc_reports",
          step_key: "report",
          player_id: ctx.me.id,
          payload: {
            targetId: cur.ownerId,
            targetName: targetPlayer?.name || cur.ownerId,
            reporterName: ctx.me.name,
            reportedAt: new Date().toISOString(),
          },
        },
      ]);
      window.PartyApp.toast("✅ 已在本機隱藏本題內容，並通知主辦人審核！");
      await window.PartyApp.refreshAll();
    },

    beginEditShareGuess(stepKey, ownerPick, factPick) {
      this.editingShareStepKey = stepKey;
      this.localShareOwnerPick = ownerPick || "";
      this.localShareFactPick = Number.isFinite(factPick) ? factPick : -1;
      window.PartyApp.render();
    },

    renderShareDetectiveLeaderboard(session, ctx, isHost, playerMap, lbA, lbB) {
      const { themeResponses, badgesAwarded } = ctx;
      const st = session.state || {};
      const roundsByYear = { ...(st.roundsByYear || {}) };
      if (st.year && Array.isArray(st.items) && !roundsByYear[st.year]) {
        roundsByYear[st.year] = st.items;
      }
      const has2026 = Array.isArray(roundsByYear["2026"]) && roundsByYear["2026"].length > 0;
      const has2027 = Array.isArray(roundsByYear["2027"]) && roundsByYear["2027"].length > 0;
      const scope =
        has2026 && has2027
          ? this.shareRankScope || "all"
          : has2027
          ? "2027"
          : "2026";
      const yearsToCount =
        scope === "all"
          ? ["2026", "2027"].filter((y) => Array.isArray(roundsByYear[y]))
          : [scope].filter((y) => Array.isArray(roundsByYear[y]));

      const sessResps = (themeResponses || []).filter((r) => r.session_id === session.id);
      const mindReaders = new Set(
        (badgesAwarded || [])
          .filter((b) => b.badge_code === "mile_mindreader")
          .map((b) => b.player_id)
      );

      const stats = (session.participants || []).map((pid) => {
        const pl = playerMap[pid] || { id: pid, name: pid };
        let ownerHits = 0;
        let factHits = 0;
        let doubleKills = 0;
        let questionsGuessed = 0;

        yearsToCount.forEach((yr) => {
          (roundsByYear[yr] || []).forEach((item, i) => {
            if (!item || item.ownerId === pid) return;
            questionsGuessed += 1;
            const r = sessResps.find(
              (x) => x.step_key === `${yr}_${i}` && x.player_id === pid
            );
            if (!r || !r.payload) return;
            const hitOwner = r.payload.ownerPick === item.ownerId;
            const hitFact = Number(r.payload.factPick) === Number(item.trueIdx);
            if (hitOwner) ownerHits += 1;
            if (hitFact) factHits += 1;
            if (hitOwner && hitFact) doubleKills += 1;
          });
        });

        const totalHits = ownerHits + factHits;
        const possibleHits = questionsGuessed * 2;
        const accuracyRatio = possibleHits > 0 ? totalHits / possibleHits : 0;
        const accuracyPct = possibleHits > 0 ? Math.round(accuracyRatio * 100) : 0;
        const dkRatio = questionsGuessed > 0 ? doubleKills / questionsGuessed : 0;
        const guessPts = totalHits * 10;
        return {
          pid,
          name: pl.name || pid,
          ownerHits,
          factHits,
          doubleKills,
          questionsGuessed,
          totalHits,
          possibleHits,
          accuracyRatio,
          accuracyPct,
          dkRatio,
          guessPts,
          hasBadge: mindReaders.has(pid),
        };
      });

      // 以「命中率 %」優先排名（同命中率再比雙殺率，確保有填分享卡少猜自己 1 題的玩家 100% 公平，不被未填卡者多猜 1 題壓過！）
      stats.sort((a, b) => {
        if (Math.abs(b.accuracyRatio - a.accuracyRatio) > 1e-9) {
          return b.accuracyRatio - a.accuracyRatio;
        }
        if (Math.abs(b.dkRatio - a.dkRatio) > 1e-9) {
          return b.dkRatio - a.dkRatio;
        }
        return b.guessPts - a.guessPts;
      });

      // 計算並列名次（同命中率＆同雙殺率並列同名次，第 1 名全給皇冠！）
      let curRank = 1;
      stats.forEach((row, i) => {
        if (
          i > 0 &&
          (Math.abs(row.accuracyRatio - stats[i - 1].accuracyRatio) > 1e-9 ||
            Math.abs(row.dkRatio - stats[i - 1].dkRatio) > 1e-9)
        ) {
          curRank = i + 1;
        }
        row.rank = curRank;
      });
      const topScore = stats.length > 0 ? stats[0].totalHits : 0;
      const topChampions = topScore > 0 ? stats.filter((s) => s.rank === 1) : [];

      return `
        <div class="mini-game-box">
          <div style="text-align:center;margin-bottom:10px;">
            <div style="font-size:32px;line-height:1.1;">🕵️‍♂️🔮👑</div>
            <h3 style="color:#fde047;margin:6px 0 3px;">
              ${
                st.year === "2026" && !has2027
                  ? `Round 1【${esc(lbA)}】神探中場風雲榜`
                  : "《跨年分享篇》終極讀心神探總排名"
              }
            </h3>
            <div class="muted-xs">依「命中率 %」優先排名（猜中主人 +10 ／ 猜中真實細節 +10；單輪命中率 ≥70% 解鎖讀心神探 +40 PT）</div>
          </div>

          ${
            has2026 && has2027
              ? `<div class="gm-nav" style="justify-content:center;margin-bottom:10px;">
                   <button type="button" class="chip-btn ${scope === "all" ? "active" : ""}" onclick="ThemeGamesUI.shareRankScope='all';PartyApp.render();">🏆 兩輪總合榜</button>
                   <button type="button" class="chip-btn ${scope === "2026" ? "active" : ""}" onclick="ThemeGamesUI.shareRankScope='2026';PartyApp.render();">📘 Round 1 (${esc(lbA)})</button>
                   <button type="button" class="chip-btn ${scope === "2027" ? "active" : ""}" onclick="ThemeGamesUI.shareRankScope='2027';PartyApp.render();">🚀 Round 2 (${esc(lbB)})</button>
                 </div>`
              : ""
          }

          ${
            topChampions.length > 0
              ? `<div class="poll-crown-banner" style="margin-bottom:10px;">
                   <div class="muted-xs" style="color:#fde047;font-weight:800;">👑 最強讀心神探冠軍（${topChampions.length > 1 ? `${topChampions.length} 人並列第 1` : "獨占鰲頭"}）</div>
                   <div class="poll-tied-chips" style="justify-content:center;margin-top:6px;">
                     ${topChampions
                       .map(
                         (c) => `<span class="crown-winner-chip">👑 ${esc(c.name)} (+${c.guessPts} PT・命中 ${c.accuracyPct}%)</span>`
                       )
                       .join("")}
                   </div>
                 </div>`
              : ""
          }

          <div style="display:flex;flex-direction:column;gap:6px;">
            ${stats
              .map((r) => {
                const isChamp = r.rank === 1 && r.guessPts > 0;
                const rankBadge = isChamp
                  ? "👑 #1"
                  : r.rank === 2
                  ? "🥈 #2"
                  : r.rank === 3
                  ? "🥉 #3"
                  : `#${r.rank}`;
                return `
                  <div class="detective-rank-row ${isChamp ? "champ" : ""}">
                    <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
                      <span class="det-rank-num">${rankBadge}</span>
                      <div style="min-width:0;flex:1;">
                        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
                          <b>${esc(r.name)}</b>
                          ${r.hasBadge ? `<span class="q-tag q-ok">🔮 讀心神探</span>` : ""}
                        </div>
                        <div class="muted-xs">
                          猜中主人 ${r.ownerHits} ｜ 真實細節 ${r.factHits} ｜ 🔥雙殺 ${r.doubleKills} 題（命中率 ${r.accuracyPct}%）
                        </div>
                      </div>
                    </div>
                    <div style="text-align:right;white-space:nowrap;">
                      <div class="gold-text" style="font-size:15px;font-weight:900;">命中 ${r.accuracyPct}%</div>
                      <div class="muted-xs">+${r.guessPts} PT</div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>

          ${
            isHost && st.year === "2026"
              ? `<button class="btn btn-gold" style="width:100%;margin-top:14px;" onclick="ThemeGamesUI.startShareRound('${session.id}', '2027')">
                   🚀 繼續進入 Round 2：猜大家的【${esc(lbB)}】！
                 </button>`
              : isHost && st.year === "2027"
              ? `<button class="btn btn-secondary btn-sm" style="width:100%;margin-top:14px;" onclick="ThemeGamesUI.closeSession('${session.id}')">
                   🏁 圓滿結束《分享篇》返回主題大廳
                 </button>`
              : ""
          }
        </div>
      `;
    },

    // ==================== 2. 🗳️ 匿名靈魂爆料派對 ====================
    renderPollMinority(session, ctx, isHost, playerMap) {
      const { me, themeResponses, questionBanks } = ctx;
      const banks = questionBanks || window.DEFAULT_QUESTION_BANKS;
      const st = session.state || { subMode: "poll", qIdx: 0, revealed: false };
      const joinedPlayers = (session.participants || []).map((id) => playerMap[id]).filter(Boolean);
      const list = banks.pollQuestions || [];
      const qPos = (st.qIdx || 0) % Math.max(1, list.length);
      const qRealIdx = Array.isArray(st.order) && st.order.length === list.length ? st.order[qPos] : qPos;
      const curQ = st.customQ || list[qRealIdx] || { q: "在場誰最會帶氣氛？" };
      const stepKey = `poll_${st.roundSeq || 0}`;
      const resps = (themeResponses || []).filter(
        (r) => r.session_id === session.id && r.step_key === stepKey
      );
      const pollWaitNames = joinedPlayers
        .filter((p) => !resps.some((r) => r.player_id === p.id))
        .map((p) => esc(p.name));
      const myResp = resps.find((r) => r.player_id === me.id);

      return `
        <div class="mini-game-box">
          <div class="ss-top">
            <span class="badge-pill">🗳️ 匿名指認（命中最高票 +15 PT）</span>
            <span class="q-tag ${resps.length >= joinedPlayers.length ? "q-ok" : "q-cheer"}">🗳️ 已投 ${resps.length}/${joinedPlayers.length}</span>
          </div>
          ${
            !st.revealed && pollWaitNames.length > 0
              ? `<div class="part-chips" style="margin-top:6px;">
                   ${pollWaitNames
                     .map((nm) => `<span class="part-chip fun-only" style="padding:2px 8px;"><span>⏳ ${nm}</span></span>`)
                     .join("")}
                 </div>`
              : ""
          }

          <div class="q-title" style="margin:10px 0;">${esc(curQ.q)}</div>

          ${
            !st.revealed
              ? `<div>
                   ${
                     myResp
                       ? `<div class="my-cheer-tag" style="margin-bottom:8px;text-align:center;">
                            ✅ 已投：<b>${esc(playerMap[myResp.payload?.pick]?.name || "夥伴")}</b>（開票前點下方可改票）
                          </div>`
                       : `<div class="muted-xs" style="margin-bottom:6px;">點選 1 位最符合的夥伴（可投自己，開票前可改票）：</div>`
                   }
                   <div class="owner-pick-grid">
                     ${joinedPlayers
                       .map(
                         (p) => `<button class="chip-select ${myResp?.payload?.pick === p.id ? "selected" : ""}" title="${esc(p.name)}" onclick="ThemeGamesUI.submitPollVote('${session.id}','${stepKey}','${p.id}')">
                           ${myResp?.payload?.pick === p.id ? "✅ " : ""}${esc(p.name)}${p.id === me.id ? "（我）" : ""}
                         </button>`
                       )
                       .join("")}
                   </div>
                 </div>`
              : this.renderPollRevealResult(resps, playerMap)
          }

          ${
            isHost
              ? `<div class="gm-inline-bar" style="margin-top:14px;">
                  <div class="host-row">
                    ${
                      !st.revealed
                        ? `<button class="btn btn-gold" onclick="ThemeGamesUI.revealPoll('${session.id}')">📣 截止並開票派分！</button>`
                        : `<button class="btn btn-gold" onclick="ThemeGamesUI.nextPoll('${session.id}')">➡️ 推送下一題</button>`
                    }
                  </div>
                  <details style="margin-top:8px;">
                    <summary class="muted-xs" style="cursor:pointer;">✏️ Host 現場臨時插播一題（剛發生的民宿內梗！）</summary>
                    <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px;">
                      <div class="muted-xs">💡 範例：剛剛誰吃火鍋最認真？／誰昨天最早睡著？</div>
                      <input id="live-custom-q" class="input-dark" placeholder="輸入臨時插播題目…">
                      <button class="btn btn-primary btn-xs" onclick="ThemeGamesUI.pushLiveCustomPoll('${session.id}')">📢 立即插播推送此題</button>
                    </div>
                  </details>
                </div>`
              : ""
          }
        </div>
      `;
    },

    renderPollRevealResult(resps, playerMap) {
      const tally = {};
      resps.forEach((r) => {
        const tid = r.payload?.pick;
        if (!tid) return;
        tally[tid] = (tally[tid] || 0) + 1;
      });
      // 依得票數分組（同票的人合併擺在一起，第 1 高票全員都給 👑 皇冠！）
      const byCount = new Map();
      Object.entries(tally).forEach(([pid, cnt]) => {
        if (!byCount.has(cnt)) byCount.set(cnt, []);
        byCount.get(cnt).push(pid);
      });
      const tiers = [...byCount.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 3);
      const topVotes = tiers.length ? tiers[0][0] : 0;

      return `
        <div class="reveal-card">
          <div style="font-weight:800;color:#fbbf24;margin-bottom:8px;">📊 匿名票選結果揭曉（不公開誰投誰）：</div>
          ${
            tiers.length === 0
              ? `<div class="muted-sm">本題無人投票</div>`
              : tiers
                  .map(([cnt, pids], tierIdx) => {
                    if (tierIdx === 0) {
                      return `
                        <div class="poll-crown-banner">
                          <div style="font-size:13px;font-weight:800;color:#fde047;margin-bottom:6px;">
                            👑 最高票第 1 名（${cnt} 票${pids.length > 1 ? `・${pids.length} 人並列冠軍！` : ""}）
                          </div>
                          <div class="poll-tied-chips">
                            ${pids
                              .map(
                                (pid) => `<span class="crown-winner-chip">👑 ${esc(playerMap[pid]?.name || pid)}</span>`
                              )
                              .join("")}
                          </div>
                        </div>
                      `;
                    }
                    const medal = tierIdx === 1 ? "🥈 第 2 高票" : "🥉 第 3 高票";
                    return `
                      <div class="poll-tier-row">
                        <span class="muted-xs" style="font-weight:800;min-width:86px;">${medal}（${cnt} 票）</span>
                        <div class="poll-tied-chips">
                          ${pids
                            .map(
                              (pid) => `<span class="part-chip">${esc(playerMap[pid]?.name || pid)}</span>`
                            )
                            .join("")}
                        </div>
                      </div>
                    `;
                  })
                  .join("")
          }
          ${
            topVotes > 0
              ? `<div class="muted-xs" style="margin-top:8px;">🎉 凡投給最高票（${topVotes} 票）得主者，皆已自動入帳 +15 PT！</div>`
              : ""
          }
        </div>
      `;
    },

    // ==================== 3. 📡 心電頻率同步 ====================
    renderWavelength(session, ctx, isHost, playerMap) {
      const { me, themeResponses } = ctx;
      const st = session.state || {};
      const joinedPlayers = (session.participants || []).map((id) => playerMap[id]).filter(Boolean);
      if (!st.prompt) {
        return `
          <div class="mini-game-box" style="text-align:center;">
            <p class="muted-sm">已入房 ${joinedPlayers.length} 人，準備測試全場腦波頻率！</p>
            ${
              isHost
                ? `<button class="btn btn-gold" style="margin-top:10px;" onclick="ThemeGamesUI.nextWavelength('${session.id}')">📡 抽出第 1 位發訊員 ＆ 光譜題</button>`
                : ""
            }
          </div>
        `;
      }

      const presenter = playerMap[st.presenterId] || { name: st.presenterId };
      const isPresenter = st.presenterId === me.id;
      const stepKey = `wl_${st.roundSeq || 1}`;
      const resps = (themeResponses || []).filter(
        (r) => r.session_id === session.id && r.step_key === stepKey
      );
      const myResp = resps.find((r) => r.player_id === me.id);

      return `
        <div class="mini-game-box">
          <div class="ss-top">
            <span class="badge-pill">🎙️ 本輪發訊員：${esc(presenter.name)}</span>
            <span class="muted-xs">已給分：${resps.length}/${Math.max(0, joinedPlayers.length - 1)} 人</span>
          </div>

          <div class="spectrum-3col">
            <div class="spec-col spec-low">
              <div class="spec-tag">最小端 0</div>
              <div class="spec-txt">${esc(st.prompt.left)}</div>
            </div>
            <div class="spec-col spec-mid">
              <div class="spec-tag">📡 頻率刻度</div>
              <div class="spec-mid-hint">0 ◀──▶ 100<br>口頭舉例禁講數字</div>
            </div>
            <div class="spec-col spec-high">
              <div class="spec-tag">最大端 100</div>
              <div class="spec-txt">${esc(st.prompt.right)}</div>
            </div>
          </div>

          ${
            isPresenter
              ? `<div class="peek-card revealed" style="margin:10px 0;">
                  <span class="peek-secret">🎯 你的目標刻度是：<b style="font-size:26px;color:#fbbf24;">${st.target}</b>（請口頭講一句話提示大家，禁止講數字！）</span>
                </div>`
              : !st.revealed
              ? myResp && this.editingWlStepKey !== stepKey
                ? `<div class="locked-cheer-msg" style="text-align:center;">
                     <div>✅ 你已鎖定刻度 <b>${myResp.payload.val}</b>！等待全員送出開獎…</div>
                     <button type="button" class="btn btn-ghost btn-xs" style="margin-top:8px;border-color:rgba(251,191,36,0.55);color:#fde047;"
                       onclick="ThemeGamesUI.localSliderVal=${Number(myResp.payload.val) || 50};ThemeGamesUI.editingWlStepKey='${stepKey}';PartyApp.render();">
                       ↺ 開獎前修改刻度
                     </button>
                   </div>`
                : `<div class="slider-box">
                    <div style="text-align:center;font-size:24px;font-weight:900;color:#38bdf8;" id="wl-val-label">${this.localSliderVal}</div>
                    <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#94a3b8;margin-bottom:3px;gap:8px;">
                      <span>◀ 0 最小端</span>
                      <span>最大端 100 ▶</span>
                    </div>
                    <input type="range" min="0" max="100" value="${this.localSliderVal}" class="party-slider"
                      oninput="ThemeGamesUI.localSliderVal=Number(this.value);document.getElementById('wl-val-label').textContent=this.value;">
                    <div style="display:flex;gap:8px;margin-top:10px;">
                      ${
                        myResp
                          ? `<button type="button" class="btn btn-ghost btn-sm" onclick="ThemeGamesUI.editingWlStepKey='';PartyApp.render();">取消</button>`
                          : ""
                      }
                      <button class="btn btn-gold" style="flex:1;" onclick="ThemeGamesUI.submitWavelength('${session.id}','${stepKey}')">
                        🎯 ${myResp ? "更新鎖定刻度" : "鎖定我的刻度猜測"}
                      </button>
                    </div>
                  </div>`
              : ""
          }

          ${
            st.revealed
              ? (() => {
                  const guessList = resps
                    .filter((r) => r.player_id !== st.presenterId)
                    .map((r) => ({
                      ...r,
                      diff: Math.abs(Number(r.payload.val) - st.target),
                    }))
                    .sort((a, b) => a.diff - b.diff);
                  const bestDiff = guessList.length ? guessList[0].diff : 999;
                  const within18 =
                    st.lastWithin18 !== undefined
                      ? st.lastWithin18
                      : guessList.filter((r) => r.diff <= 18).length;
                  const roomGuessers =
                    st.lastTotalGuessers !== undefined
                      ? st.lastTotalGuessers
                      : Math.max(
                          guessList.length,
                          (session.participants || []).filter((pid) => pid !== st.presenterId).length,
                          1
                        );
                  const hostBonus =
                    st.lastHostBonus !== undefined
                      ? st.lastHostBonus
                      : within18 > 0
                      ? Math.round((50 * within18) / roomGuessers)
                      : 0;
                  return `<div class="reveal-card">
                    <div style="font-size:20px;font-weight:900;color:#fbbf24;">🎯 靶心正解：${st.target}</div>
                    <div class="cb-row-3col" style="margin-top:6px;">
                      <span class="cb-cell-main">🎙️ 發訊員 ${esc(presenter.name)}</span>
                      <span class="cb-block-mid st-cyan">進圈 ${within18}/${roomGuessers}</span>
                      <span class="cb-block-stat ${hostBonus > 0 ? "st-gold" : "st-wait"}">+${hostBonus} PT</span>
                    </div>
                    <div style="margin-top:8px;display:flex;flex-direction:column;gap:5px;">
                      ${guessList
                        .map((r) => {
                          const pts = r.diff <= 4 ? 50 : r.diff <= 10 ? 30 : r.diff <= 18 ? 15 : 0;
                          const isTop = r.diff === bestDiff && pts > 0;
                          const nm = playerMap[r.player_id]?.name || r.player_id;
                          return `<div class="cb-row-3col">
                            <span class="cb-cell-main" title="${esc(nm)}">${isTop ? "👑 " : ""}${esc(nm)}</span>
                            <span class="cb-block-mid">猜 ${r.payload.val} (差${r.diff})</span>
                            <span class="cb-block-stat ${pts > 0 ? "st-gold" : "st-wait"}">+${pts} PT</span>
                          </div>`;
                        })
                        .join("")}
                    </div>
                  </div>`;
                })()
              : ""
          }

          ${
            isHost
              ? `<div class="host-row" style="margin-top:12px;">
                  ${
                    !st.revealed
                      ? `<button class="btn btn-gold" onclick="ThemeGamesUI.revealWavelength('${session.id}')">📣 開獎結算本輪！</button>`
                      : `<button class="btn btn-gold" onclick="ThemeGamesUI.nextWavelength('${session.id}')">➡️ 下一輪（換下一位發訊員）</button>`
                  }
                </div>`
              : ""
          }
        </div>
      `;
    },

    // ==================== 4. 🕵️ 誰是臥底 ====================
    renderUndercover(session, ctx, isHost, playerMap) {
      const { me, themeResponses } = ctx;
      const st = session.state || {};
      const joinedPlayers = (session.participants || []).map((id) => playerMap[id]).filter(Boolean);

      if (!st.roles) {
        return `
          <div class="mini-game-box" style="text-align:center;">
            <div class="q-title">🕵️ 誰是臥底準備室（已加入 ${joinedPlayers.length} 人）</div>
            <p class="muted-sm">系統將依人數自動隨機發放「平民詞／臥底詞／白板」，Host 也能一起抽牌下場抓鬼！</p>
            ${
              isHost
                ? `<button class="btn btn-gold" style="margin-top:12px;" ${joinedPlayers.length < 3 ? "disabled" : ""} onclick="ThemeGamesUI.dealUndercover('${session.id}')">
                    🃏 自動發詞開局（至少 3 人）
                  </button>`
                : ""
            }
          </div>
        `;
      }

      const myRole = st.roles[me.id];
      const aliveIds = st.aliveIds || [];
      const amAlive = aliveIds.includes(me.id);
      const stepKey = `uc_vote_${st.gameSeq || 1}_${st.voteRound || 1}`;
      const resps = (themeResponses || []).filter(
        (r) => r.session_id === session.id && r.step_key === stepKey && aliveIds.includes(r.player_id)
      );
      const myVote = resps.find((r) => r.player_id === me.id);
      const startIdx = Math.max(0, aliveIds.indexOf(st.speakerStartId));
      const speakChain = aliveIds.map((_, i) => aliveIds[(startIdx + i) % aliveIds.length]);

      return `
        <div class="mini-game-box">
          ${
            myRole
              ? `<div class="peek-card" onclick="this.classList.toggle('revealed')">
                  <span class="peek-hint">🙈 長按／點擊翻開偷看你的本局秘密詞（看完記得蓋回！）</span>
                  <span class="peek-secret">
                    ${
                      myRole.type === "blank"
                        ? "⬜ 你抽到【白板（沒有詞）】！請仔細聽別人描述跟著混過去！"
                        : `🔑 你的詞語是：<b style="font-size:22px;color:#fbbf24;">${esc(myRole.word)}</b>`
                    }
                  </span>
                </div>`
              : ""
          }

          <div class="toast-inline" style="margin:10px 0;background:rgba(15,23,42,0.85);border-color:rgba(251,191,36,0.35);">
            <div class="muted-xs" style="margin-bottom:2px;">🎙️ 本輪發言順序（各講一句形容）：</div>
            <div style="color:#fde047;font-weight:800;font-size:13px;">${speakChain
              .map((id, idx) => `${idx + 1}.${esc(playerMap[id]?.name || id)}`)
              .join(" ➜ ")}</div>
          </div>

          ${st.lastResultMsg ? `<div class="reveal-card" style="margin-bottom:10px;">${esc(st.lastResultMsg)}</div>` : ""}

          ${
            !st.gameOver && amAlive
              ? `<div>
                  ${
                    myVote
                      ? `<div class="my-cheer-tag" style="margin-bottom:8px;text-align:center;">
                           ✅ 已投：<b>${esc(playerMap[myVote.payload?.targetId]?.name || "")}</b>（${resps.length}/${aliveIds.length} 已投，開票前可改票）
                         </div>`
                      : `<div class="sub-label">🗳️ 投票指認內鬼（正式開票投中內鬼 +5 PT）：</div>`
                  }
                  <div class="owner-pick-grid">
                    ${aliveIds
                      .filter((id) => id !== me.id)
                      .map(
                        (id) => `<button class="chip-select ${myVote?.payload?.targetId === id ? "selected" : ""}" title="${esc(playerMap[id]?.name || id)}" onclick="ThemeGamesUI.voteUndercover('${session.id}','${stepKey}','${id}')">
                          ${myVote?.payload?.targetId === id ? "✅ " : "🗳️ "}${esc(playerMap[id]?.name || id)}
                        </button>`
                      )
                      .join("")}
                  </div>
                </div>`
              : !st.gameOver && !amAlive && myRole
              ? `<div class="locked-cheer-msg" style="text-align:center;margin-top:8px;">
                   👻 已出局，請旁觀推理勿透露詞語
                 </div>`
              : ""
          }

          ${
            isHost
              ? `<div class="host-row" style="margin-top:12px;">
                  ${
                    !st.gameOver
                      ? `<button class="btn btn-gold" onclick="ThemeGamesUI.tallyUndercover('${session.id}')">⚖️ 截止開票淘汰！</button>`
                      : `<button class="btn btn-gold" onclick="ThemeGamesUI.dealUndercover('${session.id}')">🔄 再來一局（換新詞重發）</button>`
                  }
                </div>`
              : ""
          }
        </div>
      `;
    },

    // ==================== 5. 🏃‍♂️ 1/1 尋找真實小人雙隊攻防戰 ====================
    renderFindFigurine(session, ctx, isHost, playerMap) {
      const { me, themeResponses } = ctx;
      const st = session.state || {};
      const joinedPlayers = (session.participants || []).map((id) => playerMap[id]).filter(Boolean);

      if (!st.teamA) {
        return `
          <div class="mini-game-box">
            <div class="q-title">🏃‍♂️《實體小人雙隊攻防戰》</div>
            <p class="muted-sm">目前已加入 ${joinedPlayers.length} 人。分上下半場攻守交換，找到小人後<b>拍照傳至派對群組相簿＋勾選打卡自動計時</b>（免上傳檔案零卡頓！），最快隊伍全隊每人 +100 PT！</p>
            ${
              isHost
                ? `<div class="grid-2-btns" style="margin-top:10px;">
                    <div>
                      <label class="sub-label">⏱️ 找尋時間上限 (分鐘)</label>
                      <input type="number" id="fig-limit-min" class="input-dark" value="15" min="2" max="60">
                    </div>
                    <div>
                      <label class="sub-label">🪆 真實小人數量 (隻)</label>
                      <input type="number" id="fig-total-cnt" class="input-dark" value="5" min="1" max="15">
                    </div>
                  </div>
                  <button class="btn btn-gold" style="width:100%;margin-top:12px;" ${joinedPlayers.length < 2 ? "disabled" : ""} onclick="ThemeGamesUI.initFigurineTeams('${session.id}')">
                    🎲 隨機平分 A / B 兩隊開戰！
                  </button>`
                : `<div class="muted-xs" style="margin-top:8px;">等待 GM 設定搜尋時間並隨機分隊…</div>`
            }
          </div>
        `;
      }

      const half = st.half || 1; // 1: A藏B找, 2: B藏A找, 3: 完賽總結
      if (half === 3) {
        return `
          <div class="reveal-card">
            <h3>🏆 尋找小人・攻防總結算</h3>
            <div class="cb-team-vs" style="margin:10px 0;">
              <div class="cb-team-card team-a">
                <div class="cb-team-head"><span style="color:#7dd3fc;">🅰️ A 隊</span><span class="cb-team-score">${st.resA?.found || 0}/${st.totalCount} 隻</span></div>
                <div class="muted-xs">耗時 ${((st.resA?.elapsedMs || 0) / 1000).toFixed(1)}s</div>
              </div>
              <div class="cb-vs-pill">VS</div>
              <div class="cb-team-card team-b">
                <div class="cb-team-head"><span style="color:#fde047;">🅱️ B 隊</span><span class="cb-team-score">${st.resB?.found || 0}/${st.totalCount} 隻</span></div>
                <div class="muted-xs">耗時 ${((st.resB?.elapsedMs || 0) / 1000).toFixed(1)}s</div>
              </div>
            </div>
            <div style="font-size:17px;font-weight:900;color:#fbbf24;">${esc(st.winnerBanner || "")}</div>
          </div>
        `;
      }

      const hiderTeam = half === 1 ? st.teamA : st.teamB;
      const searcherTeam = half === 1 ? st.teamB : st.teamA;
      const amSearcher = searcherTeam.includes(me.id);
      const stepPrefix = `fig_h${half}_`;
      const foundResps = (themeResponses || []).filter(
        (r) => r.session_id === session.id && r.step_key.startsWith(stepPrefix)
      );
      const foundMap = {};
      foundResps.forEach((r) => {
        foundMap[r.step_key] = r;
      });

      const limitMs = (st.limitMin || 15) * 60000;
      const elapsedMs = st.searchStartedAt
        ? Math.min(limitMs, Math.max(0, window.PartyDB.serverNowMs - st.searchStartedAt))
        : 0;
      const remainSec = Math.max(0, Math.ceil((limitMs - elapsedMs) / 1000));

      return `
        <div class="mini-game-box">
          <div class="ss-top">
            <span class="badge-pill">${half === 1 ? "上半場：A藏 ➜ B找" : "下半場：B藏 ➜ A找"}</span>
            <span class="gold-text">已尋獲 ${foundResps.length} / ${st.totalCount} 隻</span>
          </div>
          <div class="cb-team-vs">
            <div class="cb-team-card team-a">
              <div class="cb-team-head">
                <span style="color:#7dd3fc;">🅰️ A隊</span>
                <span class="q-tag ${half === 2 ? "q-ok" : "q-muted"}">${half === 1 ? "🙈 藏匿方" : "🔍 搜尋方"}</span>
              </div>
              <div class="cb-team-members">${st.teamA.map((id) => esc(playerMap[id]?.name)).join(" · ")}</div>
            </div>
            <div class="cb-vs-pill">VS</div>
            <div class="cb-team-card team-b">
              <div class="cb-team-head">
                <span style="color:#fde047;">🅱️ B隊</span>
                <span class="q-tag ${half === 1 ? "q-ok" : "q-muted"}">${half === 1 ? "🔍 搜尋方" : "🙈 藏匿方"}</span>
              </div>
              <div class="cb-team-members">${st.teamB.map((id) => esc(playerMap[id]?.name)).join(" · ")}</div>
            </div>
          </div>

          ${
            !st.searchStartedAt
              ? isHost
                ? `<div class="gm-inline-bar" style="margin-top:10px;text-align:left;">
                    <div class="sub-label">👑 Host (GM) 專屬控時面板（一般玩家看不到此設定，只會等待開始）：</div>
                    <div class="grid-2-btns" style="margin-top:6px;">
                      <div>
                        <label class="muted-xs">⏱️ 本半場搜尋時間 (分鐘)</label>
                        <input type="number" id="fig-half-limit-min" class="input-dark" value="${Number(st.limitMin) || 15}" min="1" max="60">
                      </div>
                      <div>
                        <label class="muted-xs">🗺️ 方位提示（選填）</label>
                        <input type="text" id="fig-clue-note" class="input-dark" placeholder="例：客廳x2、餐廳x3" value="${esc(st.clueNote || "")}">
                      </div>
                    </div>
                    <button class="btn btn-gold" style="width:100%;margin-top:10px;" onclick="ThemeGamesUI.startFigurineTimer('${session.id}')">
                      🚀 小人藏好了！啟動搜尋倒數計時器！
                    </button>
                  </div>`
                : `<div class="locked-cheer-msg" style="text-align:center;margin-top:12px;padding:16px 12px;">
                    <div style="font-size:24px;margin-bottom:4px;">⏳</div>
                    <div><b>分隊完成！請依現場指示準備（${half === 1 ? "A隊藏小人、B隊先迴避" : "B隊藏小人、A隊先迴避"}）</b></div>
                    <div class="muted-xs" style="margin-top:4px;">等待 Host (GM) 按下開始後，畫面將自動同步顯示搜尋倒數計時！</div>
                  </div>`
              : `<div>
                  <div id="fig-live-timer" class="timer-giant" data-started="${st.searchStartedAt}" data-limit-min="${st.limitMin || 15}">${Math.floor(remainSec / 60)}:${String(remainSec % 60).padStart(2, "0")}</div>
                  <div class="muted-xs" style="text-align:center;margin-bottom:6px;">⏱️ 本半場限時 ${st.limitMin} 分鐘（全場同步倒數中）</div>
                  ${st.clueNote ? `<div class="toast-inline">🗺️ 方位提示：${esc(st.clueNote)}</div>` : ""}
                  <div class="fig-slots-grid">
                    ${Array.from({ length: st.totalCount }, (_, i) => i + 1)
                      .map((num) => {
                        const key = `${stepPrefix}${num}`;
                        const fullChkKey = `${session.id}_${key}`;
                        const found = foundMap[key];
                        const isChecked = this.checkedFigKeys.has(fullChkKey);
                        return `<div class="fig-slot ${found ? "found" : ""}">
                          <div><b>🪆 小人 #${num}</b></div>
                          ${
                            found
                              ? `<div class="gold-text" style="font-size:12px;">✅ ${(found.payload.elapsedMs / 1000).toFixed(1)}s 尋獲 (${esc(playerMap[found.player_id]?.name)})</div>
                                 <div class="muted-xs" style="margin-top:2px;">📸 已傳群組相簿打卡</div>`
                              : amSearcher && remainSec > 0
                              ? `<label class="fig-line-chk">
                                   <input type="checkbox" id="fig-chk-${key}" ${isChecked ? "checked" : ""} onchange="ThemeGamesUI.toggleFigLineCheck('${fullChkKey}', this.checked)">
                                   <span>已拍照傳群組相簿</span>
                                 </label>
                                 <button class="btn btn-primary btn-xs" style="margin-top:5px;width:100%;" onclick="ThemeGamesUI.checkInFigurine('${session.id}','${key}')">
                                   ✅ 打卡收繳計時
                                 </button>`
                              : `<span class="muted-xs">尚未尋獲</span>`
                          }
                        </div>`;
                      })
                      .join("")}
                  </div>
                  ${
                    isHost
                      ? `<div class="gm-inline-bar" style="margin-top:12px;">
                          <div class="host-row" style="justify-content:space-between;margin-bottom:8px;">
                            <span class="muted-xs">⏱️ Host 即時調整倒數時間：</span>
                            <div style="display:flex;gap:6px;">
                              <button class="btn btn-secondary btn-xs" onclick="ThemeGamesUI.adjustFigurineTime('${session.id}', -1)">-1 分鐘</button>
                              <button class="btn btn-secondary btn-xs" onclick="ThemeGamesUI.adjustFigurineTime('${session.id}', 1)">+1 分鐘</button>
                              <button class="btn btn-secondary btn-xs" onclick="ThemeGamesUI.adjustFigurineTime('${session.id}', 3)">+3 分鐘</button>
                            </div>
                          </div>
                          <button class="btn btn-gold" style="width:100%;" onclick="ThemeGamesUI.finishFigurineHalf('${session.id}')">
                            ${half === 1 ? "⏭️ 結算上半場・進入下半場攻守交換！" : "🏆 結算上下半場總勝負並派發 +100 PT！"}
                          </button>
                        </div>`
                      : ""
                  }
                </div>`
          }
        </div>
      `;
    },

    // ==================== 6. 🏓 實體六關紅藍雙隊大對抗 ====================
    renderPhysical6(session, ctx, isHost, playerMap) {
      const st = session.state || {};
      const joinedPlayers = (session.participants || []).map((id) => playerMap[id]).filter(Boolean);

      if (!st.redTeam) {
        return `
          <div class="mini-game-box" style="text-align:center;">
            <div class="q-title">🏓《實體六關・紅藍雙隊大對抗》</div>
            <p class="muted-sm">已加入 ${joinedPlayers.length} 人。隨機平均分紅藍兩隊，共 6 關分開計分，每贏一關全隊隊員立刻 +30 PT！</p>
            ${
              isHost
                ? `<button class="btn btn-gold" style="margin-top:12px;" ${joinedPlayers.length < 2 ? "disabled" : ""} onclick="ThemeGamesUI.initPhysicalTeams('${session.id}')">
                    🎲 隨機平均分紅隊 vs 藍隊！
                  </button>`
                : ""
            }
          </div>
        `;
      }

      const stageWinners = st.stageWinners || {};
      const redWins = Object.values(stageWinners).filter((w) => w === "red").length;
      const blueWins = Object.values(stageWinners).filter((w) => w === "blue").length;

      return `
        <div class="mini-game-box">
          <div class="cb-team-vs" style="margin-bottom:8px;">
            <div class="cb-team-card team-red">
              <div class="cb-team-head">
                <span style="color:#fda4af;">🔴 紅隊</span>
                <span class="cb-team-score">${redWins} 勝</span>
              </div>
              <div class="cb-team-members">${st.redTeam.map((id) => esc(playerMap[id]?.name)).join(" · ")}</div>
            </div>
            <div class="cb-vs-pill">VS</div>
            <div class="cb-team-card team-blue">
              <div class="cb-team-head">
                <span style="color:#7dd3fc;">🔵 藍隊</span>
                <span class="cb-team-score">${blueWins} 勝</span>
              </div>
              <div class="cb-team-members">${st.blueTeam.map((id) => esc(playerMap[id]?.name)).join(" · ")}</div>
            </div>
          </div>
          ${
            st.doubleRepId
              ? `<div class="muted-xs" style="margin-bottom:8px;color:#fde047;">✨ 奇數平衡代表：<b>${esc(playerMap[st.doubleRepId]?.name)}</b>（代表賽可上場 2 次）</div>`
              : ""
          }

          <div class="stages-list">
            ${PHYSICAL_STAGES.map((sg) => {
              const win = stageWinners[sg.no];
              return `
                <div class="stage-item">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <b>第 ${sg.no} 關｜${esc(sg.title)}</b>
                    <span class="badge-pill">${
                      win === "red" ? "🔴 紅隊勝 (+30)" : win === "blue" ? "🔵 藍隊勝 (+30)" : "待開賽"
                    }</span>
                  </div>
                  <div class="muted-xs" style="margin:4px 0;">🧰 道具：${esc(sg.prop)}</div>
                  <div class="muted-xs stage-rule-txt">${esc(sg.rule)}</div>
                  ${
                    isHost && !win
                      ? `<div class="grid-2-btns" style="margin-top:6px;">
                          <button class="btn btn-rose btn-xs" onclick="ThemeGamesUI.awardPhysicalStage('${session.id}', ${sg.no}, 'red')">🔴 判定紅隊贏 (+30 PT)</button>
                          <button class="btn btn-cyan btn-xs" onclick="ThemeGamesUI.awardPhysicalStage('${session.id}', ${sg.no}, 'blue')">🔵 判定藍隊贏 (+30 PT)</button>
                        </div>`
                      : ""
                  }
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    },

    // ==================== 7. 🎆 2027 跨年倒數煙火 ＆ 新年簽到禮 ====================
    renderNyeCheckinStandalone(ctx) {
      return this.renderNyeCheckinCore(ctx, null, ctx.isGmUnlocked);
    },

    renderNyeCheckinSession(session, ctx, isHost) {
      return this.renderNyeCheckinCore(ctx, session, isHost);
    },

    getDynamicNyeTargetMs(ctx) {
      const slots = window.PartyEngine.getNormalizedSlots(ctx.schedule, ctx.globalCfg);
      const giftSlot = slots.find((s) => s.scene === "nye_gift");
      if (giftSlot) {
        // 若時段橫跨午夜 00:00（例如 23:55~00:15），精準取該午夜 00:00；否則取時段開始後 5 分鐘（或不超過結束時間）
        const endDateKey = window.PartyEngine.taipeiParts(giftSlot.endMs).dateKey;
        const midnightMs = window.PartyEngine.parseTaipeiMs(`${endDateKey}T00:00`);
        if (midnightMs >= giftSlot.startMs && midnightMs <= giftSlot.endMs) {
          return midnightMs;
        }
        return Math.min(giftSlot.endMs, giftSlot.startMs + 5 * 60000);
      }
      return window.PartyEngine.parseTaipeiMs("2027-01-01T00:00");
    },

    renderNyeCheckinCore(ctx, session, isHost) {
      const { me, ledger, globalCfg } = ctx;
      const g = { ...window.PARTY_CONFIG.DEFAULTS, ...(globalCfg || {}) };
      const pts = Number(g.nyeGiftPoints) || 50;
      const nowEff = window.PartyEngine.getEffectiveNowMs(g, window.PartyDB.serverNowMs);
      const targetMs =
        (session && session.state && session.state.targetMs) ||
        this.getDynamicNyeTargetMs(ctx);
      const remainMs = targetMs - nowEff;
      const isMidnight = remainMs <= 0;
      const claimed = (ledger || []).some((l) => l.id === `nye2027_checkin_${me.id}`);

      const secLeft = Math.max(0, Math.ceil(remainMs / 1000));
      return `
        <div class="nye-fireworks-card">
          <div class="firework-sparkle">🎆 ✨ 🎇 🥂 🎆</div>
          <h2 style="color:#fde047;margin:6px 0;">跨年煙火午夜盛典</h2>
          ${
            !isMidnight
              ? `<div id="nye-live-timer" class="timer-giant" style="font-size:44px;" data-target-ms="${targetMs}">${
                  secLeft > 3600
                    ? `倒數 ${Math.floor(secLeft / 3600)}h ${Math.floor((secLeft % 3600) / 60)}m`
                    : `${Math.floor(secLeft / 60)}:${String(secLeft % 60).padStart(2, "0")}`
                }</div>
                 <p class="muted-sm">倒數歸零瞬間（預計 ${esc(window.PartyEngine.formatDateTimeFriendly(targetMs))}），全場手機同步綻放煙火並解鎖新年開運簽到禮！</p>
                 ${
                   isHost
                     ? `<button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="ThemeGamesUI.triggerMockCountdown()">🧪 啟動 8 秒跨年倒數彩排模擬</button>`
                     : ""
                 }`
              : `<div style="font-size:26px;font-weight:900;color:#fff;margin:8px 0;">🎉 HAPPY NEW YEAR！🎉</div>
                 ${
                   claimed
                     ? `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
                          <div class="my-cheer-tag" style="display:inline-block;padding:10px 18px;font-size:16px;">🎉 已領取新年開運簽到禮 +${pts} PT！新年快樂！</div>
                          <button type="button" class="btn btn-secondary btn-xs" onclick="ThemeGamesUI.replayFireworks()">
                            🎆 再放一次跨年煙火＆慶典特效！
                          </button>
                        </div>`
                     : `<button class="btn btn-nyegift" onclick="ThemeGamesUI.claimNyeGift()">
                          🎉 點擊領取新年開運簽到禮 (+${pts} PT)
                        </button>`
                 }`
          }
        </div>
      `;
    },

    // ==================== 主題遊戲 Actions ====================
    async openThemeSession() {
      const ctx = window.PartyApp.getContext();
      // 先將舊主題房標記結束
      for (const old of ctx.themeSessions || []) {
        if (old.status !== "finished") {
          await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(old.id)}`, {
            status: "finished",
          });
        }
      }
      const sid = `thm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const initState =
        this.selectedThemeToOpen === "nye_checkin"
          ? { targetMs: this.getDynamicNyeTargetMs(ctx) }
          : {};
      await window.PartyDB.upsert("theme_sessions", [
        {
          id: sid,
          theme_type: this.selectedThemeToOpen,
          status: "lobby",
          host_id: ctx.me.id,
          participants: [ctx.me.id],
          state: initState,
        },
      ]);
      // 若當前排程已經在 theme / nye_gift，保持自動排程不覆寫！僅在非主題時段臨時開房才切換
      const g = { ...window.PARTY_CONFIG.DEFAULTS, ...(ctx.globalCfg || {}) };
      if (
        g.seasonStatus === "active" &&
        ctx.sceneInfo.scene !== "theme" &&
        ctx.sceneInfo.scene !== "nye_gift"
      ) {
        g.sceneOverride = "theme";
        await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      }
      window.PartyFX.playTone("bell");
      await window.PartyApp.refreshAll();
    },

    async joinSession(sessionId) {
      return window.PartyDB.withLock(`join_thm_${sessionId}`, async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        await window.PartyDB.transactRow("theme_sessions", sessionId, (cur) => {
          if (!cur || cur.status === "finished") return undefined;
          const set = new Set(cur.participants || []);
          if (set.has(ctx.me.id)) return undefined;
          set.add(ctx.me.id);
          cur.participants = [...set];
          return cur;
        });
        window.PartyFX.haptic("medium");
        await window.PartyApp.refreshAll();
      });
    },

    async closeSession(sessionId) {
      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        status: "finished",
      });
      await window.PartyApp.refreshAll();
    },

    // --- 分享篇 ---
    async startShareRound(sessionId, year) {
      return window.PartyDB.withLock(`start_share_${sessionId}_${year}`, async () => {
        const ctx = window.PartyApp.getContext();
        const [freshSessions, freshPlayers] = await Promise.all([
          window.PartyDB.select("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
            forceNetwork: true,
          }),
          window.PartyDB.select("players", "order=joined_at.asc", { forceNetwork: true }),
        ]);
        const s = (freshSessions && freshSessions[0]) || (ctx.themeSessions || []).find((x) => x.id === sessionId);
        if (!s) return;
        const playerList = Array.isArray(freshPlayers) && freshPlayers.length ? freshPlayers : ctx.players || [];
        const field = year === "2026" ? "share_2026" : "share_2027";
        const items = [];
        for (const pid of window.PartyEngine.shuffle(s.participants || [])) {
          const p = playerList.find((x) => x.id === pid);
          const card = p && p[field];
          if (card && card.story && card.trueFact) {
            const fakes = (card.fakeFacts || ["假的細節一", "假的細節二", "假的細節三"]).slice(0, 3);
            const tagged = [
              { text: card.trueFact, isTrue: true },
              ...fakes.map((f) => ({ text: f, isTrue: false })),
            ];
            const mixed = window.PartyEngine.shuffle(tagged);
            items.push({
              ownerId: pid,
              story: card.story,
              options: mixed.map((m) => m.text),
              trueIdx: mixed.findIndex((m) => m.isTrue),
            });
          }
        }
        if (items.length === 0) {
          window.PartyApp.toast("目前入房玩家尚未填寫分享卡！請先至個人主頁填寫。");
          return;
        }
        const prevRounds = (s.state && s.state.roundsByYear) || {};
        this.editingShareStepKey = "";
        this.shareRankScope = year === "2027" ? "all" : "2026";
        await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
          status: "active",
          state: {
            year,
            items,
            roundsByYear: { ...prevRounds, [year]: items },
            idx: 0,
            revealed: false,
          },
        });
        await window.PartyApp.refreshAll();
      });
    },

    async submitShareGuess(sessionId, stepKey) {
      const ctx = window.PartyApp.getContext();
      await window.PartyDB.upsert("theme_responses", [
        {
          id: `${sessionId}_${stepKey}_${ctx.me.id}`,
          session_id: sessionId,
          step_key: stepKey,
          player_id: ctx.me.id,
          payload: {
            ownerPick: this.localShareOwnerPick,
            factPick: this.localShareFactPick,
          },
        },
      ]);
      this.editingShareStepKey = "";
      this.localShareOwnerPick = "";
      this.localShareFactPick = -1;
      window.PartyFX.haptic("medium");
      await window.PartyApp.refreshAll();
    },

    async revealShareItem(sessionId) {
      return window.PartyDB.withLock(`rev_share_${sessionId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
        if (!s || s.state?.revealed) return;
        const st = { ...(s.state || {}), revealed: true };
        const cur = (st.items || [])[st.idx || 0];
        if (!cur) return;
        const stepKey = `${st.year}_${st.idx || 0}`;
        const resps = await window.PartyDB.select(
          "theme_responses",
          `session_id=eq.${encodeURIComponent(sessionId)}&step_key=eq.${encodeURIComponent(stepKey)}`,
          { forceNetwork: true }
        );
        const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";

        // 題主固定領分享獎 +15 PT
        await window.PartyDB.upsert(
          "ledger",
          [
            {
              id: `share_owner_${sessionId}_${stepKey}_${cur.ownerId}`,
              player_id: cur.ownerId,
              delta: 15,
              category: "theme",
              reason: `🌟 分享篇(${st.year})誠意分享獎`,
              day_key: dayKey,
              meta: { sessionId, themeType: "share_2026_2027", stepKey },
            },
          ],
          { ignoreDuplicates: true }
        );

        // 猜題者各別計分 (+10 主人 / +10 真細節)
        for (const r of resps) {
          if (r.player_id === cur.ownerId) continue;
          let pts = 0;
          if (r.payload.ownerPick === cur.ownerId) pts += 10;
          if (r.payload.factPick === cur.trueIdx) pts += 10;
          if (pts > 0) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `share_guess_${sessionId}_${stepKey}_${r.player_id}`,
                  player_id: r.player_id,
                  delta: pts,
                  category: "theme",
                  reason: `🌟 分享篇(${st.year})猜中獎勵`,
                  day_key: dayKey,
                  meta: { sessionId, themeType: "share_2026_2027", stepKey },
                },
              ],
              { ignoreDuplicates: true }
            );
          }
        }

        await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
          state: st,
        });
        window.PartyFX.playTone("win");
        await window.PartyApp.refreshAll();
      });
    },

    async nextShareItem(sessionId) {
      return window.PartyDB.withLock(`next_share_${sessionId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
        if (!s) return;
        const st = { ...(s.state || {}) };
        const nextIdx = (st.idx || 0) + 1;
        this.editingShareStepKey = "";

        // 若整輪結束，自動檢查【🔮 讀心神探 +40 PT】(命中率 >= 70%)
        if (nextIdx >= (st.items || []).length && (st.items || []).length >= 2) {
          const allResps = await window.PartyDB.select(
            "theme_responses",
            `session_id=eq.${encodeURIComponent(sessionId)}`,
            { forceNetwork: true }
          );
          const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";
          for (const pid of s.participants || []) {
            let hits = 0;
            let possible = 0;
            (st.items || []).forEach((item, i) => {
              if (item.ownerId === pid) return;
              possible += 2;
              const r = allResps.find(
                (x) => x.step_key === `${st.year}_${i}` && x.player_id === pid
              );
              if (r) {
                if (r.payload.ownerPick === item.ownerId) hits += 1;
                if (r.payload.factPick === item.trueIdx) hits += 1;
              }
            });
            if (possible >= 2 && hits / possible >= 0.7) {
              await window.PartyEngine.awardBadgeOnce(
                `mile_mindreader_${pid}`,
                "mile_mindreader",
                pid,
                40,
                "讀心神探",
                `${st.year} 分享篇命中率達 ${Math.round((hits / possible) * 100)}%`,
                dayKey
              );
            }
          }
        }

        st.idx = nextIdx;
        st.revealed = false;
        await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
          state: st,
        });
        await window.PartyApp.refreshAll();
      });
    },

    // --- 匿名爆料 & 少數決 ---
    async submitPollVote(sessionId, stepKey, pick) {
      const ctx = window.PartyApp.getContext();
      await window.PartyDB.upsert("theme_responses", [
        {
          id: `${sessionId}_${stepKey}_${ctx.me.id}`,
          session_id: sessionId,
          step_key: stepKey,
          player_id: ctx.me.id,
          payload: { pick },
        },
      ]);
      window.PartyFX.haptic("medium");
      await window.PartyApp.refreshAll();
    },

    async revealPoll(sessionId) {
      return window.PartyDB.withLock(`rev_poll_${sessionId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
        if (!s || s.state?.revealed) return;
        const st = { subMode: "poll", qIdx: 0, roundSeq: 0, ...(s.state || {}), revealed: true };
        const stepKey = `poll_${st.roundSeq || 0}`;
        const resps = await window.PartyDB.select(
          "theme_responses",
          `session_id=eq.${encodeURIComponent(sessionId)}&step_key=eq.${encodeURIComponent(stepKey)}`,
          { forceNetwork: true }
        );
        const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";

        const tally = {};
        resps.forEach((r) => {
          if (r.payload?.pick) tally[r.payload.pick] = (tally[r.payload.pick] || 0) + 1;
        });
        const maxV = Math.max(0, ...Object.values(tally));
        if (maxV > 0) {
          const topIds = new Set(
            Object.entries(tally)
              .filter(([, cnt]) => cnt === maxV)
              .map(([id]) => id)
          );
          for (const r of resps) {
            if (topIds.has(r.payload?.pick)) {
              await window.PartyDB.upsert(
                "ledger",
                [
                  {
                    id: `poll_hit_${sessionId}_${stepKey}_${r.player_id}`,
                    player_id: r.player_id,
                    delta: 15,
                    category: "theme",
                    reason: "🗳️ 匿名爆料命中全場最高票共識",
                    day_key: dayKey,
                    meta: { sessionId, themeType: "poll_minority", stepKey },
                  },
                ],
                { ignoreDuplicates: true }
              );
            }
          }
        }

        await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
          status: "active",
          state: st,
        });
        window.PartyFX.playTone("win");
        await window.PartyApp.refreshAll();
      });
    },

    async pushLiveCustomPoll(sessionId) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s) return;
      const q = document.getElementById("live-custom-q")?.value.trim() || "";
      if (!q) {
        window.PartyApp.toast("請輸入插播題目內容！");
        return;
      }
      if (window.PartyApp.containsObjectionableText?.(q)) {
        window.PartyApp.toast("🚫 插播題目包含不雅或違規字詞，請修改後再發送！");
        return;
      }
      const cur = s.state || { qIdx: 0, roundSeq: 0 };
      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        status: "active",
        state: {
          subMode: "poll",
          qIdx: cur.qIdx || 0,
          order: cur.order,
          roundSeq: (cur.roundSeq || 0) + 1,
          customQ: { q },
          revealed: false,
        },
      });
      window.PartyFX.playTone("bell");
      await window.PartyApp.refreshAll();
    },

    async nextPoll(sessionId) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s) return;
      const cur = s.state || { subMode: "poll", qIdx: -1, roundSeq: -1 };
      const banks = ctx.questionBanks || window.DEFAULT_QUESTION_BANKS;
      const total = (banks.pollQuestions || []).length;
      const nextIdx = (cur.qIdx ?? -1) + 1;
      // 每場開局隨機洗牌題目順序；整副題目都出完一輪後再重新洗牌，避免每次第一題都一樣
      let order = Array.isArray(cur.order) && cur.order.length === total ? cur.order : null;
      if (!order || (total > 0 && nextIdx % total === 0)) {
        order = window.PartyEngine.shuffle([...Array(total).keys()]);
        if (total > 1 && Array.isArray(cur.order) && cur.order.length === total && order[0] === cur.order[total - 1]) {
          order.push(order.shift()); // 新一輪第一題不要跟上一輪最後一題重複
        }
      }
      const nextState = {
        subMode: "poll",
        qIdx: nextIdx,
        order,
        roundSeq: (cur.roundSeq ?? -1) + 1,
        customQ: null,
        revealed: false,
      };
      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        status: "active",
        state: nextState,
      });
      await window.PartyApp.refreshAll();
    },

    // --- Wavelength ---
    async nextWavelength(sessionId) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s) return;
      const banks = ctx.questionBanks || window.DEFAULT_QUESTION_BANKS;
      const cur = s.state || {};
      const parts = s.participants || [];
      const nextRound = (cur.roundSeq || 0) + 1;
      const presenterId = parts[(nextRound - 1) % parts.length];
      const prompt = window.PartyEngine.shuffle(banks.wavelengthPrompts)[0];
      const target = Math.floor(Math.random() * 91) + 5; // 5 ~ 95

      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        status: "active",
        state: {
          roundSeq: nextRound,
          presenterId,
          prompt,
          target,
          revealed: false,
        },
      });
      this.localSliderVal = 50;
      await window.PartyApp.refreshAll();
    },

    async submitWavelength(sessionId, stepKey) {
      const ctx = window.PartyApp.getContext();
      await window.PartyDB.upsert("theme_responses", [
        {
          id: `${sessionId}_${stepKey}_${ctx.me.id}`,
          session_id: sessionId,
          step_key: stepKey,
          player_id: ctx.me.id,
          payload: { val: this.localSliderVal },
        },
      ]);
      this.editingWlStepKey = "";
      window.PartyFX.haptic("medium");
      await window.PartyApp.refreshAll();
    },

    async revealWavelength(sessionId) {
      return window.PartyDB.withLock(`rev_wl_${sessionId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
        if (!s || !s.state || s.state.revealed) return;
        const st = { ...s.state, revealed: true };
        const stepKey = `wl_${st.roundSeq || 1}`;
        const resps = await window.PartyDB.select(
          "theme_responses",
          `session_id=eq.${encodeURIComponent(sessionId)}&step_key=eq.${encodeURIComponent(stepKey)}`,
          { forceNetwork: true }
        );
        const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";
        let within18 = 0;
        const guessers = resps.filter((r) => r.player_id !== st.presenterId);
        const totalRoomGuessers = Math.max(
          guessers.length,
          (s.participants || []).filter((pid) => pid !== st.presenterId).length,
          1
        );

        for (const r of guessers) {
          const diff = Math.abs(Number(r.payload.val) - st.target);
          if (diff <= 18) within18 += 1;
          const pts = diff <= 4 ? 50 : diff <= 10 ? 30 : diff <= 18 ? 15 : 0;
          if (pts > 0) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `wl_guess_${sessionId}_${stepKey}_${r.player_id}`,
                  player_id: r.player_id,
                  delta: pts,
                  category: "theme",
                  reason: `📡 頻率同步命中靶圈 (誤差 ${diff})`,
                  day_key: dayKey,
                  meta: { sessionId, themeType: "wavelength", stepKey },
                },
              ],
              { ignoreDuplicates: true }
            );
          }
        }

        const hostBonus = within18 > 0 ? Math.round((50 * within18) / totalRoomGuessers) : 0;
        st.lastWithin18 = within18;
        st.lastTotalGuessers = totalRoomGuessers;
        st.lastHostBonus = hostBonus;
        if (hostBonus > 0) {
          await window.PartyDB.upsert(
            "ledger",
            [
              {
                id: `wl_host_${sessionId}_${stepKey}_${st.presenterId}`,
                player_id: st.presenterId,
                delta: hostBonus,
                category: "theme",
                reason: `📡 頻率同步發訊員神引導助攻 (${within18}/${totalRoomGuessers}人進得分圈)`,
                day_key: dayKey,
                meta: { sessionId, themeType: "wavelength", stepKey },
              },
            ],
            { ignoreDuplicates: true }
          );
        }

        await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
          state: st,
        });
        window.PartyFX.playTone("win");
        await window.PartyApp.refreshAll();
      });
    },

    // --- 誰是臥底 ---
    async dealUndercover(sessionId) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s) return;
      const parts = window.PartyEngine.shuffle(s.participants || []);
      const n = parts.length;
      if (n < 3) return;
      const banks = ctx.questionBanks || window.DEFAULT_QUESTION_BANKS;
      const pair = window.PartyEngine.shuffle(banks.undercoverPairs)[0];
      const flip = Math.random() < 0.5;
      const civWord = flip ? pair.civilian : pair.spy;
      const spyWord = flip ? pair.spy : pair.civilian;

      const spyCount = n >= 12 ? 3 : n >= 7 ? 2 : 1;
      const blankCount = n >= 5 ? 1 : 0;

      const roles = {};
      parts.forEach((pid, idx) => {
        if (idx < spyCount) {
          roles[pid] = { type: "spy", word: spyWord };
        } else if (idx < spyCount + blankCount) {
          roles[pid] = { type: "blank", word: "" };
        } else {
          roles[pid] = { type: "civilian", word: civWord };
        }
      });

      const nonBlankIds = parts.filter((id) => roles[id].type !== "blank");
      const speakerStartId = window.PartyEngine.shuffle(nonBlankIds)[0] || parts[0];
      const prevSeq = (s.state && s.state.gameSeq) || 0;

      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        status: "active",
        state: {
          gameSeq: prevSeq + 1,
          voteRound: 1,
          roles,
          civWord,
          spyWord,
          aliveIds: [...parts],
          speakerStartId,
          gameOver: false,
          lastResultMsg: "",
        },
      });
      window.PartyFX.playTone("bell");
      await window.PartyApp.refreshAll();
    },

    async voteUndercover(sessionId, stepKey, targetId) {
      const ctx = window.PartyApp.getContext();
      await window.PartyDB.upsert("theme_responses", [
        {
          id: `${sessionId}_${stepKey}_${ctx.me.id}`,
          session_id: sessionId,
          step_key: stepKey,
          player_id: ctx.me.id,
          payload: { targetId },
        },
      ]);
      window.PartyFX.haptic("medium");
      await window.PartyApp.refreshAll();
    },

    async tallyUndercover(sessionId) {
      return window.PartyDB.withLock(`tally_uc_${sessionId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
        if (!s || !s.state || s.state.gameOver) return;
        const st = { ...s.state };
        const stepKey = `uc_vote_${st.gameSeq || 1}_${st.voteRound || 1}`;
        const resps = await window.PartyDB.select(
          "theme_responses",
          `session_id=eq.${encodeURIComponent(sessionId)}&step_key=eq.${encodeURIComponent(stepKey)}`,
          { forceNetwork: true }
        );
        const dayKey =
          ctx.globalCfg?.activeDayKey ||
          window.PartyEngine.taipeiParts(window.PartyDB.serverNowMs).dateKey;
        const playerMap = {};
        (ctx.players || []).forEach((p) => (playerMap[p.id] = p));

        const aliveSet = new Set(st.aliveIds || []);
        const validResps = (resps || []).filter(
          (r) =>
            aliveSet.has(r.player_id) &&
            r.payload?.targetId &&
            aliveSet.has(r.payload.targetId) &&
            r.player_id !== r.payload.targetId
        );

        const tally = {};
        for (const r of validResps) {
          const tid = r.payload.targetId;
          tally[tid] = (tally[tid] || 0) + 1;
        }

        const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0 || (sorted.length > 1 && sorted[0][1] === sorted[1][1])) {
          const topCnt = sorted.length > 0 ? sorted[0][1] : 0;
          const tiedNames = sorted
            .filter((x) => x[1] === topCnt)
            .map((x) => playerMap[x[0]]?.name || x[0])
            .join("、");
          st.voteRound = (st.voteRound || 1) + 1;
          st.lastResultMsg = tiedNames
            ? `⚖️ 最高票平手（${tiedNames} 各 ${topCnt} 票）！請平票者各補述一句話，重新投票！（平票重投不發放識破分）`
            : "⚖️ 尚未有人送出有效投票，請重新投票！";
          await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
            state: st,
          });
          return await window.PartyApp.refreshAll();
        }

        // 確認非平票、正式淘汰開票時，才發放平民投中內鬼的 +5 PT（防止平票重投無限洗分）
        const elimStageKey = `elim_${st.gameSeq || 1}_${aliveSet.size}`;
        for (const r of validResps) {
          const tid = r.payload.targetId;
          const voterRole = st.roles[r.player_id]?.type;
          const targetRole = st.roles[tid]?.type;
          if (voterRole === "civilian" && (targetRole === "spy" || targetRole === "blank")) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `uc_snipe_${sessionId}_${elimStageKey}_${r.player_id}`,
                  player_id: r.player_id,
                  delta: 5,
                  category: "theme",
                  reason: "🕵️ 誰是臥底投票精準識破內鬼 (+5 PT)",
                  day_key: dayKey,
                  meta: { sessionId, themeType: "undercover", stepKey },
                },
              ],
              { ignoreDuplicates: true }
            );
          }
        }

        const outId = sorted[0][0];
        const outName = playerMap[outId]?.name || outId;
        st.aliveIds = (st.aliveIds || []).filter((id) => id !== outId);

        const aliveBad = st.aliveIds.filter((id) => st.roles[id]?.type !== "civilian");
        const aliveGood = st.aliveIds.filter((id) => st.roles[id]?.type === "civilian");

        if (aliveBad.length === 0) {
          st.gameOver = true;
          st.lastResultMsg = `🎉 ${outName} 出局！所有臥底與白板全滅，【平民陣營獲勝】！（平民詞：${st.civWord} ／ 臥底詞：${st.spyWord}）`;
          for (const [pid, r] of Object.entries(st.roles)) {
            if (r.type === "civilian") {
              const pts = st.aliveIds.includes(pid) ? 40 : 20;
              await window.PartyDB.upsert(
                "ledger",
                [
                  {
                    id: `uc_end_${sessionId}_${st.gameSeq}_${pid}`,
                    player_id: pid,
                    delta: pts,
                    category: "theme",
                    reason: `🕵️ 誰是臥底平民獲勝 (${st.aliveIds.includes(pid) ? "存活" : "躺贏"})`,
                    day_key: dayKey,
                    meta: { sessionId, themeType: "undercover", outcome: "civilian_win" },
                  },
                ],
                { ignoreDuplicates: true }
              );
            }
          }
          window.PartyFX.playTone("win");
        } else if (aliveBad.length >= aliveGood.length || st.aliveIds.length <= 2) {
          st.gameOver = true;
          st.lastResultMsg = `😈 ${outName} 出局！存活人數達警戒線，【臥底＆白板陣營大獲全勝】！（平民詞：${st.civWord} ／ 臥底詞：${st.spyWord}）`;
          for (const [pid, r] of Object.entries(st.roles)) {
            if (r.type === "spy" || r.type === "blank") {
              const alive = st.aliveIds.includes(pid);
              const pts = r.type === "blank" ? (alive ? 90 : 30) : alive ? 70 : 35;
              await window.PartyDB.upsert(
                "ledger",
                [
                  {
                    id: `uc_end_${sessionId}_${st.gameSeq}_${pid}`,
                    player_id: pid,
                    delta: pts,
                    category: "theme",
                    reason: `🕵️ 誰是臥底內鬼陣營獲勝 (${r.type === "blank" ? "白板" : "臥底"})`,
                    day_key: dayKey,
                    meta: { sessionId, themeType: "undercover", outcome: "spy_win" },
                  },
                ],
                { ignoreDuplicates: true }
              );
              if (alive) {
                await window.PartyEngine.awardBadgeOnce(
                  `mile_spy_${pid}`,
                  "mile_spy",
                  pid,
                  40,
                  "影帝級臥底",
                  "誰是臥底擔任內鬼存活獲勝",
                  dayKey
                );
              }
            }
          }
          window.PartyFX.playTone("win");
        } else {
          st.voteRound = (st.voteRound || 1) + 1;
          st.lastResultMsg = `📢 ${outName} 被投票淘汰出局！場上仍有內鬼，請繼續下一輪描述與投票！`;
        }

        await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
          state: st,
        });
        await window.PartyApp.refreshAll();
      });
    },

    // --- 1/1 尋找真實小人 ---
    async initFigurineTeams(sessionId) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s) return;
      const limitMin = Math.max(1, Number(document.getElementById("fig-limit-min")?.value || 15));
      const totalCount = Math.max(1, Number(document.getElementById("fig-total-cnt")?.value || 5));
      const shuffled = window.PartyEngine.shuffle(s.participants || []);
      const mid = Math.ceil(shuffled.length / 2);

      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        status: "active",
        state: {
          limitMin,
          totalCount,
          teamA: shuffled.slice(0, mid),
          teamB: shuffled.slice(mid),
          half: 1,
          searchStartedAt: 0,
          clueNote: "",
        },
      });
      await window.PartyApp.refreshAll();
    },

    async startFigurineTimer(sessionId) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s) return;
      const isHost = s.host_id === ctx.me?.id || ctx.isGmUnlocked;
      if (!isHost) {
        window.PartyApp.toast("僅限本場 Host (GM) 可以啟動搜尋計時器喔！");
        return;
      }
      const note = document.getElementById("fig-clue-note")?.value.trim() || "";
      const customMin = Number(document.getElementById("fig-half-limit-min")?.value || s.state?.limitMin || 15);
      const limitMin = Math.max(1, Math.min(60, customMin));
      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        state: {
          ...(s.state || {}),
          limitMin,
          clueNote: note,
          searchStartedAt: window.PartyDB.serverNowMs,
        },
      });
      window.PartyFX.playTone("bell");
      await window.PartyApp.refreshAll();
    },

    async adjustFigurineTime(sessionId, deltaMin) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s || !s.state) return;
      const isHost = s.host_id === ctx.me?.id || ctx.isGmUnlocked;
      if (!isHost) return;
      const nextMin = Math.max(1, Math.min(90, (Number(s.state.limitMin) || 15) + deltaMin));
      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        state: {
          ...s.state,
          limitMin: nextMin,
        },
      });
      window.PartyApp.toast(`⏱️ 已調整本半場搜尋時間上限為 ${nextMin} 分鐘！`);
      await window.PartyApp.refreshAll();
    },

    async checkInFigurine(sessionId, stepKey) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s || !s.state?.searchStartedAt) return;
      const fullChkKey = `${sessionId}_${stepKey}`;
      const chk = document.getElementById(`fig-chk-${stepKey}`);
      const isChecked = Boolean(chk?.checked) || this.checkedFigKeys.has(fullChkKey);
      if (!isChecked) {
        window.PartyApp.toast("📸 請先拍照傳至派對群組相簿，並勾選「已拍照傳群組相簿」再按打卡！");
        return;
      }
      const elapsedMs = Math.max(100, window.PartyDB.serverNowMs - s.state.searchStartedAt);
      await window.PartyDB.upsert(
        "theme_responses",
        [
          {
            id: `${sessionId}_${stepKey}`,
            session_id: sessionId,
            step_key: stepKey,
            player_id: ctx.me.id,
            payload: { elapsedMs, lineAlbumChecked: true },
          },
        ],
        { ignoreDuplicates: true }
      );
      this.checkedFigKeys.delete(fullChkKey);
      window.PartyFX.playTone("win");
      await window.PartyApp.refreshAll();
    },

    async finishFigurineHalf(sessionId) {
      return window.PartyDB.withLock(`fin_fig_${sessionId}`, async () => {
        const ctx = window.PartyApp.getContext();
        const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
        if (!s || !s.state || s.state.half === 3) return;
        const st = { ...s.state };
        const half = st.half || 1;
        const allResps = await window.PartyDB.select(
          "theme_responses",
          `session_id=eq.${encodeURIComponent(sessionId)}`,
          { forceNetwork: true }
        );
        const halfResps = allResps.filter((r) => r.step_key.startsWith(`fig_h${half}_`));
        const found = halfResps.length;
        const maxElapsed = halfResps.reduce(
          (m, r) => Math.max(m, Number(r.payload.elapsedMs) || 0),
          found === 0 ? st.limitMin * 60000 : 0
        );

        if (half === 1) {
          st.resB = { found, elapsedMs: maxElapsed };
          st.half = 2;
          st.searchStartedAt = 0;
          st.clueNote = "";
        } else {
          st.resA = { found, elapsedMs: maxElapsed };
          st.half = 3;
          const isExactTie =
            st.resA.found === st.resB.found && st.resA.elapsedMs === st.resB.elapsedMs;
          const aWin =
            st.resA.found > st.resB.found ||
            (st.resA.found === st.resB.found && st.resA.elapsedMs < st.resB.elapsedMs);
          const winTeam = isExactTie ? [...(st.teamA || []), ...(st.teamB || [])] : aWin ? st.teamA : st.teamB;
          const loseTeam = isExactTie ? [] : aWin ? st.teamB : st.teamA;
          st.winnerBanner = isExactTie
            ? "👑 雙隊尋獲數與秒數完全並列第 1！全場共同獲勝每人 +100 PT！"
            : `${aWin ? "👑 🅰️ A 隊" : "👑 🅱️ B 隊"} 最快完成搜查獲勝！全隊每人 +100 PT ＆ 解鎖【神探夏洛克】！`;
          const dayKey =
            ctx.globalCfg?.activeDayKey ||
            window.PartyEngine.taipeiParts(window.PartyDB.serverNowMs).dateKey;

          for (const pid of winTeam) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `fig_win_${sessionId}_${pid}`,
                  player_id: pid,
                  delta: 100,
                  category: "theme",
                  reason: "🏃‍♂️ 尋找真實小人最快獲勝隊伍獎勵",
                  day_key: dayKey,
                  meta: { sessionId, themeType: "find_figurine", outcome: "win" },
                },
              ],
              { ignoreDuplicates: true }
            );
            if (!isExactTie || st.resA.found > 0) {
              await window.PartyEngine.awardBadgeOnce(
                `mile_sherlock_${pid}`,
                "mile_sherlock",
                pid,
                40,
                "神探夏洛克",
                "尋找真實小人獲勝隊員",
                dayKey
              );
            }
          }
          for (const pid of loseTeam) {
            await window.PartyDB.upsert(
              "ledger",
              [
                {
                  id: `fig_part_${sessionId}_${pid}`,
                  player_id: pid,
                  delta: 40,
                  category: "theme",
                  reason: "🏃‍♂️ 尋找真實小人完賽參與獎勵",
                  day_key: dayKey,
                  meta: { sessionId, themeType: "find_figurine", outcome: "participate" },
                },
              ],
              { ignoreDuplicates: true }
            );
          }
          window.PartyFX.playTone("win");
        }

        await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
          state: st,
        });
        await window.PartyApp.refreshAll();
      });
    },

    // --- 1/2 實體六關 ---
    async initPhysicalTeams(sessionId) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s) return;
      const shuffled = window.PartyEngine.shuffle(s.participants || []);
      const mid = Math.ceil(shuffled.length / 2);
      const redTeam = shuffled.slice(0, mid);
      const blueTeam = shuffled.slice(mid);
      const doubleRepId =
        redTeam.length !== blueTeam.length && blueTeam.length > 0
          ? window.PartyEngine.shuffle(blueTeam)[0]
          : null;

      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        status: "active",
        state: { redTeam, blueTeam, doubleRepId, stageWinners: {} },
      });
      await window.PartyApp.refreshAll();
    },

    async awardPhysicalStage(sessionId, stageNo, teamColor) {
      const ctx = window.PartyApp.getContext();
      const s = (ctx.themeSessions || []).find((x) => x.id === sessionId);
      if (!s || !s.state) return;
      const st = { ...s.state, stageWinners: { ...(s.state.stageWinners || {}) } };
      if (st.stageWinners[stageNo]) return;
      st.stageWinners[stageNo] = teamColor;

      const winners = teamColor === "red" ? st.redTeam : st.blueTeam;
      const dayKey =
        ctx.globalCfg?.activeDayKey ||
        window.PartyEngine.taipeiParts(window.PartyDB.serverNowMs).dateKey;
      const stageMeta = PHYSICAL_STAGES.find((x) => x.no === stageNo);

      for (const pid of winners || []) {
        await window.PartyDB.upsert(
          "ledger",
          [
            {
              id: `phys6_${sessionId}_s${stageNo}_${pid}`,
              player_id: pid,
              delta: 30,
              category: "theme",
              reason: `🏓 實體對抗第${stageNo}關【${stageMeta?.title || ""}】獲勝`,
              day_key: dayKey,
              meta: { sessionId, themeType: "physical_6stages", stageNo, teamColor },
            },
          ],
          { ignoreDuplicates: true }
        );
      }

      await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(sessionId)}`, {
        state: st,
      });
      window.PartyFX.playTone("win");
      await window.PartyApp.refreshAll();
    },

    // --- 2027 跨年煙火簽到禮 ---
    async triggerMockCountdown() {
      const ctx = window.PartyApp.getContext();
      const sid = `thm_nye_${Date.now()}`;
      for (const old of ctx.themeSessions || []) {
        if (old.status !== "finished") {
          await window.PartyDB.update("theme_sessions", `id=eq.${encodeURIComponent(old.id)}`, {
            status: "finished",
          });
        }
      }
      await window.PartyDB.upsert("theme_sessions", [
        {
          id: sid,
          theme_type: "nye_checkin",
          status: "active",
          host_id: ctx.me.id,
          participants: (ctx.players || []).map((p) => p.id),
          state: {
            targetMs:
              window.PartyEngine.getEffectiveNowMs(ctx.globalCfg, window.PartyDB.serverNowMs) + 8000,
          },
        },
      ]);
      await window.PartyApp.refreshAll();
    },

    replayFireworks() {
      window.PartyFX.playFirecrackers();
      window.PartyFX.launchFireworksShow({ celebration: true, durationMs: 3800 });
    },

    async claimNyeGift() {
      return window.PartyDB.withLock("claim_nye_gift", async () => {
        const ctx = window.PartyApp.getContext();
        if (!ctx.me) return;
        const g = { ...window.PARTY_CONFIG.DEFAULTS, ...(ctx.globalCfg || {}) };
        const pts = Number(g.nyeGiftPoints) || 50;
        const dayKey =
          g.activeDayKey ||
          window.PartyEngine.taipeiParts(window.PartyDB.serverNowMs).dateKey;
        const inserted = await window.PartyDB.upsert(
          "ledger",
          [
            {
              id: `nye2027_checkin_${ctx.me.id}`,
              player_id: ctx.me.id,
              delta: pts,
              category: "nye_gift",
              reason: `🎉 《${g.eventTitle || "跨年英雄紀元"}》午夜煙火開運簽到禮`,
              day_key: dayKey,
            },
          ],
          { ignoreDuplicates: true }
        );
        // 播放喜慶音效 ＋ 全螢幕繽紛煙火與慶典特效 ＋ 簽到賀卡！
        window.PartyFX.playFirecrackers();
        window.PartyFX.launchFireworksShow({ celebration: true, durationMs: 4200 });
        if (window.PartyApp.showNyeGiftSplash) {
          window.PartyApp.showNyeGiftSplash(pts, g.eventTitle || "跨年英雄紀元");
        } else {
          window.PartyApp.toast(`🎉 新年快樂！成功領取 +${pts} PT 開運簽到禮！`);
        }
        await window.PartyApp.refreshAll();
        return inserted;
      });
    },
  };

  ThemeGamesUI.THEME_LIST = THEME_LIST;
  ThemeGamesUI.PHYSICAL_STAGES = PHYSICAL_STAGES;
  window.ThemeGamesUI = ThemeGamesUI;
})();
