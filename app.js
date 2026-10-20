(() => {
  "use strict";
  const STORE_KEY = "goal-bet-local-v1";
  const LABELS = { ucl: "ליגת האלופות", laliga: "הליגה הספרדית", israel: "ליגת העל" };
  const SYMBOLS = { ucl: "🏆", laliga: "◉", israel: "⚽" };
  const AUDIO_PATHS = { ucl: "assets/audio/ucl.mp3", laliga: "assets/audio/laliga.mp3", israel: "assets/audio/israel.mp3" };
  const config = window.APP_CONFIG || {};
  const cloudReady = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient);
  let db = cloudReady ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  let cloudUser = null;
  let activeLeague = null;
  let activeMember = null;
  let members = [];
  let matches = [];
  let predictions = [];
  let localName = localStorage.getItem("goal-bet-name") || "רותם";
  let favoriteIsrael = localStorage.getItem("goal-bet-fav-israel") || "";
  let favoriteUcl = localStorage.getItem("goal-bet-fav-ucl") || "";
  let localLeague = { title: "ליגת החברים", invite_code: "GOL-2026" };
  let localMatches = [];
  let localPredictions = [];
  let currentCompetition = "ucl";
  let isBusy = false;
  const audio = document.getElementById("competition-audio");

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved) {
      localLeague = saved.league || localLeague;
      localMatches = Array.isArray(saved.matches) ? saved.matches : [];
      localPredictions = Array.isArray(saved.predictions) ? saved.predictions : [];
      localName = saved.name || localName;
    }
  } catch (_) {}

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const currentName = () => cloudReady ? (activeMember?.display_name || cloudUser?.user_metadata?.display_name || "שחקן") : localName;
  const currentId = () => cloudReady ? cloudUser?.id : `local-${slug(localName)}`;
  const leagueTitle = () => cloudReady ? (activeLeague?.title || "הליגה שלכם") : localLeague.title;
  const inviteCode = () => cloudReady ? (activeLeague?.invite_code || "") : localLeague.invite_code;
  const allMatches = () => cloudReady ? matches : localMatches;
  const allPredictions = () => cloudReady ? predictions : localPredictions;
  function slug(text) { return String(text || "player").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "player"; }
  function saveLocal() { localStorage.setItem(STORE_KEY, JSON.stringify({ league: localLeague, matches: localMatches, predictions: localPredictions, name: localName })); localStorage.setItem("goal-bet-name", localName); }
  function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add("hidden"), 2800); }
  function setBusy(form, busy) { isBusy = busy; $$("button[type='submit']", form).forEach(button => { button.disabled = busy; }); }
  function nameMap() {
    const map = new Map();
    if (!cloudReady) {
      for (const p of localPredictions) map.set(p.user_id, p.display_name);
      map.set(currentId(), localName);
    } else for (const m of members) map.set(m.user_id, m.display_name);
    return map;
  }
  function myPrediction(matchId) { return allPredictions().find(p => p.match_id === matchId && p.user_id === currentId()); }
  function scoreOutcome(home, away) { return home > away ? "home" : home < away ? "away" : "draw"; }
  function sameName(a, b) { const norm = v => String(v || "").trim().toLocaleLowerCase("he").replace(/\s+/g, " "); return norm(a) === norm(b); }
  function pointsFor(prediction, match) {
    if (!match || match.status !== "finished") return 0;
    let points = 0;
    const exact = Number(prediction.home_score) === Number(match.home_score) && Number(prediction.away_score) === Number(match.away_score);
    if (exact) points += 5;
    else if (scoreOutcome(Number(prediction.home_score), Number(prediction.away_score)) === scoreOutcome(Number(match.home_score), Number(match.away_score))) points += 2;
    const actualScorer = String(match.first_scorer || "").trim();
    const guessedScorer = String(prediction.first_scorer_guess || "").trim();
    if (actualScorer && guessedScorer && sameName(actualScorer, guessedScorer)) points += 3;
    return points;
  }
  function formatKickoff(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "מועד לא הוגדר";
    return new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }
  function isLocked(match) { return match.status === "finished" || new Date(match.kickoff_at).getTime() <= Date.now(); }
  function showModal(id) { $("#" + id).classList.remove("hidden"); }
  function hideModal(id) { $("#" + id).classList.add("hidden"); }

  function renderMatch(match) {
    const prediction = myPrediction(match.id);
    const locked = isLocked(match);
    const finished = match.status === "finished";
    const comp = match.competition || "ucl";
    const points = prediction ? pointsFor(prediction, match) : 0;
    const scoreHome = prediction?.home_score ?? "";
    const scoreAway = prediction?.away_score ?? "";
    const scorer = prediction?.first_scorer_guess ?? "";
    const timeText = finished ? "המשחק הסתיים" : locked ? "הניחושים נסגרו" : `שריקת פתיחה · ${formatKickoff(match.kickoff_at)}`;
    const resultBlock = finished ? `<div class="match-result"><span>תוצאה: <b>${match.home_score} : ${match.away_score}</b></span><span>כובש ראשון: <b>${escapeHtml(match.first_scorer || "לא הוזן")}</b></span>${prediction ? `<span class="match-points">${points} נק׳</span>` : ""}</div>` : "";
    let predictionBlock = "";
    if (finished) {
      predictionBlock = prediction ? `<div class="locked-message">הניחוש שלך: <b>${prediction.home_score} : ${prediction.away_score}</b> · כובש: <b>${escapeHtml(prediction.first_scorer_guess)}</b></div>` : `<div class="locked-message">לא הוגש ניחוש למשחק הזה.</div>`;
    } else if (locked) {
      predictionBlock = prediction ? `<div class="locked-message">הניחוש שלך: <b>${prediction.home_score} : ${prediction.away_score}</b> · כובש: <b>${escapeHtml(prediction.first_scorer_guess)}</b></div>` : `<div class="locked-message">שריקת הפתיחה כבר הייתה — הניחושים נעולים.</div>`;
    } else {
      predictionBlock = `<form class="prediction-form" data-match-id="${escapeHtml(match.id)}"><div class="prediction-caption"><span>${prediction ? "עדכון הניחוש שלך" : "מה הניחוש שלך?"}</span><small>ננעל בשריקת הפתיחה</small></div><div class="prediction-row"><div class="score-input-wrap"><input name="home_score" type="number" min="0" max="30" required aria-label="שערים לקבוצה הביתית" value="${escapeHtml(scoreHome)}"><span>בית</span></div><div class="score-input-wrap"><input name="away_score" type="number" min="0" max="30" required aria-label="שערים לקבוצה האורחת" value="${escapeHtml(scoreAway)}"><span>חוץ</span></div></div><input class="scorer-input" name="first_scorer_guess" required maxlength="48" placeholder="מי יבקיע ראשון?" value="${escapeHtml(scorer)}"><button class="submit-prediction" type="submit">${prediction ? "שמור עדכון" : "שלח ניחוש"} <span>→</span></button></form>`;
    }
    return `<article class="match-card" data-competition="${escapeHtml(comp)}" data-match-card="${escapeHtml(match.id)}"><button class="delete-match" data-delete-match="${escapeHtml(match.id)}" title="מחיקת משחק" aria-label="מחיקת משחק">×</button><div class="match-topline"><span class="competition-chip ${escapeHtml(comp)}">${SYMBOLS[comp] || "⚽"} ${LABELS[comp] || "ליגה"}</span><span class="match-date">${escapeHtml(timeText)}</span></div><div class="match-teams"><div class="team"><span class="team-badge">🏠</span><div class="team-name">${escapeHtml(match.home_team)}</div></div><div class="vs-block">${finished ? `<strong class="score-final">${match.home_score} : ${match.away_score}</strong><span>סופי</span>` : `<strong>VS</strong><span class="match-time">${formatKickoff(match.kickoff_at).split(" ").slice(-1)[0] || ""}</span>`}</div><div class="team"><span class="team-badge">🛡️</span><div class="team-name">${escapeHtml(match.away_team)}</div></div></div>${predictionBlock}${resultBlock}</article>`;
  }

  function leaderboardRows() {
    const people = new Map();
    if (cloudReady) {
      for (const member of members) people.set(member.user_id, { user_id: member.user_id, display_name: member.display_name, guesses: 0, points: 0 });
    } else {
      people.set(currentId(), { user_id: currentId(), display_name: localName, guesses: 0, points: 0 });
      for (const prediction of localPredictions) if (!people.has(prediction.user_id)) people.set(prediction.user_id, { user_id: prediction.user_id, display_name: prediction.display_name, guesses: 0, points: 0 });
    }
    for (const prediction of allPredictions()) {
      const person = people.get(prediction.user_id) || { user_id: prediction.user_id, display_name: prediction.display_name || "שחקן", guesses: 0, points: 0 };
      person.guesses += 1;
      const match = allMatches().find(m => m.id === prediction.match_id);
      person.points += pointsFor(prediction, match);
      people.set(prediction.user_id, person);
    }
    return [...people.values()].sort((a, b) => b.points - a.points || b.guesses - a.guesses || a.display_name.localeCompare(b.display_name, "he"));
  }

  function renderLeaderboard() {
    const rows = leaderboardRows();
    const completed = allMatches().filter(m => m.status === "finished").length;
    const list = $("#leaderboard-list");
    if (!completed || !rows.length) { list.innerHTML = ""; $("#empty-leaderboard").classList.remove("hidden"); return; }
    $("#empty-leaderboard").classList.add("hidden");
    list.innerHTML = rows.map((row, i) => `<div class="leader-row"><span class="leader-position ${i === 0 ? "top" : ""}">${i === 0 ? "🏆" : String(i + 1).padStart(2, "0")}</span><span class="leader-player"><span class="player-avatar">${escapeHtml([...row.display_name][0] || "?")}</span>${escapeHtml(row.display_name)}${row.user_id === currentId() ? " <small>(אתה)</small>" : ""}</span><span>${row.guesses}</span><span class="leader-points">${row.points} נק׳</span></div>`).join("");
  }

  function render() {
    const games = allMatches().slice().sort((a, b) => new Date(a.kickoff_at) - new Date(b.kickoff_at));
    const filter = $("#competition-filter").value;
    const visible = games.filter(m => filter === "all" || m.competition === filter);
    $("#match-grid").innerHTML = visible.map(renderMatch).join("");
    $("#empty-matches").classList.toggle("visible", games.length === 0);
    $("#match-grid").classList.toggle("hidden", games.length === 0);
    $("#stat-games").textContent = games.length;
    $("#tab-game-count").textContent = games.length;
    $("#stat-predictions").textContent = allPredictions().length;
    const scoreRows = leaderboardRows();
    $("#stat-players").textContent = cloudReady ? members.length : Math.max(1, scoreRows.length);
    $("#stat-leader").textContent = scoreRows[0]?.points > 0 ? scoreRows[0].display_name : "—";
    $("#league-name-display").textContent = leagueTitle();
    $("#invite-code-display").textContent = inviteCode() || "—";
    $("#avatar-initial").textContent = [...currentName()][0] || "?";
    $("#season-label").textContent = cloudReady && activeLeague ? `הליגה · ${activeLeague.title}` : "העונה שלכם מתחילה כאן";
    const pending = games.filter(m => m.status !== "finished");
    $("#result-match-select").innerHTML = pending.length ? `<option value="">בחר משחק</option>${pending.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(LABELS[m.competition] || "ליגה")} · ${escapeHtml(m.home_team)} — ${escapeHtml(m.away_team)}</option>`).join("")}` : `<option value="">אין משחקים פתוחים</option>`;
    const canManage = !cloudReady || activeMember?.role === "admin";
    $("#admin-badge").textContent = canManage ? "מנהל הליגה" : "חבר ליגה";
    $$("#panel-admin .admin-card").forEach((card, index) => card.classList.toggle("admin-disabled", !canManage && index < 2));
    renderLeaderboard();
  }

  function setConnection(cloud) {
    const pill = $("#connection-pill");
    if (cloud) { pill.classList.add("cloud"); pill.querySelector("span").textContent = "מחובר לענן"; $("#demo-banner").classList.add("hidden"); }
    else { pill.classList.remove("cloud"); pill.querySelector("span").textContent = "מצב הדגמה"; $("#demo-banner").classList.remove("hidden"); }
  }
  function setTheme(comp) { currentCompetition = LABELS[comp] ? comp : "ucl"; document.body.dataset.theme = currentCompetition; $$(".music-choice").forEach(btn => btn.classList.toggle("active", btn.dataset.music === currentCompetition)); }
  function showAuth() { $("#auth-message").textContent = ""; showModal("auth-modal"); }

  async function loadCloud() {
    if (!cloudReady || !cloudUser) return;
    const { data: memberRows, error: memberError } = await db.from("league_members").select("league_id,user_id,display_name,role,favorite_israel_team,favorite_ucl_team").eq("user_id", cloudUser.id);
    if (memberError) { toast(`שגיאה בטעינת הליגות: ${memberError.message}`); return; }
    if (!memberRows?.length) { activeLeague = null; activeMember = null; members = []; matches = []; predictions = []; render(); showModal("league-modal"); return; }
    const savedLeagueId = localStorage.getItem("goal-bet-active-league");
    const chosen = memberRows.find(m => m.league_id === savedLeagueId) || memberRows[0];
    activeMember = chosen;
    const [leagueRes, membersRes, matchRes] = await Promise.all([
      db.from("leagues").select("id,title,invite_code,owner_id").eq("id", chosen.league_id).single(),
      db.from("league_members").select("league_id,user_id,display_name,role,favorite_israel_team,favorite_ucl_team").eq("league_id", chosen.league_id),
      db.from("matches").select("*").eq("league_id", chosen.league_id).order("kickoff_at", { ascending: true })
    ]);
    if (leagueRes.error || membersRes.error || matchRes.error) { toast("לא הצלחתי לטעון את הליגה. בדוק את ההגדרות וההרשאות."); return; }
    activeLeague = leagueRes.data; members = membersRes.data || []; matches = matchRes.data || [];
    localStorage.setItem("goal-bet-active-league", activeLeague.id);
    const predRes = await db.from("predictions").select("*").eq("league_id", activeLeague.id);
    if (predRes.error) { toast(`שגיאה בטעינת הניחושים: ${predRes.error.message}`); return; }
    predictions = predRes.data || [];
    setConnection(true); render();
    if (!activeMember.favorite_israel_team || !activeMember.favorite_ucl_team) showModal("setup-profile-modal");
  }

  async function bootCloud() {
    setConnection(true);
    const { data, error } = await db.auth.getSession();
    if (error) { toast(error.message); return; }
    cloudUser = data.session?.user || null;
    if (!cloudUser) { render(); showAuth(); return; }
    await loadCloud();
  }

  async function handleAuth(event) {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    const name = String(data.get("display_name") || "").trim();
    const email = String(data.get("email") || "").trim(); const password = String(data.get("password") || "");
    const intent = event.submitter?.value || "signin";
    const message = $("#auth-message"); message.textContent = ""; setBusy(form, true);
    try {
      let response;
      if (intent === "signup") {
        response = await db.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: `${location.origin}${location.pathname}` } });
        if (response.error) throw response.error;
        if (!response.data.session) { message.textContent = "נשלח אליך מייל אימות. אשר את החשבון ואז התחבר."; return; }
      } else {
        response = await db.auth.signInWithPassword({ email, password });
        if (response.error) throw response.error;
        if (name && response.data.user.user_metadata?.display_name !== name) await db.auth.updateUser({ data: { display_name: name } });
      }
      cloudUser = response.data.user || (await db.auth.getUser()).data.user;
      localStorage.setItem("goal-bet-display-name", name || cloudUser.user_metadata?.display_name || "שחקן");
      hideModal("auth-modal"); await loadCloud();
    } catch (error) { message.textContent = error.message || "לא הצלחתי להתחבר."; }
    finally { setBusy(form, false); }
  }

  async function handleLeague(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const intent = event.submitter?.value;
    const message = $("#league-message"); message.textContent = "";
    if (intent === "create" && !String(data.get("league_name") || "").trim()) { message.textContent = "צריך לתת שם לליגה."; return; }
    if (intent === "join" && !String(data.get("invite_code") || "").trim()) { message.textContent = "צריך להזין קוד הזמנה."; return; }
    setBusy(form, true);
    const name = cloudUser?.user_metadata?.display_name || localStorage.getItem("goal-bet-display-name") || "שחקן";
    try {
      let response;
      if (intent === "create") response = await db.rpc("create_league", { p_title: String(data.get("league_name") || "").trim(), p_display_name: name });
      else response = await db.rpc("join_league", { p_invite_code: String(data.get("invite_code") || "").trim().toUpperCase(), p_display_name: name });
      if (response.error) throw response.error;
      hideModal("league-modal"); await loadCloud(); toast(intent === "create" ? "הליגה נוצרה — שלח את קוד ההזמנה לחברים." : "הצטרפת לליגה!");
    } catch (error) { message.textContent = error.message || "לא הצלחתי לעדכן את הליגה."; }
    finally { setBusy(form, false); }
  }

  async function handleAddMatch(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const home = String(data.get("home") || "").trim(); const away = String(data.get("away") || "").trim();
    const kickoff = new Date(String(data.get("kickoff") || "")).toISOString(); const competition = String(data.get("competition") || "ucl");
    if (home === away) { toast("בחר שתי קבוצות שונות."); return; }
    setBusy(form, true);
    try {
      if (cloudReady) {
        const { error } = await db.from("matches").insert({ league_id: activeLeague.id, competition, home_team: home, away_team: away, kickoff_at: kickoff, created_by: cloudUser.id });
        if (error) throw error;
        await loadCloud();
      } else {
        localMatches.push({ id: crypto.randomUUID(), competition, home_team: home, away_team: away, kickoff_at: kickoff, status: "open", home_score: null, away_score: null, first_scorer: "" }); saveLocal(); render();
      }
      form.reset(); toast("המשחק נוסף ללוח!"); setTheme(competition);
    } catch (error) { toast(error.message || "לא הצלחתי להוסיף את המשחק."); }
    finally { setBusy(form, false); }
  }

  async function handlePrediction(event) {
    const form = event.target.closest(".prediction-form"); if (!form) return;
    event.preventDefault(); if (cloudReady && !cloudUser) { showAuth(); return; }
    const match = allMatches().find(m => m.id === form.dataset.matchId); if (!match) return;
    if (isLocked(match)) { toast("הניחושים למשחק הזה כבר נסגרו."); render(); return; }
    const data = new FormData(form); const home = Number(data.get("home_score")); const away = Number(data.get("away_score")); const scorer = String(data.get("first_scorer_guess") || "").trim();
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || !scorer) { toast("מלא תוצאה ושם של הכובש הראשון."); return; }
    const p = { league_id: activeLeague?.id, match_id: match.id, user_id: currentId(), display_name: currentName(), home_score: home, away_score: away, first_scorer_guess: scorer, updated_at: new Date().toISOString() };
    const button = $("button[type='submit']", form); if (button) { button.disabled = true; button.textContent = "שומר..."; }
    try {
      if (cloudReady) {
        const { error } = await db.from("predictions").upsert({ league_id: p.league_id, match_id: p.match_id, user_id: p.user_id, home_score: p.home_score, away_score: p.away_score, first_scorer_guess: p.first_scorer_guess, updated_at: p.updated_at }, { onConflict: "match_id,user_id" });
        if (error) throw error;
        await loadCloud();
      } else {
        const index = localPredictions.findIndex(old => old.match_id === p.match_id && old.user_id === p.user_id);
        if (index >= 0) localPredictions[index] = p; else localPredictions.push(p);
        if (!members.some(m => m.user_id === p.user_id)) members.push({ user_id: p.user_id, display_name: p.display_name, role: "admin" });
        saveLocal(); render();
      }
      toast("הניחוש נשמר בהצלחה!");
    } catch (error) { toast(error.message || "לא הצלחתי לשמור את הניחוש."); }
  }

  async function handleResult(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const matchId = String(data.get("match_id") || "");
    const homeScore = Number(data.get("home_score")); const awayScore = Number(data.get("away_score")); const scorer = String(data.get("first_scorer") || "").trim();
    if (!matchId || !scorer || !Number.isInteger(homeScore) || !Number.isInteger(awayScore)) { toast("בחר משחק ומלא את התוצאה ואת הכובש הראשון."); return; }
    setBusy(form, true);
    try {
      if (cloudReady) {
        const { error } = await db.from("matches").update({ home_score: homeScore, away_score: awayScore, first_scorer: scorer, status: "finished" }).eq("id", matchId).eq("league_id", activeLeague.id);
        if (error) throw error;
        await loadCloud();
      } else {
        const match = localMatches.find(m => m.id === matchId); Object.assign(match, { home_score: homeScore, away_score: awayScore, first_scorer: scorer, status: "finished" }); saveLocal(); render();
      }
      form.reset(); toast("התוצאה נשמרה והניקוד עודכן!");
    } catch (error) { toast(error.message || "לא הצלחתי לשמור את התוצאה."); }
    finally { setBusy(form, false); }
  }

  async function deleteMatch(matchId) {
    if (!confirm("למחוק את המשחק ואת כל הניחושים שלו?")) return;
    try {
      if (cloudReady) { const { error } = await db.from("matches").delete().eq("id", matchId); if (error) throw error; await loadCloud(); }
      else { localMatches = localMatches.filter(m => m.id !== matchId); localPredictions = localPredictions.filter(p => p.match_id !== matchId); saveLocal(); render(); }
      toast("המשחק נמחק.");
    } catch (error) { toast(error.message || "לא הצלחתי למחוק את המשחק."); }
  }

  async function shareInvite() {
    const code = inviteCode();
    if (cloudReady && !activeLeague) { showModal("league-modal"); return; }
    const url = new URL(location.href); url.search = ""; url.searchParams.set("join", code); const shareUrl = url.toString();
    const text = `בואו לליגת הניחושים שלנו ⚽\nקוד הזמנה: ${code}\n${shareUrl}`;
    try { await navigator.clipboard.writeText(text); toast("קוד ההזמנה והקישור הועתקו!"); }
    catch (_) { prompt("העתק ושלח לחברים:", text); }
  }

  async function handleMusic() {
    const path = AUDIO_PATHS[currentCompetition] || AUDIO_PATHS.ucl;
    if (audio.src && audio.src.endsWith(path) && !audio.paused) { audio.pause(); $("#music-toggle").textContent = "♫ הפעל אווירה"; return; }
    audio.pause(); audio.src = path; audio.loop = true;
    try { await audio.play(); $("#music-toggle").textContent = "Ⅱ עצור מוזיקה"; }
    catch (_) { toast(`לא נמצא קובץ מוזיקה ל${LABELS[currentCompetition]}. הוסף אותו לתיקיית assets/audio.`); }
  }

  function handleProfile() {
    const israel = cloudReady ? (activeMember?.favorite_israel_team || "לא נבחרה") : (favoriteIsrael || "לא נבחרה");
    const ucl = cloudReady ? (activeMember?.favorite_ucl_team || "לא נבחרה") : (favoriteUcl || "לא נבחרה");
    $("#profile-content").innerHTML = `<div class="profile-content"><div>מחובר בתור <strong>${escapeHtml(currentName())}</strong></div><div>ליגת העל: <b>${escapeHtml(israel)}</b></div><div>ליגת האלופות: <b>${escapeHtml(ucl)}</b></div><small>${cloudReady ? escapeHtml(cloudUser?.email || "") : "מצב הדגמה: הפרטים נשמרים במכשיר הזה בלבד."}</small><button id="edit-favorites" class="secondary-button dark-secondary">עריכת הקבוצות שלי</button><button id="logout-button" class="danger-button">${cloudReady ? "התנתקות" : "סגור"}</button></div>`;
    showModal("profile-modal");
  }

  async function saveFavorites(event) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const israel = String(data.get("favorite_israel_team") || "").trim(); const ucl = String(data.get("favorite_ucl_team") || "").trim();
    if (!israel || !ucl) return;
    setBusy(form, true); $("#favorite-message").textContent = "";
    try {
      if (cloudReady) {
        const { error } = await db.from("league_members").update({ favorite_israel_team: israel, favorite_ucl_team: ucl }).eq("league_id", activeLeague.id).eq("user_id", cloudUser.id);
        if (error) throw error;
        activeMember.favorite_israel_team = israel; activeMember.favorite_ucl_team = ucl;
        const roster = members.find(m => m.user_id === cloudUser.id); if (roster) Object.assign(roster, { favorite_israel_team: israel, favorite_ucl_team: ucl });
      } else {
        favoriteIsrael = israel; favoriteUcl = ucl;
        localStorage.setItem("goal-bet-fav-israel", israel); localStorage.setItem("goal-bet-fav-ucl", ucl);
      }
      hideModal("setup-profile-modal"); render(); toast("הפרופיל מוכן — קדימה לניחושים!");
    } catch (error) { $("#favorite-message").textContent = error.message || "לא הצלחתי לשמור את הפרופיל."; }
    finally { setBusy(form, false); }
  }

  document.addEventListener("click", async event => {
    const tab = event.target.closest("[data-tab]");
    if (tab) { $$(".tab-button").forEach(b => b.classList.toggle("active", b === tab)); $$(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `panel-${tab.dataset.tab}`)); if (tab.dataset.tab === "admin" && cloudReady && !cloudUser) showAuth(); }
    const close = event.target.closest("[data-close]"); if (close) hideModal(close.dataset.close);
    if (event.target.classList.contains("modal-backdrop")) event.target.classList.add("hidden");
    if (event.target.closest("#hero-add-game,#empty-add-game")) { $("[data-tab='admin']").click(); $("#match-form [name='home']").focus(); }
    if (event.target.closest("#hero-share,#share-button,#copy-code")) await shareInvite();
    if (event.target.closest("#profile-button")) handleProfile();
    if (event.target.closest("#edit-favorites")) { hideModal("profile-modal"); $("#favorite-form [name='favorite_israel_team']").value = cloudReady ? (activeMember?.favorite_israel_team || "") : favoriteIsrael; $("#favorite-form [name='favorite_ucl_team']").value = cloudReady ? (activeMember?.favorite_ucl_team || "") : favoriteUcl; showModal("setup-profile-modal"); }
    if (event.target.closest("#music-toggle")) await handleMusic();
    const musicButton = event.target.closest("[data-music]"); if (musicButton) { setTheme(musicButton.dataset.music); if (!audio.paused) { audio.pause(); audio.src = AUDIO_PATHS[currentCompetition]; audio.play().catch(() => {}); } }
    const deleteButton = event.target.closest("[data-delete-match]"); if (deleteButton) await deleteMatch(deleteButton.dataset.deleteMatch);
    if (event.target.closest("#refresh-button")) { if (cloudReady) await loadCloud(); else { render(); toast("הנתונים עודכנו."); } }
    if (event.target.closest("#logout-button")) { hideModal("profile-modal"); if (cloudReady) { await db.auth.signOut(); cloudUser = null; activeLeague = null; activeMember = null; members = []; matches = []; predictions = []; showAuth(); } }
  });

  document.addEventListener("submit", event => {
    if (event.target.matches(".prediction-form")) return handlePrediction(event);
    if (event.target.id === "match-form") return handleAddMatch(event);
    if (event.target.id === "result-form") return handleResult(event);
    if (event.target.id === "auth-form") return handleAuth(event);
    if (event.target.id === "league-form") return handleLeague(event);
    if (event.target.id === "favorite-form") return saveFavorites(event);
    
  });

  $("#competition-filter").addEventListener("change", event => { const comp = event.target.value; setTheme(comp === "all" ? currentCompetition : comp); render(); });
  $("#match-grid").addEventListener("click", event => { const card = event.target.closest("[data-match-card]"); if (card && !event.target.closest("button,input")) setTheme(card.dataset.competition); });

  const joinFromLink = new URLSearchParams(location.search).get("join");
  if (cloudReady) {
    setConnection(true);
    db.auth.onAuthStateChange((_event, session) => { cloudUser = session?.user || null; if (cloudUser) setTimeout(() => loadCloud(), 0); else { activeLeague = null; activeMember = null; members = []; matches = []; predictions = []; } });
    bootCloud().then(() => { if (joinFromLink && cloudUser) { $("#league-form [name='invite_code']").value = joinFromLink; showModal("league-modal"); } });
    setInterval(() => { if (cloudUser && activeLeague) loadCloud(); }, 45000);
  } else {
    members = [{ user_id: currentId(), display_name: localName, role: "admin" }];
    setConnection(false); render();
    if (joinFromLink) toast("כדי להצטרף לליגה דרך קישור, יש לחבר את האתר למסד נתונים.");
  }
  setTheme("ucl");
  render();
})();
