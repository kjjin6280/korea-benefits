/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   전국민 혜택존 v5 — GitHub Token 관리자 인증
   ?admin=1 → Token 검증 → 관리자 패널
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  /* ───── GitHub 설정 ───── */
  var GH_OWNER  = 'kjjin6280';
  var GH_REPO   = 'korea-benefits';
  var GH_BRANCH = 'main';
  var GH_FILE   = 'data/approved.json';
  var GH_API    = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO;

  var BASE = 'https://raw.githubusercontent.com/' + GH_OWNER + '/' + GH_REPO + '/' + GH_BRANCH + '/data/';
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

  var FINANCE_TYPE_ORDER = {
    '서민대출':0,'대출이자 감면':1,'청년 금융':2,'전세·주택대출':3,
    '신용회복':4,'보증지원':5,'학자금':6,'기타 금융':7
  };
  var FINANCE_TYPE_CLS = {
    '서민대출':'badge-finance-loan','대출이자 감면':'badge-finance-rate',
    '청년 금융':'badge-finance-youth','전세·주택대출':'badge-finance-house',
    '신용회복':'badge-finance-recovery','보증지원':'badge-finance-guarantee',
    '학자금':'badge-finance-edu','기타 금융':'badge-always'
  };

  /* ───── 상태 ───── */
  var state = {
    currentTab: 'subsidies',
    currentRegion: '전국',
    showCount: PER_PAGE,
    data: { subsidies:[], business:[], housing:[], medical:[], finance:[] },
    approved: {},
    posted: {},
    meta: {},
    loaded: 0,
    totalToLoad: 8,
    /* 관리자 */
    isAdmin: false,
    ghToken: '',
    adminTab: 'subsidies',
    adminSearch: '',
    adminRegion: '',
    adminDate: '',
    adminStatus: ''
  };

  /* ───── 유틸 ───── */
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

  /* ───── approved 필터 (일반 모드용) ───── */
  function filterApproved(items, catKey) {
    var cat = state.approved[catKey];
    if (!cat || !cat.approved || cat.approved.length === 0) return [];
    var appSet = {}, rejSet = {};
    for (var a = 0; a < cat.approved.length; a++) appSet[cat.approved[a]] = true;
    if (cat.rejected) { for (var r = 0; r < cat.rejected.length; r++) rejSet[cat.rejected[r]] = true; }
    return items.filter(function(it){ return appSet[it.id] && !rejSet[it.id]; });
  }

  /* ───── 다크/라이트 ───── */
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

  /* ───── 데이터 로딩 ───── */
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

  /* ───── 마감일 계산 ───── */
  function calcDeadline(item) {
    var dl = item.deadline || '';
    if (!dl || dl === '상시' || dl === '상시모집')
      return { type:'always', remain:9999, label:'상시모집', cls:'badge-always' };
    if (dl === '예산소진시')
      return { type:'budget', remain:0, label:'예산소진시', cls:'badge-budget' };
    if (/^\d{4}-\d{2}-\d{2}$/.test(dl)) {
      var p = dl.split('-');
      var dd = new Date(+p[0], +p[1]-1, +p[2]);
      var tp = TODAY.split('-');
      var td = new Date(+tp[0], +tp[1]-1, +tp[2]);
      var diff = Math.ceil((dd - td) / 86400000);
      if (diff < 0) return { type:'expired', remain:diff, label:'마감', cls:'' };
      if (diff === 0) return { type:'urgent', remain:0, label:'오늘마감', cls:'badge-urgent' };
      if (diff <= 7) return { type:'urgent', remain:diff, label:'D-'+diff, cls:'badge-urgent' };
      return { type:'normal', remain:diff, label:'D-'+diff, cls:'badge-always' };
    }
    return { type:'always', remain:9999, label:'상시모집', cls:'badge-always' };
  }

  function getSortPriority(t) {
    switch(t){ case 'urgent':return 0; case 'budget':return 1; case 'normal':return 2; case 'always':return 3; default:return 4; }
  }

  function sortItems(items) {
    var f = [];
    for (var i = 0; i < items.length; i++) {
      var info = calcDeadline(items[i]);
      if (info.type !== 'expired') { items[i]._dlInfo = info; f.push(items[i]); }
    }
    f.sort(function(a, b) {
      var pa = getSortPriority(a._dlInfo.type), pb = getSortPriority(b._dlInfo.type);
      if (pa !== pb) return pa - pb;
      if (pa === 0) return a._dlInfo.remain - b._dlInfo.remain;
      return (b.trend_score||0) - (a.trend_score||0);
    });
    return f;
  }

  function sortFinance(items) {
    var f = [];
    for (var i = 0; i < items.length; i++) {
      var info = calcDeadline(items[i]);
      if (info.type !== 'expired') { items[i]._dlInfo = info; f.push(items[i]); }
    }
    f.sort(function(a, b) {
      var oa = FINANCE_TYPE_ORDER[a.finance_type] !== undefined ? FINANCE_TYPE_ORDER[a.finance_type] : 99;
      var ob = FINANCE_TYPE_ORDER[b.finance_type] !== undefined ? FINANCE_TYPE_ORDER[b.finance_type] : 99;
      if (oa !== ob) return oa - ob;
      return (b.trend_score||0) - (a.trend_score||0);
    });
    return f;
  }

  function filterByRegion(items, region) {
    if (region === '전국') return items;
    return items.filter(function(it){ var r = it.region||'전국'; return r === region; });
  }

  function getRegionCount(items, region) {
    if (region === '전국') return items.length;
    var c = 0;
    for (var i = 0; i < items.length; i++) { var r = items[i].region||'전국'; if (r === region) c++; }
    return c;
  }

  /* ───── 토스트 ───── */
  function showToast(msg) {
    var el = document.getElementById('toastMsg');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function(){ el.classList.remove('show'); }, 3000);
  }

  function handleCardClick(item) {
    var p = state.posted[item.id];
    if (p) { window.location.href = p; }
    else { window.open(item.url, '_blank'); showToast('📝 이 혜택의 상세 포스팅을 준비 중입니다!'); }
  }

  function isNewItem(item) { return item.collected_date === TODAY; }

  /* ========================================
     일반 모드 (블로그 표시)
     ======================================== */

  function buildCard(item, isFinance) {
    var card = document.createElement('div');
    card.className = 'card';
    if (isNewItem(item)) card.classList.add('card-new');
    var dl = item._dlInfo || calcDeadline(item);
    var bh = '<div class="card-badges">';
    if (isNewItem(item)) bh += '<span class="badge badge-new">🆕 NEW</span>';
    if (isFinance) {
      var ft = item.finance_type || '기타 금융';
      bh += '<span class="badge ' + (FINANCE_TYPE_CLS[ft]||'badge-always') + '">' + esc(ft) + '</span>';
    }
    bh += '<span class="badge ' + dl.cls + '">' + dl.label + '</span>';
    if (item.region && item.region !== '전국') bh += '<span class="badge badge-region">' + esc(item.region) + '</span>';
    bh += '</div>';
    card.innerHTML = bh +
      '<div class="card-title">' + esc(item.name) + '</div>' +
      '<div class="card-desc">' + esc(item.desc) + '</div>' +
      '<div class="card-meta"><span class="card-org">' + esc(item.org) + '</span><span>' + esc(item.region||'전국') + '</span></div>';
    card.addEventListener('click', function(){ handleCardClick(item); });
    return card;
  }

  function buildTabMenu() {
    var c = document.getElementById('benefitsTabs');
    if (!c) return;
    c.innerHTML = ''; c.className = 'tabs-outer';
    var nav = document.createElement('div'); nav.className = 'nav-tabs';
    for (var i = 0; i < TABS.length; i++) {
      (function(tab) {
        var items = filterApproved(state.data[state.currentTab] || [], state.currentTab);
        var nc = 0; for (var j=0;j<items.length;j++) if(isNewItem(items[j]))nc++;
        var btn = document.createElement('div');
        btn.className = 'nav-tab' + (tab.key === state.currentTab ? ' active' : '');
        var lbl = tab.icon + ' ' + tab.label + ' 총' + items.length;
        if (nc > 0) lbl += ' 🆕' + nc;
        btn.textContent = lbl;
        btn.addEventListener('click', function() {
          state.currentTab = tab.key; state.currentRegion = '전국'; state.showCount = PER_PAGE; renderAll();
        });
        nav.appendChild(btn);
      })(TABS[i]);
    }
    c.appendChild(nav);
  }

  function buildRegionFilter() {
    var c = document.getElementById('regionFilter');
    if (!c) return;
    c.className = 'region-outer';
    var items = filterApproved(state.data[state.currentTab]||[], state.currentTab);
    var h = '<div class="region-filter"><div class="region-row">';
    for (var i=0;i<REGIONS_ROW1.length;i++) {
      var r=REGIONS_ROW1[i],cnt=getRegionCount(items,r),act=r===state.currentRegion?' active':'';
      h+='<button class="region-btn'+act+'" data-region="'+r+'">'+r;
      if(cnt>0)h+=' <span class="region-count">'+cnt+'</span>';
      h+='</button>';
    }
    h+='</div><div class="region-row">';
    for(var j=0;j<REGIONS_ROW2.length;j++){
      var r2=REGIONS_ROW2[j],cnt2=getRegionCount(items,r2),act2=r2===state.currentRegion?' active':'';
      h+='<button class="region-btn'+act2+'" data-region="'+r2+'">'+r2;
      if(cnt2>0)h+=' <span class="region-count">'+cnt2+'</span>';
      h+='</button>';
    }
    h+='</div></div>';
    c.innerHTML = h;
    var btns = c.querySelectorAll('.region-btn');
    for(var k=0;k<btns.length;k++) btns[k].addEventListener('click',function(){
      state.currentRegion=this.getAttribute('data-region'); state.showCount=PER_PAGE; renderAll();
    });
  }

  function renderCards() {
    var c = document.getElementById('benefitsCards');
    if (!c) return;
    c.innerHTML = '';
    var isF = state.currentTab === 'finance';
    var items = (state.data[state.currentTab]||[]).slice();
    items = filterApproved(items, state.currentTab);
    items = filterByRegion(items, state.currentRegion);
    items = isF ? sortFinance(items) : sortItems(items);
    var total = items.length;

    var info = document.createElement('div'); info.className = 'result-info';
    var it = '<span>총 <span class="result-count">' + total + '</span>건</span>';
    if (isF) {
      var tc={}; for(var t=0;t<items.length;t++){var ft=items[t].finance_type||'기타 금융';tc[ft]=(tc[ft]||0)+1;}
      var tl=[]; for(var k in FINANCE_TYPE_ORDER)if(tc[k])tl.push(k+' '+tc[k]);
      if(tl.length)it+='<span class="finance-summary">'+tl.join(' · ')+'</span>';
    }
    info.innerHTML = it; c.appendChild(info);

    if (!total) {
      var g=document.createElement('div');g.className='card-grid';
      g.innerHTML='<div class="empty-state">😢 해당 조건의 혜택 정보가 없습니다.</div>';
      c.appendChild(g); return;
    }
    var grid=document.createElement('div');grid.className='card-grid';
    var lim=Math.min(state.showCount,total);
    for(var i=0;i<lim;i++) grid.appendChild(buildCard(items[i],isF));
    c.appendChild(grid);
    if(lim<total){
      var w=document.createElement('div');w.className='load-more-wrap';
      var btn=document.createElement('button');btn.className='load-more-btn';
      btn.textContent='더 보기 ('+lim+' / '+total+')';
      btn.addEventListener('click',function(){state.showCount+=PER_PAGE;renderCards();});
      w.appendChild(btn);c.appendChild(w);
    }
  }

  function buildSidebar() {
    var c = document.getElementById('benefitsSidebar');
    if (!c) return;
    c.innerHTML = '';
    var cats=[
      {key:'subsidies',icon:'💰',label:'정부지원·민생'},
      {key:'business',icon:'🏢',label:'소상공인·정책자금'},
      {key:'housing',icon:'🏠',label:'주거·부동산'},
      {key:'medical',icon:'🏥',label:'의료·건강'},
      {key:'finance',icon:'💡',label:'금융·서민대출'}
    ];
    for(var ci=0;ci<cats.length;ci++){
      var cat=cats[ci],arr=filterApproved(state.data[cat.key]||[], cat.key);
      if(!arr.length)continue;
      var sorted=arr.slice().sort(function(a,b){return(b.trend_score||0)-(a.trend_score||0);});
      sorted=uniqueByName(sorted);
      var sec=document.createElement('div');sec.className='sidebar-section';
      var html='<div class="sidebar-title">'+cat.icon+' '+cat.label+'</div>';
      var mx=Math.min(sorted.length,5),clickItems=[];
      for(var si=0;si<mx;si++){
        var item=sorted[si];clickItems.push(item);
        var dl=calcDeadline(item),isN=isNewItem(item);
        html+='<div class="sidebar-item" data-idx="'+si+'"><span class="sidebar-rank">'+(si+1)+'</span><span class="sidebar-item-title">';
        if(isN)html+='<span class="sidebar-new">🆕</span> ';
        html+=esc(item.name)+'</span>';
        if(cat.key==='finance'&&item.finance_type){
          html+='<span class="badge '+(FINANCE_TYPE_CLS[item.finance_type]||'badge-always')+'">'+esc(item.finance_type)+'</span>';
        }else{html+='<span class="badge '+dl.cls+'">'+dl.label+'</span>';}
        html+='</div>';
      }
      sec.innerHTML=html;c.appendChild(sec);
      (function(items){
        var els=sec.querySelectorAll('.sidebar-item');
        for(var e=0;e<els.length;e++)(function(idx){
          els[idx].addEventListener('click',function(){handleCardClick(items[idx]);});
        })(e);
      })(clickItems);
    }
    if(state.meta&&state.meta.updated_at){
      var up=document.createElement('div');up.className='sidebar-update';
      var nt=state.meta.new_today||{},tn=0;for(var nk in nt)tn+=(nt[nk]||0);
      up.innerHTML='🕐 '+esc(state.meta.updated_at)+' 업데이트';
      if(tn>0)up.innerHTML+='<br><span style="color:var(--badge-urgent-text);font-weight:600;">🆕 오늘 신규 '+tn+'건</span>';
      c.appendChild(up);
    }
  }

  function renderAll() {
    buildTabMenu(); buildRegionFilter(); renderCards(); buildSidebar();
  }

  /* ========================================
     관리자 모드
     ======================================== */

  /* --- GitHub API: Token 유효성 검증 --- */
  function verifyToken(token, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', GH_API, true);
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.setRequestHeader('Accept', 'application/vnd.github+json');
    x.onreadystatechange = function() {
      if (x.readyState === 4) {
        if (x.status === 200) {
          try {
            var data = JSON.parse(x.responseText);
            cb(data.permissions && data.permissions.push);
          } catch(e) { cb(false); }
        } else { cb(false); }
      }
    };
    x.send();
  }

  /* --- GitHub API: 파일 저장 (커밋) --- */
  function saveToGitHub(token, content, cb) {
    /* 먼저 기존 파일의 sha를 가져옴 */
    var x1 = new XMLHttpRequest();
    x1.open('GET', GH_API + '/contents/' + GH_FILE + '?ref=' + GH_BRANCH, true);
    x1.setRequestHeader('Authorization', 'Bearer ' + token);
    x1.setRequestHeader('Accept', 'application/vnd.github+json');
    x1.onreadystatechange = function() {
      if (x1.readyState === 4) {
        var sha = '';
        if (x1.status === 200) {
          try { sha = JSON.parse(x1.responseText).sha; } catch(e) {}
        }
        /* 파일 업데이트 (또는 생성) */
        var x2 = new XMLHttpRequest();
        x2.open('PUT', GH_API + '/contents/' + GH_FILE, true);
        x2.setRequestHeader('Authorization', 'Bearer ' + token);
        x2.setRequestHeader('Accept', 'application/vnd.github+json');
        x2.setRequestHeader('Content-Type', 'application/json');
        x2.onreadystatechange = function() {
          if (x2.readyState === 4) cb(x2.status === 200 || x2.status === 201);
        };
        var body = {
          message: '관리자: approved.json 업데이트 (' + TODAY + ')',
          content: btoa(unescape(encodeURIComponent(content))),
          branch: GH_BRANCH
        };
        if (sha) body.sha = sha;
        x2.send(JSON.stringify(body));
      }
    };
    x1.send();
  }

  /* --- 관리자 상태 헬퍼 --- */
  function getItemStatus(catKey, itemId) {
    var cat = state.approved[catKey];
    if (!cat) return 'pending';
    if (cat.approved && cat.approved.indexOf(itemId) !== -1) return 'approved';
    if (cat.rejected && cat.rejected.indexOf(itemId) !== -1) return 'rejected';
    return 'pending';
  }

  function setItemStatus(catKey, itemId, status) {
    if (!state.approved[catKey]) state.approved[catKey] = { approved: [], rejected: [] };
    var cat = state.approved[catKey];
    cat.approved = cat.approved.filter(function(id){ return id !== itemId; });
    cat.rejected = cat.rejected.filter(function(id){ return id !== itemId; });
    if (status === 'approved') cat.approved.push(itemId);
    if (status === 'rejected') cat.rejected.push(itemId);
  }

  /* --- 관리자 CSS 주입 --- */
  function injectAdminCSS() {
    if (document.getElementById('adminCSS')) return;
    var s = document.createElement('style');
    s.id = 'adminCSS';
    s.textContent =
      '#adminOverlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:var(--bg-primary);overflow-y:auto;display:flex;flex-direction:column}' +
      '.adm-hd{background:#1a73e8;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}' +
      '.adm-hd h2{font-size:18px;margin:0}' +
      '.adm-hd .adm-meta{font-size:12px;opacity:.9}' +
      '.adm-close{background:rgba(255,255,255,.2);border:none;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px}' +
      '.adm-close:hover{background:rgba(255,255,255,.35)}' +
      '.adm-tabs{display:flex;gap:4px;padding:10px 20px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);flex-wrap:wrap}' +
      '.adm-tab{padding:7px 14px;border:1px solid var(--border-color);border-radius:18px;background:var(--bg-card);cursor:pointer;font-size:12px;color:var(--text-secondary);transition:all .15s}' +
      '.adm-tab.active{background:#1a73e8;color:#fff;border-color:#1a73e8}' +
      '.adm-tab .cnt{font-weight:700;margin-left:3px}.adm-tab .nb{color:#e53935;font-weight:700;margin-left:3px}' +
      '.adm-bar{padding:10px 20px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.adm-bar input,.adm-bar select{padding:7px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;background:var(--bg-card);color:var(--text-primary)}' +
      '.adm-bar input{width:200px}' +
      '.adm-btn{padding:7px 14px;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;transition:all .15s}' +
      '.adm-btn:hover{opacity:.85}' +
      '.adm-btn-sel{background:#757575;color:#fff}' +
      '.adm-btn-app{background:#1a73e8;color:#fff}' +
      '.adm-btn-rej{background:#e53935;color:#fff}' +
      '.adm-btn-save{background:#ff6f00;color:#fff;animation:admpulse 2s infinite}' +
      '.adm-btn-save:disabled{background:#bbb;animation:none}' +
      '@keyframes admpulse{0%,100%{box-shadow:0 0 0 0 rgba(255,111,0,.4)}50%{box-shadow:0 0 0 8px rgba(255,111,0,0)}}' +
      '.adm-stats{padding:6px 20px;font-size:11px;color:var(--text-muted);background:var(--bg-primary);border-bottom:1px solid var(--border-color)}' +
      '.adm-save-msg{font-size:11px;padding:3px 10px;border-radius:6px;font-weight:600}' +
      '.adm-save-ok{background:#c8e6c9;color:#1b5e20}.adm-save-err{background:#ffcdd2;color:#b71c1c}.adm-save-ing{background:#fff9c4;color:#f57f17}' +
      '.adm-list{padding:10px 20px;flex:1;overflow-y:auto}' +
      '.adm-item{background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:flex-start;gap:10px;transition:all .15s}' +
      '.adm-item:hover{border-color:#1a73e8}' +
      '.adm-item.st-approved{border-left:4px solid #43a047}' +
      '.adm-item.st-rejected{border-left:4px solid #e53935;opacity:.5}' +
      '.adm-item.st-new{background:#e3f2fd}' +
      '[data-theme="dark"] .adm-item.st-new{background:#1e3a5f}' +
      '.adm-item input[type=checkbox]{margin-top:3px;width:17px;height:17px;flex-shrink:0}' +
      '.adm-item-body{flex:1;min-width:0}' +
      '.adm-item-name{font-size:13px;font-weight:600;margin-bottom:3px}' +
      '.adm-item-name a{color:var(--accent-color);text-decoration:none}' +
      '.adm-item-name a:hover{text-decoration:underline}' +
      '.adm-item-desc{font-size:11px;color:var(--text-muted);margin-bottom:4px;line-height:1.3}' +
      '.adm-item-badges{display:flex;gap:5px;flex-wrap:wrap}' +
      '.adm-badge{display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:600}' +
      '.abg-region{background:#e3f2fd;color:#1565c0}[data-theme="dark"] .abg-region{background:#1e3a5f;color:#90caf9}' +
      '.abg-new{background:#fce4ec;color:#c62828}[data-theme="dark"] .abg-new{background:#451a1a;color:#fca5a5}' +
      '.abg-date{background:#f3e5f5;color:#6a1b9a}[data-theme="dark"] .abg-date{background:#2a1a3e;color:#ce93d8}' +
      '.abg-type{background:#e8f5e9;color:#2e7d32}[data-theme="dark"] .abg-type{background:#1b3a1b;color:#a5d6a7}' +
      '.abg-ok{background:#c8e6c9;color:#1b5e20}.abg-no{background:#ffcdd2;color:#b71c1c}' +
      /* 토큰 입력 모달 */
      '#adminLoginOverlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;justify-content:center;align-items:center}' +
      '.adm-login{background:var(--bg-card);border-radius:16px;padding:32px;width:90%;max-width:400px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3)}' +
      '.adm-login h3{font-size:18px;margin-bottom:8px;color:var(--text-primary)}' +
      '.adm-login p{font-size:12px;color:var(--text-muted);margin-bottom:16px;line-height:1.5}' +
      '.adm-login input{width:100%;padding:12px;border:2px solid var(--border-color);border-radius:8px;font-size:14px;margin-bottom:12px;background:var(--bg-primary);color:var(--text-primary)}' +
      '.adm-login input:focus{border-color:#1a73e8;outline:none}' +
      '.adm-login .err{color:#e53935;font-size:12px;margin-bottom:8px;display:none}' +
      '.adm-login button{width:100%;padding:12px;background:#1a73e8;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px}' +
      '.adm-login button:hover{background:#1557b0}' +
      '.adm-login .cancel{background:var(--bg-primary);color:var(--text-secondary);border:1px solid var(--border-color)}';
    document.head.appendChild(s);
  }

  /* --- 토큰 입력 화면 --- */
  function showTokenLogin() {
    injectAdminCSS();
    var saved = localStorage.getItem('gh-admin-token') || '';
    var ov = document.createElement('div');
    ov.id = 'adminLoginOverlay';
    ov.innerHTML =
      '<div class="adm-login">' +
        '<h3>🔐 관리자 인증</h3>' +
        '<p>GitHub Personal Access Token을 입력하세요.<br>저장소 쓰기 권한이 확인되면 관리자 모드가 열립니다.<br>토큰은 이 브라우저에만 저장됩니다.</p>' +
        '<div class="err" id="admLoginErr"></div>' +
        '<input type="password" id="admTokenInput" placeholder="ghp_xxxxxxxxxxxx" value="' + esc(saved) + '">' +
        '<button id="admLoginBtn">🔓 인증 및 접속</button>' +
        '<button class="cancel" id="admCancelBtn">취소</button>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById('admCancelBtn').addEventListener('click', function() {
      ov.remove();
      /* URL에서 ?admin=1 제거 */
      if (window.history.replaceState) {
        var url = window.location.href.replace(/[\?&]admin=1/,'');
        window.history.replaceState(null, '', url);
      }
    });

    document.getElementById('admLoginBtn').addEventListener('click', function() {
      var btn = this;
      var token = document.getElementById('admTokenInput').value.trim();
      var err = document.getElementById('admLoginErr');
      if (!token) { err.textContent = '토큰을 입력하세요'; err.style.display = 'block'; return; }
      btn.textContent = '⏳ 확인 중...'; btn.disabled = true;
      verifyToken(token, function(ok) {
        if (ok) {
          state.ghToken = token;
          state.isAdmin = true;
          localStorage.setItem('gh-admin-token', token);
          ov.remove();
          openAdminPanel();
        } else {
          err.textContent = '❌ 권한 없음 — 토큰이 잘못되었거나 이 저장소에 쓰기 권한이 없습니다';
          err.style.display = 'block';
          btn.textContent = '🔓 인증 및 접속'; btn.disabled = false;
        }
      });
    });

    /* 자동 시도: 이전에 저장된 토큰이 있으면 바로 검증 */
    if (saved) {
      document.getElementById('admLoginBtn').click();
    }
  }

  /* --- 관리자 패널 열기 --- */
  function openAdminPanel() {
    injectAdminCSS();

    var ov = document.createElement('div');
    ov.id = 'adminOverlay';

    /* 헤더 */
    var metaText = state.meta && state.meta.updated_at ? '수집: ' + state.meta.updated_at : '';
    ov.innerHTML =
      '<div class="adm-hd">' +
        '<h2>🛡️ 관리자 모드</h2>' +
        '<span class="adm-meta">' + esc(metaText) + '</span>' +
        '<button class="adm-close" id="admClose">✕ 닫기</button>' +
      '</div>' +
      '<div class="adm-tabs" id="admTabs"></div>' +
      '<div class="adm-stats" id="admStats"></div>' +
      '<div class="adm-bar" id="admBar">' +
        '<input type="text" id="admSearch" placeholder="🔍 검색">' +
        '<select id="admRegion"><option value="">전체 지역</option></select>' +
        '<select id="admDate"><option value="">전체 날짜</option><option value="today">🆕 오늘 신규</option><option value="week">최근 7일</option></select>' +
        '<select id="admStatusF"><option value="">전체 상태</option><option value="pending">⏳ 미결정</option><option value="approved">✅ 승인</option><option value="rejected">❌ 거부</option></select>' +
        '<button class="adm-btn adm-btn-sel" id="admSelAll">전체선택</button>' +
        '<button class="adm-btn adm-btn-app" id="admAppSel">✅ 승인</button>' +
        '<button class="adm-btn adm-btn-rej" id="admRejSel">❌ 거부</button>' +
        '<button class="adm-btn adm-btn-save" id="admSave">💾 GitHub 저장</button>' +
        '<span id="admSaveMsg"></span>' +
      '</div>' +
      '<div class="adm-list" id="admList"></div>';

    document.body.appendChild(ov);

    /* 지역 드롭다운 */
    var sel = document.getElementById('admRegion');
    var allR = REGIONS_ROW1.concat(REGIONS_ROW2);
    for (var i = 0; i < allR.length; i++) {
      var o = document.createElement('option'); o.value = allR[i]; o.textContent = allR[i]; sel.appendChild(o);
    }

    /* 이벤트 */
    document.getElementById('admClose').addEventListener('click', function() { ov.remove(); 
      if(window.history.replaceState){var u=window.location.href.replace(/[\?&]admin=1/,'');window.history.replaceState(null,'',u);}
    });
    document.getElementById('admSearch').addEventListener('input', renderAdminList);
    document.getElementById('admRegion').addEventListener('change', renderAdminList);
    document.getElementById('admDate').addEventListener('change', renderAdminList);
    document.getElementById('admStatusF').addEventListener('change', renderAdminList);
    document.getElementById('admSelAll').addEventListener('click', adminSelectAll);
    document.getElementById('admAppSel').addEventListener('click', function(){ adminBulkAction('approved'); });
    document.getElementById('admRejSel').addEventListener('click', function(){ adminBulkAction('rejected'); });
    document.getElementById('admSave').addEventListener('click', adminSaveToGitHub);

    renderAdminTabs();
    renderAdminList();
  }

  function renderAdminTabs() {
    var c = document.getElementById('admTabs');
    if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < TABS.length; i++) {
      (function(tab) {
        var items = state.data[tab.key]||[];
        var nc = 0; for(var j=0;j<items.length;j++) if(isNewItem(items[j]))nc++;
        var d = document.createElement('div');
        d.className = 'adm-tab' + (tab.key === state.adminTab ? ' active' : '');
        d.innerHTML = tab.icon + ' ' + tab.label + '<span class="cnt">(' + items.length + ')</span>';
        if (nc > 0) d.innerHTML += '<span class="nb">🆕' + nc + '</span>';
        d.addEventListener('click', function() {
          state.adminTab = tab.key; renderAdminTabs(); renderAdminList();
        });
        c.appendChild(d);
      })(TABS[i]);
    }
  }

  function renderAdminList() {
    var c = document.getElementById('admList');
    var statsEl = document.getElementById('admStats');
    if (!c) return;

    var search = (document.getElementById('admSearch').value||'').toLowerCase();
    var regionF = document.getElementById('admRegion').value;
    var dateF = document.getElementById('admDate').value;
    var statusF = document.getElementById('admStatusF').value;

    var items = (state.data[state.adminTab]||[]).slice();

    /* 필터 */
    items = items.filter(function(it) {
      var txt = ((it.name||'')+(it.desc||'')+(it.org||'')+(it.region||'')).toLowerCase();
      if (search && txt.indexOf(search) === -1) return false;
      if (regionF && it.region !== regionF) return false;
      var cd = it.collected_date || '';
      if (dateF === 'today' && cd !== TODAY) return false;
      if (dateF === 'week') {
        var w = new Date(); w.setDate(w.getDate()-7);
        if (cd < w.toISOString().slice(0,10)) return false;
      }
      var st = getItemStatus(state.adminTab, it.id);
      if (statusF && st !== statusF) return false;
      return true;
    });

    /* 통계 */
    var totalAll = (state.data[state.adminTab]||[]).length;
    var appCnt = (state.approved[state.adminTab] && state.approved[state.adminTab].approved || []).length;
    var rejCnt = (state.approved[state.adminTab] && state.approved[state.adminTab].rejected || []).length;
    if (statsEl) statsEl.textContent = '전체 '+totalAll+'건 | ✅ 승인 '+appCnt+' | ❌ 거부 '+rejCnt+' | ⏳ 미결정 '+(totalAll-appCnt-rejCnt)+' | 🔍 표시 '+items.length+'건';

    c.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var st = getItemStatus(state.adminTab, it.id);
      var isN = isNewItem(it);
      var div = document.createElement('div');
      div.className = 'adm-item st-' + st + (isN ? ' st-new' : '');

      var badges = '';
      if (isN) badges += '<span class="adm-badge abg-new">🆕 신규</span>';
      badges += '<span class="adm-badge abg-region">' + esc(it.region||'전국') + '</span>';
      if (it.collected_date) badges += '<span class="adm-badge abg-date">📅 ' + esc(it.collected_date) + '</span>';
      if (it.finance_type) badges += '<span class="adm-badge abg-type">' + esc(it.finance_type) + '</span>';
      if (st === 'approved') badges += '<span class="adm-badge abg-ok">✅ 승인</span>';
      if (st === 'rejected') badges += '<span class="adm-badge abg-no">❌ 거부</span>';

      div.innerHTML =
        '<input type="checkbox" data-id="' + esc(it.id) + '">' +
        '<div class="adm-item-body">' +
          '<div class="adm-item-name"><a href="' + esc(it.url) + '" target="_blank">' + esc(it.name) + '</a></div>' +
          '<div class="adm-item-desc">' + esc(it.desc||'') + (it.org ? ' | '+esc(it.org) : '') + '</div>' +
          '<div class="adm-item-badges">' + badges + '</div>' +
        '</div>';
      c.appendChild(div);
    }
  }

  function adminSelectAll() {
    var checks = document.querySelectorAll('#admList input[type=checkbox]');
    var allOn = true;
    for (var i = 0; i < checks.length; i++) { if (!checks[i].checked) { allOn = false; break; } }
    for (var j = 0; j < checks.length; j++) checks[j].checked = !allOn;
  }

  function adminBulkAction(status) {
    var checks = document.querySelectorAll('#admList input[type=checkbox]:checked');
    for (var i = 0; i < checks.length; i++) {
      setItemStatus(state.adminTab, checks[i].getAttribute('data-id'), status);
    }
    renderAdminList();
  }

  function adminSaveToGitHub() {
    var btn = document.getElementById('admSave');
    var msg = document.getElementById('admSaveMsg');
    btn.disabled = true; btn.textContent = '⏳ 저장 중...';
    msg.className = 'adm-save-msg adm-save-ing'; msg.textContent = '저장 중...';

    var content = JSON.stringify(state.approved, null, 2);
    saveToGitHub(state.ghToken, content, function(ok) {
      if (ok) {
        btn.textContent = '✅ 저장 완료!';
        msg.className = 'adm-save-msg adm-save-ok'; msg.textContent = '✅ GitHub에 저장 완료!';
        setTimeout(function() {
          btn.textContent = '💾 GitHub 저장'; btn.disabled = false;
          msg.textContent = '';
        }, 3000);
        /* 일반 블로그도 즉시 갱신 */
        renderAll();
      } else {
        btn.textContent = '❌ 실패';
        msg.className = 'adm-save-msg adm-save-err'; msg.textContent = '❌ 저장 실패 — 토큰 권한을 확인하세요';
        setTimeout(function() {
          btn.textContent = '💾 GitHub 저장'; btn.disabled = false;
        }, 3000);
      }
    });
  }

  /* ========================================
     초기화
     ======================================== */

  function render() {
    var ld = document.getElementById('loadingIndicator');
    if (ld) ld.classList.add('hidden');
    renderAll();

    /* ?admin=1 파라미터 감지 */
    if (window.location.search.indexOf('admin=1') !== -1) {
      var saved = localStorage.getItem('gh-admin-token');
      if (saved) {
        /* 저장된 토큰으로 자동 인증 시도 */
        verifyToken(saved, function(ok) {
          if (ok) {
            state.ghToken = saved;
            state.isAdmin = true;
            openAdminPanel();
          } else {
            localStorage.removeItem('gh-admin-token');
            showTokenLogin();
          }
        });
      } else {
        showTokenLogin();
      }
    }
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
