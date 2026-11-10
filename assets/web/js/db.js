/**
 * 《跨年英雄紀元》統一資料庫與即時推播／原生橋接層 (db.js)
 * 同時相容三種模式：
 *   1. 🔥 Google Firebase Realtime Database（免費 Spark 方案免綁卡！專為純手機 App 打造，SSE 即時推播 + 單請求快照合併）
 *   2. ⚡ 本機開發預覽 server.py（PostgREST / Firebase 雙協定模擬 + SSE）
 *   3. ☁️ Supabase PostgREST（向下相容）
 * 並內建 WebAudio 派對音效合成器 + Flutter Native Bridge (震動 & 系統本地通知)！
 */

(function () {
  const cfg = window.PARTY_CONFIG || {};
  const urlParams = new URLSearchParams(window.location.search);

  function cleanFirebaseUrl(raw) {
    const s = String(raw || "").trim().replace(/\/+$/, "");
    if (!s || s.includes("YOUR-PROJECT") || s.includes("你的")) return "";
    return s;
  }

  function getFirebaseUrl() {
    const fromQuery = cleanFirebaseUrl(urlParams.get("fb"));
    if (fromQuery) return fromQuery;
    const fromNative = cleanFirebaseUrl(window.__NYE_FIREBASE_DB_URL__);
    if (fromNative) return fromNative;
    try {
      const fromLocal = cleanFirebaseUrl(localStorage.getItem("nye_firebase_db_url"));
      if (fromLocal) return fromLocal;
    } catch (_) {}
    return cleanFirebaseUrl(cfg.FIREBASE_DB_URL);
  }

  const isSupabase = Boolean(!getFirebaseUrl() && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const baseUrl = isSupabase
    ? cfg.SUPABASE_URL.replace(/\/+$/, "")
    : window.location.origin;

  function buildHeaders(extra = {}) {
    const h = { "Content-Type": "application/json", ...extra };
    if (isSupabase) {
      h["apikey"] = cfg.SUPABASE_ANON_KEY;
      h["Authorization"] = `Bearer ${cfg.SUPABASE_ANON_KEY}`;
    }
    return h;
  }

  // ==================== Firebase Realtime Database 輔助與正規化 ====================
  function encodeFbKey(k) {
    return String(k ?? "").replace(/[.$#[\]/%]/g, (ch) =>
      `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
    );
  }

  function toDenseArray(val) {
    if (Array.isArray(val)) return val.filter((x) => x !== undefined);
    if (val && typeof val === "object") {
      const keys = Object.keys(val);
      if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
        return keys
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => val[k]);
      }
    }
    return [];
  }

  // Firebase 會自動省略空陣列 [] 與空物件 {}，讀取時自動補回標準結構確保遊戲引擎 100% 一致！
  function normalizeFirebaseRow(table, raw) {
    if (!raw || typeof raw !== "object") return null;
    const row = { ...raw };
    if (table === "players") {
      row.room = row.room ?? "";
      row.bound_device_id = row.bound_device_id ?? "";
      row.thigh_id = row.thigh_id ?? null;
      row.second_thigh_id = row.second_thigh_id ?? null;
    } else if (table === "tables") {
      row.participants = toDenseArray(row.participants);
      row.winner_ids = toDenseArray(row.winner_ids);
      row.game_state = row.game_state && typeof row.game_state === "object" ? row.game_state : {};
    } else if (table === "claims") {
      row.witness_ids = toDenseArray(row.witness_ids);
    } else if (table === "missions") {
      row.cards = toDenseArray(row.cards);
    } else if (table === "theme_sessions") {
      row.participants = toDenseArray(row.participants);
      row.state = row.state && typeof row.state === "object" ? row.state : {};
    } else if (table === "config" && row.key === "schedule") {
      row.value = toDenseArray(row.value);
    }
    return row;
  }

  function prepareRowForFirebase(table, rawRow) {
    const nowIso = new Date().toISOString();
    const r = { ...rawRow };
    if (table === "players") {
      if (!r.joined_at) r.joined_at = nowIso;
      if (r.room === undefined) r.room = "";
      if (r.bound_device_id === undefined) r.bound_device_id = "";
    } else if (table !== "config") {
      if (!r.created_at) r.created_at = nowIso;
    } else {
      r.updated_at = nowIso;
    }
    return r;
  }

  function matchPostgrestQuery(row, queryStr) {
    if (!queryStr) return true;
    const params = new URLSearchParams(queryStr);
    for (const [k, expr] of params.entries()) {
      if (k === "select" || k === "order" || k === "limit" || k === "offset" || k === "on_conflict") {
        continue;
      }
      const val = row[k];
      if (expr.startsWith("eq.")) {
        const target = expr.slice(3);
        if (typeof val === "boolean") {
          if (String(val).toLowerCase() !== target.toLowerCase()) return false;
        } else if (String(val ?? "") !== target) {
          return false;
        }
      } else if (expr.startsWith("neq.")) {
        const target = expr.slice(4);
        if (String(val ?? "") === target) return false;
      } else if (expr.startsWith("in.(") && expr.endsWith(")")) {
        const items = expr
          .slice(4, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
        if (!items.includes(String(val ?? ""))) return false;
      } else if (expr === "is.null") {
        if (val !== null && val !== undefined) return false;
      } else if (expr === "not.is.null") {
        if (val === null || val === undefined) return false;
      }
    }
    return true;
  }

  function sortAndLimitRows(rows, queryStr) {
    if (!queryStr) return rows;
    const params = new URLSearchParams(queryStr);
    const orderParam = params.get("order");
    let out = rows;
    if (orderParam) {
      const parts = orderParam.split(",").reverse();
      for (const part of parts) {
        const [col, dir] = part.trim().split(".");
        const desc = dir && dir.toLowerCase() === "desc";
        out = [...out].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av == null && bv == null) return 0;
          if (av == null) return desc ? 1 : -1;
          if (bv == null) return desc ? -1 : 1;
          const cmp = String(av).localeCompare(String(bv));
          return desc ? -cmp : cmp;
        });
      }
    }
    const lim = params.get("limit");
    if (lim && /^\d+$/.test(lim)) {
      out = out.slice(0, Number(lim));
    }
    return out;
  }

  // 同一事件迴圈 (Promise.all) 內的多表查詢自動合併為單次 GET /.json 快照請求！
  let _fbBatchQueue = null;
  function fetchFirebaseTableMap(fbUrl, table) {
    if (!_fbBatchQueue) {
      const q = { tables: new Set(), resolvers: [] };
      _fbBatchQueue = q;
      Promise.resolve().then(async () => {
        _fbBatchQueue = null;
        try {
          if (q.tables.size > 1) {
            const res = await fetch(`${fbUrl}/.json`, { cache: "no-store" });
            if (!res.ok) throw new Error(`Firebase root GET failed (${res.status})`);
            const root = (await res.json()) || {};
            q.resolvers.forEach(({ t, resolve }) => resolve(root[t] || {}));
          } else {
            const onlyTable = [...q.tables][0];
            const res = await fetch(`${fbUrl}/${onlyTable}.json`, { cache: "no-store" });
            if (!res.ok) throw new Error(`Firebase GET ${onlyTable} failed (${res.status})`);
            const tblObj = (await res.json()) || {};
            q.resolvers.forEach(({ resolve }) => resolve(tblObj));
          }
        } catch (err) {
          q.resolvers.forEach(({ reject }) => reject(err));
        }
      });
    }
    _fbBatchQueue.tables.add(table);
    return new Promise((resolve, reject) => {
      _fbBatchQueue.resolvers.push({ t: table, resolve, reject });
    });
  }

  let clockOffsetMs = 0;
  const _inFlightLocks = new Set();

  const PartyDB = {
    get isFirebase() {
      return Boolean(getFirebaseUrl());
    },
    get isCloud() {
      return Boolean(getFirebaseUrl() || isSupabase);
    },
    get firebaseUrl() {
      return getFirebaseUrl();
    },
    baseUrl,
    get serverNowMs() {
      return Date.now() + clockOffsetMs;
    },

    // 防連點／同客戶端併發互撞保護鎖（避免玩家手滑連點兩下按鈕重複送出！）
    async withLock(lockKey, asyncFn) {
      if (_inFlightLocks.has(lockKey)) return null;
      _inFlightLocks.add(lockKey);
      try {
        return await asyncFn();
      } finally {
        _inFlightLocks.delete(lockKey);
      }
    },

    getDeviceId() {
      const asSlot = urlParams.get("as");
      if (asSlot) {
        const sk = `slot_${asSlot}_device_id`;
        let sid = sessionStorage.getItem(sk);
        if (!sid) {
          sid = `dev_slot_${asSlot}_${Math.random().toString(36).slice(2, 10)}`;
          sessionStorage.setItem(sk, sid);
        }
        return sid;
      }
      if (window.__NYE_NATIVE_DEVICE_ID__ && String(window.__NYE_NATIVE_DEVICE_ID__).trim()) {
        const nid = String(window.__NYE_NATIVE_DEVICE_ID__).trim();
        try {
          localStorage.setItem("nye_device_id", nid);
        } catch (_) {}
        return nid;
      }
      let did = localStorage.getItem("nye_device_id");
      if (!did) {
        did = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("nye_device_id", did);
      }
      return did;
    },

    async syncClock() {
      if (this.isCloud) return;
      try {
        const t0 = Date.now();
        const res = await fetch(`${baseUrl}/api/time`);
        if (res.ok) {
          const data = await res.json();
          const t1 = Date.now();
          const rtt = t1 - t0;
          clockOffsetMs = data.now_ms - (t0 + Math.round(rtt / 2));
        }
      } catch (_) {}
    },

    async select(table, query = "") {
      const fbUrl = getFirebaseUrl();
      if (fbUrl) {
        // 單鍵精準查詢快速通道 (如 key=eq.__e2e_report__ 或 id=eq.xxx)
        const singleMatch = /^([a-zA-Z0-9_]+)=eq\.([^&]+)$/.exec(query);
        const pk = table === "config" ? "key" : "id";
        if (singleMatch && singleMatch[1] === pk) {
          const keyVal = decodeURIComponent(singleMatch[2]);
          const res = await fetch(`${fbUrl}/${table}/${encodeFbKey(keyVal)}.json`, { cache: "no-store" });
          if (!res.ok) throw new Error(`Firebase select ${table} key failed (${res.status})`);
          const item = await res.json();
          if (!item) return [];
          return [normalizeFirebaseRow(table, item)];
        }
        const tblMap = await fetchFirebaseTableMap(fbUrl, table);
        const rawList = Array.isArray(tblMap)
          ? tblMap.filter(Boolean)
          : Object.values(tblMap || {}).filter(Boolean);
        const normalized = rawList
          .map((r) => normalizeFirebaseRow(table, r))
          .filter((r) => r && matchPostgrestQuery(r, query));
        return sortAndLimitRows(normalized, query);
      }

      const url = `${baseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;
      const res = await fetch(url, { headers: buildHeaders() });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`select ${table} failed (${res.status}): ${txt}`);
      }
      return await res.json();
    },

    async upsert(table, rows, { ignoreDuplicates = false } = {}) {
      const fbUrl = getFirebaseUrl();
      if (fbUrl) {
        if (!rows || rows.length === 0) return [];
        const pk = table === "config" ? "key" : "id";
        if (ignoreDuplicates) {
          const inserted = [];
          await Promise.all(
            rows.map(async (raw) => {
              const prepared = prepareRowForFirebase(table, raw);
              const fbKey = encodeFbKey(prepared[pk]);
              const chk = await fetch(`${fbUrl}/${table}/${fbKey}.json`, {
                headers: { "X-Firebase-ETag": "true" },
                cache: "no-store",
              });
              const etag = chk.headers ? chk.headers.get("ETag") : null;
              const existing = chk.ok ? await chk.json() : null;
              if (existing !== null && existing !== undefined) return;
              const putHeaders = { "Content-Type": "application/json" };
              if (etag) putHeaders["If-Match"] = etag;
              const putRes = await fetch(`${fbUrl}/${table}/${fbKey}.json`, {
                method: "PUT",
                headers: putHeaders,
                body: JSON.stringify(prepared),
              });
              if (putRes.status === 412) {
                // 另一台手機在同毫秒搶先寫入相同冪等鍵，安全略過不報錯！
                return;
              }
              if (!putRes.ok) {
                throw new Error(`Firebase PUT ${table}/${fbKey} failed (${putRes.status})`);
              }
              inserted.push(normalizeFirebaseRow(table, prepared));
            })
          );
          return inserted;
        }

        const batchPatch = {};
        const out = [];
        for (const raw of rows) {
          const prepared = prepareRowForFirebase(table, raw);
          const fbKey = encodeFbKey(prepared[pk]);
          batchPatch[fbKey] = prepared;
          out.push(normalizeFirebaseRow(table, prepared));
        }
        const res = await fetch(`${fbUrl}/${table}.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batchPatch),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Firebase upsert ${table} failed (${res.status}): ${txt}`);
        }
        return out;
      }

      const prefer = ignoreDuplicates
        ? "resolution=ignore-duplicates,return=representation"
        : "resolution=merge-duplicates,return=representation";
      const pk = table === "config" ? "key" : "id";
      const url = `${baseUrl}/rest/v1/${table}?on_conflict=${pk}`;
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders({ Prefer: prefer }),
        body: JSON.stringify(rows),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`upsert ${table} failed (${res.status}): ${txt}`);
      }
      return await res.json();
    },

    async update(table, matchQuery, patch) {
      const fbUrl = getFirebaseUrl();
      if (fbUrl) {
        const pk = table === "config" ? "key" : "id";
        const nowIso = new Date().toISOString();
        const patchWithTs =
          table === "tables" || table === "config" || table === "players"
            ? { ...patch, updated_at: nowIso }
            : { ...patch };

        const singleMatch = /^([a-zA-Z0-9_]+)=eq\.([^&]+)$/.exec(matchQuery);
        if (singleMatch && singleMatch[1] === pk) {
          const keyVal = decodeURIComponent(singleMatch[2]);
          const fbKey = encodeFbKey(keyVal);
          const chk = await fetch(`${fbUrl}/${table}/${fbKey}.json`, { cache: "no-store" });
          const cur = chk.ok ? await chk.json() : null;
          if (!cur) return [];
          const res = await fetch(`${fbUrl}/${table}/${fbKey}.json`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchWithTs),
          });
          if (!res.ok) throw new Error(`Firebase PATCH ${table}/${fbKey} failed (${res.status})`);
          return [normalizeFirebaseRow(table, { ...cur, ...patchWithTs })];
        }

        const matched = await this.select(table, matchQuery);
        if (!matched.length) return [];
        const multiPatch = {};
        const updatedRows = [];
        for (const r of matched) {
          const merged = { ...r, ...patchWithTs };
          multiPatch[encodeFbKey(r[pk])] = merged;
          updatedRows.push(normalizeFirebaseRow(table, merged));
        }
        const res = await fetch(`${fbUrl}/${table}.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(multiPatch),
        });
        if (!res.ok) throw new Error(`Firebase multi-update ${table} failed (${res.status})`);
        return updatedRows;
      }

      const url = `${baseUrl}/rest/v1/${table}?${matchQuery}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: buildHeaders({ Prefer: "return=representation" }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`update ${table} failed (${res.status}): ${txt}`);
      }
      return await res.json();
    },

    async remove(table, matchQuery) {
      const fbUrl = getFirebaseUrl();
      if (fbUrl) {
        if (matchQuery === "id=neq.__never__") {
          await fetch(`${fbUrl}/${table}.json`, { method: "DELETE" });
          return true;
        }
        const pk = table === "config" ? "key" : "id";
        const singleMatch = /^([a-zA-Z0-9_]+)=eq\.([^&]+)$/.exec(matchQuery);
        if (singleMatch && singleMatch[1] === pk) {
          const fbKey = encodeFbKey(decodeURIComponent(singleMatch[2]));
          await fetch(`${fbUrl}/${table}/${fbKey}.json`, { method: "DELETE" });
          return true;
        }
        const matched = await this.select(table, matchQuery);
        if (!matched.length) return true;
        const delPatch = {};
        matched.forEach((r) => {
          delPatch[encodeFbKey(r[pk])] = null;
        });
        await fetch(`${fbUrl}/${table}.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(delPatch),
        });
        return true;
      }

      const url = `${baseUrl}/rest/v1/${table}?${matchQuery}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: buildHeaders(),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`delete ${table} failed (${res.status}): ${txt}`);
      }
      return true;
    },

    // 🔒 商用級多人同時按壓 CAS 樂觀鎖交易 (X-Firebase-ETag + If-Match 412 自動重試)
    // 確保 10 台手機同毫秒搶進 3 人房、同時加入主題房、同時按互認結算時 100% 不掉資料、不超收！
    async transactRow(table, keyVal, mutatorFn) {
      const pk = table === "config" ? "key" : "id";
      const fbUrl = getFirebaseUrl();
      if (fbUrl) {
        const fbKey = encodeFbKey(keyVal);
        for (let attempt = 0; attempt < 10; attempt++) {
          const chk = await fetch(`${fbUrl}/${table}/${fbKey}.json`, {
            headers: { "X-Firebase-ETag": "true" },
            cache: "no-store",
          });
          if (!chk.ok) throw new Error(`Firebase transact GET ${table}/${fbKey} failed (${chk.status})`);
          const etag = chk.headers ? chk.headers.get("ETag") : null;
          const rawCur = await chk.json();
          const cur = rawCur ? normalizeFirebaseRow(table, rawCur) : null;
          const draft = cur ? JSON.parse(JSON.stringify(cur)) : null;
          const next = mutatorFn(draft);
          if (next === undefined) {
            return { committed: false, snapshot: cur };
          }
          const nowIso = new Date().toISOString();
          let bodyVal = null;
          if (next !== null) {
            bodyVal = prepareRowForFirebase(table, next);
            if (table === "tables" || table === "config" || table === "players" || table === "theme_sessions") {
              bodyVal.updated_at = nowIso;
            }
          }
          const putHeaders = { "Content-Type": "application/json" };
          if (etag) putHeaders["If-Match"] = etag;
          const putRes = await fetch(`${fbUrl}/${table}/${fbKey}.json`, {
            method: "PUT",
            headers: putHeaders,
            body: JSON.stringify(bodyVal),
          });
          if (putRes.status === 412) {
            await new Promise((r) => setTimeout(r, 15 + Math.floor(Math.random() * 45)));
            continue;
          }
          if (!putRes.ok) {
            throw new Error(`Firebase transact PUT ${table}/${fbKey} failed (${putRes.status})`);
          }
          return {
            committed: true,
            snapshot: bodyVal ? normalizeFirebaseRow(table, bodyVal) : null,
          };
        }
        throw new Error(`Firebase transact ${table}/${fbKey} exceeded max retries`);
      }

      // PostgREST / Local server fallback
      const rows = await this.select(table, `${pk}=eq.${encodeURIComponent(keyVal)}`);
      const cur = (rows && rows[0]) || null;
      const draft = cur ? JSON.parse(JSON.stringify(cur)) : null;
      const next = mutatorFn(draft);
      if (next === undefined) {
        return { committed: false, snapshot: cur };
      }
      if (next === null) {
        await this.remove(table, `${pk}=eq.${encodeURIComponent(keyVal)}`);
        return { committed: true, snapshot: null };
      }
      const saved = await this.upsert(table, [next]);
      return { committed: true, snapshot: (saved && saved[0]) || next };
    },

    async uploadImage(file, folder = "uploads") {
      const blob = await compressImageFile(file, 640, 0.78);
      if (getFirebaseUrl()) {
        return await blobToDataURL(blob);
      }
      const ext = "jpg";
      const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const url = `${baseUrl}/storage/v1/object/party-media/${path}`;
      const headers = { "Content-Type": "image/jpeg", "x-upsert": "true" };
      if (isSupabase) {
        headers["apikey"] = cfg.SUPABASE_ANON_KEY;
        headers["Authorization"] = `Bearer ${cfg.SUPABASE_ANON_KEY}`;
      }
      try {
        const res = await fetch(url, { method: "POST", headers, body: blob });
        if (res.ok) {
          return isSupabase
            ? `${baseUrl}/storage/v1/object/public/party-media/${path}`
            : `/storage/v1/object/public/party-media/${path}`;
        }
      } catch (_) {}
      return await blobToDataURL(blob);
    },

    async uploadAvatar(file) {
      // Firebase 免綁卡免費方案：直接前端置中壓縮成 160x160 輕量高畫質 JPEG (~7KB DataURL) 存入資料庫，零 Storage 費用！
      const fbUrl = getFirebaseUrl();
      if (fbUrl) {
        const smallBlob = await compressAvatarSquare(file, 160, 0.8);
        return await blobToDataURL(smallBlob);
      }
      const blob = await compressAvatarSquare(file, 256, 0.84);
      const path = `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const url = `${baseUrl}/storage/v1/object/party-media/${path}`;
      const headers = { "Content-Type": "image/jpeg", "x-upsert": "true" };
      if (isSupabase) {
        headers["apikey"] = cfg.SUPABASE_ANON_KEY;
        headers["Authorization"] = `Bearer ${cfg.SUPABASE_ANON_KEY}`;
      }
      try {
        const res = await fetch(url, { method: "POST", headers, body: blob });
        if (res.ok) {
          return isSupabase
            ? `${baseUrl}/storage/v1/object/public/party-media/${path}`
            : `/storage/v1/object/public/party-media/${path}`;
        }
      } catch (_) {}
      return await blobToDataURL(blob);
    },

    async resetRehearsal(wipePlayers = false) {
      const fbUrl = getFirebaseUrl();
      if (fbUrl) {
        const rootPatch = {
          ledger: null,
          missions: null,
          claims: null,
          claim_approvals: null,
          tables: null,
          bets: null,
          theme_sessions: null,
          theme_responses: null,
          badges_awarded: null,
        };
        if (wipePlayers) {
          rootPatch.players = null;
        } else {
          const curPlayers = await this.select("players");
          const cleanedPlayers = {};
          curPlayers.forEach((p) => {
            cleanedPlayers[encodeFbKey(p.id)] = {
              ...p,
              thigh_id: null,
              second_thigh_id: null,
            };
          });
          rootPatch.players = Object.keys(cleanedPlayers).length ? cleanedPlayers : null;
        }
        await fetch(`${fbUrl}/.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rootPatch),
        });
        return true;
      }

      if (!isSupabase) {
        try {
          const res = await fetch(`${baseUrl}/api/reset`, {
            method: "POST",
            headers: buildHeaders(),
            body: JSON.stringify({ wipePlayers }),
          });
          if (res.ok) return true;
        } catch (_) {}
      }
      const tablesToClear = [
        "ledger",
        "missions",
        "claims",
        "claim_approvals",
        "tables",
        "bets",
        "theme_sessions",
        "theme_responses",
        "badges_awarded",
      ];
      for (const t of tablesToClear) {
        await PartyDB.remove(t, "id=neq.__never__");
      }
      if (wipePlayers) {
        await PartyDB.remove("players", "id=neq.__never__");
      } else {
        await PartyDB.update("players", "id=neq.__never__", {
          thigh_id: null,
          second_thigh_id: null,
        });
      }
      return true;
    },

    subscribeChanges(onChange) {
      if (urlParams.get("nosse") === "1") {
        return () => {};
      }
      const fbUrl = getFirebaseUrl();
      if (fbUrl) {
        // 🔥 Firebase Realtime Database 原生 SSE 串流監聽 (Accept: text/event-stream) + 2.5s 保底輪詢！
        let stopped = false;
        let abortCtrl = null;
        let skipInitialPut = true;

        const connectFirebaseStream = async () => {
          while (!stopped) {
            try {
              abortCtrl = new AbortController();
              skipInitialPut = true;
              const res = await fetch(`${fbUrl}/.json`, {
                headers: { Accept: "text/event-stream" },
                signal: abortCtrl.signal,
              });
              if (!res.ok || !res.body) throw new Error("SSE stream unavailable");
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buf = "";
              while (!stopped) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf("\n\n")) !== -1) {
                  const block = buf.slice(0, idx);
                  buf = buf.slice(idx + 2);
                  if (block.includes("event: put") || block.includes("event: patch")) {
                    if (skipInitialPut) {
                      skipInitialPut = false;
                    } else {
                      onChange({ firebaseStream: true });
                    }
                  }
                }
              }
            } catch (_) {}
            if (!stopped) {
              await new Promise((r) => setTimeout(r, 3000));
            }
          }
        };
        connectFirebaseStream();
        const pollTimer = setInterval(() => onChange({ poll: true }), 2500);
        return () => {
          stopped = true;
          if (abortCtrl) abortCtrl.abort();
          clearInterval(pollTimer);
        };
      }

      let pollTimer = null;
      if (!isSupabase && window.EventSource) {
        const es = new EventSource(`${baseUrl}/api/events`);
        es.addEventListener("db_change", (ev) => {
          try {
            onChange(JSON.parse(ev.data));
          } catch (_) {
            onChange({});
          }
        });
        pollTimer = setInterval(() => onChange({ poll: true }), 6000);
        return () => {
          es.close();
          clearInterval(pollTimer);
        };
      }
      if (isSupabase && window.WebSocket) {
        try {
          const wsUrl =
            baseUrl.replace(/^http/, "ws") +
            `/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.SUPABASE_ANON_KEY)}&vsn=1.0.0`;
          const ws = new WebSocket(wsUrl);
          ws.onopen = () => {
            ws.send(
              JSON.stringify({
                topic: "realtime:public",
                event: "phx_join",
                payload: {
                  config: {
                    postgres_changes: [{ event: "*", schema: "public" }],
                  },
                },
                ref: "1",
              })
            );
          };
          ws.onmessage = (msg) => {
            try {
              const d = JSON.parse(msg.data);
              if (d.event === "postgres_changes") onChange(d.payload);
            } catch (_) {}
          };
          const hb = setInterval(() => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" }));
            }
          }, 25000);
          pollTimer = setInterval(() => onChange({ poll: true }), 3000);
          return () => {
            clearInterval(hb);
            clearInterval(pollTimer);
            ws.close();
          };
        } catch (_) {}
      }
      pollTimer = setInterval(() => onChange({ poll: true }), 2500);
      return () => clearInterval(pollTimer);
    },
  };

  function compressImageFile(file, maxDim = 960, quality = 0.82) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((b) => resolve(b || file), "image/jpeg", quality);
        };
        img.onerror = () => resolve(file);
        img.src = ev.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  function compressAvatarSquare(file, size = 256, quality = 0.84) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const minSide = Math.min(img.width, img.height) || 1;
          const sx = Math.floor((img.width - minSide) / 2);
          const sy = Math.floor((img.height - minSide) / 2);
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          canvas.toBlob((b) => resolve(b || file), "image/jpeg", quality);
        };
        img.onerror = () => resolve(file);
        img.src = ev.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }

  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  let _fwAnimId = null;

  const PartyFX = {
    isMuted() {
      try {
        return localStorage.getItem("nye_fx_muted") === "1";
      } catch (_) {
        return false;
      }
    },

    toggleMute() {
      const next = !this.isMuted();
      try {
        localStorage.setItem("nye_fx_muted", next ? "1" : "0");
      } catch (_) {}
      if (!next) {
        this.unlockAudio();
        this.playTone("bell");
      }
      return next;
    },

    unlockAudio() {
      if (this.isMuted()) return;
      ensureAudio();
    },

    playTone(type = "bell") {
      if (this.isMuted()) return;
      try {
        const ctx = ensureAudio();
        if (!ctx) return;
        const now = ctx.currentTime;
        const notes =
          type === "bell"
            ? [587.33, 880, 1174.66]
            : type === "win"
            ? [523.25, 659.25, 783.99, 1046.5]
            : type === "fire"
            ? [880, 880]
            : [440, 554.37];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type === "fire" ? "sawtooth" : "triangle";
          osc.frequency.setValueAtTime(freq, now + i * 0.09);
          gain.gain.setValueAtTime(0.18, now + i * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.32);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.09);
          osc.stop(now + i * 0.09 + 0.34);
        });
      } catch (_) {}
    },

    // 🧨 喜慶跨年鞭炮霹靂啪啦聲 ＋ 煙火升空砲響 ＋ 新年五聲音階號角
    playFirecrackers() {
      this.haptic("heavy");
      setTimeout(() => this.haptic("medium"), 220);
      setTimeout(() => this.haptic("heavy"), 480);
      setTimeout(() => this.haptic("medium"), 820);
      if (this.isMuted()) return true;
      try {
        const ctx = ensureAudio();
        if (!ctx) return true;
        const now = ctx.currentTime;

        // 1. 建立白噪音緩衝模擬清脆連珠鞭炮聲 (28 發隨機節奏爆竹)
        const bufLen = Math.floor(ctx.sampleRate * 0.09);
        const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const out = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) {
          out[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.018));
        }

        for (let p = 0; p < 28; p++) {
          const t = now + p * 0.068 + Math.random() * 0.035;
          const src = ctx.createBufferSource();
          src.buffer = noiseBuf;
          const filter = ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(1400 + Math.random() * 2400, t);
          filter.Q.setValueAtTime(1.1, t);
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.28 + Math.random() * 0.16, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
          src.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          src.start(t);
          src.stop(t + 0.085);
        }

        // 2. 3 發高空煙火重低音開花砲響
        [0.05, 0.65, 1.3].forEach((offset) => {
          const t = now + offset;
          const boom = ctx.createOscillator();
          const bGain = ctx.createGain();
          boom.type = "sine";
          boom.frequency.setValueAtTime(160, t);
          boom.frequency.exponentialRampToValueAtTime(38, t + 0.34);
          bGain.gain.setValueAtTime(0.32, t);
          bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
          boom.connect(bGain);
          bGain.connect(ctx.destination);
          boom.start(t);
          boom.stop(t + 0.38);
        });

        // 3. 喜慶新年五聲宮調號角旋律 (C5-D5-E5-G5-A5-C6)
        const fanfare = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
        fanfare.forEach((freq, idx) => {
          const t = now + 0.18 + idx * 0.13;
          const dur = idx === fanfare.length - 1 ? 0.65 : 0.22;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + dur + 0.02);
        });
      } catch (_) {}
      return true;
    },

    // 🎆 全螢幕繽紛跨年煙火 ＋ 紅包金幣雨粒子動畫引擎
    launchFireworksShow(opts = {}) {
      const canvas = document.getElementById("fx-canvas");
      if (!canvas) return false;
      const showRedPackets = opts.redPackets !== false;
      const durationMs = Number(opts.durationMs) || 3800;

      if (_fwAnimId) {
        cancelAnimationFrame(_fwAnimId);
        _fwAnimId = null;
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const resize = () => {
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
      };
      resize();
      canvas.classList.remove("hidden");
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;

      const palette = ["#fbbf24", "#fb7185", "#38bdf8", "#34d399", "#fde047", "#f472b6", "#c084fc"];
      const sparks = [];
      const floaters = [];

      const spawnBurst = (cx, cy) => {
        const count = 42;
        const baseColor = palette[Math.floor(Math.random() * palette.length)];
        for (let i = 0; i < count; i++) {
          const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.18;
          const spd = (2.2 + Math.random() * 5.2) * dpr;
          sparks.push({
            x: cx,
            y: cy,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            alpha: 1,
            decay: 0.014 + Math.random() * 0.012,
            radius: (2.2 + Math.random() * 2.2) * dpr,
            color: Math.random() < 0.3 ? "#fef08a" : baseColor,
          });
        }
      };

      const w = () => canvas.width;
      const h = () => canvas.height;
      spawnBurst(w() * 0.5, h() * 0.26);
      const burstTimers = [260, 580, 950, 1380, 1850, 2350].map((delay) =>
        setTimeout(() => {
          spawnBurst(
            w() * (0.18 + Math.random() * 0.64),
            h() * (0.16 + Math.random() * 0.34)
          );
        }, delay)
      );

      if (showRedPackets) {
        const icons = ["🧧", "🪙", "✨", "🧧", "🎉"];
        for (let i = 0; i < 28; i++) {
          floaters.push({
            x: Math.random() * w(),
            y: -Math.random() * h() * 0.8 - 20 * dpr,
            vy: (2.3 + Math.random() * 2.8) * dpr,
            vx: (Math.random() - 0.5) * 1.4 * dpr,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 0.07,
            size: (20 + Math.random() * 12) * dpr,
            icon: icons[i % icons.length],
          });
        }
      }

      const startTs = performance.now();
      const step = (now) => {
        const elapsed = now - startTs;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.09 * dpr;
          p.vx *= 0.985;
          p.alpha -= p.decay;
          if (p.alpha <= 0) {
            sparks.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8 * dpr;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        if (showRedPackets) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (const f of floaters) {
            f.x += f.vx + Math.sin(elapsed * 0.004 + f.rot) * 0.5 * dpr;
            f.y += f.vy;
            f.rot += f.vrot;
            if (elapsed < durationMs * 0.65 && f.y > canvas.height + 30 * dpr) {
              f.y = -25 * dpr;
              f.x = Math.random() * canvas.width;
            }
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.rotate(f.rot * 0.25);
            ctx.font = `${Math.round(f.size)}px sans-serif`;
            ctx.globalAlpha = elapsed > durationMs - 600 ? Math.max(0, (durationMs - elapsed) / 600) : 0.96;
            ctx.fillText(f.icon, 0, 0);
            ctx.restore();
          }
        }

        if (elapsed < durationMs || sparks.length > 0) {
          _fwAnimId = requestAnimationFrame(step);
        } else {
          burstTimers.forEach((tid) => clearTimeout(tid));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.classList.add("hidden");
          _fwAnimId = null;
        }
      };
      _fwAnimId = requestAnimationFrame(step);
      return true;
    },

    haptic(style = "medium") {
      try {
        if (window.NYEPartyBridge && window.NYEPartyBridge.postMessage) {
          window.NYEPartyBridge.postMessage(JSON.stringify({ type: "haptic", style }));
        } else if (navigator.vibrate) {
          navigator.vibrate(style === "heavy" ? [80, 40, 120] : 35);
        }
      } catch (_) {}
    },

    async notify(title, body) {
      PartyFX.playTone("bell");
      PartyFX.haptic("heavy");
      try {
        if (window.NYEPartyBridge && window.NYEPartyBridge.postMessage) {
          window.NYEPartyBridge.postMessage(
            JSON.stringify({ type: "notify", title, body })
          );
          return;
        }
        if ("Notification" in window) {
          if (Notification.permission === "default") {
            await Notification.requestPermission();
          }
          if (Notification.permission === "granted") {
            new Notification(title, { body });
          }
        }
      } catch (_) {}
    },

    async requestNotifyPermission() {
      PartyFX.unlockAudio();
      try {
        if (window.NYEPartyBridge && window.NYEPartyBridge.postMessage) {
          window.NYEPartyBridge.postMessage(
            JSON.stringify({ type: "request_permission" })
          );
          return true;
        }
        if ("Notification" in window && Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch (_) {}
      return true;
    },

    async requestPermissionAndTest() {
      PartyFX.unlockAudio();
      PartyFX.playTone("win");
      PartyFX.haptic("heavy");
      if (window.NYEPartyBridge && window.NYEPartyBridge.postMessage) {
        window.NYEPartyBridge.postMessage(
          JSON.stringify({
            type: "notify",
            title: "🔔 跨年英雄紀元測試成功！",
            body: "推播橫幅、派對鈴聲與手機震動皆運作正常！",
          })
        );
        return true;
      }
      if ("Notification" in window) {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          new Notification("🔔 跨年英雄紀元測試成功！", {
            body: "推播與派對音效皆正常運作！",
          });
        }
      }
      return true;
    },
  };

  window.PartyDB = PartyDB;
  window.PartyFX = PartyFX;
})();
