/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   전국민 혜택존 v3 - 정렬 통일 + 사이드바 5카테고리
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';

  var BASE = 'https://raw.githubusercontent.com/kjjin6280/korea-benefits/main/data/';
  var URLS = {
    subsidies: BASE + 'subsidies.json',
    business: BASE + 'business.json',
    housing: BASE + 'housing.json',
    medical: BASE + 'medical.json',
    finance: BASE + 'finance.json',
    posted: BASE + 'posted_urls.json',
    meta: BASE + 'meta.json'
  };

  var TABS = [
    { key: 'subsidies', icon: '💰', label: '정부지원·민생' },
    { key: 'business', icon: '🏢', label: '소상공인·정책자금' },
    { key: 'housing',  icon: '🏠', label: '주거·부동산' },
    { key: 'medical',  icon: '🏥', label: '의료·건강' },
    { key: 'finance',  icon: '💡', label: '금융·재테크' }
  ];

  var REGIONS_ROW1 = ['전국','서울','부산','대구','인천','광주','대전','울산','세종'];
  var REGIONS_ROW2 = ['경기','강원','충북','충남','전북','전남','경북','경남','제주'];
  var PER_PAGE = 20;

  var state = {
    currentTab: 'subsidies',
    currentRegion: '전국',
    showCount: PER_PAGE,
    data: { subsidies:[], business:[], housing:[], medical:[], finance:[] },
    posted: {},
    meta: {},
    loaded: 0,
    totalToLoad: 7
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
        if (x.status === 200) { try { cb(JSON.parse(x.responseText)); } catch(e) { cb(null); } }
        else cb(null);
      }
    };
    x.send();
  }
  function loadAllData() {
    fetchJSON(URLS.subsidies, function(d){ state.data.subsidies=d||[]; checkReady(); });
    fetchJSON(URLS.business, function(d){ state.data.business=d||[]; checkReady(); });
    fetchJSON(URLS.housing, function(d){ state.data.housing=d||[]; checkReady(); });
    fetchJSON(URLS.medical, function(d){ state.data.medical=d||[]; checkReady(); });
    fetchJSON(URLS.finance, function(d){ state.data.finance=d||[]; checkReady(); });
    fetchJSON(URLS.posted, function(d){ state.posted=d||{}; checkReady(); });
    fetchJSON(URLS.meta, function(d){ state.meta=d||{}; checkReady(); });
  }
  function checkReady() { state.loaded++; if (state.loaded >= state.totalToLoad) render(); }

  /* ===== 마감일 ===== */
  function calcDeadline(item) {
    var dl = item.deadline || '';
    if (!dl || dl === '상시모집') return {type:'always',remain:9999,label:'상시모집',cls:'badge-always'};
    if (dl === '예산소진시') return {type:'budget',remain:0,label:'예산소진시',cls:'badge-budget'};
    if (/^\d{4}-\d{2}-\d{2}$/.test(dl)) {
      var p=dl.split('-'), dd=new Date(p[0],p[1]-1,p[2]);
      var tp=TODAY.split('-'), td=new Date(tp[0],tp[1]-1,tp[2]);
      var diff=Math.ceil((dd-td)/86400000);
      if (diff<0) return {type:'expired',remain:diff,label:'마감',cls:''};
      if (diff===0) return {type:'urgent',remain:0,label:'오늘마감',cls:'badge-urgent'};
      if (diff<=7) return {type:'urgent',remain:diff,label:'D-'+diff,cls:'badge-urgent'};
      return {type:'normal',remain:diff,label:'D-'+diff,cls:'badge-always'};
    }
    return {type:'always',remain:9999,label:'상시모집',cls:'badge-always'};
  }

  /* ===== 정렬 ===== */
  function getSortPriority(t) {
    switch(t){ case'urgent':return 0;case'budget':return 1;case'normal':return 2;case'always':return 3;default:return 4;}
  }
  function sortItems(items) {
    var f=[];
    for (var i=0;i<items.length;i++) {
      var info=calcDeadline(items[i]);
      if (info.type!=='expired') { items[i]._dlInfo=info; f.push(items[i]); }
    }
    f.sort(function(a,b){
      var pa=getSortPriority(a._dlInfo.type),pb=getSortPriority(b._dlInfo.type);
      if (pa!==pb) return pa-pb;
      if (pa===0) return a._dlInfo.remain-b._dlInfo.remain;
      return (b.trend_score||0)-(a.trend_score||0);
    });
    return f;
  }
  function sortFinance(items) {
    var dep=[],loan=[];
    for (var i=0;i<items.length;i++) {
      var t=items[i].type||'';
      if (t==='정기예금'||t==='적금') dep.push(items[i]); else loan.push(items[i]);
    }
    dep.sort(function(a,b){ return (parseFloat(b.rate_max)||0)-(parseFloat(a.rate_max)||0); });
    loan.sort(function(a,b){ return (parseFloat(a.rate_basic)||999)-(parseFloat(b.rate_basic)||999); });
    return dep.concat(loan);
  }

  /* ===== 지역 필터 ===== */
  function filterByRegion(items, region) {
    if (region==='전국') return items;
    var r=[];
    for (var i=0;i<items.length;i++) { var ir=items[i].region||'전국'; if (ir===region||ir==='전국') r.push(items[i]); }
    return r;
  }
  function getRegionCount(items, region) {
    if (region==='전국') return items.length;
    var c=0;
    for (var i=0;i<items.length;i++) { var ir=items[i].region||'전국'; if (ir===region||ir==='전국') c++; }
    return c;
  }

  /* ===== 토스트 ===== */
  function showToast(msg) {
    var el=document.getElementById('toastMsg'); if(!el) return;
    el.textContent=msg; el.classList.add('show');
    setTimeout(function(){ el.classList.remove('show'); },3000);
  }

  /* ===== 카드 클릭 ===== */
  function handleCardClick(item) {
    var p=state.posted[item.id];
    if (p) window.location.href=p;
    else { window.open(item.url,'_blank'); showToast('📝 이 혜택의 상세 포스팅을 준비 중입니다!'); }
  }

  /* ===== 카드 HTML ===== */
  function buildCard(item, isFinance) {
    var card=document.createElement('div');
    card.className='card';
    if (isFinance) {
      var rb=parseFloat(item.rate_basic)||0, rm=parseFloat(item.rate_max)||0;
      var isLoan=(item.type||'').indexOf('대출')>-1;
      var rd=isLoan?(rb>0?rb.toFixed(2)+'%':'-'):(rm>0?rm.toFixed(2)+'%':'-');
      card.innerHTML=
        '<div class="card-badges"><span class="badge badge-always">'+esc(item.type)+'</span>'+
        (item.region&&item.region!=='전국'?'<span class="badge badge-region">'+esc(item.region)+'</span>':'')+
        '</div><div class="card-rate">'+rd+'</div><div class="card-rate-label">'+(isLoan?'최저금리':'최고금리')+
        '</div><div class="card-title">'+esc(item.name)+'</div><div class="card-meta"><span class="card-org">'+
        esc(item.bank)+'</span><span>'+esc((item.join_way||'').split(',')[0])+'</span></div>';
      card.addEventListener('click',function(){ window.open(item.url,'_blank'); });
    } else {
      var dl=item._dlInfo||calcDeadline(item);
      var bh='<div class="card-badges"><span class="badge '+dl.cls+'">'+dl.label+'</span>';
      if (item.region&&item.region!=='전국') bh+='<span class="badge badge-region">'+esc(item.region)+'</span>';
      bh+='</div>';
      card.innerHTML=bh+'<div class="card-title">'+esc(item.name)+'</div><div class="card-desc">'+esc(item.desc)+
        '</div><div class="card-meta"><span class="card-org">'+esc(item.org)+'</span><span>'+esc(item.region||'전국')+'</span></div>';
      card.addEventListener('click',function(){ handleCardClick(item); });
    }
    return card;
  }

  /* ===== 탭 빌드 — tabs-outer 래퍼로 중앙 정렬 ===== */
  function buildTabMenu() {
    var c=document.getElementById('benefitsTabs'); if(!c) return;
    c.innerHTML=''; c.className='tabs-outer';
    var nav=document.createElement('div'); nav.className='nav-tabs';
    for (var i=0;i<TABS.length;i++) {
      (function(tab){
        var btn=document.createElement('div');
        btn.className='nav-tab'+(tab.key===state.currentTab?' active':'');
        btn.textContent=tab.icon+' '+tab.label;
        btn.addEventListener('click',function(){
          state.currentTab=tab.key; state.currentRegion='전국'; state.showCount=PER_PAGE; renderAll();
        });
        nav.appendChild(btn);
      })(TABS[i]);
    }
    c.appendChild(nav);
  }

  /* ===== 지역 필터 — region-outer 래퍼로 중앙 정렬 ===== */
  function buildRegionFilter() {
    var c=document.getElementById('regionFilter'); if(!c) return;
    if (state.currentTab==='finance') { c.innerHTML=''; c.className='hidden'; return; }
    c.className='region-outer';
    var items=state.data[state.currentTab]||[];
    var h='<div class="region-filter"><div class="region-row">';
    for (var i=0;i<REGIONS_ROW1.length;i++) {
      var r=REGIONS_ROW1[i],cnt=getRegionCount(items,r),act=r===state.currentRegion?' active':'';
      h+='<button class="region-btn'+act+'" data-region="'+r+'">'+r;
      if(cnt>0) h+=' <span class="region-count">'+cnt+'</span>';
      h+='</button>';
    }
    h+='</div><div class="region-row">';
    for (var j=0;j<REGIONS_ROW2.length;j++) {
      var r2=REGIONS_ROW2[j],cnt2=getRegionCount(items,r2),act2=r2===state.currentRegion?' active':'';
      h+='<button class="region-btn'+act2+'" data-region="'+r2+'">'+r2;
      if(cnt2>0) h+=' <span class="region-count">'+cnt2+'</span>';
      h+='</button>';
    }
    h+='</div></div>';
    c.innerHTML=h;
    var btns=c.querySelectorAll('.region-btn');
    for (var k=0;k<btns.length;k++) {
      btns[k].addEventListener('click',function(){
        state.currentRegion=this.getAttribute('data-region'); state.showCount=PER_PAGE; renderAll();
      });
    }
  }

  /* ===== 카드 영역 ===== */
  function renderCards() {
    var c=document.getElementById('benefitsCards'); if(!c) return;
    c.innerHTML='';
    var isF=state.currentTab==='finance';
    var items=state.data[state.currentTab]||[];
    if(!isF){ items=filterByRegion(items,state.currentRegion); items=sortItems(items); }
    else items=sortFinance(items);
    var total=items.length;
    var info=document.createElement('div'); info.className='result-info';
    info.innerHTML='<span>총 <span class="result-count">'+total+'</span>건</span>';
    c.appendChild(info);
    if(total===0){
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
      btn.addEventListener('click',function(){ state.showCount+=PER_PAGE; renderCards(); });
      w.appendChild(btn); c.appendChild(w);
    }
  }

  /* ===== 사이드바 — 5개 카테고리 각 5개 + 금리 + 업데이트 시간 ===== */
  function buildSidebar() {
    var c=document.getElementById('benefitsSidebar'); if(!c) return;
    c.innerHTML='';

    /* 카테고리 4개 (금융 제외) 각 5개씩 */
    var cats = [
      { key:'subsidies', icon:'💰', label:'정부지원·민생' },
      { key:'business',  icon:'🏢', label:'소상공인·정책자금' },
      { key:'housing',   icon:'🏠', label:'주거·부동산' },
      { key:'medical',   icon:'🏥', label:'의료·건강' }
    ];

    for (var ci=0; ci<cats.length; ci++) {
      var cat = cats[ci];
      var arr = state.data[cat.key] || [];
      if (arr.length === 0) continue;

      /* 트렌드 점수순 정렬 + 중복 이름 제거 */
      var sorted = arr.slice().sort(function(a,b){ return (b.trend_score||0)-(a.trend_score||0); });
      sorted = uniqueByName(sorted);

      var sec = document.createElement('div');
      sec.className = 'sidebar-section';
      var html = '<div class="sidebar-title">' + cat.icon + ' ' + cat.label + '</div>';
      var max = Math.min(sorted.length, 5);
      var clickItems = [];

      for (var si=0; si<max; si++) {
        var item = sorted[si];
        var dl = calcDeadline(item);
        clickItems.push(item);
        html += '<div class="sidebar-item" data-idx="'+si+'">';
        html += '<span class="sidebar-rank">'+(si+1)+'</span>';
        html += '<span class="sidebar-item-title">'+esc(item.name)+'</span>';
        html += '<span class="badge '+dl.cls+'">'+dl.label+'</span>';
        html += '</div>';
      }
      sec.innerHTML = html;
      c.appendChild(sec);

      /* 클릭 이벤트 */
      (function(items) {
        var els = sec.querySelectorAll('.sidebar-item');
        for (var e=0; e<els.length; e++) {
          (function(idx){
            els[idx].addEventListener('click', function(){ handleCardClick(items[idx]); });
          })(e);
        }
      })(clickItems);
    }

    /* 금리 TOP 5 */
    var fin = (state.data.finance||[]).slice();
    var dep = [];
    for (var fi=0; fi<fin.length; fi++) {
      var ft=fin[fi].type||'';
      if (ft==='정기예금'||ft==='적금') dep.push(fin[fi]);
    }
    dep.sort(function(a,b){ return (parseFloat(b.rate_max)||0)-(parseFloat(a.rate_max)||0); });

    if (dep.length > 0) {
      var fSec = document.createElement('div');
      fSec.className = 'sidebar-section';
      var fh = '<div class="sidebar-title">💰 고금리</div>';
      var fm = Math.min(dep.length, 5);
      var fClicks = [];
      for (var fj=0; fj<fm; fj++) {
        var fItem = dep[fj];
        fClicks.push(fItem);
        var rm = parseFloat(fItem.rate_max)||0;
        fh += '<div class="sidebar-item" data-idx="'+fj+'">';
        fh += '<span class="sidebar-rank">'+(fj+1)+'</span>';
        fh += '<span class="sidebar-item-title">'+esc(fItem.name)+'</span>';
        fh += '<span class="badge badge-always">'+rm.toFixed(2)+'%</span>';
        fh += '</div>';
      }
      fSec.innerHTML = fh;
      c.appendChild(fSec);

      (function(items) {
        var els = fSec.querySelectorAll('.sidebar-item');
        for (var e=0; e<els.length; e++) {
          (function(idx){
            els[idx].addEventListener('click', function(){ window.open(items[idx].url,'_blank'); });
          })(e);
        }
      })(fClicks);
    }

    /* 업데이트 시간 */
    if (state.meta && state.meta.updated_at) {
      var up = document.createElement('div');
      up.className = 'sidebar-update';
      up.textContent = '🕐 ' + state.meta.updated_at + ' 업데이트';
      c.appendChild(up);
    }
  }

  /* ===== 렌더링 ===== */
  function renderAll() { buildTabMenu(); buildRegionFilter(); renderCards(); buildSidebar(); }

  function render() {
    var ld = document.getElementById('loadingIndicator');
    if (ld) ld.classList.add('hidden');
    console.log('혜택존 v3 로드 완료');
    console.log('  💰', state.data.subsidies.length, '🏢', state.data.business.length,
                '🏠', state.data.housing.length, '🏥', state.data.medical.length, '💡', state.data.finance.length);
    renderAll();
  }

  function init() { initThemeToggle(); loadAllData(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
