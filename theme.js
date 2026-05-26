/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   전국민 혜택존 v4 - 금융 정부혜택 + approved 연동 + 🆕 배지
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  var BASE = 'https://raw.githubusercontent.com/kjjin6280/korea-benefits/main/data/';
  var URLS = {
    subsidies: BASE + 'subsidies.json',
    business:  BASE + 'business.json',
    housing:   BASE + 'housing.json',
    medical:   BASE + 'medical.json',
    finance:   BASE + 'finance.json',
    approved:  BASE + 'approved.json',
    posted:    BASE + 'posted_urls.json',
    meta:      BASE + 'meta.json'
  };

  var TABS = [
    { key: 'subsidies', icon: '💰', label: '정부지원·민생' },
    { key: 'business',  icon: '🏢', label: '소상공인·정책자금' },
    { key: 'housing',   icon: '🏠', label: '주거·부동산' },
    { key: 'medical',   icon: '🏥', label: '의료·건강' },
    { key: 'finance',   icon: '💡', label: '금융·서민대출' }
  ];

  var REGIONS_ROW1 = ['전국','서울','부산','대구','인천','광주','대전','울산','세종'];
  var REGIONS_ROW2 = ['경기','강원','충북','충남','전북','전남','경북','경남','제주'];
  var PER_PAGE = 20;

  /* 금융 유형 정렬 순서 */
  var FINANCE_TYPE_ORDER = {
    '서민대출': 0,
    '대출이자 감면': 1,
    '청년 금융': 2,
    '전세·주택대출': 3,
    '신용회복': 4,
    '보증지원': 5,
    '학자금': 6,
    '기타 금융': 7
  };

  /* 금융 유형별 배지 색상 클래스 */
  var FINANCE_TYPE_CLS = {
    '서민대출': 'badge-finance-loan',
    '대출이자 감면': 'badge-finance-rate',
    '청년 금융': 'badge-finance-youth',
    '전세·주택대출': 'badge-finance-house',
    '신용회복': 'badge-finance-recovery',
    '보증지원': 'badge-finance-guarantee',
    '학자금': 'badge-finance-edu',
    '기타 금융': 'badge-always'
  };

  var state = {
    currentTab: 'subsidies',
    currentRegion: '전국',
    showCount: PER_PAGE,
    data: { subsidies:[], business:[], housing:[], medical:[], finance:[] },
    approved: {},
    posted: {},
    meta: {},
    loaded: 0,
    totalToLoad: 8
  };

  /* ===== 유틸 ===== */
  function getToday() {
    var n = new Date();
    return new Date(n.getTime() + 9*3600000).toISOString().slice(0,10);
  }
  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }
  var TODAY = getToday();

  function uniqueByName(arr) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i].name]) { seen[arr[i].name] = true; out.push(arr[i]); }
    }
    return out;
  }

  /* ===== approved.json 필터 ===== */
  function filterApproved(items, catKey) {
    var cat = state.approved[catKey];
    /* approved.json이 비어있거나 approved 배열이 없으면 → 전체 표시 */
    if (!cat || !cat.approved || cat.approved.length === 0) {
      /* rejected 항목만 제거 */
      if (cat && cat.rejected && cat.rejected.length > 0) {
        var rejSet = {};
        for (var r = 0; r < cat.rejected.length; r++) rejSet[cat.rejected[r]] = true;
        var filtered = [];
        for (var i = 0; i < items.length; i++) {
          if (!rejSet[items[i].id]) filtered.push(items[i]);
        }
        return filtered;
      }
      return items;
    }
    /* approved 목록이 있으면 → 승인된 것만 표시 */
    var appSet = {};
    for (var a = 0; a < cat.approved.length; a++) appSet[cat.approved[a]] = true;
    var result = [];
    for (var j = 0; j < items.length; j++) {
      if (appSet[items[j].id]) result.push(items[j]);
    }
    return result;
  }

  /* ===== 다크/라이트 ===== */
  function initThemeToggle() {
    var saved = localStorage.getItem('benefits-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.textContent = saved === 'dark' ? '☀️' : '🌙';
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var nxt = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nxt);
      localStorage.setItem('benefits-theme', nxt);
      btn.textContent = nxt === 'dark' ? '☀️' : '🌙';
    });
  }

  /* ===== 데이터 로딩 ===== */
  function fetchJSON(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url + '?t=' + Date.now(), true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) {
        if (x.status === 200) {
          try { cb(JSON.parse(x.responseText)); } catch(e) { cb(null); }
        } else { cb(null); }
      }
    };
    x.send();
  }

  function loadAllData() {
    fetchJSON(URLS.subsidies, function(d){ state.data.subsidies=d||[]; checkReady(); });
    fetchJSON(URLS.business,  function(d){ state.data.business=d||[];  checkReady(); });
    fetchJSON(URLS.housing,   function(d){ state.data.housing=d||[];   checkReady(); });
    fetchJSON(URLS.medical,   function(d){ state.data.medical=d||[];   checkReady(); });
    fetchJSON(URLS.finance,   function(d){ state.data.finance=d||[];   checkReady(); });
    fetchJSON(URLS.approved,  function(d){ state.approved=d||{};       checkReady(); });
    fetchJSON(URLS.posted,    function(d){ state.posted=d||{};         checkReady(); });
    fetchJSON(URLS.meta,      function(d){ state.meta=d||{};           checkReady(); });
  }

  function checkReady() {
    state.loaded++;
    if (state.loaded >= state.totalToLoad) render();
  }

  /* ===== 마감일 계산 ===== */
  function calcDeadline(item) {
    var dl = item.deadline || '';
    if (!dl || dl === '상시' || dl === '상시모집') {
      return { type:'always', remain:9999, label:'상시모집', cls:'badge-always' };
    }
    if (dl === '예산소진시') {
      return { type:'budget', remain:0, label:'예산소진시', cls:'badge-budget' };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dl)) {
      var p = dl.split('-');
      var dd = new Date(parseInt(p[0]), parseInt(p[1])-1, parseInt(p[2]));
      var tp = TODAY.split('-');
      var td = new Date(parseInt(tp[0]), parseInt(tp[1])-1, parseInt(tp[2]));
      var diff = Math.ceil((dd - td) / 86400000);
      if (diff < 0) return { type:'expired', remain:diff, label:'마감', cls:'' };
      if (diff === 0) return { type:'urgent', remain:0, label:'오늘마감', cls:'badge-urgent' };
      if (diff <= 7) return { type:'urgent', remain:diff, label:'D-'+diff, cls:'badge-urgent' };
      return { type:'normal', remain:diff, label:'D-'+diff, cls:'badge-always' };
    }
    return { type:'always', remain:9999, label:'상시모집', cls:'badge-always' };
  }

  /* ===== 정렬 (일반 카테고리) ===== */
  function getSortPriority(t) {
    switch(t) {
      case 'urgent': return 0;
      case 'budget': return 1;
      case 'normal': return 2;
      case 'always': return 3;
      default: return 4;
    }
  }

  function sortItems(items) {
    var f = [];
    for (var i = 0; i < items.length; i++) {
      var info = calcDeadline(items[i]);
      if (info.type !== 'expired') {
        items[i]._dlInfo = info;
        f.push(items[i]);
      }
    }
    f.sort(function(a, b) {
      var pa = getSortPriority(a._dlInfo.type);
      var pb = getSortPriority(b._dlInfo.type);
      if (pa !== pb) return pa - pb;
      if (pa === 0) return a._dlInfo.remain - b._dlInfo.remain;
      return (b.trend_score || 0) - (a.trend_score || 0);
    });
    return f;
  }

  /* ===== 정렬 (금융 탭) ===== */
  function sortFinance(items) {
    var f = [];
    for (var i = 0; i < items.length; i++) {
      var info = calcDeadline(items[i]);
      if (info.type !== 'expired') {
        items[i]._dlInfo = info;
        f.push(items[i]);
      }
    }
    f.sort(function(a, b) {
      var oa = FINANCE_TYPE_ORDER[a.finance_type] !== undefined ? FINANCE_TYPE_ORDER[a.finance_type] : 99;
      var ob = FINANCE_TYPE_ORDER[b.finance_type] !== undefined ? FINANCE_TYPE_ORDER[b.finance_type] : 99;
      if (oa !== ob) return oa - ob;
      return (b.trend_score || 0) - (a.trend_score || 0);
    });
    return f;
  }

  /* ===== 지역 필터 ===== */
  function filterByRegion(items, region) {
    if (region === '전국') return items;
    var r = [];
    for (var i = 0; i < items.length; i++) {
      var ir = items[i].region || '전국';
      if (ir === region || ir === '전국') r.push(items[i]);
    }
    return r;
  }

  function getRegionCount(items, region) {
    if (region === '전국') return items.length;
    var c = 0;
    for (var i = 0; i < items.length; i++) {
      var ir = items[i].region || '전국';
      if (ir === region || ir === '전국') c++;
    }
    return c;
  }

  /* ===== 토스트 ===== */
  function showToast(msg) {
    var el = document.getElementById('toastMsg');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function(){ el.classList.remove('show'); }, 3000);
  }

  /* ===== 카드 클릭 ===== */
  function handleCardClick(item) {
    var p = state.posted[item.id];
    if (p) {
      window.location.href = p;
    } else {
      window.open(item.url, '_blank');
      showToast('📝 이 혜택의 상세 포스팅을 준비 중입니다!');
    }
  }

  /* ===== 🆕 신규 배지 여부 ===== */
  function isNewItem(item) {
    return item.collected_date === TODAY;
  }

  /* ===== 카드 HTML 생성 ===== */
  function buildCard(item, isFinance) {
    var card = document.createElement('div');
    card.className = 'card';
    if (isNewItem(item)) card.classList.add('card-new');

    var dl = item._dlInfo || calcDeadline(item);
    var badgesHtml = '<div class="card-badges">';

    /* 🆕 신규 배지 */
    if (isNewItem(item)) {
      badgesHtml += '<span class="badge badge-new">🆕 NEW</span>';
    }

    if (isFinance) {
      /* 금융 탭: finance_type 배지 */
      var ft = item.finance_type || '기타 금융';
      var ftCls = FINANCE_TYPE_CLS[ft] || 'badge-always';
      badgesHtml += '<span class="badge ' + ftCls + '">' + esc(ft) + '</span>';
    }

    /* 마감일 배지 */
    badgesHtml += '<span class="badge ' + dl.cls + '">' + dl.label + '</span>';

    /* 지역 배지 */
    if (item.region && item.region !== '전국') {
      badgesHtml += '<span class="badge badge-region">' + esc(item.region) + '</span>';
    }

    badgesHtml += '</div>';

    card.innerHTML = badgesHtml +
      '<div class="card-title">' + esc(item.name) + '</div>' +
      '<div class="card-desc">' + esc(item.desc) + '</div>' +
      '<div class="card-meta">' +
        '<span class="card-org">' + esc(item.org) + '</span>' +
        '<span>' + esc(item.region || '전국') + '</span>' +
      '</div>';

    card.addEventListener('click', function(){ handleCardClick(item); });
    return card;
  }

  /* ===== 탭 메뉴 ===== */
  function buildTabMenu() {
    var c = document.getElementById('benefitsTabs');
    if (!c) return;
    c.innerHTML = '';
    c.className = 'tabs-outer';

    var nav = document.createElement('div');
    nav.className = 'nav-tabs';

    for (var i = 0; i < TABS.length; i++) {
      (function(tab) {
        var items = state.data[tab.key] || [];
        var newCnt = 0;
        for (var j = 0; j < items.length; j++) {
          if (isNewItem(items[j])) newCnt++;
        }

        var btn = document.createElement('div');
        btn.className = 'nav-tab' + (tab.key === state.currentTab ? ' active' : '');
        var label = tab.icon + ' ' + tab.label;
        if (newCnt > 0) label += ' 🆕' + newCnt;
        btn.textContent = label;
        btn.addEventListener('click', function() {
          state.currentTab = tab.key;
          state.currentRegion = '전국';
          state.showCount = PER_PAGE;
          renderAll();
        });
        nav.appendChild(btn);
      })(TABS[i]);
    }

    c.appendChild(nav);
  }

  /* ===== 지역 필터 UI (금융 탭도 포함) ===== */
  function buildRegionFilter() {
    var c = document.getElementById('regionFilter');
    if (!c) return;
    c.className = 'region-outer';

    var items = state.data[state.currentTab] || [];

    var h = '<div class="region-filter"><div class="region-row">';
    for (var i = 0; i < REGIONS_ROW1.length; i++) {
      var r = REGIONS_ROW1[i];
      var cnt = getRegionCount(items, r);
      var act = r === state.currentRegion ? ' active' : '';
      h += '<button class="region-btn' + act + '" data-region="' + r + '">' + r;
      if (cnt > 0) h += ' <span class="region-count">' + cnt + '</span>';
      h += '</button>';
    }
    h += '</div><div class="region-row">';
    for (var j = 0; j < REGIONS_ROW2.length; j++) {
      var r2 = REGIONS_ROW2[j];
      var cnt2 = getRegionCount(items, r2);
      var act2 = r2 === state.currentRegion ? ' active' : '';
      h += '<button class="region-btn' + act2 + '" data-region="' + r2 + '">' + r2;
      if (cnt2 > 0) h += ' <span class="region-count">' + cnt2 + '</span>';
      h += '</button>';
    }
    h += '</div></div>';

    c.innerHTML = h;

    var btns = c.querySelectorAll('.region-btn');
    for (var k = 0; k < btns.length; k++) {
      btns[k].addEventListener('click', function() {
        state.currentRegion = this.getAttribute('data-region');
        state.showCount = PER_PAGE;
        renderAll();
      });
    }
  }

  /* ===== 카드 영역 렌더링 ===== */
  function renderCards() {
    var c = document.getElementById('benefitsCards');
    if (!c) return;
    c.innerHTML = '';

    var isF = state.currentTab === 'finance';
    var items = state.data[state.currentTab] || [];

    /* approved.json 필터 적용 */
    items = filterApproved(items, state.currentTab);

    /* 지역 필터 (금융 포함) */
    items = filterByRegion(items, state.currentRegion);

    /* 정렬 */
    if (isF) {
      items = sortFinance(items);
    } else {
      items = sortItems(items);
    }

    var total = items.length;

    /* 상단 결과 정보 */
    var info = document.createElement('div');
    info.className = 'result-info';
    var infoText = '<span>총 <span class="result-count">' + total + '</span>건</span>';
    if (isF) {
      /* 금융 유형별 소계 */
      var typeCounts = {};
      for (var t = 0; t < items.length; t++) {
        var ft = items[t].finance_type || '기타 금융';
        typeCounts[ft] = (typeCounts[ft] || 0) + 1;
      }
      var typeLabels = [];
      for (var key in FINANCE_TYPE_ORDER) {
        if (typeCounts[key]) typeLabels.push(key + ' ' + typeCounts[key]);
      }
      if (typeLabels.length > 0) {
        infoText += '<span class="finance-summary">' + typeLabels.join(' · ') + '</span>';
      }
    }
    info.innerHTML = infoText;
    c.appendChild(info);

    /* 빈 상태 */
    if (total === 0) {
      var g = document.createElement('div');
      g.className = 'card-grid';
      g.innerHTML = '<div class="empty-state">😢 해당 조건의 혜택 정보가 없습니다.</div>';
      c.appendChild(g);
      return;
    }

    /* 카드 그리드 */
    var grid = document.createElement('div');
    grid.className = 'card-grid';
    var lim = Math.min(state.showCount, total);
    for (var i = 0; i < lim; i++) {
      grid.appendChild(buildCard(items[i], isF));
    }
    c.appendChild(grid);

    /* 더 보기 버튼 */
    if (lim < total) {
      var w = document.createElement('div');
      w.className = 'load-more-wrap';
      var btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.textContent = '더 보기 (' + lim + ' / ' + total + ')';
      btn.addEventListener('click', function() {
        state.showCount += PER_PAGE;
        renderCards();
      });
      w.appendChild(btn);
      c.appendChild(w);
    }
  }

  /* ===== 사이드바 ===== */
  function buildSidebar() {
    var c = document.getElementById('benefitsSidebar');
    if (!c) return;
    c.innerHTML = '';

    /* 5개 카테고리 각 TOP 5 */
    var cats = [
      { key:'subsidies', icon:'💰', label:'정부지원·민생' },
      { key:'business',  icon:'🏢', label:'소상공인·정책자금' },
      { key:'housing',   icon:'🏠', label:'주거·부동산' },
      { key:'medical',   icon:'🏥', label:'의료·건강' },
      { key:'finance',   icon:'💡', label:'금융·서민대출' }
    ];

    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      var arr = state.data[cat.key] || [];
      if (arr.length === 0) continue;

      /* 트렌드 점수순 정렬 + 중복 이름 제거 */
      var sorted = arr.slice().sort(function(a, b) {
        return (b.trend_score || 0) - (a.trend_score || 0);
      });
      sorted = uniqueByName(sorted);

      var sec = document.createElement('div');
      sec.className = 'sidebar-section';
      var html = '<div class="sidebar-title">' + cat.icon + ' ' + cat.label + '</div>';
      var max = Math.min(sorted.length, 5);
      var clickItems = [];

      for (var si = 0; si < max; si++) {
        var item = sorted[si];
        clickItems.push(item);

        var dl = calcDeadline(item);
        var isNew = isNewItem(item);

        html += '<div class="sidebar-item" data-idx="' + si + '">';
        html += '<span class="sidebar-rank">' + (si + 1) + '</span>';
        html += '<span class="sidebar-item-title">';
        if (isNew) html += '<span class="sidebar-new">🆕</span> ';
        html += esc(item.name) + '</span>';

        /* 금융 카테고리면 finance_type 배지 */
        if (cat.key === 'finance' && item.finance_type) {
          var ftCls = FINANCE_TYPE_CLS[item.finance_type] || 'badge-always';
          html += '<span class="badge ' + ftCls + '">' + esc(item.finance_type) + '</span>';
        } else {
          html += '<span class="badge ' + dl.cls + '">' + dl.label + '</span>';
        }

        html += '</div>';
      }
      sec.innerHTML = html;
      c.appendChild(sec);

      /* 클릭 이벤트 */
      (function(items) {
        var els = sec.querySelectorAll('.sidebar-item');
        for (var e = 0; e < els.length; e++) {
          (function(idx) {
            els[idx].addEventListener('click', function() { handleCardClick(items[idx]); });
          })(e);
        }
      })(clickItems);
    }

    /* 업데이트 시간 */
    if (state.meta && state.meta.updated_at) {
      var up = document.createElement('div');
      up.className = 'sidebar-update';
      var newToday = state.meta.new_today || {};
      var totalNew = 0;
      for (var nk in newToday) totalNew += (newToday[nk] || 0);
      up.innerHTML = '🕐 ' + esc(state.meta.updated_at) + ' 업데이트';
      if (totalNew > 0) {
        up.innerHTML += '<br><span style="color:var(--badge-urgent-text);font-weight:600;">🆕 오늘 신규 ' + totalNew + '건</span>';
      }
      c.appendChild(up);
    }
  }

  /* ===== 렌더링 ===== */
  function renderAll() {
    buildTabMenu();
    buildRegionFilter();
    renderCards();
    buildSidebar();
  }

  function render() {
    var ld = document.getElementById('loadingIndicator');
    if (ld) ld.classList.add('hidden');
    console.log('혜택존 v4 로드 완료');
    console.log('  💰', state.data.subsidies.length,
                '🏢', state.data.business.length,
                '🏠', state.data.housing.length,
                '🏥', state.data.medical.length,
                '💡', state.data.finance.length);
    renderAll();
  }

  function init() {
    initThemeToggle();
    loadAllData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
