/* BLP-2027 Task 2 website.
 * Content lives in data/site.json (edit that file) and data/leaderboard.json
 * (written hourly by the "Update leaderboard from EvalAI" GitHub Action).
 */
(function () {
  "use strict";

  var DAY = 86400000;
  var TRACKS = {
    "2A-bn": "Subtask 2A, Bangla", "2A-en": "Subtask 2A, English", "2A-as": "Subtask 2A, Assamese", "2A-hi": "Subtask 2A, Hindi",
    "2B-bn": "Subtask 2B, Bangla", "2B-en": "Subtask 2B, English", "2B-as": "Subtask 2B, Assamese", "2B-hi": "Subtask 2B, Hindi",
    "2B-all": "Subtask 2B, all languages (macro average)"
  };
  var PAGE_TITLES = {
    home: "", task: "Task", dates: "Important dates", data: "Data", submit: "How to submit",
    evaluation: "Evaluation", leaderboard: "Leaderboard", paper: "System papers", organizers: "Organizers"
  };
  var BASE_TITLE = "BLP-2027 Task 2: Multilingual Cultural Question Answering";

  var site = null;
  var board = null;          // leaderboard.json, or {error: true}
  var lbState = { phase: "dev", track: "2A-bn" };

  /* ---------------- helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Build DOM nodes without innerHTML so team names from EvalAI are always treated as text.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") node.textContent = v;
        else if (k === "class") node.className = v;
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function endOfDay(iso) { return new Date(iso + "T23:59:59Z").getTime(); }
  function fmtDate(t) {
    return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  function inDays(t, now) {
    var n = Math.max(0, Math.ceil((t - now) / DAY));
    return n === 0 ? "today" : n === 1 ? "tomorrow" : "in " + n + " days";
  }
  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + ": HTTP " + r.status);
      return r.json();
    });
  }

  /* ---------------- routing: one section at a time ---------------- */
  var routes = $all(".page").map(function (p) { return p.getAttribute("data-page"); });
  var firstRender = true;

  function parseHash() {
    var raw = (location.hash || "").replace(/^#/, "");
    var parts = raw.split("?");
    var route = routes.indexOf(parts[0]) >= 0 ? parts[0] : "home";
    var params = {};
    (parts[1] || "").split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
    });
    return { route: route, params: params };
  }

  function showRoute() {
    var h = parseHash();
    $all(".page").forEach(function (p) {
      var active = p.getAttribute("data-page") === h.route;
      p.hidden = !active;
      p.classList.toggle("entering", active && !firstRender);
    });
    $all("[data-route]").forEach(function (a) {
      if (a.getAttribute("data-route") === h.route && !a.classList.contains("brand")) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = PAGE_TITLES[h.route] ? PAGE_TITLES[h.route] + " · BLP-2027 Task 2" : BASE_TITLE;

    if (h.route === "leaderboard") {
      if (h.params.phase) lbState.phase = h.params.phase === "test" ? "test" : "dev";
      if (h.params.track && TRACKS[h.params.track]) lbState.track = h.params.track;
      renderLeaderboard();
    }

    closeNav();
    if (!firstRender) {
      window.scrollTo(0, 0);
      var heading = $("#page-" + h.route + " h1");
      if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
    }
    firstRender = false;
  }

  /* ---------------- mobile nav ---------------- */
  var toggle = $(".nav-toggle");
  var nav = $("#site-nav");
  function closeNav() { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
  toggle.addEventListener("click", function () {
    var open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("open")) { closeNav(); toggle.focus(); }
  });

  /* ---------------- links from site.json ---------------- */
  function applyLinks() {
    $all("[data-link]").forEach(function (a) {
      var url = site.links[a.getAttribute("data-link")];
      if (url) a.setAttribute("href", url);
    });
  }

  /* ---------------- dates, stage and progress ---------------- */
  function renderDates() {
    var now = Date.now();
    var items = site.dates.map(function (d) { return Object.assign({ t: endOfDay(d.date) }, d); });
    var n = items.length;
    var nextIdx = -1;
    for (var i = 0; i < n; i++) { if (items[i].t >= now) { nextIdx = i; break; } }

    // Timeline
    var list = $("#timeline");
    list.textContent = "";
    items.forEach(function (d, i) {
      var done = d.t < now;
      var isNext = i === nextIdx;
      var fill = 0;
      if (i < n - 1) {
        var nxt = items[i + 1].t;
        fill = now >= nxt ? 100 : done ? Math.round(((now - d.t) / (nxt - d.t)) * 100) : 0;
      }
      var cls = "tl-item" + (d.key ? " key" : "") + (done ? " done" : "") + (isNext ? " next" : "");
      var titleRow = el("div", { class: "tl-title-row" }, [
        el("span", { class: "tl-title", text: d.title }),
        isNext ? el("span", { class: "badge-next", text: "Next, " + inDays(d.t, now) }) : null,
        done ? el("span", { class: "badge-done" }, [checkIcon(), "Done"]) : null
      ]);
      var bottom = null;
      if (i < n - 1) {
        var fillEl = el("span", { class: "tl-line-fill" });
        fillEl.style.height = fill + "%";
        bottom = el("span", { class: "tl-line-bottom" }, [fillEl]);
      }
      list.appendChild(el("li", { class: cls }, [
        el("span", { class: "tl-date", text: d.label }),
        el("div", { class: "tl-rail", "aria-hidden": "true" }, [
          i > 0 ? el("span", { class: "tl-line-top" }) : null,
          bottom,
          el("span", { class: "tl-dot" })
        ]),
        el("div", { class: "tl-body" }, [
          titleRow,
          d.detail ? el("span", { class: "tl-detail", text: d.detail }) : null
        ])
      ]));
    });

    // Stage card(s)
    var stage = "Completed";
    for (var s = 0; s < site.stages.length; s++) {
      if (now < endOfDay(site.stages[s].until)) { stage = site.stages[s].name; break; }
    }
    var start = items[0].t - 30 * DAY, end = items[n - 1].t;
    var pct = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
    var next = items[nextIdx];
    var values = {
      stage: stage,
      pct: pct + "% of the way to the workshop",
      today: "Today: " + fmtDate(now),
      nextTitle: next ? next.title + ", " + next.label : "All milestones are complete",
      nextIn: next ? inDays(next.t, now) : ""
    };
    Object.keys(values).forEach(function (k) {
      $all('[data-bind="' + k + '"]').forEach(function (node) { node.textContent = values[k]; });
    });
    $all(".progress").forEach(function (bar) {
      bar.setAttribute("aria-valuenow", String(pct));
      $(".progress-fill", bar).style.width = pct + "%";
    });

    var note = $('[data-bind="deadlineNote"]');
    if (site.deadlineNote) { note.textContent = site.deadlineNote; note.hidden = false; }
  }

  function checkIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "14"); svg.setAttribute("height", "14"); svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "3");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 12l5 5L20 7");
    svg.appendChild(path);
    return svg;
  }

  /* ---------------- news ---------------- */
  function renderNews() {
    var list = $("#news-list");
    list.textContent = "";
    var news = (site.news || []).map(function (n, i) { return Object.assign({ i: i }, n); })
      .sort(function (a, b) { return a.date === b.date ? a.i - b.i : a.date < b.date ? 1 : -1; });
    if (!news.length) { list.appendChild(el("li", { text: "No news yet." })); return; }
    news.forEach(function (item) {
      list.appendChild(el("li", null, [
        el("time", { class: "news-date", datetime: item.date, text: fmtDate(endOfDay(item.date)) }),
        el("span", { text: item.text })
      ]));
    });
  }

  /* ---------------- organizers ---------------- */
  var TINTS = ["#FFF3D6", "#DCEFEA", "#E7E9F4", "#FBE3D5", "#E8F0DC", "#F1E4EE"];
  function initials(name) {
    var parts = name.split(/\s+/).filter(Boolean);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function renderPeople() {
    var list = $("#people");
    list.textContent = "";
    site.organizers.forEach(function (p, i) {
      var portrait = el("div", { class: "portrait" }, [el("span", { class: "initials", "hidden": "true", text: initials(p.name) })]);
      portrait.style.setProperty("--tint", TINTS[i % TINTS.length]);
      if (p.photo) {
        var img = el("img", { src: p.photo, alt: "Photo of " + p.name, loading: "lazy", width: "600", height: "600" });
        img.addEventListener("error", function () { img.remove(); }); // falls back to initials
        portrait.appendChild(img);
      }
      var meta = [p.role, p.affiliation].filter(Boolean);
      var body = [
        portrait,
        el("div", null, [
          el("p", { class: "person-name", text: p.name }),
          meta.length ? el("p", { class: "person-meta", text: meta[0] }) : null,
          meta.length > 1 ? el("p", { class: "person-meta", text: meta[1] }) : null
        ])
      ];
      var card = p.url ? el("a", { class: "person", href: p.url }, body) : el("div", { class: "person" }, body);
      list.appendChild(el("li", null, [card]));
    });
  }

  /* ---------------- baseline (from site.json) ---------------- */
  function renderBaseline() {
    var b = site.baseline || {};
    $('[data-bind="baselineModel"]').textContent = b.model || "mT5-base";
    var res = b.results || {};
    var tbody = $("#baseline-table tbody");
    tbody.textContent = "";
    function cell(key) {
      var v = res[key];
      return el("td", { text: typeof v === "number" ? v.toFixed(4) : key ? "TBA" : "n/a" });
    }
    tbody.appendChild(el("tr", null, [el("td", { text: "2A" }), cell("2A-bn"), cell("2A-en"), cell("2A-as"), cell("2A-hi"), el("td", { text: "n/a" })]));
    tbody.appendChild(el("tr", null, [el("td", { text: "2B" }), cell("2B-bn"), cell("2B-en"), cell("2B-as"), cell("2B-hi"), cell("2B-all")]));
  }

  /* ---------------- leaderboard (from leaderboard.json) ---------------- */
  function setPressed(selector, attr, value) {
    $all(selector).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute(attr) === value ? "true" : "false"); });
  }
  function emptyState(title, text, linkText) {
    var link = linkText ? el("a", { class: "btn btn-small", href: (site && site.links.evalaiLeaderboard) || "#" , text: linkText }) : null;
    return el("div", { class: "lb-empty" }, [el("h3", { text: title }), el("p", { text: text }), link]);
  }

  function renderLeaderboard() {
    setPressed("[data-phase]", "data-phase", lbState.phase);
    setPressed("[data-track]", "data-track", lbState.track);
    $("#lb-track-title").textContent = TRACKS[lbState.track];
    var body = $("#lb-body");
    var updated = $("#lb-updated");
    body.textContent = "";

    if (!board) { body.appendChild(emptyState("Loading leaderboard…", "")); return; }
    if (board.error) {
      updated.textContent = "";
      body.appendChild(emptyState("The leaderboard could not be loaded", "Check your connection and reload the page, or view the scores directly on EvalAI.", "Open on EvalAI"));
      return;
    }
    updated.textContent = board.updated ? "Updated " + new Date(board.updated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Not synced yet";

    var phase = (board.phases || []).filter(function (p) { return p.key === lbState.phase; })[0];
    var testDate = (site.leaderboard && site.leaderboard.testResultsDate) || "after the evaluation phase";
    if (!phase || !phase.public) {
      if (lbState.phase === "test") {
        body.appendChild(emptyState("Test phase results are not public yet", "Final rankings on the blind test set will be published on " + testDate + ". Your own scores are visible on EvalAI under My Submissions."));
      } else {
        body.appendChild(emptyState("The development leaderboard is not public yet", "It will appear here once the development phase opens and the first submissions are scored.", "Open on EvalAI"));
      }
      return;
    }
    var track = phase.tracks[lbState.track];
    if (!track || !track.entries.length) {
      body.appendChild(emptyState("No submissions on this track yet", "Submit on EvalAI and your team will appear here within the hour.", "Open on EvalAI"));
      return;
    }

    var labels = track.labels;
    var headRow = el("tr", null, [el("th", { scope: "col", text: "Rank" }), el("th", { scope: "col", text: "Team" }), el("th", { scope: "col", text: "Method" })]
      .concat(labels.map(function (l) { return el("th", { scope: "col", class: l === track.orderBy ? "official" : null, text: l }); })));
    var rows = track.entries.map(function (e) {
      var rankCell;
      if (e.rank === null) rankCell = el("td", { text: "–" });
      else if (e.rank <= 3) rankCell = el("td", null, [el("span", { class: "medal medal-" + e.rank, text: String(e.rank) })]);
      else rankCell = el("td", { text: String(e.rank) });
      var teamCell = el("td", { class: "team" }, [e.team, e.baseline ? el("span", { class: "baseline-tag", text: "baseline" }) : null]);
      var cells = [rankCell, teamCell, el("td", { class: "method", text: e.method || "" })].concat(labels.map(function (l) {
        var v = e.scores[l];
        return el("td", { class: l === track.orderBy ? "official" : null, text: typeof v === "number" ? v.toFixed(4) : "–" });
      }));
      return el("tr", { class: (e.baseline ? "is-baseline" : "") + (e.rank && e.rank <= 3 ? " rank-" + e.rank : "") }, cells);
    });
    var table = el("table", { class: "lb-table" }, [
      el("caption", { class: "sr-only", text: phase.name + ": " + TRACKS[lbState.track] + ", ranked by " + track.orderBy }),
      el("thead", null, [headRow]),
      el("tbody", null, rows)
    ]);
    body.appendChild(el("div", { class: "scroll-x" }, [table]));
  }

  $all("[data-phase]").forEach(function (b) {
    b.addEventListener("click", function () { lbState.phase = b.getAttribute("data-phase"); syncLbHash(); renderLeaderboard(); });
  });
  $all("[data-track]").forEach(function (b) {
    b.addEventListener("click", function () { lbState.track = b.getAttribute("data-track"); syncLbHash(); renderLeaderboard(); });
  });
  function syncLbHash() {
    // Keep the selection in the URL so a specific leaderboard can be shared.
    history.replaceState(null, "", "#leaderboard?phase=" + lbState.phase + "&track=" + lbState.track);
  }

  /* ---------------- copy BibTeX ---------------- */
  var copyBtn = $("#copy-bib");
  copyBtn.addEventListener("click", function () {
    var text = $("#bibtex").textContent;
    var done = function () { copyBtn.textContent = "Copied"; setTimeout(function () { copyBtn.textContent = "Copy BibTeX"; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { copyBtn.textContent = "Select the text to copy"; });
  });

  /* ---------------- start ---------------- */
  window.addEventListener("hashchange", showRoute);
  showRoute();

  getJSON("data/site.json").then(function (data) {
    site = data;
    applyLinks();
    renderDates();
    renderNews();
    renderPeople();
    renderBaseline();
    renderLeaderboard();
  }).catch(function (err) {
    console.error(err);
    $all('[data-bind="stage"]').forEach(function (n) { n.textContent = "Could not load site data"; });
  });

  getJSON("data/leaderboard.json").then(function (data) { board = data; }).catch(function (err) {
    console.error(err);
    board = { error: true };
  }).then(function () { if (site) renderLeaderboard(); });

  // Keep "Next in N days" fresh for visitors who leave the tab open.
  setInterval(function () { if (site) renderDates(); }, 60 * 60 * 1000);
})();
