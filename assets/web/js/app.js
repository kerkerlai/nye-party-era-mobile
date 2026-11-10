/**
 * 《跨年英雄紀元 2026 ➜ 2027》主控制器與個人 Dashboard / 隱藏任務 / Viewer 結算畫面 (app.js)
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

  function avatarHtml(player, size = 40) {
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

  // 支援網址 ?as=1 多開視窗獨立模擬測試，實機則存於 localStorage 永久記住登入
  const urlParams = new URLSearchParams(window.location.search);
  const slotPrefix = urlParams.get("as") ? `slot_${urlParams.get("as")}_` : "";

  function getSavedPlayerId() {
    if (slotPrefix) return sessionStorage.getItem(`${slotPrefix}player_id`) || "";
    return localStorage.getItem("nye_party_player_id") || "";
  }

  function setSavedPlayerId(id) {
    if (slotPrefix) sessionStorage.setItem(`${slotPrefix}player_id`, id);
    else localStorage.setItem("nye_party_player_id", id);
  }

  const PartyApp = {
    tab: "stage", // stage (第1順位) | dashboard (第2順位) | gm (第3順位)
    isGmUnlocked: false,
    claimModalCard: null,
    choreModalBadge: null,
    selectedLoginEmoji: "🦊",
    pendingLoginAvatarUrl: "",
    loginDraftName: "",
    loginDraftPin: "",
    uploadingAvatar: false,
    currentZoomScale: 1,
    reactionTestState: { phase: "idle", fireAt: 0, lastMs: null },
    seenTableIds: new Set(),
    seenNudgeKeys: new Set(),
    seenClaimIds: new Set(),
    shownResultSplashIds: new Set(),
    lastKnownScene: null,
    lastKnownCeremonyStage: 1,
    localCeremonyPreviewStage: 0,
    _logoTapCount: 0,
    _logoTapResetTimer: null,
    initializedOnce: false,

    data: {
      globalCfg: { ...CFG.DEFAULTS },
      schedule: [...CFG.DEFAULT_SCHEDULE],
      questionBanks: window.DEFAULT_QUESTION_BANKS,
      players: [],
      ledger: [],
      missions: [],
      claims: [],
      claimApprovals: [],
      tables: [],
      bets: [],
      themeSessions: [],
      themeResponses: [],
      badgesAwarded: [],
    },

    async init() {
      document.body.addEventListener(
        "pointerdown",
        () => window.PartyFX.unlockAudio(),
        { once: true }
      );
      const markDirty = (ev) => {
        const t = ev.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
          t.dataset.dirty = "1";
        }
      };
      document.body.addEventListener("input", markDirty);
      document.body.addEventListener("change", markDirty);
      await window.PartyDB.syncClock();
      await this.refreshAll(true);

      window.PartyDB.subscribeChanges(() => {
        this.refreshAll({ isFirst: false, background: true });
      });

      // 每秒平滑更新畫面上所有倒數計時器 (不重繪 DOM，零閃爍、不吃掉勾勾！)，每 5 秒檢查自動排程時段切換
      if (!urlParams.get("nosse")) {
        setInterval(() => {
          this.tickLiveCountdowns();
        }, 1000);
        setInterval(() => {
          this.checkSceneTransitionAndRender();
        }, 5000);
      }
    },

    handleBackButton() {
      const zoom = document.getElementById("zoom-lightbox");
      if (zoom && !zoom.classList.contains("hidden")) {
        this.closeImageZoom();
        return true;
      }
      const splash = document.getElementById("result-splash");
      if (splash && !splash.classList.contains("hidden")) {
        this.closeResultSplash();
        return true;
      }
      const modal = document.getElementById("party-modal");
      if (modal && !modal.classList.contains("hidden")) {
        window.PartyGamesUI.closeModal();
        return true;
      }
      const roomOverlay = document.getElementById("game-room-overlay");
      if (roomOverlay && !roomOverlay.classList.contains("hidden")) {
        window.PartyGamesUI.minimizeRoomWindow();
        return true;
      }
      if (this.tab !== "stage") {
        this.switchTab("stage");
        return true;
      }
      return false;
    },

    tickLiveCountdowns() {
      const realNow = window.PartyDB.serverNowMs;
      const effNow = window.PartyEngine.getEffectiveNowMs(this.data.globalCfg, realNow);

      // 1. 更新 GM 時光機雙時鐘顯示
      document.querySelectorAll(".live-real-clock").forEach((el) => {
        el.textContent = window.PartyEngine.formatFullClock(realNow);
      });
      document.querySelectorAll(".live-sim-clock").forEach((el) => {
        el.textContent = window.PartyEngine.formatFullClock(effNow);
      });

      // 2. 更新開賽前網路遊戲風格倒數計時器（日 / 時 / 分 / 秒）
      const launchCard = document.getElementById("launch-countdown-card");
      if (launchCard) {
        const launchAt = Number(launchCard.getAttribute("data-launch-ms") || 0);
        if (launchAt > 0) {
          const remSec = Math.max(0, Math.ceil((launchAt - effNow) / 1000));
          const dd = Math.floor(remSec / 86400);
          const hh = Math.floor((remSec % 86400) / 3600);
          const mm = Math.floor((remSec % 3600) / 60);
          const ss = remSec % 60;
          const setTxt = (id, v) => {
            const node = document.getElementById(id);
            if (node && node.textContent !== v) node.textContent = v;
          };
          setTxt("lcd-dd", String(dd).padStart(2, "0"));
          setTxt("lcd-hh", String(hh).padStart(2, "0"));
          setTxt("lcd-mm", String(mm).padStart(2, "0"));
          setTxt("lcd-ss", String(ss).padStart(2, "0"));
          setTxt(
            "lcd-inline-summary",
            `${dd}日 ${String(hh).padStart(2, "0")}時 ${String(mm).padStart(2, "0")}分 ${String(ss).padStart(2, "0")}秒`
          );
          if (remSec === 0) {
            this.checkSceneTransitionAndRender();
            return;
          }
        }
      }

      // 2b. 平滑更新【實體小人攻防戰】搜尋倒數計時（不重繪整頁，100% 保護玩家勾選框不跳掉！）
      const figTimer = document.getElementById("fig-live-timer");
      if (figTimer) {
        const started = Number(figTimer.getAttribute("data-started") || 0);
        const limitMin = Number(figTimer.getAttribute("data-limit-min") || 15);
        if (started > 0) {
          const limitMs = limitMin * 60000;
          const elapsed = Math.min(limitMs, Math.max(0, realNow - started));
          const remSec = Math.max(0, Math.ceil((limitMs - elapsed) / 1000));
          const nextFigTxt = `${Math.floor(remSec / 60)}:${String(remSec % 60).padStart(2, "0")}`;
          if (figTimer.textContent !== nextFigTxt) {
            figTimer.textContent = nextFigTxt;
            if (remSec === 0) {
              this.render();
              return;
            }
          }
        }
      }

      // 2c. 平滑更新【跨年煙火午夜盛典】倒數計時（歸零瞬間自動解鎖紅包！）
      const nyeTimer = document.getElementById("nye-live-timer");
      if (nyeTimer) {
        const targetMs = Number(nyeTimer.getAttribute("data-target-ms") || 0);
        if (targetMs > 0) {
          const remMs = targetMs - effNow;
          if (remMs <= 0) {
            window.PartyFX.playTone("win");
            window.PartyFX.haptic("heavy");
            this.render();
            return;
          }
          const secLeft = Math.max(0, Math.ceil(remMs / 1000));
          const nextNyeTxt =
            secLeft > 3600
              ? `倒數 ${Math.floor(secLeft / 3600)}h ${Math.floor((secLeft % 3600) / 60)}m`
              : `${Math.floor(secLeft / 60)}:${String(secLeft % 60).padStart(2, "0")}`;
          if (nyeTimer.textContent !== nextNyeTxt) {
            nyeTimer.textContent = nextNyeTxt;
          }
        }
      }

      // 3. 更新賽桌集結倒數
      const nodes = document.querySelectorAll(".live-countdown[data-until]");
      if (!nodes.length) return;
      let anyJustExpired = false;
      nodes.forEach((el) => {
        const until = Date.parse(el.getAttribute("data-until") || "");
        if (!until) return;
        const sec = Math.max(0, Math.ceil((until - realNow) / 1000));
        const mm = String(Math.floor(sec / 60)).padStart(2, "0");
        const ss = String(sec % 60).padStart(2, "0");
        const nextTxt = `⏳ 集結＆下注倒數 ${mm}:${ss}`;
        if (el.textContent.trim() !== nextTxt) {
          el.textContent = nextTxt;
          if (sec === 0) anyJustExpired = true;
        }
      });
      if (anyJustExpired) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
          this.render();
        }
      }
    },

    confirmModal(title, message, confirmLabel, onConfirm, danger = false) {
      this._pendingConfirmAction = onConfirm;
      const modal = document.getElementById("party-modal");
      const box = document.getElementById("party-modal-body");
      if (!modal || !box) {
        if (onConfirm) onConfirm();
        return;
      }
      modal.classList.remove("hidden");
      box.innerHTML = `
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="btn-close" onclick="PartyGamesUI.closeModal()">✕</button>
        </div>
        <p class="muted-sm" style="margin-bottom:16px;white-space:pre-line;">${esc(message)}</p>
        <div class="grid-2-btns">
          <button class="btn btn-ghost" onclick="PartyGamesUI.closeModal()">取消</button>
          <button class="btn ${danger ? "btn-rose" : "btn-gold"}" onclick="PartyApp.runPendingConfirm()">${esc(confirmLabel)}</button>
        </div>
      `;
    },

    async runPendingConfirm() {
      const fn = this._pendingConfirmAction;
      this._pendingConfirmAction = null;
      window.PartyGamesUI.closeModal();
      if (fn) await fn();
    },

    setGmUnlocked(val) {
      this.isGmUnlocked = val;
      if (slotPrefix) sessionStorage.setItem(`${slotPrefix}gm`, val ? "1" : "");
      else localStorage.setItem("nye_party_gm", val ? "1" : "");
      this.render();
    },

    // c-1: 隱藏一般玩家的 GM Tab，連點左上角品牌 Logo 3 下彈出主辦人控場解鎖視窗
    handleLogoTap() {
      this._logoTapCount = (this._logoTapCount || 0) + 1;
      clearTimeout(this._logoTapResetTimer);
      this._logoTapResetTimer = setTimeout(() => {
        this._logoTapCount = 0;
      }, 1500);

      if (this._logoTapCount >= 3) {
        this._logoTapCount = 0;
        clearTimeout(this._logoTapResetTimer);
        window.PartyFX.haptic("medium");
        if (this.isGmUnlocked) {
          this.switchTab("gm");
          this.toast("👑 已切換至 GM 主控台！");
        } else {
          this.openGmUnlockModal();
        }
      }
    },

    openGmUnlockModal() {
      const modal = document.getElementById("party-modal");
      const box = document.getElementById("party-modal-body");
      if (!modal || !box) return;
      modal.classList.remove("hidden");
      box.innerHTML = `
        <div class="modal-head">
          <h3>👑 主辦人 GM 控場解鎖</h3>
          <button class="btn-close" onclick="PartyGamesUI.closeModal()">✕</button>
        </div>
        <p class="muted-sm" style="margin-bottom:12px;">此區為活動主辦人專屬黑盒控場後台。請輸入 GM 控場密碼解鎖：</p>
        <input type="password" inputmode="numeric" id="gm-unlock-modal-pin" class="input-dark" placeholder="請輸入 GM 控場密碼" onkeydown="if(event.key==='Enter') PartyApp.submitGmUnlockModal()">
        <div class="grid-2-btns" style="margin-top:12px;">
          <button class="btn btn-ghost" onclick="PartyGamesUI.closeModal()">取消</button>
          <button class="btn btn-gold" onclick="PartyApp.submitGmUnlockModal()">🔑 解鎖進入後台</button>
        </div>
      `;
      setTimeout(() => document.getElementById("gm-unlock-modal-pin")?.focus(), 60);
    },

    submitGmUnlockModal() {
      const inp = document.getElementById("gm-unlock-modal-pin");
      const val = inp ? inp.value.trim() : "";
      const ctx = this.getContext();
      const expected = String(ctx.globalCfg?.gmPin || CFG.DEFAULT_GM_PIN).trim();
      if (val === expected) {
        window.PartyGamesUI.closeModal();
        this.setGmUnlocked(true);
        this.switchTab("gm");
        window.PartyFX.playTone("win");
        this.toast("👑 GM 主控台已解鎖！底部導覽列已開啟「GM控場」");
      } else {
        window.PartyFX.haptic("heavy");
        this.toast("❌ GM 密碼不正確，僅限主辦人解鎖！");
      }
    },

    toggleSoundMute() {
      const muted = window.PartyFX.toggleMute();
      this.toast(muted ? "🔇 已切換為靜音模式（保留震動與視覺動畫）" : "🔊 已開啟派對音效！");
      this.render();
    },

    showRedPacketSplash(pts, eventTitle) {
      const el = document.getElementById("result-splash");
      const card = document.getElementById("result-splash-card");
      if (!el || !card) return;
      card.style.borderColor = "#fde047";
      card.innerHTML = `
        <div style="font-size:52px;line-height:1.1;margin-bottom:6px;">🧧🧨🎆</div>
        <div class="muted-xs" style="color:#fde047;margin-bottom:4px;">《${esc(eventTitle || "跨年英雄紀元")}》午夜開運禮</div>
        <h3 style="font-size:23px;color:#fff;margin-bottom:8px;">🎉 恭喜發財・新年快樂！</h3>
        <div class="badge-pill pill-gold" style="font-size:18px;padding:9px 20px;margin:8px 0 14px;">
          ✨ 開運紅包入帳 +${window.PartyEngine.fmtPt(pts)} PT！
        </div>
        <button class="btn btn-gold btn-sm" style="min-width:150px;" onclick="PartyApp.closeResultSplash()">
          太讚啦！(3.5秒自動關閉)
        </button>
        <div class="result-splash-bar"></div>
      `;
      el.classList.remove("hidden");
      clearTimeout(this._resultSplashTimer);
      this._resultSplashTimer = setTimeout(() => {
        this.closeResultSplash();
      }, 3500);
    },

    switchTab(t) {
      this.tab = t;
      this.render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    toast(msg) {
      const el = document.getElementById("app-toast");
      if (!el) return;
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove("show"), 3400);
    },

    // --- 高清攻略圖卡全螢幕點擊放大檢視器 ---
    openImageZoom(src, title) {
      const box = document.getElementById("zoom-lightbox");
      const img = document.getElementById("zoom-target-img");
      const titleEl = document.getElementById("zoom-title");
      const scrollArea = document.getElementById("zoom-scroll-area");
      if (!box || !img) return;
      img.src = src;
      if (titleEl) titleEl.textContent = title || "📖 攻略圖卡放大檢視";
      box.classList.remove("hidden");
      this.setImageZoomScale(1.85); // 預設點開直接放大至清晰好讀的 1.85x！
      if (scrollArea) {
        scrollArea.scrollTop = 0;
        scrollArea.scrollLeft = 0;
      }
    },

    closeImageZoom() {
      const box = document.getElementById("zoom-lightbox");
      if (box) box.classList.add("hidden");
    },

    setImageZoomScale(scale) {
      this.currentZoomScale = scale;
      const img = document.getElementById("zoom-target-img");
      if (!img) return;
      img.style.width = `${Math.round(scale * 100)}%`;
      img.style.cursor = scale >= 2.6 ? "zoom-out" : "zoom-in";
    },

    cycleImageZoomScale() {
      const next =
        this.currentZoomScale < 1.5
          ? 1.85
          : this.currentZoomScale < 2.4
          ? 2.7
          : 1;
      this.setImageZoomScale(next);
    },

    // --- 賽局結束 3 秒勝負開獎彈窗 (原地彈出顯示勝負與個人得分，不跳動捲軸！) ---
    closeResultSplash() {
      clearTimeout(this._resultSplashTimer);
      const el = document.getElementById("result-splash");
      if (el) el.classList.add("hidden");
    },

    showTableResultSplash(table) {
      const el = document.getElementById("result-splash");
      const card = document.getElementById("result-splash-card");
      if (!el || !card || !table) return;

      const myId = getSavedPlayerId();
      const playerMap = {};
      (this.data.players || []).forEach((p) => (playerMap[p.id] = p));
      (table.participants || []).forEach((p) => {
        if (!playerMap[p.id]) playerMap[p.id] = p;
      });
      const gameMeta =
        CFG.PARTY_GAMES.find((x) => x.id === table.game_type) || CFG.PARTY_GAMES[0];
      const wids = table.winner_ids || [];
      const isCoopFail = wids.includes("__coop_fail__");
      const isPvpTie = wids.includes("__pvp_tie__");
      const realWinIds = wids.filter((id) => id !== "__coop_fail__" && id !== "__pvp_tie__");
      const gs = table.game_state || {};

      // 1. 判定勝負標題
      const isCoop =
        table.game_type === "ito_numbers" ||
        (table.game_type === "soul_sync_2v2" && (table.participants || []).length <= 2);
      let headline = "";
      if (isCoop) {
        headline =
          !isCoopFail && realWinIds.length > 0
            ? "🎉 合作闖關大成功！"
            : "💥 挑戰翻車失敗！";
      } else if (isPvpTie || realWinIds.length === 0) {
        headline = "⚖️ 雙方平手和局！";
      } else {
        const winNames = realWinIds
          .map((id) => playerMap[id]?.name || id)
          .join("、");
        headline = `🏆 贏家：${winNames}`;
      }

      // 2. 各遊戲精彩賽況摘要
      let detailTxt = "";
      if (table.game_type === "quick_draw") {
        const times = gs.times || {};
        const entries = Object.entries(times);
        if (entries.length) {
          detailTxt = entries
            .map(([pid, v]) => {
              const nm = playerMap[pid]?.name || pid;
              if (gs.mode === "blind10") return `${nm} ${(v / 1000).toFixed(2)}秒`;
              return v < 0 || v >= 99000 ? `${nm} 偷跑淘汰` : `${nm} ${v}ms`;
            })
            .slice(0, 5)
            .join(" ｜ ");
        }
      } else if (table.game_type === "number_bomb" && gs.lastLog) {
        detailTxt = gs.lastLog;
      } else if (table.game_type === "rps_king" && gs.lastRoundMsg) {
        const p1 = (table.participants || [])[0];
        const p2 = (table.participants || [])[1];
        const wMap = gs.wins || {};
        const scoreStr =
          p1 && p2 ? `（總比分 ${wMap[p1.id] || 0} : ${wMap[p2.id] || 0}）` : "";
        detailTxt = `${gs.lastRoundMsg}${scoreStr}`;
      } else if (
        table.game_type === "ito_numbers" &&
        (gs.proposedOrder?.length || gs.playedOrder?.length)
      ) {
        const ord = gs.proposedOrder || [];
        const sec = gs.secretNumbers || {};
        detailTxt =
          "翻牌順序：" +
          ord
            .map((pid) => `${playerMap[pid]?.name || pid}(${sec[pid] ?? "?"})`)
            .join(" ➜ ");
      } else if (table.game_type === "soul_sync_2v2" && (gs.scores || gs.teamHits)) {
        const sc = gs.scores || gs.teamHits || {};
        const totalQ = (gs.questions || []).length || 8;
        detailTxt =
          (table.participants || []).length <= 2
            ? `${totalQ} 題共默契命中 ${sc.team_A || 0} 題！`
            : `🅰️ A組命中 ${sc.team_A || 0} 題 vs 🅱️ B組命中 ${sc.team_B || 0} 題`;
      } else if (table.game_type === "five_seconds" && gs.scores) {
        detailTxt = (table.participants || [])
          .map((p) => `${p.name} ${gs.scores[p.id] || 0}分`)
          .join(" ｜ ");
      }

      // 3. 計算我個人的積分淨變化 (參賽 + 下注)
      const myPart = (table.participants || []).find((p) => p.id === myId);
      const myBet = (this.data.bets || []).find(
        (b) => b.table_id === table.id && b.bettor_id === myId
      );
      const myEntries = (this.data.ledger || []).filter(
        (e) => e.player_id === myId && e.meta && e.meta.tableId === table.id
      );
      const netDelta = myEntries.reduce((acc, e) => acc + (Number(e.delta) || 0), 0);

      let myResultPill = "";
      let borderColor = "var(--gold)";
      if (table.is_test_run) {
        myResultPill = `<div class="badge-pill pill-cyan" style="font-size:14px;padding:6px 14px;">🧪 新手免費測試局：0 PT（不扣不加）</div>`;
      } else if (myPart && !myPart.isScoring) {
        const iWon = realWinIds.includes(myId);
        myResultPill = `<div class="badge-pill pill-cyan" style="font-size:14px;padding:6px 14px;">🤝 陪玩局（${iWon ? "獲勝" : "完賽"}）：0 PT（未滿額對手照常計分！）</div>`;
      } else if (netDelta > 0) {
        myResultPill = `<div class="badge-pill pill-gold" style="font-size:16px;padding:7px 16px;">🎉 你的本局戰果：+${window.PartyEngine.fmtPt(netDelta)} PT！</div>`;
        borderColor = "#fbbf24";
      } else if (netDelta < 0) {
        myResultPill = `<div class="badge-pill pill-fire" style="font-size:15px;padding:7px 16px;">💸 你的本局戰果：${window.PartyEngine.fmtPt(netDelta)} PT</div>`;
        borderColor = "#fb7185";
      } else if (myBet && myBet.status === "refunded") {
        myResultPill = `<div class="badge-pill" style="font-size:14px;padding:6px 14px;">↩️ 場邊押注平手／單邊已全額退回（0 PT）</div>`;
      } else {
        myResultPill = `<div class="badge-pill" style="font-size:14px;padding:6px 14px;">⚖️ 本局損益：0 PT（本金退回）</div>`;
      }

      card.style.borderColor = borderColor;
      card.innerHTML = `
        <div style="font-size:44px;line-height:1.1;margin-bottom:6px;">${gameMeta.icon}</div>
        <div class="muted-xs" style="margin-bottom:4px;">${esc(table.title)}・對戰結算</div>
        <h3 style="font-size:21px;color:#fef08a;margin-bottom:8px;">${esc(headline)}</h3>
        ${
          detailTxt
            ? `<div class="muted-sm" style="background:rgba(9,13,24,0.65);border-radius:10px;padding:7px 10px;margin-bottom:12px;font-size:12.5px;">${esc(detailTxt)}</div>`
            : ""
        }
        <div style="margin:8px 0 12px;">${myResultPill}</div>
        <button class="btn btn-gold btn-sm" style="min-width:140px;" onclick="PartyApp.closeResultSplash()">
          繼續開玩 (3秒自動關閉)
        </button>
        <div class="result-splash-bar"></div>
      `;

      el.classList.remove("hidden");
      window.PartyFX.haptic(netDelta > 0 ? "heavy" : "medium");
      clearTimeout(this._resultSplashTimer);
      this._resultSplashTimer = setTimeout(() => {
        this.closeResultSplash();
      }, 3000);
    },

    async refreshAll(opts = false) {
      const isFirst = typeof opts === "boolean" ? opts : Boolean(opts?.isFirst);
      const isBackground = typeof opts === "object" && Boolean(opts?.background);
      if (this._fetching) {
        this._pendingRefresh = true;
        this._pendingBg = Boolean(this._pendingBg && isBackground);
        return await new Promise((res) => {
          (this._pendingWaiters = this._pendingWaiters || []).push(res);
        });
      }
      this._fetching = true;
      try {
        const [
          cfgRows,
          players,
          ledger,
          missions,
          claims,
          claimApprovals,
          tables,
          bets,
          themeSessions,
          themeResponses,
          badgesAwarded,
        ] = await Promise.all([
          window.PartyDB.select("config"),
          window.PartyDB.select("players", "order=joined_at.asc"),
          window.PartyDB.select("ledger", "order=created_at.desc"),
          window.PartyDB.select("missions"),
          window.PartyDB.select("claims", "order=created_at.desc"),
          window.PartyDB.select("claim_approvals"),
          window.PartyDB.select("tables", "order=created_at.desc"),
          window.PartyDB.select("bets", "order=created_at.desc"),
          window.PartyDB.select("theme_sessions", "order=created_at.desc"),
          window.PartyDB.select("theme_responses"),
          window.PartyDB.select("badges_awarded", "order=created_at.desc"),
        ]);

        const cfgMap = {};
        (cfgRows || []).forEach((r) => (cfgMap[r.key] = r.value));

        this.data = {
          globalCfg: { ...CFG.DEFAULTS, ...(cfgMap.global || {}) },
          schedule:
            cfgMap.schedule && cfgMap.schedule.length
              ? cfgMap.schedule
              : [...CFG.DEFAULT_SCHEDULE],
          questionBanks: {
            ...window.DEFAULT_QUESTION_BANKS,
            ...(cfgMap.question_banks || {}),
          },
          players: players || [],
          ledger: ledger || [],
          missions: missions || [],
          claims: claims || [],
          claimApprovals: claimApprovals || [],
          tables: tables || [],
          bets: bets || [],
          themeSessions: themeSessions || [],
          themeResponses: themeResponses || [],
          badgesAwarded: badgesAwarded || [],
        };

        if (isFirst) {
          this.isGmUnlocked = Boolean(
            slotPrefix
              ? sessionStorage.getItem(`${slotPrefix}gm`)
              : localStorage.getItem("nye_party_gm")
          );
          const initMyId = getSavedPlayerId();
          (this.data.tables || []).forEach((t) => {
            this.seenTableIds.add(t.id);
            if (t.game_state?.lastNudgeAt && initMyId) {
              this.seenNudgeKeys.add(`${initMyId}_${t.id}_${t.game_state.lastNudgeAt}`);
            }
            if (t.status === "finished") this.shownResultSplashIds.add(t.id);
          });
          (this.data.claims || []).forEach((c) => this.seenClaimIds.add(c.id));
          this.lastKnownCeremonyStage = Number(this.data.globalCfg?.ceremonyStage) || 1;
          const effInit = window.PartyEngine.getEffectiveNowMs(
            this.data.globalCfg,
            window.PartyDB.serverNowMs
          );
          const sc = window.PartyEngine.resolveScene(
            this.data.globalCfg,
            this.data.schedule,
            effInit
          );
          this.lastKnownScene = sc.scene;
          this.initializedOnce = true;
        } else {
          this.detectRealtimeNotifications();
        }

        // 檢查單機裝置綁定鎖：若已開啟單機鎖且此帳號已被綁定至另一台裝置，自動退出防止雙機重登
        const myIdCheck = getSavedPlayerId();
        if (myIdCheck && this.data.globalCfg.enforceDeviceLock) {
          const meRow = (this.data.players || []).find((p) => p.id === myIdCheck);
          const myDev = window.PartyDB.getDeviceId();
          if (meRow && meRow.bound_device_id && meRow.bound_device_id !== myDev) {
            this.logoutSwitchAccount();
            this.toast("🔒 此角色已綁定在另一台手機上，已自動登出以防重複連線！");
          }
        }

        const effNowMs = window.PartyEngine.getEffectiveNowMs(
          this.data.globalCfg,
          window.PartyDB.serverNowMs
        );
        const curSceneInfo = window.PartyEngine.resolveScene(
          this.data.globalCfg,
          this.data.schedule,
          effNowMs
        );

        // 🏆 若自動排程時間已進入【viewer 終局結算】時段且尚未執行過結算，自動執行頒發四大王冠與公開總榜！
        if (
          curSceneInfo.scene === "viewer" &&
          this.data.globalCfg.seasonStatus !== "settled" &&
          (this.data.players || []).length > 0 &&
          !this._autoSettling
        ) {
          this._autoSettling = true;
          try {
            await window.PartyEngine.executeFinalSettlement(this.getContext());
            const [freshCfg, freshLedger, freshBadges] = await Promise.all([
              window.PartyDB.select("config"),
              window.PartyDB.select("ledger", "order=created_at.desc"),
              window.PartyDB.select("badges_awarded", "order=created_at.desc"),
            ]);
            const fMap = {};
            (freshCfg || []).forEach((r) => (fMap[r.key] = r.value));
            this.data.globalCfg = { ...CFG.DEFAULTS, ...(fMap.global || {}) };
            this.data.ledger = freshLedger || [];
            this.data.badgesAwarded = freshBadges || [];
          } finally {
            this._autoSettling = false;
          }
        }

        // 若目前場景已進入正式活動（非 pre_event 開賽前準備），自動確保所有已報到玩家皆有初始 300 PT、當日任務與秘密大腿配對！
        const isLiveEvent =
          curSceneInfo.scene !== "pre_event" && curSceneInfo.scene !== "viewer";

        if (isLiveEvent && (this.data.players || []).length > 0 && !this._ensuringActive) {
          this._ensuringActive = true;
          try {
            let changed = false;
            const dayKey = this.data.globalCfg.activeDayKey || "2026-12-31";
            const initPts = Number(this.data.globalCfg.initialPoints) || 300;
            const existingInitIds = new Set(
              (this.data.ledger || [])
                .filter((l) => String(l.id || "").startsWith("init_300_"))
                .map((l) => l.id)
            );
            const existingMissionIds = new Set((this.data.missions || []).map((m) => m.id));

            for (const p of this.data.players) {
              if (!existingInitIds.has(`init_300_${p.id}`)) {
                await window.PartyDB.upsert(
                  "ledger",
                  [
                    {
                      id: `init_300_${p.id}`,
                      player_id: p.id,
                      delta: initPts,
                      category: "initial",
                      reason: "🎉 跨年英雄紀元開賽初始基金",
                      day_key: dayKey,
                    },
                  ],
                  { ignoreDuplicates: true }
                );
                changed = true;
              }
              const mid = `${p.id}_${dayKey}`;
              if (!existingMissionIds.has(mid)) {
                const cards = window.PartyEngine.drawMissionCards(
                  this.data.questionBanks,
                  [],
                  3
                );
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
                changed = true;
              }
            }

            if (
              this.data.players.length >= 2 &&
              this.data.players.some((p) => !p.thigh_id)
            ) {
              const pairs = window.PartyEngine.generateBalancedThighPairs(
                this.data.players.map((p) => p.id)
              );
              for (const p of this.data.players) {
                const pr = pairs[p.id] || { thigh_id: null, second_thigh_id: null };
                await window.PartyDB.update("players", `id=eq.${encodeURIComponent(p.id)}`, {
                  thigh_id: pr.thigh_id,
                  second_thigh_id: pr.second_thigh_id,
                });
              }
              changed = true;
            }

            if (changed) {
              const [freshPlayers, freshLedger, freshMissions] = await Promise.all([
                window.PartyDB.select("players", "order=joined_at.asc"),
                window.PartyDB.select("ledger", "order=created_at.desc"),
                window.PartyDB.select("missions"),
              ]);
              this.data.players = freshPlayers || [];
              this.data.ledger = freshLedger || [];
              this.data.missions = freshMissions || [];
            }
          } finally {
            this._ensuringActive = false;
          }
        }

        // ☀️ 自動檢查每日早上 08:00 跨日刷新（自動重置 3 次參賽/下注額度 + 低於 300 PT 自動補滿 + 發新任務）
        const myId = getSavedPlayerId();
        if (
          myId &&
          isLiveEvent &&
          this.data.globalCfg.seasonStatus !== "settled" &&
          !this.data.globalCfg.manualDayOverride &&
          !this._advancingDay
        ) {
          const natDay = window.PartyEngine.computeNaturalPartyDayKey(
            effNowMs,
            this.data.schedule,
            this.data.globalCfg
          );
          const curDay = this.data.globalCfg.activeDayKey || natDay;
          if (natDay > curDay) {
            this._advancingDay = true;
            try {
              await window.PartyEngine.executeDailyMorningRefresh(natDay, this.data, { manual: false });
              const [freshCfg, freshLedger, freshMissions] = await Promise.all([
                window.PartyDB.select("config"),
                window.PartyDB.select("ledger", "order=created_at.desc"),
                window.PartyDB.select("missions"),
              ]);
              const freshMap = {};
              (freshCfg || []).forEach((r) => (freshMap[r.key] = r.value));
              this.data.globalCfg = { ...CFG.DEFAULTS, ...(freshMap.global || {}) };
              this.data.ledger = freshLedger || [];
              this.data.missions = freshMissions || [];
            } finally {
              this._advancingDay = false;
            }
          }
        }

        // 自動檢查即時里程碑徽章，若有新解鎖立即重抓最新存摺與徽章確保零延遲顯示
        if (myId && isLiveEvent && this.data.globalCfg.seasonStatus !== "settled") {
          const newlyAwarded = await window.PartyEngine.evaluateRealtimeAutoBadges(this.data);
          if (newlyAwarded) {
            const [freshLedger, freshBadges] = await Promise.all([
              window.PartyDB.select("ledger", "order=created_at.desc"),
              window.PartyDB.select("badges_awarded", "order=created_at.desc"),
            ]);
            this.data.ledger = freshLedger || [];
            this.data.badgesAwarded = freshBadges || [];
          }
        }

        // 背景同步若使用者正在輸入文字框，暫緩整頁重繪以免收起手機鍵盤或洗掉打到一半的字！
        // 特別保護登入頁 (!myId)：未登入時背景輪詢若無新夥伴名單變化，100% 不觸發重繪，杜絕輸入名稱切密碼框時被清空！
        const activeEl = document.activeElement;
        const isTyping =
          isBackground &&
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.tagName === "SELECT");
        this.dbConnectError = "";
        if (!myId && isBackground) {
          const nextRosterSig = (this.data.players || []).map((p) => `${p.id}:${p.name}`).join("|");
          if (this._lastLoginRosterSig === nextRosterSig) {
            return;
          }
          this._lastLoginRosterSig = nextRosterSig;
          if (isTyping) return;
        }
        if (isTyping) {
          if (!activeEl._deferHooked) {
            activeEl._deferHooked = true;
            activeEl.addEventListener(
              "blur",
              () => {
                activeEl._deferHooked = false;
                if (getSavedPlayerId()) {
                  this.render();
                }
              },
              { once: true }
            );
          }
        } else {
          this.render();
        }
      } catch (err) {
        console.error("refreshAll error:", err);
        this.dbConnectError = String(err?.message || err || "連線失敗");
        if (isFirst) this.render();
      } finally {
        this._fetching = false;
        if (this._pendingRefresh) {
          const bg = Boolean(this._pendingBg);
          const waiters = this._pendingWaiters ? [...this._pendingWaiters] : [];
          this._pendingWaiters = [];
          this._pendingRefresh = false;
          this._pendingBg = true;
          await this.refreshAll({ isFirst: false, background: bg });
          waiters.forEach((fn) => fn());
        } else if (this._pendingWaiters && this._pendingWaiters.length > 0) {
          const waiters = [...this._pendingWaiters];
          this._pendingWaiters = [];
          waiters.forEach((fn) => fn());
        }
      }
    },

    detectRealtimeNotifications() {
      const myId = getSavedPlayerId();
      if (!myId) return;

      const playerMap = {};
      (this.data.players || []).forEach((p) => (playerMap[p.id] = p));

      // 1. 新賽桌推播提醒（顯示房主名字！）& 桌長催人廣播 & 賽局結束 3 秒勝負開獎彈窗
      for (const t of this.data.tables || []) {
        const hostName =
          playerMap[t.host_id]?.name || t.host_name || t.participants?.[0]?.name || "夥伴";
        if (!this.seenTableIds.has(t.id)) {
          this.seenTableIds.add(t.id);
          if (t.game_state?.lastNudgeAt) {
            this.seenNudgeKeys.add(`${myId}_${t.id}_${t.game_state.lastNudgeAt}`);
          }
          if (t.status === "open" && t.host_id !== myId) {
            window.PartyFX.notify(
              `🔥 房主【${hostName}】開新賽桌囉！`,
              `【${hostName}】正在揪團玩「${t.title}」，快進來參賽或場邊下注！`
            );
            this.toast(`🔥 房主【${hostName}】開桌：【${t.title}】快去參賽或下注！`);
          }
        } else if (t.status === "open" && t.game_state?.lastNudgeAt) {
          const nudgeKey = `${myId}_${t.id}_${t.game_state.lastNudgeAt}`;
          if (!this.seenNudgeKeys.has(nudgeKey)) {
            this.seenNudgeKeys.add(nudgeKey);
            const amIn = (t.participants || []).some((p) => p.id === myId);
            if (t.host_id !== myId && !amIn) {
              const nudger = t.game_state.lastNudgeBy || hostName;
              const gm = CFG.PARTY_GAMES.find((x) => x.id === t.game_type) || CFG.PARTY_GAMES[0];
              const minNeed =
                t.game_type === "soul_sync_2v2" && (t.participants || []).length === 3
                  ? 1
                  : Math.max(0, gm.minPlayers - (t.participants || []).length);
              const needTxt =
                minNeed > 0
                  ? `還差 ${minNeed} 人開局`
                  : `目前 ${(t.participants || []).length}/${gm.maxPlayers} 人即將開戰`;
              window.PartyFX.notify(
                `📢 房主【${nudger}】緊急催人進房！`,
                `【${nudger}】在「${t.title}」呼喚大家加入（${needTxt}）！`
              );
              this.toast(`📢 房主【${nudger}】催人進房：【${t.title}】（${needTxt}）！`);
            }
          }
        }
        if (t.status === "finished" && !this.shownResultSplashIds.has(t.id)) {
          this.shownResultSplashIds.add(t.id);
          const amParticipant = (t.participants || []).some((p) => p.id === myId);
          const amBettor = (this.data.bets || []).some(
            (b) => b.table_id === t.id && b.bettor_id === myId
          );
          if (amParticipant || amBettor) {
            this.showTableResultSplash(t);
          }
        }
      }

      // 1b. 終局頒獎典禮揭曉第 4 幕（總冠軍登基）全場同步放煙火！
      const curCeremonyStage = Number(this.data.globalCfg?.ceremonyStage) || 1;
      if (curCeremonyStage !== this.lastKnownCeremonyStage) {
        const prevStage = this.lastKnownCeremonyStage;
        this.lastKnownCeremonyStage = curCeremonyStage;
        if (curCeremonyStage === 4 && prevStage < 4) {
          window.PartyFX.playTone("win");
          window.PartyFX.haptic("heavy");
          window.PartyFX.launchFireworksShow({ redPackets: false, durationMs: 3800 });
        }
      }

      // 2. 有人請我幫忙按見證／當事人認證提醒
      for (const c of this.data.claims || []) {
        if (!this.seenClaimIds.has(c.id)) {
          this.seenClaimIds.add(c.id);
          const needMe =
            c.status === "pending" &&
            (c.target_id === myId || (c.witness_ids || []).includes(myId));
          if (needMe) {
            const appPlayer = this.data.players.find((p) => p.id === c.applicant_id);
            window.PartyFX.notify(
              "🕵️ 收到好友認證請求！",
              `${appPlayer?.name || "朋友"} 請你幫忙確認「${c.title}」！`
            );
            this.toast(`🕵️ ${appPlayer?.name || "朋友"} 請你確認「${c.title}」！`);
          }
        }
      }

      this.checkSceneTransitionAndRender(true);
    },

    checkSceneTransitionAndRender(skipRender = false) {
      if (!this.initializedOnce) return;
      const effNow = window.PartyEngine.getEffectiveNowMs(
        this.data.globalCfg,
        window.PartyDB.serverNowMs
      );
      const sc = window.PartyEngine.resolveScene(
        this.data.globalCfg,
        this.data.schedule,
        effNow
      );
      // 跨過早上 08:00 時自動觸發背景刷新以推進 activeDayKey
      if (
        sc.scene !== "pre_event" &&
        sc.scene !== "viewer" &&
        this.data.globalCfg.seasonStatus !== "settled" &&
        !this.data.globalCfg.manualDayOverride &&
        !this._advancingDay
      ) {
        const natDay = window.PartyEngine.computeNaturalPartyDayKey(
          effNow,
          this.data.schedule,
          this.data.globalCfg
        );
        if (natDay > (this.data.globalCfg.activeDayKey || "2026-12-31")) {
          this.refreshAll({ isFirst: false, background: true });
          return;
        }
      }
      const sceneChanged = Boolean(this.lastKnownScene && sc.scene !== this.lastKnownScene);
      const labelChanged = Boolean(this.lastKnownSceneLabel && sc.label !== this.lastKnownSceneLabel);
      this.lastKnownSceneLabel = sc.label;

      if (sceneChanged) {
        const prev = this.lastKnownScene;
        this.lastKnownScene = sc.scene;
        window.PartyFX.notify("⏰ 活動場景切換！", `目前已進入：${sc.label}`);
        this.toast(`⏰ 時段切換：${sc.label}`);
        // 若剛從開賽前進入開賽，或剛進入終局結算，立即觸發 refreshAll 執行自動發分／自動結算！
        if (prev === "pre_event" || sc.scene === "viewer") {
          this.refreshAll({ isFirst: false, background: true });
          return;
        }
      } else if (!this.lastKnownScene) {
        this.lastKnownScene = sc.scene;
      }

      // 只有真正發生排程時段／標題切換時才主動重繪整頁，平時絕不每 5 秒無故重建 DOM 影響操作！
      if (!skipRender && (sceneChanged || labelChanged)) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
          this.render();
        }
      }
    },

    getContext() {
      const myId = getSavedPlayerId();
      const me = (this.data.players || []).find((p) => p.id === myId) || null;
      const effNow = window.PartyEngine.getEffectiveNowMs(
        this.data.globalCfg,
        window.PartyDB.serverNowMs
      );
      const sceneInfo = window.PartyEngine.resolveScene(
        this.data.globalCfg,
        this.data.schedule,
        effNow
      );
      const scoreboard = window.PartyEngine.computeScoreboard(
        this.data.players,
        this.data.ledger,
        this.data.tables,
        this.data.claims,
        this.data.claimApprovals
      );
      return {
        ...this.data,
        me,
        isGmUnlocked: this.isGmUnlocked,
        sceneInfo,
        scoreboard,
      };
    },

    // ==================== 畫面主渲染（自動記憶展開的手風琴、勾選框與尚未送出的輸入草稿！） ====================
    render() {
      const root = document.getElementById("app-root");
      if (!root) return;

      // 保存目前頁面捲軸位置、內部清單捲軸、展開的 <details>、勾選框與尚未送出的欄位 (dirty inputs)
      const prevWinY = window.scrollY;
      const savedListScrolls = [...root.querySelectorAll(".create-game-list")].map(
        (el) => el.scrollTop
      );
      const savedDrafts = {};
      const savedChecks = {};
      root.querySelectorAll("input[id], textarea[id], select[id]").forEach((el) => {
        if (el.type === "file" || el.type === "radio") return;
        if (el.type === "checkbox") {
          if (el.dataset.dirty === "1") {
            savedChecks[el.id] = Boolean(el.checked);
          }
          return;
        }
        if (el.dataset.dirty === "1" || el === document.activeElement) {
          savedDrafts[el.id] = el.value;
        }
      });
      const openDetailsIdx = [];
      root.querySelectorAll("details").forEach((d, idx) => {
        if (d.open) openDetailsIdx.push(idx);
      });

      const ctx = this.getContext();

      if (!ctx.me) {
        const curNameEl = document.getElementById("login-name");
        const curPinEl = document.getElementById("login-pin");
        const activeLoginId = document.activeElement?.id || "";
        if (curNameEl) this.loginDraftName = curNameEl.value;
        if (curPinEl) this.loginDraftPin = curPinEl.value;

        this._lastLoginRosterSig = (ctx.players || []).map((p) => `${p.id}:${p.name}`).join("|");
        if (window.PartyGamesUI && window.PartyGamesUI.syncRoomOverlay) {
          window.PartyGamesUI.syncRoomOverlay(ctx);
        }
        root.innerHTML = this.renderOnboarding(ctx);

        const nextNameEl = document.getElementById("login-name");
        const nextPinEl = document.getElementById("login-pin");
        if (nextNameEl && this.loginDraftName) {
          nextNameEl.value = this.loginDraftName;
          nextNameEl.dataset.dirty = "1";
        }
        if (nextPinEl && this.loginDraftPin) {
          nextPinEl.value = this.loginDraftPin;
          nextPinEl.dataset.dirty = "1";
        }
        if (activeLoginId) {
          document.getElementById(activeLoginId)?.focus();
        }
        return;
      }

      if (!this.isGmUnlocked && this.tab === "gm") {
        this.tab = "stage";
      }

      const gTop = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const evTitle = gTop.eventTitle || "跨年英雄紀元";
      const isPreEvent = ctx.sceneInfo.scene === "pre_event";
      const pendingForMe = isPreEvent ? [] : this.getPendingClaimsForMe(ctx);
      const badgeDot = pendingForMe.length > 0 ? `<span class="nav-dot">${pendingForMe.length}</span>` : "";
      const myScore = ctx.scoreboard.byId[ctx.me.id]?.baseScore || 0;
      const myPtBadgeHtml = isPreEvent
        ? ""
        : `<span class="top-my-pt" title="點擊查看個人積分存摺" onclick="PartyApp.switchTab('dashboard')">💰 ${esc(window.PartyEngine.fmtPt(myScore))} PT</span>`;

      root.innerHTML = `
        <header class="top-bar">
          <div class="brand-row">
            <span class="brand-logo" onclick="PartyApp.handleLogoTap()" title="主辦人連點 3 下可解鎖控場後台">🥂 ${esc(evTitle)}</span>
            <div class="top-status-group">
              ${myPtBadgeHtml}
              <span class="scene-indicator sc-${ctx.sceneInfo.scene}">${esc(ctx.sceneInfo.label)}</span>
            </div>
          </div>
        </header>

        ${pendingForMe.length > 0 ? this.renderPendingApprovalsBanner(pendingForMe, ctx) : ""}

        <main class="main-container">
          ${
            this.tab === "stage"
              ? this.renderGameStage(ctx)
              : this.tab === "dashboard"
              ? this.renderPersonalDashboard(ctx)
              : window.GMConsole.render(ctx)
          }
        </main>

        <nav class="bottom-nav ${this.isGmUnlocked ? "" : "cols-2"}">
          <button class="nav-item ${this.tab === "stage" ? "active" : ""}" onclick="PartyApp.switchTab('stage')">
            <span class="nav-icon">🎮${badgeDot}</span>
            <span>遊戲舞台</span>
          </button>
          <button class="nav-item ${this.tab === "dashboard" ? "active" : ""}" onclick="PartyApp.switchTab('dashboard')">
            <span class="nav-icon">🏠</span>
            <span>個人主頁</span>
          </button>
          ${
            this.isGmUnlocked
              ? `<button class="nav-item ${this.tab === "gm" ? "active" : ""}" onclick="PartyApp.switchTab('gm')">
                   <span class="nav-icon">👑</span>
                   <span>GM控場</span>
                 </button>`
              : ""
          }
        </nav>
      `;

      // 還原使用者剛展開的手風琴、內部清單捲軸、主畫面捲軸、勾選框與未送出草稿欄位（結算或背景同步絕不亂跳捲軸或吃掉勾勾！）
      if (this._lastRenderedTab === this.tab) {
        const newDetails = root.querySelectorAll("details");
        openDetailsIdx.forEach((idx) => {
          if (newDetails[idx]) newDetails[idx].open = true;
        });
        root.querySelectorAll(".create-game-list").forEach((el, idx) => {
          if (savedListScrolls[idx] !== undefined) el.scrollTop = savedListScrolls[idx];
        });
        Object.entries(savedDrafts).forEach(([id, val]) => {
          const el = document.getElementById(id);
          if (el) {
            el.value = val;
            el.dataset.dirty = "1";
          }
        });
        Object.entries(savedChecks).forEach(([id, chk]) => {
          const el = document.getElementById(id);
          if (el && el.type === "checkbox") {
            el.checked = chk;
            el.dataset.dirty = "1";
          }
        });
        if (window.scrollY !== prevWinY) {
          window.scrollTo(0, prevWinY);
        }
      }
      this._lastRenderedTab = this.tab;
      if (window.PartyGamesUI && window.PartyGamesUI.syncRoomOverlay) {
        window.PartyGamesUI.syncRoomOverlay(ctx);
      }
    },

    // ==================== 登入／註冊 Onboarding（支援自行上傳照片 + 角色手機綁定鎖！） ====================
    renderOnboarding(ctx) {
      const emojis = CFG.AVATAR_EMOJIS || ["🦊", "🐶", "🐱", "🐼", "🐨", "🐯"];
      const chosenEmoji = this.selectedLoginEmoji || emojis[0];
      const photoUrl = this.pendingLoginAvatarUrl || "";
      const dateRangeStr = window.PartyEngine.getScheduleDateRangeLabel(
        ctx.schedule,
        ctx.globalCfg
      );
      const joinPinHint = ctx.globalCfg?.partyJoinPin || "1234";
      const evTitle = ctx.globalCfg?.eventTitle || "跨年英雄紀元";

      return `
        <div class="onboard-wrap">
          <div class="onboard-card">
            <div class="eyebrow-tag">🎉 ${esc(dateRangeStr)} 派對專屬</div>
            <h1 style="font-size:28px;margin:10px 0 4px;">《${esc(evTitle)}》</h1>
            <p class="muted-sm" style="margin-bottom:14px;">
              上傳你的個人大頭貼並輸入暱稱與派對 PIN 碼登入（登入後將自動記住這支手機，滑掉重開或誤登出輸入同暱稱即可連回！）
            </p>

            ${
              this.dbConnectError
                ? `<div class="toast-inline" style="margin-bottom:12px;border-color:rgba(251,113,133,0.55);color:#fda4af;text-align:left;">
                     ⚠️ <b>尚未連上雲端資料庫</b>：請確認網路連線，或檢查 Firebase Realtime Database 網址與規則設定。
                     ${
                       window.NYEPartyBridge && window.NYEPartyBridge.postMessage
                         ? `<button type="button" class="btn btn-secondary btn-xs" style="width:100%;margin-top:6px;" onclick="window.NYEPartyBridge.postMessage(JSON.stringify({type:'switch_server'}))">🔥 點此設定／修改 Firebase 資料庫網址</button>`
                         : ""
                     }
                   </div>`
                : ""
            }

            <div style="text-align:center;margin-bottom:14px;">
              <div class="avatar-upload-ring" onclick="document.getElementById('login-avatar-file').click()" title="點擊上傳照片">
                ${
                  photoUrl
                    ? `<img src="${esc(photoUrl)}" alt="預覽頭貼">`
                    : `<span style="font-size:44px;">${esc(chosenEmoji)}</span>`
                }
              </div>
              <input type="file" id="login-avatar-file" accept="image/*" style="display:none;" onchange="PartyApp.handleLoginAvatarUpload(this)">
              <button type="button" class="btn btn-secondary btn-sm" style="margin-bottom:6px;" onclick="document.getElementById('login-avatar-file').click()">
                📷 ${this.uploadingAvatar ? "正在壓縮上傳中…" : photoUrl ? "更換個人照片大頭貼" : "上傳個人照片 ／ 自拍大頭貼"}
              </button>

              <details style="margin-top:4px;">
                <summary class="muted-xs" style="cursor:pointer;">或點此選擇預設可愛圖示</summary>
                <div class="emoji-picker-grid" style="margin-top:6px;">
                  ${emojis
                    .map(
                      (em) => `<button type="button" class="emoji-pick-btn ${!photoUrl && chosenEmoji === em ? "selected" : ""}" onclick="PartyApp.pickLoginEmoji('${em}')">${em}</button>`
                    )
                    .join("")}
                </div>
              </details>
            </div>

            <div style="text-align:left;display:flex;flex-direction:column;gap:10px;">
              <div>
                <label class="sub-label">英雄暱稱 ID（大家認得出你的名字）</label>
                <input type="text" id="login-name" class="input-dark" maxlength="16" value="${esc(this.loginDraftName || "")}" oninput="PartyApp.loginDraftName=this.value" onchange="PartyApp.loginDraftName=this.value" placeholder="例如：Kerker / 小明">
              </div>
              <div>
                <label class="sub-label">派對登入 PIN 碼（輸入主辦人給的 4 碼 PIN）</label>
                <input type="password" inputmode="numeric" id="login-pin" class="input-dark" maxlength="8" value="${esc(this.loginDraftPin || "")}" oninput="PartyApp.loginDraftPin=this.value" onchange="PartyApp.loginDraftPin=this.value" placeholder="輸入 4 碼通行 PIN（如 ${esc(joinPinHint)}）" onkeydown="if(event.key==='Enter') PartyApp.submitLogin()">
              </div>
              <button class="btn btn-gold" style="width:100%;margin-top:6px;padding:13px;font-size:16px;" onclick="PartyApp.submitLogin()">
                🚀 進入《${esc(evTitle)}》！
              </button>
            </div>

            ${
              (ctx.players || []).length > 0
                ? `<div style="margin-top:18px;text-align:left;">
                    <div class="muted-xs" style="margin-bottom:6px;">目前已報到夥伴（${ctx.players.length} 人，同手機誤登出可點名字快速連回）：</div>
                    <div class="part-chips">
                      ${ctx.players
                        .map(
                          (p) => `<span class="part-chip" style="cursor:pointer;" onclick="PartyApp.loginDraftName='${esc(p.name)}';document.getElementById('login-name').value='${esc(p.name)}'">
                            ${avatarHtml(p, 22)} <span>${esc(p.name)}</span>
                          </span>`
                        )
                        .join("")}
                    </div>
                  </div>`
                : ""
            }
          </div>
        </div>
      `;
    },

    async handleLoginAvatarUpload(inputEl) {
      const file = inputEl && inputEl.files && inputEl.files[0];
      if (!file) return;
      this.uploadingAvatar = true;
      this.render();
      try {
        const url = await window.PartyDB.uploadAvatar(file);
        this.pendingLoginAvatarUrl = url;
        window.PartyFX.haptic("medium");
        this.toast("✨ 照片大頭貼已準備就緒！");
      } catch (e) {
        this.toast("照片讀取失敗，請換一張試試！");
      } finally {
        this.uploadingAvatar = false;
        this.render();
      }
    },

    pickLoginEmoji(emoji) {
      const curN = document.getElementById("login-name");
      const curP = document.getElementById("login-pin");
      if (curN) this.loginDraftName = curN.value;
      if (curP) this.loginDraftPin = curP.value;
      this.selectedLoginEmoji = emoji;
      this.pendingLoginAvatarUrl = "";
      this.render();
    },

    async submitLogin() {
      const name = (document.getElementById("login-name")?.value ?? this.loginDraftName ?? "").trim();
      const rawPin = (document.getElementById("login-pin")?.value ?? this.loginDraftPin ?? "").trim();
      this.loginDraftName = name;
      this.loginDraftPin = rawPin;
      if (!name) {
        this.toast("請輸入你的暱稱 ID！");
        return;
      }
      const g = { ...CFG.DEFAULTS, ...(this.data.globalCfg || {}) };
      const partyPin = String(g.partyJoinPin || "1234").trim();
      const pin = rawPin || partyPin;
      const myDeviceId = window.PartyDB.getDeviceId();

      const existing = (this.data.players || []).find(
        (p) => p.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        // 驗證統一派對 PIN 碼或該角色原 PIN 碼
        if (rawPin && pin !== partyPin && existing.pin && existing.pin !== pin) {
          this.toast("❌ PIN 碼不正確，請輸入主辦人提供的派對 PIN 碼！");
          return;
        }
        if (!rawPin && existing.pin && existing.pin !== partyPin) {
          this.toast("請輸入 4 碼 PIN 認證登入！");
          return;
        }
        // 🔒 檢查單機裝置綁定鎖（正式派對開啟時，禁止第 2 台手機重複登入同一角色！）
        if (
          g.enforceDeviceLock &&
          existing.bound_device_id &&
          existing.bound_device_id !== myDeviceId
        ) {
          this.toast(
            `🔒 角色「${existing.name}」已綁定在另一支手機上，無法兩支手機共用同一角色！（若本人換手機請找 GM 後台解綁）`
          );
          return;
        }

        const patch = {};
        if (this.pendingLoginAvatarUrl) {
          patch.avatar = this.pendingLoginAvatarUrl;
        } else if (!existing.avatar && this.selectedLoginEmoji) {
          patch.avatar = this.selectedLoginEmoji;
        }
        if (!existing.bound_device_id || (!g.enforceDeviceLock && existing.bound_device_id !== myDeviceId)) {
          patch.bound_device_id = myDeviceId;
        }
        if (Object.keys(patch).length > 0) {
          await window.PartyDB.update("players", `id=eq.${encodeURIComponent(existing.id)}`, patch);
        }
        this.pendingLoginAvatarUrl = "";
        this.loginDraftName = "";
        this.loginDraftPin = "";
        setSavedPlayerId(existing.id);
        await this.refreshAll(true);
        return;
      }

      if (rawPin && rawPin !== partyPin) {
        this.toast("❌ 派對通行 PIN 碼不正確，請輸入主辦人給的 PIN 碼！");
        return;
      }

      const newId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const chosenAvatar = this.pendingLoginAvatarUrl || this.selectedLoginEmoji || "🦊";
      const isFirstGm = (this.data.players || []).length === 0 && /kerker/i.test(name);

      await window.PartyDB.upsert("players", [
        {
          id: newId,
          name,
          pin: partyPin,
          avatar: chosenAvatar,
          room: "",
          is_gm: isFirstGm,
          push_tested: false,
          bound_device_id: myDeviceId,
        },
      ]);
      this.pendingLoginAvatarUrl = "";
      this.loginDraftName = "";
      this.loginDraftPin = "";

      // 若活動已經正式開始（中途晚到的朋友），自動補發初始 300 PT 與今日隱藏任務！
      const effNow = window.PartyEngine.getEffectiveNowMs(
        this.data.globalCfg,
        window.PartyDB.serverNowMs
      );
      const curSc = window.PartyEngine.resolveScene(
        this.data.globalCfg,
        this.data.schedule,
        effNow
      );
      if (curSc.scene !== "pre_event" && curSc.scene !== "viewer") {
        const dayKey = this.data.globalCfg.activeDayKey || "2026-12-31";
        await window.PartyDB.upsert(
          "ledger",
          [
            {
              id: `init_300_${newId}`,
              player_id: newId,
              delta: Number(this.data.globalCfg.initialPoints) || 300,
              category: "initial",
              reason: "🎉 跨年英雄紀元開賽初始基金",
              day_key: dayKey,
            },
          ],
          { ignoreDuplicates: true }
        );
        const cards = window.PartyEngine.drawMissionCards(this.data.questionBanks, [], 3);
        await window.PartyDB.upsert(
          "missions",
          [
            {
              id: `${newId}_${dayKey}`,
              player_id: newId,
              day_key: dayKey,
              cards,
              rerolls_used: 0,
              locked: false,
            },
          ],
          { ignoreDuplicates: true }
        );
      }

      setSavedPlayerId(newId);
      window.PartyFX.playTone("win");
      await this.refreshAll(true);
    },

    logoutSwitchAccount() {
      this.closeResultSplash();
      if (window.PartyGamesUI) {
        window.PartyGamesUI.activeRoomTableId = null;
      }
      document.getElementById("game-room-overlay")?.classList.add("hidden");
      this.isGmUnlocked = false;
      this.tab = "stage";
      if (slotPrefix) {
        sessionStorage.removeItem(`${slotPrefix}player_id`);
        sessionStorage.removeItem(`${slotPrefix}gm`);
      } else {
        localStorage.removeItem("nye_party_player_id");
        localStorage.removeItem("nye_party_gm");
      }
      this.render();
    },

    // --- 置頂可折疊行程表導航卡（100% 動態連動 GM 自動排程時間，零 Hardcode！） ---
    renderCollapsibleScheduleCard(ctx) {
      const normSlots = window.PartyEngine.getNormalizedSlots(ctx.schedule, ctx.globalCfg);
      const effNow = window.PartyEngine.getEffectiveNowMs(
        ctx.globalCfg,
        window.PartyDB.serverNowMs
      );

      const activeSlot = ctx.sceneInfo.activeSlot;
      const nextSlot = normSlots.find((s) => s.startMs > effNow) || null;
      const headlineSlot = activeSlot || nextSlot || normSlots[normSlots.length - 1] || null;
      const badgeTxt = activeSlot ? "🟢 目前進行中" : nextSlot ? "⏭️ 下一個活動" : "🏁 行程圓滿結束";
      const headParts = headlineSlot ? window.PartyEngine.taipeiParts(headlineSlot.startMs) : null;
      const timeStr = headParts
        ? `${headParts.mm}/${headParts.dd} (${headParts.wk}) ${headParts.hh}:${headParts.mi}`
        : "";
      const nextParts = nextSlot ? window.PartyEngine.taipeiParts(nextSlot.startMs) : null;

      return `
        <div class="section-card top-schedule-card">
          <details class="top-schedule-details">
            <summary>
              <div class="sched-summary-row">
                <div style="min-width:0;flex:1;">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span class="scene-pill pill-cyan" style="font-size:11px;padding:2px 8px;">📅 ${badgeTxt}</span>
                    <span class="muted-xs" style="color:#fde047;font-weight:700;">${esc(timeStr)}</span>
                  </div>
                  <div style="font-weight:800;font-size:14.5px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${esc(headlineSlot ? headlineSlot.title : "活動行程時刻表")}
                  </div>
                  ${
                    activeSlot && nextSlot && nextParts
                      ? `<div class="muted-xs" style="margin-top:2px;">⏭️ 下一站 (${esc(`${nextParts.hh}:${nextParts.mi}`)})：${esc(nextSlot.title)}</div>`
                      : ""
                  }
                </div>
                <span class="sched-toggle-pill">
                  <span class="closed-txt">展開完整行程 ▼</span>
                  <span class="open-txt">收合 ▲</span>
                </span>
              </div>
            </summary>

            <div class="timeline-list" style="margin-top:12px;padding-top:10px;border-top:1px dashed rgba(148,163,184,0.25);">
              ${normSlots
                .map((s) => {
                  const isCurrent = activeSlot && activeSlot.id === s.id;
                  const sp = window.PartyEngine.taipeiParts(s.startMs);
                  const ep = window.PartyEngine.taipeiParts(s.endMs);
                  const dayTag = `${sp.mm}/${sp.dd} (${sp.wk})`;
                  const timeRange = `${sp.hh}:${sp.mi}–${ep.hh}:${ep.mi}`;
                  return `
                    <div class="timeline-item ${isCurrent ? "current" : ""}">
                      <div class="tl-time">${esc(dayTag)}<br><b>${esc(timeRange)}</b></div>
                      <div class="tl-body">
                        <div class="tl-title">${isCurrent ? "👉 " : ""}${esc(s.title)}</div>
                        <div class="muted-xs">${esc(s.desc || "")}</div>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </details>
        </div>
      `;
    },

    // ==================== 🏠 分頁二：個人主頁 (開賽前自動隱藏遊戲機制保留驚喜！) ====================
    renderPersonalDashboard(ctx) {
      const { me, players, ledger, badgesAwarded, globalCfg, scoreboard, sceneInfo } = ctx;
      const isPreEvent = sceneInfo.scene === "pre_event";
      const myStat = scoreboard.byId[me.id] || { baseScore: 0, rawRank: 1 };
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };

      const myBadges = (badgesAwarded || []).filter((b) => b.player_id === me.id);
      const myLedger = (ledger || []).filter((l) => l.player_id === me.id).slice(0, 20);
      const roommates = me.room
        ? (players || []).filter((p) => p.room === me.room && p.id !== me.id)
        : [];

      const ok26 = Boolean(me.share_2026?.story && me.share_2026?.trueFact);
      const ok27 = Boolean(me.share_2027?.story && me.share_2027?.trueFact);
      const lbA = g.shareLabelA || "2026 回顧";
      const lbB = g.shareLabelB || "2027 展望";
      const prA = g.sharePromptA || "2026 年最值得分享的一件事";
      const prB = g.sharePromptB || "2027 年最想完成的一件事";
      const isMuted = window.PartyFX.isMuted();

      return `
        ${isPreEvent ? "" : this.renderCollapsibleScheduleCard(ctx)}

        <div class="hero-profile-card">
          <div class="profile-top">
            <div style="position:relative;cursor:pointer;" title="點擊更換可愛頭貼" onclick="PartyApp.openAvatarPickerModal()">
              ${avatarHtml(me, 62)}
              <span class="avatar-edit-dot">✨</span>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <h2 style="font-size:21px;">${esc(me.name)}</h2>
                <span class="room-pill">${me.room ? `🛏️ ${esc(me.room)}` : "🛏️ 房號待指派"}</span>
              </div>
              <div class="muted-xs" style="margin-top:3px;">
                ${
                  isPreEvent
                    ? `${me.push_tested && ok26 && ok27 ? "✅ 行前準備已完成" : "⏳ 請完成通知測試與下方個人資料填寫"}`
                    : `已解鎖徽章：<b>${myBadges.length}</b> 枚 ｜ 已互動夥伴：<b>${myStat.interactionCount || 0}</b> 人`
                }
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
              <button class="btn btn-ghost btn-xs" title="切換音效開關" onclick="PartyApp.toggleSoundMute()">${isMuted ? "🔇 已靜音" : "🔊 音效開"}</button>
              <button class="btn btn-ghost btn-xs" title="切換或登出帳號" onclick="PartyApp.logoutSwitchAccount()">🚪 換帳號</button>
            </div>
          </div>

          ${
            isPreEvent
              ? `<div class="thigh-locked-bar" style="margin-top:4px;">🤫 神秘派對機制將於活動正式開始時揭曉，敬請期待！</div>`
              : `
                ${
                  myBadges.length > 0
                    ? `<div class="part-chips" style="margin-bottom:10px;">
                        ${myBadges
                          .map(
                            (b) => `<span class="badge-earned">🏅 ${esc(b.title)} (+${b.points})</span>`
                          )
                          .join("")}
                      </div>`
                    : ""
                }

                <div class="blind-stats-grid">
                  <div class="stat-tile">
                    <div class="stat-label">💰 我的目前原始積分</div>
                    <div class="stat-val gold-text">${window.PartyEngine.fmtPt(myStat.baseScore)} PT</div>
                  </div>
                  <div class="stat-tile">
                    <div class="stat-label">🕵️ 目前原始分私密排名</div>
                    <div class="stat-val cyan-text">第 ${myStat.rawRank} / ${scoreboard.totalPlayers} 名</div>
                  </div>
                </div>

                <div class="peek-card" style="margin-top:10px;" onclick="this.classList.toggle('revealed')">
                  <span class="peek-hint">🦵 點擊翻開／蓋住偷看你的【秘密大腿 ×0.5 ＆ 二腿 ×0.3】（嚴禁外洩！）</span>
                  <div class="peek-secret thigh-reveal-row">
                    <div>🦵 大腿(×0.5)：<b>${esc(myStat.thighName)}</b></div>
                    <div>🦿 二腿(×0.3)：<b>${esc(myStat.secondThighName)}</b></div>
                  </div>
                </div>

                <details style="margin-top:10px;">
                  <summary class="muted-xs" style="cursor:pointer;">📜 展開我的個人積分存摺明細（最近 ${myLedger.length} 筆）</summary>
                  <div style="margin-top:6px;max-height:180px;overflow-y:auto;">
                    ${
                      myLedger.length === 0
                        ? `<div class="muted-xs">尚無積分變動紀錄</div>`
                        : myLedger
                            .map(
                              (l) => `<div class="history-row" style="font-size:12.5px;">
                                <span>${esc(l.reason)}</span>
                                <b style="color:${l.delta >= 0 ? "#6ee7b7" : "#fda4af"};">${l.delta >= 0 ? `+${l.delta}` : l.delta} PT</b>
                              </div>`
                            )
                            .join("")
                    }
                  </div>
                </details>
              `
          }
        </div>

        <!-- 2. 行前必填：雙輪個人資料分享卡 -->
        <div class="section-card">
          <details ${!ok26 || !ok27 || isPreEvent ? "open" : ""}>
            <summary style="font-weight:800;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
              <span>✍️ 個人資料填寫（${esc(lbA)} ＆ ${esc(lbB)}）</span>
              <span class="q-tag ${ok26 && ok27 ? "q-ok" : "q-lock"}">${ok26 && ok27 ? "✅ 已完成" : "⏳ 請填寫"}</span>
            </summary>
            <p class="muted-xs" style="margin:8px 0;">請分別寫下【${esc(lbA)}】與【${esc(lbB)}】（請勿在內文寫出自己名字），並各附上 <b>1 個真實細節 + 3 個瞎掰假細節</b>：</p>

            <div class="share-form-block">
              <div class="sub-label">📘 Part A：${esc(prA)}</div>
              <input id="sh26-story" class="input-dark" placeholder="例：今年一個人去北海道自駕差點迷路" value="${esc(me.share_2026?.story || "")}">
              <input id="sh26-true" class="input-dark" style="margin-top:6px;border-color:rgba(16,185,129,0.5);" placeholder="✅ 1 個真實細節（例：最後是靠便利商店店員畫地圖救了我）" value="${esc(me.share_2026?.trueFact || "")}">
              <input id="sh26-f1" class="input-dark" style="margin-top:5px;" placeholder="🎭 假細節 1" value="${esc(me.share_2026?.fakeFacts?.[0] || "")}">
              <input id="sh26-f2" class="input-dark" style="margin-top:5px;" placeholder="🎭 假細節 2" value="${esc(me.share_2026?.fakeFacts?.[1] || "")}">
              <input id="sh26-f3" class="input-dark" style="margin-top:5px;" placeholder="🎭 假細節 3" value="${esc(me.share_2026?.fakeFacts?.[2] || "")}">
            </div>

            <div class="share-form-block" style="margin-top:12px;">
              <div class="sub-label">🚀 Part B：${esc(prB)}</div>
              <input id="sh27-story" class="input-dark" placeholder="例：報名人生第一場鐵人三項或學衝浪" value="${esc(me.share_2027?.story || "")}">
              <input id="sh27-true" class="input-dark" style="margin-top:6px;border-color:rgba(16,185,129,0.5);" placeholder="✅ 1 個真實動機／細節" value="${esc(me.share_2027?.trueFact || "")}">
              <input id="sh27-f1" class="input-dark" style="margin-top:5px;" placeholder="🎭 假細節 1" value="${esc(me.share_2027?.fakeFacts?.[0] || "")}">
              <input id="sh27-f2" class="input-dark" style="margin-top:5px;" placeholder="🎭 假細節 2" value="${esc(me.share_2027?.fakeFacts?.[1] || "")}">
              <input id="sh27-f3" class="input-dark" style="margin-top:5px;" placeholder="🎭 假細節 3" value="${esc(me.share_2027?.fakeFacts?.[2] || "")}">
            </div>

            <button class="btn btn-gold" style="width:100%;margin-top:10px;" onclick="PartyApp.saveMyShareCards()">
              💾 儲存我的個人分享卡資料
            </button>
          </details>
        </div>

        <!-- 3. 分房與民宿資訊卡 -->
        <div class="section-card">
          <div class="section-title">🏠 分房資訊 ＆ 民宿百寶箱</div>
          <div class="villa-grid">
            <div><b>🛏️ 我的房間</b>：${me.room ? esc(me.room) : "等待指派中"}</div>
            <div><b>👥 同房室友</b>：${roommates.length ? roommates.map((r) => esc(r.name)).join("、") : "尚無／單人"}</div>
            <div>
              <b>📶 Wi-Fi</b>：<code>${esc(g.villaInfo?.wifiSsid || "")}</code> ／ 密碼：<code>${esc(g.villaInfo?.wifiPass || "")}</code>
              <button class="btn-copy" onclick="navigator.clipboard?.writeText('${esc(g.villaInfo?.wifiPass || "")}');PartyApp.toast('已複製 Wi-Fi 密碼！')">複製</button>
            </div>
            ${
              g.villaInfo?.doorCode
                ? `<div>
                     <b>🚪 大門密碼</b>：<code>${esc(g.villaInfo.doorCode)}</code>
                     <button class="btn-copy" onclick="navigator.clipboard?.writeText('${esc(g.villaInfo.doorCode)}');PartyApp.toast('已複製大門密碼！')">複製</button>
                   </div>`
                : ""
            }
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
              <span><b>📍 地址說明</b>：${esc(g.villaInfo?.address || "")}</span>
              ${
                g.villaInfo?.mapUrl && /^https?:\/\//i.test(g.villaInfo.mapUrl)
                  ? `<a href="${esc(g.villaInfo.mapUrl)}" target="_blank" rel="noopener" class="btn-copy" style="text-decoration:none;display:inline-flex;align-items:center;gap:3px;">🗺️ Google Maps 導航</a>`
                  : ""
              }
            </div>
          </div>
          ${isPreEvent ? "" : `<div class="muted-xs" style="margin-top:8px;color:#fcd34d;">${esc(g.villaInfo?.notes || "")}</div>`}
        </div>

        <!-- 4. 跨年夥伴大頭貼牆 -->
        <div class="section-card">
          <div class="section-title">👥 已報到夥伴牆 (${players.length} 人)</div>
          <div class="members-wall">
            ${(players || [])
              .map((p) => {
                const pBadges = (badgesAwarded || []).filter((b) => b.player_id === p.id);
                return `
                  <div class="member-tile">
                    ${avatarHtml(p, 46)}
                    <div class="member-name">${esc(p.name)}</div>
                    <div class="muted-xs">${esc(p.room || "待分房")}</div>
                    <div class="muted-xs">${isPreEvent ? "✨已報到" : pBadges.length ? `🏅×${pBadges.length}` : "✨參戰中"}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    },

    // --- 🙌 神隊友互助 ＆ 早起打卡（6 項同伴互證，移至「🎮 遊戲舞台」Tab！） ---
    formatPendingApprovers(claim, ctx) {
      const playerMap = {};
      (ctx.players || []).forEach((p) => (playerMap[p.id] = p));
      const approvedIds = new Set(
        (ctx.claimApprovals || [])
          .filter((a) => a.claim_id === claim.id)
          .map((a) => a.approver_id)
      );
      const parts = [];
      if (claim.target_id) {
        const nm = playerMap[claim.target_id]?.name || "當事人";
        parts.push(`當事人 ${nm} ${approvedIds.has(claim.target_id) ? "✅" : "⏳"}`);
      }
      const wits = (claim.witness_ids || []).map((wid) => {
        const nm = playerMap[wid]?.name || "見證人";
        return `${nm} ${approvedIds.has(wid) ? "✅" : "⏳"}`;
      });
      if (wits.length) parts.push(`見證(${wits.join("、")})`);
      return parts.join(" ｜ ");
    },

    renderChoreCheckInCard(ctx, opts = {}) {
      const { me, claims, globalCfg } = ctx;
      const autoFold = Boolean(opts.collapsible);
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const dayKey = g.activeDayKey || "2026-12-31";
      const checkInBadges = CFG.BADGE_CATALOG.filter((b) => !b.auto);
      const myPendingChores = (claims || []).filter(
        (c) =>
          c.applicant_id === me.id &&
          c.badge_code &&
          c.status === "pending"
      );

      const innerHtml = `
        <p class="muted-xs" style="margin-bottom:8px;">
          主動幫忙團體事務或早起現身客廳，點選下方項目請現場夥伴按確認即可入帳加分！（其餘遊戲成就徽章皆由系統自動發放）
        </p>
        ${
          myPendingChores.length > 0
            ? `<div style="margin-bottom:8px;display:flex;flex-direction:column;gap:6px;">
                ${myPendingChores
                  .map(
                    (c) => `<div class="muted-xs" style="color:#fcd34d;display:flex;justify-content:space-between;align-items:center;gap:8px;background:rgba(245,158,11,0.1);padding:6px 8px;border-radius:8px;">
                      <span>⏳ <b>${esc(c.title)}</b> 認證中：${esc(this.formatPendingApprovers(c, ctx))}</span>
                      <button type="button" class="btn btn-ghost btn-xs" style="padding:2px 8px;font-size:11px;flex-shrink:0;" onclick="PartyApp.cancelMyPendingClaim('${esc(c.id)}')">↺ 撤回重選</button>
                    </div>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        <div class="bet-btn-grid">
          ${checkInBadges
            .map((b) => {
              const limit = b.code === "morning_bird" ? 1 : b.maxCount || 2;
              const used = (claims || []).filter(
                (c) =>
                  c.applicant_id === me.id &&
                  c.badge_code === b.code &&
                  c.status !== "rejected" &&
                  (b.code === "morning_bird" ? c.day_key === dayKey : true)
              ).length;
              const full = used >= limit;
              const lockedBySeason = g.seasonStatus !== "active";
              return `
                <button class="btn ${full ? "btn-ghost" : "btn-secondary"} btn-sm"
                  style="text-align:left;display:flex;flex-direction:column;gap:2px;"
                  ${full || lockedBySeason ? "disabled" : ""}
                  onclick="PartyApp.openChoreClaimModal('${b.code}')">
                  <span>${b.icon} <b>${esc(b.name)}</b> <small class="gold-text">+${b.points}</small></span>
                  <span class="muted-xs" style="font-size:11px;">
                    ${lockedBySeason ? "🔒 活動開始後開放" : `需 ${b.needWitness} 人見證 (${used}/${limit})`}
                  </span>
                </button>
              `;
            })
            .join("")}
        </div>
      `;

      if (autoFold) {
        return `
          <div class="section-card" style="margin-top:14px;">
            <details>
              <summary style="font-weight:800;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
                <span>🙌 神隊友互助 ＆ 早起打卡（團康進行中已收折）</span>
                <span class="muted-xs">點擊展開 ▾</span>
              </summary>
              <div style="margin-top:10px;">${innerHtml}</div>
            </details>
          </div>
        `;
      }

      return `
        <div class="section-card" style="margin-top:14px;">
          <div class="section-title">🙌 神隊友互助 ＆ 早起打卡（6 項同伴互證）</div>
          ${innerHtml}
        </div>
      `;
    },

    // ==================== 🎮 分頁一：遊戲舞台 (開賽前完全保密遊戲資訊，開賽後隨場景切換) ====================
    renderFirstLoginCheckCard(ctx, isPreEvent) {
      const { me, globalCfg } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const evTitle = g.eventTitle || "跨年英雄紀元";
      const lbA = g.shareLabelA || "2026 回顧";
      const lbB = g.shareLabelB || "2027 展望";
      const ok26 = Boolean(me.share_2026?.story && me.share_2026?.trueFact);
      const ok27 = Boolean(me.share_2027?.story && me.share_2027?.trueFact);
      const allDone = Boolean(me.push_tested && ok26 && ok27);
      if (!isPreEvent && allDone) return "";

      return `
        <div class="section-card" style="border-color:rgba(56,189,248,0.5);">
          <span class="scene-pill pill-cyan">${isPreEvent ? "🥂 行前報到準備" : "👋 首次登入準備確認"}</span>
          <h3 style="margin:10px 0 6px;">${
            allDone
              ? "🎉 你的行前準備已全部完成！"
              : `歡迎加入《${esc(evTitle)}》！請先完成 2 項準備：`
          }</h3>
          ${
            isPreEvent
              ? `<p class="muted-sm">
                   🤫 為了保留最高驚喜感，<b>所有神秘遊戲與賽制將於活動正式開始時揭曉</b>！出發前請先完成以下兩件事即可：
                 </p>`
              : `<p class="muted-sm">花 1 分鐘確認通知音效並填好你的個人資料卡，就能無縫參與所有活動：</p>`
          }

          <div class="checklist-box" style="margin-top:12px;">
            <div class="chk-row">${me.push_tested ? "✅" : "⏳"} 1. 測試手機推播通知與音效會不會響</div>
            <div class="chk-row">${ok26 && ok27 ? "✅" : "⏳"} 2. 填寫個人資料卡（${esc(lbA)} ＆ ${esc(lbB)}）</div>
          </div>

          <div class="grid-2-btns" style="margin-top:14px;">
            <button class="btn ${me.push_tested ? "btn-secondary" : "btn-gold"}" onclick="PartyApp.testPushAndSound()">
              🔔 ${me.push_tested ? "再次測試通知＆音效" : "點此測試通知＆音效"}
            </button>
            <button class="btn ${ok26 && ok27 ? "btn-secondary" : "btn-gold"}" onclick="PartyApp.switchTab('dashboard')">
              ✍️ ${ok26 && ok27 ? "查看／修改個人資料" : "前往填寫個人資料"}
            </button>
          </div>
        </div>
      `;
    },

    renderPreEventStage(ctx) {
      const effNow = window.PartyEngine.getEffectiveNowMs(
        ctx.globalCfg,
        window.PartyDB.serverNowMs
      );
      const launchAt = Number(ctx.sceneInfo.launchAtMs || 0);
      const remSec = launchAt > 0 ? Math.max(0, Math.ceil((launchAt - effNow) / 1000)) : 0;
      const dd = Math.floor(remSec / 86400);
      const hh = Math.floor((remSec % 86400) / 3600);
      const mm = Math.floor((remSec % 3600) / 60);
      const ss = remSec % 60;
      const launchTimeTxt = launchAt
        ? window.PartyEngine.formatDateTimeFriendly(launchAt)
        : "待設定";

      return `
        ${
          launchAt > 0
            ? `<div id="launch-countdown-card" class="launch-countdown-card" data-launch-ms="${launchAt}">
                 <span class="scene-pill pill-gold">⚔️ SERVER LAUNCH COUNTDOWN</span>
                 <div style="font-weight:900;font-size:17px;color:#f8fafc;margin-top:8px;">
                   遊戲將在 <span id="lcd-inline-summary" class="gold-text">${dd}日 ${String(hh).padStart(2, "0")}時 ${String(mm).padStart(2, "0")}分 ${String(ss).padStart(2, "0")}秒</span> 之後開始！
                 </div>
                 <div class="lcd-grid">
                   <div class="lcd-tile"><div id="lcd-dd" class="lcd-num">${String(dd).padStart(2, "0")}</div><div class="lcd-unit">日 (DAYS)</div></div>
                   <div class="lcd-tile"><div id="lcd-hh" class="lcd-num">${String(hh).padStart(2, "0")}</div><div class="lcd-unit">時 (HRS)</div></div>
                   <div class="lcd-tile"><div id="lcd-mm" class="lcd-num">${String(mm).padStart(2, "0")}</div><div class="lcd-unit">分 (MIN)</div></div>
                   <div class="lcd-tile"><div id="lcd-ss" class="lcd-num">${String(ss).padStart(2, "0")}</div><div class="lcd-unit">秒 (SEC)</div></div>
                 </div>
                 <div class="muted-xs">⏰ 預計開服時間：<b>${esc(launchTimeTxt)}</b>（倒數歸零自動解封全場神秘遊戲！）</div>
               </div>`
            : ""
        }
        ${this.renderFirstLoginCheckCard(ctx, true)}
        <div class="empty-card" style="margin-top:14px;">
          <div style="font-size:38px;margin-bottom:6px;">🎁🔒</div>
          <div style="font-weight:800;font-size:16.5px;color:#fde047;">神秘遊戲內容・開服前全面保密中</div>
          <div class="muted-sm" style="margin-top:6px;">
            開服前僅開放填寫個人資料與測試通知音效，所有神秘關卡與賽制將於上方倒數歸零時同步揭曉！
          </div>
        </div>
      `;
    },

    renderGameStage(ctx) {
      const scene = ctx.sceneInfo.scene;
      if (scene === "pre_event") return this.renderPreEventStage(ctx);
      if (scene === "viewer") return this.renderViewerSettlementStage(ctx);

      const firstLoginBanner = this.renderFirstLoginCheckCard(ctx, false);

      if (scene === "dining") {
        return `
          ${firstLoginBanner}
          <div class="dining-hero-card">
            <div style="font-size:38px;">🍽️🥂</div>
            <h3>現在是用餐 ＆ 自由聊天時間！</h3>
            <p class="muted-sm" style="margin-top:6px;">
              所有正式計分賽桌已暫時上鎖，請放下手機跟朋友好好吃飯聊天！<br>
              （期間可解下方的<b>【個人 Chill 隱藏任務】</b>與<b>【神隊友互助打卡】</b>喔！）
            </p>
          </div>
          ${this.renderHiddenMissionsDrawer(ctx, true)}
          ${this.renderChoreCheckInCard(ctx)}
        `;
      }
      if (scene === "party" || scene === "happy_hour") {
        return `
          ${firstLoginBanner}
          ${window.PartyGamesUI.renderLobby(ctx)}
          ${this.renderHiddenMissionsDrawer(ctx, false)}
          ${this.renderChoreCheckInCard(ctx)}
        `;
      }
      // theme or red_packet (c-4: 當玩家已加入進行中的團康主題房時，自動收折下方互助打卡雜訊！)
      const activeTheme = window.ThemeGamesUI.getActiveSession(ctx.themeSessions);
      const inActiveTheme =
        scene === "red_packet" ||
        Boolean(activeTheme && (activeTheme.participants || []).includes(ctx.me.id));
      return `
        ${firstLoginBanner}
        ${window.ThemeGamesUI.renderStage(ctx)}
        ${this.renderHiddenMissionsDrawer(ctx, false)}
        ${this.renderChoreCheckInCard(ctx, { collapsible: inActiveTheme })}
      `;
    },

    // --- 🕵️ 個人 Chill 隱藏任務抽屜 ---
    renderHiddenMissionsDrawer(ctx, openByDefault) {
      const { me, missions, claims, globalCfg } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const dayKey = g.activeDayKey || "2026-12-31";
      const mid = `${me.id}_${dayKey}`;
      const myM = (missions || []).find((m) => m.id === mid);

      if (!myM) {
        return `
          <div class="section-card" style="margin-top:14px;">
            <div class="section-title">🕵️ 今日個人 Chill 隱藏任務</div>
            <button class="btn btn-gold btn-sm" onclick="PartyApp.ensureTodayMissions()">🃏 抽取我今日的 3 張隱藏任務卡</button>
          </div>
        `;
      }

      const rerollsLeft = Math.max(0, (g.maxMissionRerollsPerDay || 3) - (myM.rerolls_used || 0));
      const myClaims = (claims || []).filter(
        (c) => c.applicant_id === me.id && c.claim_type === "hidden_mission" && c.day_key === dayKey
      );

      return `
        <div class="section-card" style="margin-top:14px;">
          <details ${openByDefault ? "open" : ""}>
            <summary style="font-weight:800;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
              <span>🕵️ 我的今日秘密隱藏任務（${esc(dayKey)}）</span>
              <span class="q-tag ${myM.locked ? "q-ok" : "q-bet"}">${myM.locked ? "🔒 已鎖定開解中" : `🎲 可重抽 ${rerollsLeft} 次`}</span>
            </summary>

            ${
              !myM.locked
                ? `<div class="toast-inline" style="margin:8px 0;">
                    💡 每天早上可免費重抽最多 ${g.maxMissionRerollsPerDay} 次（剩餘 <b>${rerollsLeft}</b> 次）。挑選滿意後請按<b>「🔒 鎖定今日任務」</b>才正式生效開解！
                  </div>`
                : `<div class="muted-xs" style="margin:6px 0;">完成互動後點「申請達成」，選「互動當事人」＋「現場至少 1 位見證人」都按同意即自動領取 +${g.hiddenMissionPoints} PT！</div>`
            }

            <div class="mission-cards-list">
              ${(myM.cards || [])
                .map((c, idx) => {
                  const existingClaim = myClaims.find(
                    (cl) => cl.mission_card_id === c.id && cl.status !== "rejected"
                  );
                  return `
                    <div class="mission-card ${existingClaim?.status === "approved" ? "done" : ""}">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span class="badge-pill">【${esc(c.tag)}】${c.needPhoto ? "📸拍傳LINE" : "💬日常互動"}</span>
                        <span class="gold-text">+${g.hiddenMissionPoints} PT</span>
                      </div>
                      <div style="margin:6px 0;font-size:14px;">${esc(c.text)}</div>
                      ${
                        !myM.locked
                          ? rerollsLeft > 0
                            ? `<button class="btn btn-secondary btn-xs" onclick="PartyApp.rerollSingleMission(${idx})">🔄 換掉這張 (剩 ${rerollsLeft} 次)</button>`
                            : ""
                          : existingClaim
                          ? existingClaim.status === "approved"
                            ? `<div class="muted-xs" style="color:#6ee7b7;font-weight:700;">✅ 已認證入帳！</div>`
                            : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                                 <span class="muted-xs" style="color:#fcd34d;">⏳ ${esc(this.formatPendingApprovers(existingClaim, ctx))}</span>
                                 <button type="button" class="btn btn-ghost btn-xs" style="padding:3px 9px;font-size:11.5px;" onclick="PartyApp.cancelMyPendingClaim('${esc(existingClaim.id)}')">
                                   ↺ 撤回重選見證人
                                 </button>
                               </div>`
                          : `<button class="btn btn-gold btn-xs" onclick="PartyApp.openMissionClaimModal('${c.id}')">🙋 我完成了！發起當事人＆見證認證</button>`
                      }
                    </div>
                  `;
                })
                .join("")}
            </div>

            ${
              !myM.locked
                ? `<button class="btn btn-gold" style="width:100%;margin-top:10px;" onclick="PartyApp.lockMyMissions()">
                    🔒 鎖定今日這 3 張任務・正式開始行動！
                  </button>`
                : ""
            }
          </details>
        </div>
      `;
    },

    // --- 🔔 待我幫忙認證通知橫幅 ---
    getPendingClaimsForMe(ctx) {
      const { me, claims, claimApprovals } = ctx;
      if (!me) return [];
      const approvedSet = new Set(
        (claimApprovals || [])
          .filter((ca) => ca.approver_id === me.id)
          .map((ca) => ca.claim_id)
      );
      return (claims || []).filter((c) => {
        if (c.status !== "pending") return false;
        if (approvedSet.has(c.id)) return false;
        return c.target_id === me.id || (c.witness_ids || []).includes(me.id);
      });
    },

    renderPendingApprovalsBanner(list, ctx) {
      const playerMap = {};
      (ctx.players || []).forEach((p) => (playerMap[p.id] = p));
      return `
        <div class="verify-alert-box">
          ${list
            .map((c) => {
              const applicant = playerMap[c.applicant_id] || { name: "夥伴" };
              const isTarget = c.target_id === ctx.me.id;
              const roleLabel = isTarget ? "互動當事人" : "現場見證人";
              return `
                <div class="verify-prominent-card">
                  <div style="display:flex;align-items:center;gap:10px;">
                    ${avatarHtml(applicant, 42)}
                    <div style="min-width:0;flex:1;">
                      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span class="hh-tag" style="margin-left:0;">🤝 認證邀請（${roleLabel}）</span>
                        <span class="gold-text" style="font-size:12.5px;">+${c.points} PT</span>
                        ${c.photo_url === "LINE_ALBUM" ? `<span class="q-tag q-ok">📸 已傳 LINE 相簿</span>` : ""}
                      </div>
                      <div style="margin-top:4px;font-size:14px;">
                        <b>${esc(applicant.name)}</b> 請你確認達成：<b>${esc(c.title)}</b>
                      </div>
                    </div>
                  </div>
                  <div class="grid-2-btns" style="margin-top:10px;">
                    <button class="btn btn-ghost btn-xs" onclick="PartyApp.rejectClaim('${esc(c.id)}')">
                      ✕ 點錯人／退回重選
                    </button>
                    <button class="btn btn-emerald btn-sm" onclick="PartyApp.approveClaim('${esc(c.id)}', '${isTarget ? "target" : "witness"}')">
                      ✅ 確有此事・幫他認證
                    </button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    },

    // --- 🏆 Viewer 終局 4 幕逐步頒獎典禮 ＆ 個人榮耀戰績紀念卡 ---
    async setCeremonyStage(stageNum) {
      const next = Math.min(4, Math.max(1, Number(stageNum) || 1));
      const ctx = this.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}), ceremonyStage: next };
      this.localCeremonyPreviewStage = 0;
      await window.PartyDB.upsert("config", [{ key: "global", value: g }]);
      if (next === 4) {
        window.PartyFX.playTone("win");
        window.PartyFX.haptic("heavy");
        window.PartyFX.launchFireworksShow({ redPackets: false, durationMs: 3800 });
      } else {
        window.PartyFX.playTone("bell");
      }
      await this.refreshAll();
    },

    renderViewerSettlementStage(ctx) {
      const { scoreboard, badgesAwarded, players, me, globalCfg, schedule, isGmUnlocked } = ctx;
      const g = { ...CFG.DEFAULTS, ...(globalCfg || {}) };
      const evTitle = g.eventTitle || "跨年英雄紀元";
      const dateRange = window.PartyEngine.getScheduleDateRangeLabel(schedule, g);
      const gmStage = Math.min(4, Math.max(1, Number(g.ceremonyStage) || 1));
      const viewStage =
        gmStage >= 4 && this.localCeremonyPreviewStage >= 1 && this.localCeremonyPreviewStage <= 4
          ? this.localCeremonyPreviewStage
          : gmStage;

      const crowns = (badgesAwarded || []).filter((b) => b.badge_code.startsWith("crown_"));
      const myBadges = (badgesAwarded || []).filter((b) => b.player_id === me?.id);
      const playerMap = {};
      (players || []).forEach((p) => (playerMap[p.id] = p));

      const sortedFinal = scoreboard.sortedFinal || [];
      const myRow = scoreboard.byId[me?.id] || sortedFinal[0] || null;
      const podium23 = sortedFinal.filter((r) => r.finalRank === 2 || r.finalRank === 3);
      const champions = sortedFinal.filter((r) => r.finalRank === 1);

      const stageNames = [
        { s: 1, label: "第1幕 王冠" },
        { s: 2, label: "第2幕 大腿網" },
        { s: 3, label: "第3幕 亞季軍" },
        { s: 4, label: "第4幕 總冠軍" },
      ];

      return `
        <div class="nye-fireworks-card" style="margin-bottom:14px;">
          <div style="font-size:34px;">🏆 👑 🎉</div>
          <h2 style="color:#fde047;margin:4px 0;">《${esc(evTitle)}》終局頒獎典禮</h2>
          <p class="muted-xs">全場計分已鎖定（Viewer 典禮模式）｜ 進度：<b>第 ${viewStage} / 4 幕</b></p>

          ${
            isGmUnlocked
              ? `<div class="gm-inline-bar" style="margin-top:12px;text-align:left;">
                   <div class="sub-label" style="color:#fde047;">🎬 主辦人頒獎典禮控場台（點擊同步切換全場手機畫面）：</div>
                   <div class="ceremony-steps-grid" style="margin-top:6px;">
                     ${stageNames
                       .map(
                         (st) => `<button type="button" class="btn ${gmStage === st.s ? "btn-gold" : "btn-secondary"} btn-xs" onclick="PartyApp.setCeremonyStage(${st.s})">${st.label}</button>`
                       )
                       .join("")}
                   </div>
                   ${
                     gmStage < 4
                       ? `<button type="button" class="btn btn-gold btn-sm" style="width:100%;margin-top:8px;" onclick="PartyApp.setCeremonyStage(${gmStage + 1})">
                            🥁 揭曉下一幕 ➜ ${stageNames[gmStage]?.label || "總冠軍"}！
                          </button>`
                       : ""
                   }
                 </div>`
              : gmStage >= 4
              ? `<div class="ceremony-steps-grid" style="margin-top:10px;">
                   ${stageNames
                     .map(
                       (st) => `<button type="button" class="btn ${viewStage === st.s ? "btn-gold" : "btn-secondary"} btn-xs" onclick="PartyApp.localCeremonyPreviewStage=${st.s};PartyApp.render();">${st.label}</button>`
                     )
                     .join("")}
                 </div>`
              : ""
          }
        </div>

        <!-- 第 1 幕：四大傳奇唯一王冠得主 -->
        <div class="section-card" style="margin-bottom:14px;">
          <div class="section-title">👑 第 1 幕｜四大傳奇唯一王冠得主 (+80 PT)</div>
          ${
            crowns.length > 0
              ? crowns
                  .map(
                    (c) => `<div class="history-row">
                      <span>👑 <b>${esc(c.title)}</b> — <b class="gold-text">${esc(playerMap[c.player_id]?.name || c.player_id)}</b></span>
                      <span class="muted-xs">${esc(c.detail)}</span>
                    </div>`
                  )
                  .join("")
              : `<div class="muted-xs">本場尚無符合條件之王冠紀錄</div>`
          }
        </div>

        ${
          viewStage < 2
            ? `<div class="empty-card">
                 <div style="font-size:32px;margin-bottom:6px;">🥁🤫</div>
                 <div style="font-weight:800;color:#fde047;">下一幕即將揭曉：全場秘密大腿(×0.5) ＆ 二腿(×0.3) 關係網！</div>
                 <div class="muted-xs" style="margin-top:4px;">快猜猜這幾天到底是誰在暗中抱你的大腿…等待主持人揭曉！</div>
               </div>`
            : `
              <!-- 第 2 幕：秘密大腿關係網大公開 -->
              <div class="section-card" style="margin-bottom:14px;">
                <div class="section-title">🦵 第 2 幕｜全場秘密大腿(×0.5) ＆ 二腿(×0.3) 真相公開</div>
                ${(scoreboard.sortedRaw || [])
                  .map(
                    (r) => `<div class="history-row" style="flex-wrap:wrap;">
                      <span><b>${esc(r.name)}</b> <small class="muted-xs">(原始 ${window.PartyEngine.fmtPt(r.baseScore)} PT)</small></span>
                      <span class="muted-xs">🦵大腿：<b class="gold-text">${esc(r.thighName)}</b> (+${window.PartyEngine.fmtPt(r.thighBonus)}) ｜ 🦿二腿：<b class="cyan-text">${esc(r.secondThighName)}</b> (+${window.PartyEngine.fmtPt(r.secondBonus)})</span>
                    </div>`
                  )
                  .join("")}
              </div>
            `
        }

        ${
          viewStage === 2
            ? `<div class="empty-card">
                 <div style="font-size:32px;margin-bottom:6px;">🥈🥉</div>
                 <div style="font-weight:800;color:#fde047;">加計大腿分後大洗牌！即將揭曉決賽【季軍 #3 ＆ 亞軍 #2】！</div>
               </div>`
            : ""
        }

        ${
          viewStage >= 3 && viewStage < 4
            ? `
              <div class="section-card" style="margin-bottom:14px;">
                <div class="section-title">🥈🥉 第 3 幕｜決賽亞軍 ＆ 季軍得主揭曉！</div>
                ${
                  podium23.length > 0
                    ? podium23
                        .sort((a, b) => b.finalRank - a.finalRank)
                        .map((row) => {
                          const rankDelta = row.rawRank - row.finalRank;
                          const deltaBadge =
                            rankDelta > 0
                              ? `<span style="color:#6ee7b7;font-size:12px;">▲ 逆轉 +${rankDelta} 名</span>`
                              : rankDelta < 0
                              ? `<span style="color:#fda4af;font-size:12px;">▼ ${rankDelta} 名</span>`
                              : `<span class="muted-xs">持平</span>`;
                          return `
                            <div class="final-rank-card">
                              <div class="fr-top">
                                <div style="display:flex;align-items:center;gap:10px;">
                                  <span class="rank-num">${row.finalRank === 2 ? "🥈#2" : "🥉#3"}</span>
                                  ${avatarHtml(row.player, 42)}
                                  <div>
                                    <b>${esc(row.name)}</b> ${deltaBadge}
                                    <div class="muted-xs">原始排名 #${row.rawRank}（原始 ${window.PartyEngine.fmtPt(row.baseScore)} PT）</div>
                                  </div>
                                </div>
                                <div class="final-pt">${window.PartyEngine.fmtPt(row.finalScore)} <small>PT</small></div>
                              </div>
                            </div>
                          `;
                        })
                        .join("")
                    : `<div class="muted-xs">等待最終總冠軍一併揭曉！</div>`
                }
                <div class="empty-card" style="margin-top:12px;">
                  <div style="font-size:34px;margin-bottom:4px;">🥁🔥👑</div>
                  <div style="font-weight:900;font-size:17px;color:#fef08a;">全場屏息！！總冠軍 MVP 即將揭曉！！</div>
                </div>
              </div>
            `
            : ""
        }

        ${
          viewStage >= 4
            ? `
              <!-- 第 4 幕：總冠軍登基 ＋ 個人榮耀戰績紀念卡 ＋ 完整總排名 -->
              ${
                champions.length > 0
                  ? `<div class="trophy-mvp-banner">
                       <div style="font-size:42px;line-height:1.1;">👑🎆🏆</div>
                       <div class="eyebrow-tag" style="margin-top:6px;">GRAND CHAMPION MVP</div>
                       <h2 style="font-size:26px;color:#fef08a;margin:8px 0 4px;">
                         ${champions.map((c) => esc(c.name)).join("、")}
                       </h2>
                       <div style="font-size:20px;font-weight:900;color:#fff;">
                         決賽總積分 ${window.PartyEngine.fmtPt(champions[0].finalScore)} PT 稱霸全場！
                       </div>
                       <button type="button" class="btn btn-secondary btn-xs" style="margin-top:10px;" onclick="window.PartyFX.playFirecrackers();window.PartyFX.launchFireworksShow({redPackets:false,durationMs:3600});">
                         🎆 為總冠軍施放禮砲煙火！
                       </button>
                     </div>`
                  : ""
              }

              ${
                myRow
                  ? `<div class="souvenir-card">
                       <div class="souvenir-header">
                         <span class="eyebrow-tag">📸 個人榮耀戰績紀念卡（可截圖分享限動！）</span>
                         <div class="muted-xs" style="margin-top:4px;">《${esc(evTitle)}》｜ ${esc(dateRange)}</div>
                       </div>
                       <div class="souvenir-hero">
                         ${avatarHtml(myRow.player, 64)}
                         <div style="text-align:left;min-width:0;flex:1;">
                           <div style="font-size:20px;font-weight:900;color:#fff;">${esc(myRow.name)}</div>
                           <div class="gold-text" style="font-size:15px;">🏆 總決賽排名 第 #${myRow.finalRank} / ${scoreboard.totalPlayers} 名</div>
                           <div class="muted-xs">累積互動夥伴 ${myRow.interactionCount || 0} 人 ｜ 榮耀徽章 ${myBadges.length} 枚</div>
                         </div>
                         <div style="text-align:right;">
                           <div class="muted-xs">決賽總分</div>
                           <div style="font-size:26px;font-weight:900;color:#fef08a;line-height:1.1;">${window.PartyEngine.fmtPt(myRow.finalScore)}</div>
                           <div class="muted-xs">PT</div>
                         </div>
                       </div>
                       <div class="souvenir-grid">
                         <div class="souvenir-stat"><span>💰 個人原始分</span><b>${window.PartyEngine.fmtPt(myRow.baseScore)} PT (#${myRow.rawRank})</b></div>
                         <div class="souvenir-stat"><span>🦵 秘密大腿助攻</span><b>${esc(myRow.thighName)} (+${window.PartyEngine.fmtPt(myRow.thighBonus)})</b></div>
                         <div class="souvenir-stat"><span>🦿 秘密二腿助攻</span><b>${esc(myRow.secondThighName)} (+${window.PartyEngine.fmtPt(myRow.secondBonus)})</b></div>
                       </div>
                       ${
                         myBadges.length > 0
                           ? `<div class="part-chips" style="margin-top:10px;justify-content:center;">
                                ${myBadges
                                  .map((b) => `<span class="badge-earned">🏅 ${esc(b.title)}</span>`)
                                  .join("")}
                              </div>`
                           : ""
                       }
                     </div>`
                  : ""
              }

              <div class="section-card">
                <div class="section-title">📊 最終決賽完整總排名（原始分 ＋ 大腿×0.5 ＋ 二腿×0.3）</div>
                ${sortedFinal
                  .map((row) => {
                    const rankDelta = row.rawRank - row.finalRank;
                    const deltaBadge =
                      rankDelta > 0
                        ? `<span style="color:#6ee7b7;font-size:12px;">▲ 逆轉 +${rankDelta} 名</span>`
                        : rankDelta < 0
                        ? `<span style="color:#fda4af;font-size:12px;">▼ ${rankDelta} 名</span>`
                        : `<span class="muted-xs">持平</span>`;
                    return `
                      <div class="final-rank-card ${row.finalRank === 1 ? "champion" : ""}">
                        <div class="fr-top">
                          <div style="display:flex;align-items:center;gap:10px;">
                            <span class="rank-num">#${row.finalRank}</span>
                            ${avatarHtml(row.player, 42)}
                            <div>
                              <b>${esc(row.name)}</b> ${deltaBadge}
                              <div class="muted-xs">原始排名 #${row.rawRank}（原始分 ${window.PartyEngine.fmtPt(row.baseScore)} PT）</div>
                            </div>
                          </div>
                          <div class="final-pt">${window.PartyEngine.fmtPt(row.finalScore)} <small>PT</small></div>
                        </div>
                        <div class="fr-thighs">
                          <span>🦵 大腿：<b>${esc(row.thighName)}</b> (+${window.PartyEngine.fmtPt(row.thighBonus)})</span>
                          <span>🦿 二腿：<b>${esc(row.secondThighName)}</b> (+${window.PartyEngine.fmtPt(row.secondBonus)})</span>
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `
            : ""
        }
      `;
    },

    // ==================== 個人互動與認證 Actions ====================
    openAvatarPickerModal() {
      const ctx = this.getContext();
      if (!ctx.me) return;
      const modal = document.getElementById("party-modal");
      const box = document.getElementById("party-modal-body");
      if (!modal || !box) return;
      const emojis = CFG.AVATAR_EMOJIS || ["🦊", "🐶", "🐱", "🐼"];
      modal.classList.remove("hidden");
      box.innerHTML = `
        <div class="modal-head">
          <h3>📷 更換我的個人照片 ／ 頭貼</h3>
          <button class="btn-close" onclick="PartyGamesUI.closeModal()">✕</button>
        </div>
        <div style="text-align:center;margin-bottom:12px;">
          <div style="margin-bottom:8px;">${avatarHtml(ctx.me, 72)}</div>
          <input type="file" id="profile-avatar-file" accept="image/*" style="display:none;" onchange="PartyApp.handleProfileAvatarUpload(this)">
          <button type="button" class="btn btn-gold btn-sm" style="width:100%;" onclick="document.getElementById('profile-avatar-file').click()">
            📷 上傳手機相簿照片 ／ 自拍新頭貼
          </button>
        </div>
        <p class="muted-xs" style="margin-bottom:8px;">或點選預設可愛圖示：</p>
        <div class="emoji-picker-grid">
          ${emojis
            .map(
              (em) => `<button type="button" class="emoji-pick-btn ${ctx.me.avatar === em ? "selected" : ""}" onclick="PartyApp.selectMyEmojiAvatar('${em}')">${em}</button>`
            )
            .join("")}
        </div>
      `;
    },

    async handleProfileAvatarUpload(inputEl) {
      const file = inputEl && inputEl.files && inputEl.files[0];
      const ctx = this.getContext();
      if (!file || !ctx.me) return;
      try {
        this.toast("📷 正在壓縮上傳大頭貼…");
        const url = await window.PartyDB.uploadAvatar(file);
        await window.PartyDB.update("players", `id=eq.${encodeURIComponent(ctx.me.id)}`, {
          avatar: url,
        });
        window.PartyGamesUI.closeModal();
        window.PartyFX.haptic("medium");
        this.toast("✨ 已更新個人照片大頭貼！");
        await this.refreshAll();
      } catch (e) {
        this.toast("照片上傳失敗，請重試！");
      }
    },

    async selectMyEmojiAvatar(emoji) {
      const ctx = this.getContext();
      if (!ctx.me) return;
      await window.PartyDB.update("players", `id=eq.${encodeURIComponent(ctx.me.id)}`, {
        avatar: emoji,
      });
      window.PartyGamesUI.closeModal();
      window.PartyFX.haptic("medium");
      this.toast(`✨ 已更換頭貼為 ${emoji}！`);
      await this.refreshAll();
    },

    async saveMyShareCards() {
      const ctx = this.getContext();
      const v = (id) => document.getElementById(id)?.value.trim() || "";
      const s26 = {
        story: v("sh26-story"),
        trueFact: v("sh26-true"),
        fakeFacts: [
          v("sh26-f1") || "其實那天還遇到明星",
          v("sh26-f2") || "結果花了三倍預算",
          v("sh26-f3") || "最後是靠猜拳決定的",
        ],
      };
      const s27 = {
        story: v("sh27-story"),
        trueFact: v("sh27-true"),
        fakeFacts: [
          v("sh27-f1") || "已經偷偷報名繳費了",
          v("sh27-f2") || "是為了跟朋友打賭贏大餐",
          v("sh27-f3") || "準備拉在場某個人一起去",
        ],
      };
      if (!s26.story || !s26.trueFact || !s27.story || !s27.trueFact) {
        this.toast("請至少填寫 2026 與 2027 的「故事/願望標題」與「1 個真實細節」！");
        return;
      }
      await window.PartyDB.update("players", `id=eq.${encodeURIComponent(ctx.me.id)}`, {
        share_2026: s26,
        share_2027: s27,
      });
      document.querySelectorAll("[data-dirty]").forEach((el) => delete el.dataset.dirty);
      window.PartyFX.playTone("bell");
      this.toast("✅ 2026 & 2027 分享卡已加密儲存！");
      await this.refreshAll();
    },

    async testPushAndSound() {
      const ctx = this.getContext();
      if (!ctx.me) return;
      // 1. 立即於點擊手勢當下解鎖音效並播放勝利鈴聲＋重震動回饋（100% 相容 Android & iOS！）
      window.PartyFX.unlockAudio();
      window.PartyFX.playTone("win");
      window.PartyFX.haptic("heavy");
      try {
        await window.PartyFX.notify(
          "🎉 跨年英雄紀元推播測試成功！",
          `${ctx.me.name}，你的手機通知橫幅與派對音效皆已就緒！`
        );
      } catch (_) {}
      await window.PartyDB.update("players", `id=eq.${encodeURIComponent(ctx.me.id)}`, {
        push_tested: true,
      });
      this.toast("✅ 測試音效與系統推播通知已發送！");
      await this.refreshAll();
    },

    startPracticeReaction() {
      this.reactionTestState = {
        phase: "wait",
        fireAt: performance.now() + 2000 + Math.random() * 2500,
        lastMs: null,
      };
      this.render();
      clearTimeout(this._pracTimer);
      this._pracTimer = setTimeout(() => {
        if (this.reactionTestState.phase === "wait") {
          this.reactionTestState.phase = "fire";
          window.PartyFX.playTone("fire");
          window.PartyFX.haptic("heavy");
          this.render();
        }
      }, this.reactionTestState.fireAt - performance.now());
    },

    tapPracticeReaction() {
      clearTimeout(this._pracTimer);
      if (this.reactionTestState.phase === "wait") {
        this.reactionTestState = { phase: "idle", fireAt: 0, lastMs: -1 };
      } else if (this.reactionTestState.phase === "fire") {
        const ms = Math.max(1, Math.round(performance.now() - this.reactionTestState.fireAt));
        this.reactionTestState = { phase: "idle", fireAt: 0, lastMs: ms };
      }
      window.PartyFX.haptic("medium");
      this.render();
    },

    // --- 隱藏任務抽卡／重抽／鎖定／申請認證 ---
    async ensureTodayMissions() {
      const ctx = this.getContext();
      const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";
      const completedIds = (ctx.claims || [])
        .filter((c) => c.applicant_id === ctx.me.id && c.mission_card_id && c.status !== "rejected")
        .map((c) => c.mission_card_id);
      const cards = window.PartyEngine.drawMissionCards(ctx.questionBanks, completedIds, 3);
      await window.PartyDB.upsert(
        "missions",
        [
          {
            id: `${ctx.me.id}_${dayKey}`,
            player_id: ctx.me.id,
            day_key: dayKey,
            cards,
            rerolls_used: 0,
            locked: false,
          },
        ],
        { ignoreDuplicates: true }
      );
      await this.refreshAll();
    },

    async rerollSingleMission(cardIdx) {
      const ctx = this.getContext();
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const dayKey = g.activeDayKey || "2026-12-31";
      const mid = `${ctx.me.id}_${dayKey}`;
      const myM = (ctx.missions || []).find((m) => m.id === mid);
      if (!myM || myM.locked) return;
      if ((myM.rerolls_used || 0) >= (g.maxMissionRerollsPerDay || 3)) {
        this.toast("今日免費重抽次數已用完！");
        return;
      }
      const excludeIds = new Set([
        ...(myM.cards || []).map((c) => c.id),
        ...(ctx.claims || [])
          .filter((c) => c.applicant_id === ctx.me.id && c.mission_card_id)
          .map((c) => c.mission_card_id),
      ]);
      const fresh = window.PartyEngine.drawMissionCards(
        ctx.questionBanks,
        [...excludeIds],
        1
      )[0];
      if (!fresh) return;
      const nextCards = [...(myM.cards || [])];
      nextCards[cardIdx] = fresh;
      await window.PartyDB.update("missions", `id=eq.${encodeURIComponent(mid)}`, {
        cards: nextCards,
        rerolls_used: (myM.rerolls_used || 0) + 1,
      });
      window.PartyFX.haptic("medium");
      await this.refreshAll();
    },

    async lockMyMissions() {
      const ctx = this.getContext();
      const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";
      const mid = `${ctx.me.id}_${dayKey}`;
      await window.PartyDB.update("missions", `id=eq.${encodeURIComponent(mid)}`, {
        locked: true,
      });
      window.PartyFX.playTone("bell");
      this.toast("🔒 今日隱藏任務已鎖定！快去找朋友自然互動解任務吧！");
      await this.refreshAll();
    },

    openMissionClaimModal(cardId) {
      const ctx = this.getContext();
      const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";
      const myM = (ctx.missions || []).find((m) => m.id === `${ctx.me.id}_${dayKey}`);
      const card = (myM?.cards || []).find((c) => c.id === cardId);
      if (!card) return;
      const others = (ctx.players || []).filter((p) => p.id !== ctx.me.id);
      if (others.length < 2) {
        this.toast("需要現場至少有「1 位互動當事人 + 1 位見證人」（共至少 3 位玩家）才能發起雙重認證喔！");
        return;
      }

      const modal = document.getElementById("party-modal");
      const box = document.getElementById("party-modal-body");
      if (!modal || !box) return;
      modal.classList.remove("hidden");

      box.innerHTML = `
        <div class="modal-head">
          <h3>🕵️ 申請隱藏任務達成認證</h3>
          <button class="btn-close" onclick="PartyGamesUI.closeModal()">✕</button>
        </div>
        <div class="toast-inline" style="margin-bottom:10px;">【${esc(card.tag)}】${esc(card.text)}</div>

        <label class="sub-label">1. 選擇「互動當事人本人」：</label>
        <select id="clm-target" class="input-dark" style="margin-bottom:10px;" onchange="PartyApp.syncMissionTargetWitnessUI()">
          ${others.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}
        </select>

        <label class="sub-label">2. 勾選「現場見證人」（至少勾 1 位，可多勾幾位讓大家誰先看到都能幫你按確認！）：</label>
        <div class="owner-pick-grid" style="margin-bottom:10px;">
          ${others
            .map(
              (p, idx) => `<label class="chip-select msn-wit-lbl" data-pid="${esc(p.id)}" style="display:flex;align-items:center;gap:5px;">
                <input type="checkbox" class="msn-wit-chk" value="${esc(p.id)}" ${idx === 1 ? "checked" : ""}>
                <span>${esc(p.name)}</span>
              </label>`
            )
            .join("")}
        </div>

        ${
          card.needPhoto
            ? `<label class="line-check-box">
                 <input type="checkbox" id="clm-line-chk">
                 <span>📸 我已拍下認證照片並上傳至 <b>LINE 群組相簿</b>（App 免傳照片不卡頓！）</span>
               </label>`
            : ""
        }

        <button class="btn btn-gold" style="width:100%;" onclick="PartyApp.submitMissionClaim('${esc(card.id)}','${esc(card.tag)}', ${Boolean(card.needPhoto)})">
          📨 送出請當事人＆見證人按確認
        </button>
      `;
      this.syncMissionTargetWitnessUI();
    },

    syncMissionTargetWitnessUI() {
      const targetId = document.getElementById("clm-target")?.value || "";
      document.querySelectorAll(".msn-wit-lbl").forEach((lbl) => {
        const pid = lbl.getAttribute("data-pid");
        const chk = lbl.querySelector("input.msn-wit-chk");
        if (!chk) return;
        if (pid === targetId) {
          chk.checked = false;
          chk.disabled = true;
          lbl.style.opacity = "0.4";
        } else {
          chk.disabled = false;
          lbl.style.opacity = "1";
        }
      });
    },

    async submitMissionClaim(cardId, cardTag, needPhoto) {
      return window.PartyDB.withLock(`msn_claim_${cardId}`, async () => {
        const ctx = this.getContext();
        const targetId = document.getElementById("clm-target")?.value || "";
        const witnessIds = [...document.querySelectorAll(".msn-wit-chk:checked")]
          .map((el) => el.value)
          .filter((id) => id && id !== targetId);
        if (!targetId || witnessIds.length < 1) {
          this.toast("請至少勾選 1 位「當事人以外」的現場見證人喔！");
          return;
        }
        let photoUrl = "";
        if (needPhoto) {
          const lineChecked = Boolean(document.getElementById("clm-line-chk")?.checked);
          if (!lineChecked) {
            this.toast("📸 此為拍照類任務，請先將照片傳到 LINE 群組相簿並打勾確認！");
            return;
          }
          photoUrl = "LINE_ALBUM";
        }

        const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
        const dayKey = g.activeDayKey || "2026-12-31";
        // 防重複申請檢查
        const dup = (ctx.claims || []).some(
          (c) =>
            c.applicant_id === ctx.me.id &&
            c.mission_card_id === cardId &&
            c.day_key === dayKey &&
            c.status !== "rejected"
        );
        if (dup) {
          window.PartyGamesUI.closeModal();
          await this.refreshAll();
          return;
        }
        const claimId = `clm_${ctx.me.id}_${cardId}_${dayKey}_${Date.now().toString(36)}`;

        await window.PartyDB.upsert(
          "claims",
          [
            {
              id: claimId,
              claim_type: "hidden_mission",
              applicant_id: ctx.me.id,
              title: `隱藏任務【${cardTag}】`,
              points: Number(g.hiddenMissionPoints) || 35,
              target_id: targetId,
              witness_ids: witnessIds,
              required_approvals: 2,
              photo_url: photoUrl,
              day_key: dayKey,
              mission_card_id: cardId,
              status: "pending",
            },
          ],
          { ignoreDuplicates: true }
        );

        window.PartyGamesUI.closeModal();
        window.PartyFX.playTone("bell");
        this.toast("📨 已送出認證請求！若選錯人可隨時點「撤回重選見證人」！");
        await this.refreshAll();
      });
    },

    // c-2: 申請人主動撤回重選見證人（徹底移除該筆申請與審核紀錄，原本被點名的人將立刻完全看不到此訊息！）
    async cancelMyPendingClaim(claimId) {
      return window.PartyDB.withLock(`cancel_clm_${claimId}`, async () => {
        const ctx = this.getContext();
        const claim = (ctx.claims || []).find((c) => c.id === claimId);
        if (!claim || claim.applicant_id !== ctx.me?.id || claim.status !== "pending") {
          await this.refreshAll();
          return;
        }
        await window.PartyDB.remove(
          "claim_approvals",
          `claim_id=eq.${encodeURIComponent(claimId)}`
        );
        await window.PartyDB.remove("claims", `id=eq.${encodeURIComponent(claimId)}`);
        this.seenClaimIds.delete(claimId);
        window.PartyFX.haptic("medium");
        this.toast("↺ 已撤回該筆認證申請！原見證人畫面已同步移除，你可以重新選擇見證人囉！");
        await this.refreshAll();
      });
    },

    // 被點名的當事人／見證人若發現對方點錯人，可一鍵退回重選（同樣徹底移除不卡死申請人！）
    async rejectClaim(claimId) {
      return window.PartyDB.withLock(`reject_clm_${claimId}`, async () => {
        const ctx = this.getContext();
        const claim = (ctx.claims || []).find((c) => c.id === claimId);
        if (!claim || claim.status !== "pending") {
          await this.refreshAll();
          return;
        }
        await window.PartyDB.remove(
          "claim_approvals",
          `claim_id=eq.${encodeURIComponent(claimId)}`
        );
        await window.PartyDB.remove("claims", `id=eq.${encodeURIComponent(claimId)}`);
        this.seenClaimIds.delete(claimId);
        window.PartyFX.haptic("medium");
        this.toast("↩️ 已退回該筆認證邀請，方便對方重新選擇正確見證人！");
        await this.refreshAll();
      });
    },

    // --- 民宿神隊友 & 晨間陽光鳥申請 ---
    openChoreClaimModal(badgeCode) {
      const ctx = this.getContext();
      const badge = CFG.BADGE_CATALOG.find((b) => b.code === badgeCode);
      if (!badge) return;
      const g = { ...CFG.DEFAULTS, ...(ctx.globalCfg || {}) };
      const dayKey = g.activeDayKey || "2026-12-31";

      // 檢查次數上限
      const myCount = (ctx.claims || []).filter(
        (c) =>
          c.applicant_id === ctx.me.id &&
          c.badge_code === badgeCode &&
          c.status !== "rejected" &&
          (badgeCode === "morning_bird" ? c.day_key === dayKey : true)
      ).length;
      const limit = badgeCode === "morning_bird" ? 1 : badge.maxCount || 2;
      if (myCount >= limit) {
        this.toast(`【${badge.name}】已達領取上限（${limit} 次）囉！`);
        return;
      }

      const others = (ctx.players || []).filter((p) => p.id !== ctx.me.id);
      if (others.length < badge.needWitness) {
        this.toast(`需要至少 ${badge.needWitness} 位其他夥伴在場才能認證！`);
        return;
      }

      const modal = document.getElementById("party-modal");
      const box = document.getElementById("party-modal-body");
      modal.classList.remove("hidden");

      box.innerHTML = `
        <div class="modal-head">
          <h3>${badge.icon} 申請【${esc(badge.name)}】(+${badge.points} PT)</h3>
          <button class="btn-close" onclick="PartyGamesUI.closeModal()">✕</button>
        </div>
        <p class="muted-sm" style="margin-bottom:10px;">${esc(badge.desc)}</p>
        <input id="chore-note" class="input-dark" style="margin-bottom:10px;" placeholder="簡短說明（例如：幫忙收拾火鍋碗盤 / 訂飲料）">
        <div class="sub-label">勾選現場 ${badge.needWitness} 位見證夥伴幫忙按感謝認證：</div>
        <div class="owner-pick-grid" style="margin:8px 0 12px;">
          ${others
            .map(
              (p, i) => `<label class="chip-select" style="display:flex;align-items:center;gap:5px;">
                <input type="checkbox" class="chore-wit-chk" value="${esc(p.id)}" ${i < badge.needWitness ? "checked" : ""}>
                ${esc(p.name)}
              </label>`
            )
            .join("")}
        </div>
        ${
          badge.needLineAlbumCheck
            ? `<label class="line-check-box">
                 <input type="checkbox" id="chore-line-chk">
                 <span>📸 我已將精選照片／短片上傳至 <b>LINE 群組相簿</b>！</span>
               </label>`
            : ""
        }
        <button class="btn btn-gold" style="width:100%;" onclick="PartyApp.submitChoreClaim('${badge.code}')">
          🙌 發送感謝認證請求
        </button>
      `;
    },

    async submitChoreClaim(badgeCode) {
      const ctx = this.getContext();
      const badge = CFG.BADGE_CATALOG.find((b) => b.code === badgeCode);
      if (!badge) return;
      const checked = [...document.querySelectorAll(".chore-wit-chk:checked")].map((el) => el.value);
      if (checked.length < badge.needWitness) {
        this.toast(`請至少勾選 ${badge.needWitness} 位夥伴幫忙認證！`);
        return;
      }
      if (badge.needLineAlbumCheck && !document.getElementById("chore-line-chk")?.checked) {
        this.toast("📸 請先將照片上傳至 LINE 群組相簿，並勾選確認框喔！");
        return;
      }
      const note = document.getElementById("chore-note")?.value.trim() || "";
      const dayKey = ctx.globalCfg?.activeDayKey || "2026-12-31";
      const cid = `chore_${badgeCode}_${ctx.me.id}_${Date.now()}`;

      await window.PartyDB.upsert("claims", [
        {
          id: cid,
          claim_type: badgeCode === "morning_bird" ? "morning_bird" : "chore_badge",
          badge_code: badgeCode,
          applicant_id: ctx.me.id,
          title: `${badge.name}${note ? `（${note}）` : ""}`,
          points: badge.points,
          target_id: null,
          witness_ids: checked,
          required_approvals: badge.needWitness,
          photo_url: badge.needLineAlbumCheck ? "LINE_ALBUM" : "",
          day_key: dayKey,
          status: "pending",
        },
      ]);

      window.PartyGamesUI.closeModal();
      window.PartyFX.playTone("bell");
      this.toast("🙌 已發送認證請求！");
      await this.refreshAll();
    },

    // --- 當事人／見證人按下同意認證（CAS + 冪等防呆自動派分！） ---
    async approveClaim(claimId, role) {
      return window.PartyDB.withLock(`approve_clm_${claimId}`, async () => {
        const ctx = this.getContext();
        // 先重新確認該筆 claim 是否仍存在且未撤回！
        const freshClaims = await window.PartyDB.select(
          "claims",
          `id=eq.${encodeURIComponent(claimId)}`
        );
        const claim = freshClaims && freshClaims[0];
        if (!claim || claim.status !== "pending") {
          this.toast("ℹ️ 該筆認證申請已被撤回或已完成結算！");
          await this.refreshAll();
          return;
        }

        await window.PartyDB.upsert(
          "claim_approvals",
          [
            {
              id: `${claimId}_${ctx.me.id}`,
              claim_id: claimId,
              approver_id: ctx.me.id,
              role,
            },
          ],
          { ignoreDuplicates: true }
        );

        // 重新撈取最新該筆 claim 的所有有效同意票，檢查是否達標
        const approvals = await window.PartyDB.select(
          "claim_approvals",
          `claim_id=eq.${encodeURIComponent(claimId)}`
        );
        const approverIds = new Set((approvals || []).map((a) => a.approver_id));

        let passed = false;
        if (claim.claim_type === "hidden_mission") {
          const hasTarget = claim.target_id && approverIds.has(claim.target_id);
          const witnessApproved = [...approverIds].filter(
            (id) => id !== claim.target_id && id !== claim.applicant_id
          );
          passed = Boolean(hasTarget && witnessApproved.length >= 1);
        } else {
          const validApprovers = [...approverIds].filter((id) => id !== claim.applicant_id);
          passed = validApprovers.length >= (claim.required_approvals || 1);
        }

        if (passed) {
          const tx = await window.PartyDB.transactRow("claims", claimId, (cur) => {
            if (!cur || cur.status !== "pending") return undefined;
            cur.status = "approved";
            return cur;
          });

          if (tx.committed) {
            if (claim.badge_code) {
              await window.PartyEngine.awardBadgeOnce(
                `${claim.badge_code}_${claimId}`,
                claim.badge_code,
                claim.applicant_id,
                claim.points,
                claim.title,
                "同伴見證認證通過",
                claim.day_key
              );
            } else {
              await window.PartyDB.upsert(
                "ledger",
                [
                  {
                    id: `claim_reward_${claim.id}`,
                    player_id: claim.applicant_id,
                    delta: Number(claim.points) || 35,
                    category: "mission",
                    reason: `🕵️ 達成${claim.title}`,
                    day_key: claim.day_key,
                    meta: { claimId: claim.id },
                  },
                ],
                { ignoreDuplicates: true }
              );
            }
          }
          window.PartyFX.playTone("win");
        } else {
          window.PartyFX.haptic("medium");
        }

        this.toast("✅ 已送出你的認證！");
        await this.refreshAll();
      });
    },
  };

  window.PartyApp = PartyApp;
  document.addEventListener("DOMContentLoaded", () => PartyApp.init());
})();
