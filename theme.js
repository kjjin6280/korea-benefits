/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   전국민 혜택존 v2 - 테마 엔진
   4×5 그리드 + 지역 필터 + 더 보기
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(function () {
  'use strict';

  // ===== 설정 =====
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
    { key: 'housing', icon: '🏠', label: '주거·부동산' },
    { key: 'medical', icon: '🏥', label: '의료·건강' },
    { key: 'finance', icon: '💡', label: '금융·재테크' }
  ];

  var REGIONS_ROW1 = ['전국', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종'];
  var REGIONS_ROW2 = ['경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];

  var PER_PAGE = 20;

  // ===== 상태 =====
  var state = {
    currentTab: 'subsidies',
    currentRegion: '전국',
    showCount: PER_PAGE,
    data: {
      subsidies: [],
      business: [],
      housing: [],
      medical: [],
      finance: []
    },
    posted: {},
    meta: {},
    loaded: 0,
    totalToLoad: 7
  };

  // ===== 유틸 =====
  function getToday() {
    var now = new Date();
    var kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  }

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  var TODAY = getToday();

  // ===== 다크/라이트 토글 =====
  function initThemeToggle() {
    var saved = localStorage.getItem('benefits-theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);

    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.textContent = saved === 'dark' ? '☀️' : '🌙';

    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('benefits-theme', next);
      btn.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }

  // ===== 데이터 로딩 =====
  function fetchJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '?t=' + Date.now(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            callback(JSON.parse(xhr.responseText));
          } catch (e) {
            console.warn('JSON 파싱 실패:', url);
            callback(null);
          }
        } else {
          callback(null);
        }
      }
    };
    xhr.send();
  }

  function loadAllData() {
    fetchJSON(URLS.subsidies, function (d) {
      state.data.subsidies = d || [];
      checkReady();
    });
    fetchJSON(URLS.business, function (d) {
      state.data.business = d || [];
      checkReady();
    });
    fetchJSON(URLS.housing, function (d) {
      state.data.housing = d || [];
      checkReady();
    });
    fetchJSON(URLS.medical, function (d) {
      state.data.medical = d || [];
      checkReady();
    });
    fetchJSON(URLS.finance, function (d) {
      state.data.finance = d || [];
      checkReady();
    });
    fetchJSON(URLS.posted, function (d) {
      state.posted = d || {};
      checkReady();
    });
    fetchJSON(URLS.meta, function (d) {
      state.meta = d || {};
      checkReady();
    });
  }

  function checkReady() {
    state.loaded++;
    if (state.loaded >= state.totalToLoad) {
      render();
    }
  }
  // ===== 마감일 계산 =====
  function calcDeadline(item) {
    var dl = item.deadline || '';

    if (!dl || dl === '상시모집') {
      return { type: 'always', remain: 9999, label: '상시모집', cls: 'badge-always' };
    }
    if (dl === '예산소진시') {
      return { type: 'budget', remain: 0, label: '예산소진시', cls: 'badge-budget' };
    }

    // YYYY-MM-DD 형식
    if (/^\d{4}-\d{2}-\d{2}$/.test(dl)) {
      var parts = dl.split('-');
      var deadDate = new Date(parts[0], parts[1] - 1, parts[2]);
      var todayParts = TODAY.split('-');
      var todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
      var diff = Math.ceil((deadDate - todayDate) / (1000 * 60 * 60 * 24));

      if (diff < 0) {
        return { type: 'expired', remain: diff, label: '마감', cls: '' };
      }
      if (diff === 0) {
        return { type: 'urgent', remain: 0, label: '오늘마감', cls: 'badge-urgent' };
      }
      if (diff <= 7) {
        return { type: 'urgent', remain: diff, label: 'D-' + diff, cls: 'badge-urgent' };
      }
      return { type: 'normal', remain: diff, label: 'D-' + diff, cls: 'badge-always' };
    }

    return { type: 'always', remain: 9999, label: '상시모집', cls: 'badge-always' };
  }

  // ===== 정렬 =====
  function getSortPriority(type) {
    switch (type) {
      case 'urgent': return 0;
      case 'budget': return 1;
      case 'normal': return 2;
      case 'always': return 3;
      default: return 4;
    }
  }

  function sortItems(items) {
    // 마감 지난 것 제거
    var filtered = [];
    for (var i = 0; i < items.length; i++) {
      var info = calcDeadline(items[i]);
      if (info.type !== 'expired') {
        items[i]._dlInfo = info;
        filtered.push(items[i]);
      }
    }

    filtered.sort(function (a, b) {
      var pa = getSortPriority(a._dlInfo.type);
      var pb = getSortPriority(b._dlInfo.type);
      if (pa !== pb) return pa - pb;

      // 같은 우선순위면 마감 가까운 순
      if (pa === 0) return a._dlInfo.remain - b._dlInfo.remain;

      // 그 외 트렌드 점수 높은 순
      return (b.trend_score || 0) - (a.trend_score || 0);
    });

    return filtered;
  }

  function sortFinance(items) {
    var deposits = [];
    var loans = [];

    for (var i = 0; i < items.length; i++) {
      var t = items[i].type || '';
      if (t === '정기예금' || t === '적금') {
        deposits.push(items[i]);
      } else {
        loans.push(items[i]);
      }
    }

    // 예금/적금: 최고금리 높은 순
    deposits.sort(function (a, b) {
      return (parseFloat(b.rate_max) || 0) - (parseFloat(a.rate_max) || 0);
    });

    // 대출: 기본금리 낮은 순
    loans.sort(function (a, b) {
      return (parseFloat(a.rate_basic) || 999) - (parseFloat(b.rate_basic) || 999);
    });

    return deposits.concat(loans);
  }

  // ===== 지역 필터 =====
  function filterByRegion(items, region) {
    if (region === '전국') {
      return items; // 전국이면 전체 표시
    }
    var result = [];
    for (var i = 0; i < items.length; i++) {
      var r = items[i].region || '전국';
      if (r === region || r === '전국') {
        result.push(items[i]);
      }
    }
    return result;
  }

  function getRegionCount(items, region) {
    if (region === '전국') return items.length;
    var count = 0;
    for (var i = 0; i < items.length; i++) {
      var r = items[i].region || '전국';
      if (r === region || r === '전국') count++;
    }
    return count;
  }

  // ===== 토스트 =====
  function showToast(msg) {
    var el = document.getElementById('toastMsg');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () {
      el.classList.remove('show');
    }, 3000);
  }

  // ===== 카드 클릭 =====
  function handleCardClick(item) {
    var postUrl = state.posted[item.id];
    if (postUrl) {
      window.location.href = postUrl;
    } else {
      window.open(item.url, '_blank');
      showToast('📝 이 혜택의 상세 포스팅을 준비 중입니다!');
    }
  }

  // ===== 카드 HTML 생성 =====
  function buildCard(item, isFinance) {
    var card = document.createElement('div');
    card.className = 'card';

    if (isFinance) {
      var rateBasic = parseFloat(item.rate_basic) || 0;
      var rateMax = parseFloat(item.rate_max) || 0;
      var isLoan = (item.type || '').indexOf('대출') > -1;

      var rateDisplay = '';
      if (isLoan) {
        rateDisplay = rateBasic > 0 ? rateBasic.toFixed(2) + '%' : '-';
      } else {
        rateDisplay = rateMax > 0 ? rateMax.toFixed(2) + '%' : '-';
      }

      card.innerHTML =
        '<div class="card-badges">' +
          '<span class="badge badge-always">' + esc(item.type) + '</span>' +
          (item.region && item.region !== '전국' ? '<span class="badge badge-region">' + esc(item.region) + '</span>' : '') +
        '</div>' +
        '<div class="card-rate">' + rateDisplay + '</div>' +
        '<div class="card-rate-label">' + (isLoan ? '최저금리' : '최고금리') + '</div>' +
        '<div class="card-title">' + esc(item.name) + '</div>' +
        '<div class="card-meta">' +
          '<span class="card-org">' + esc(item.bank) + '</span>' +
          '<span>' + esc(item.join_way || '').split(',')[0] + '</span>' +
        '</div>';

      card.addEventListener('click', function () {
        window.open(item.url, '_blank');
      });

    } else {
      var dlInfo = item._dlInfo || calcDeadline(item);

      var badgesHtml = '<div class="card-badges">';
      badgesHtml += '<span class="badge ' + dlInfo.cls + '">' + dlInfo.label + '</span>';
      if (item.region && item.region !== '전국') {
        badgesHtml += '<span class="badge badge-region">' + esc(item.region) + '</span>';
      }
      badgesHtml += '</div>';

      card.innerHTML =
        badgesHtml +
        '<div class="card-title">' + esc(item.name) + '</div>' +
        '<div class="card-desc">' + esc(item.desc) + '</div>' +
        '<div class="card-meta">' +
          '<span class="card-org">' + esc(item.org) + '</span>' +
          '<span>' + esc(item.region || '전국') + '</span>' +
        '</div>';

      card.addEventListener('click', function () {
        handleCardClick(item);
      });
    }

    return card;
  }
  // ===== 카테고리 탭 빌드 =====
  function buildTabMenu() {
    var container = document.getElementById('benefitsTabs');
    if (!container) return;

    var nav = document.createElement('div');
    nav.className = 'nav-tabs';

    for (var i = 0; i < TABS.length; i++) {
      (function (tab) {
        var btn = document.createElement('div');
        btn.className = 'nav-tab' + (tab.key === state.currentTab ? ' active' : '');
        btn.textContent = tab.icon + ' ' + tab.label;
        btn.addEventListener('click', function () {
          state.currentTab = tab.key;
          state.currentRegion = '전국';
          state.showCount = PER_PAGE;
          renderAll();
        });
        nav.appendChild(btn);
      })(TABS[i]);
    }

    container.innerHTML = '';
    container.appendChild(nav);
  }

  // ===== 지역 필터 빌드 =====
  function buildRegionFilter() {
    var container = document.getElementById('regionFilter');
    if (!container) return;

    // 금융 탭이면 지역 필터 숨김
    if (state.currentTab === 'finance') {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');

    var currentItems = state.data[state.currentTab] || [];

    var html = '<div class="region-filter">';

    // 1줄: 특별시/광역시
    html += '<div class="region-row">';
    for (var i = 0; i < REGIONS_ROW1.length; i++) {
      var r = REGIONS_ROW1[i];
      var cnt = getRegionCount(currentItems, r);
      var active = r === state.currentRegion ? ' active' : '';
      html += '<button class="region-btn' + active + '" data-region="' + r + '">';
      html += r;
      if (cnt > 0) html += ' <span class="region-count">' + cnt + '</span>';
      html += '</button>';
    }
    html += '</div>';

    // 2줄: 도
    html += '<div class="region-row">';
    for (var j = 0; j < REGIONS_ROW2.length; j++) {
      var r2 = REGIONS_ROW2[j];
      var cnt2 = getRegionCount(currentItems, r2);
      var active2 = r2 === state.currentRegion ? ' active' : '';
      html += '<button class="region-btn' + active2 + '" data-region="' + r2 + '">';
      html += r2;
      if (cnt2 > 0) html += ' <span class="region-count">' + cnt2 + '</span>';
      html += '</button>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;

    // 이벤트 바인딩
    var btns = container.querySelectorAll('.region-btn');
    for (var k = 0; k < btns.length; k++) {
      btns[k].addEventListener('click', function () {
        state.currentRegion = this.getAttribute('data-region');
        state.showCount = PER_PAGE;
        renderAll();
      });
    }
  }

  // ===== 카드 영역 렌더링 =====
  function renderCards() {
    var container = document.getElementById('benefitsCards');
    if (!container) return;
    container.innerHTML = '';

    var isFinance = state.currentTab === 'finance';
    var items = state.data[state.currentTab] || [];

    // 지역 필터 (금융 제외)
    if (!isFinance) {
      items = filterByRegion(items, state.currentRegion);
      items = sortItems(items);
    } else {
      items = sortFinance(items);
    }

    var totalCount = items.length;

    // 결과 정보
    var info = document.createElement('div');
    info.className = 'result-info';
    info.innerHTML = '<span>총 <span class="result-count">' + totalCount + '</span>건</span>';
    container.appendChild(info);

    if (totalCount === 0) {
      var grid = document.createElement('div');
      grid.className = 'card-grid';
      grid.innerHTML = '<div class="empty-state">😢 해당 조건의 혜택 정보가 없습니다.</div>';
      container.appendChild(grid);
      return;
    }

    // 카드 그리드
    var grid = document.createElement('div');
    grid.className = 'card-grid';

    var showLimit = Math.min(state.showCount, totalCount);

    for (var i = 0; i < showLimit; i++) {
      var card = buildCard(items[i], isFinance);
      grid.appendChild(card);
    }

    container.appendChild(grid);

    // 더 보기 버튼
    if (showLimit < totalCount) {
      var wrap = document.createElement('div');
      wrap.className = 'load-more-wrap';

      var btn = document.createElement('button');
      btn.className = 'load-more-btn';
      btn.textContent = '더 보기 (' + showLimit + ' / ' + totalCount + ')';
      btn.addEventListener('click', function () {
        state.showCount += PER_PAGE;
        renderCards();
      });

      wrap.appendChild(btn);
      container.appendChild(wrap);
    }
  }

  // ===== 사이드바 렌더링 =====
  function buildSidebar() {
    var container = document.getElementById('benefitsSidebar');
    if (!container) return;
    container.innerHTML = '';

    // [1] 마감임박 TOP 5
    var urgentItems = [];
    var allKeys = ['subsidies', 'business', 'housing', 'medical'];
    for (var k = 0; k < allKeys.length; k++) {
      var arr = state.data[allKeys[k]] || [];
      for (var i = 0; i < arr.length; i++) {
        var info = calcDeadline(arr[i]);
        if (info.type === 'urgent' || info.type === 'budget') {
          arr[i]._dlInfo = info;
          arr[i]._srcTab = allKeys[k];
          urgentItems.push(arr[i]);
        }
      }
    }
    urgentItems.sort(function (a, b) {
      var pa = getSortPriority(a._dlInfo.type);
      var pb = getSortPriority(b._dlInfo.type);
      if (pa !== pb) return pa - pb;
      return a._dlInfo.remain - b._dlInfo.remain;
    });

    if (urgentItems.length > 0) {
      var urgentSection = document.createElement('div');
      urgentSection.className = 'sidebar-section';
      var urgentHtml = '<div class="sidebar-title">🚨 마감임박</div>';
      var urgentMax = Math.min(urgentItems.length, 5);
      for (var u = 0; u < urgentMax; u++) {
        var ui = urgentItems[u];
        urgentHtml += '<div class="sidebar-item" data-idx="' + u + '" data-src="urgent">';
        urgentHtml += '<span class="sidebar-rank">' + (u + 1) + '</span>';
        urgentHtml += '<span class="sidebar-item-title">' + esc(ui.name) + '</span>';
        urgentHtml += '<span class="badge ' + ui._dlInfo.cls + '">' + ui._dlInfo.label + '</span>';
        urgentHtml += '</div>';
      }
      urgentSection.innerHTML = urgentHtml;
      container.appendChild(urgentSection);

      // 클릭 이벤트
      var urgentEls = urgentSection.querySelectorAll('.sidebar-item');
      for (var ue = 0; ue < urgentEls.length; ue++) {
        (function (idx) {
          urgentEls[idx].addEventListener('click', function () {
            handleCardClick(urgentItems[idx]);
          });
        })(ue);
      }
    }

    // [2] 인기 혜택 TOP 10 (트렌드 점수 기준)
    var trendItems = [];
    for (var t = 0; t < allKeys.length; t++) {
      var tArr = state.data[allKeys[t]] || [];
      for (var ti = 0; ti < tArr.length; ti++) {
        if ((tArr[ti].trend_score || 0) > 0) {
          tArr[ti]._srcTab = allKeys[t];
          trendItems.push(tArr[ti]);
        }
      }
    }
    trendItems.sort(function (a, b) {
      return (b.trend_score || 0) - (a.trend_score || 0);
    });

    if (trendItems.length > 0) {
      var trendSection = document.createElement('div');
      trendSection.className = 'sidebar-section';
      var trendHtml = '<div class="sidebar-title">🔥 인기 혜택</div>';
      var trendMax = Math.min(trendItems.length, 10);
      for (var tr = 0; tr < trendMax; tr++) {
        var tri = trendItems[tr];
        var triDl = calcDeadline(tri);
        trendHtml += '<div class="sidebar-item" data-idx="' + tr + '" data-src="trend">';
        trendHtml += '<span class="sidebar-rank">' + (tr + 1) + '</span>';
        trendHtml += '<span class="sidebar-item-title">' + esc(tri.name) + '</span>';
        trendHtml += '<span class="badge ' + triDl.cls + '">' + triDl.label + '</span>';
        trendHtml += '</div>';
      }
      trendSection.innerHTML = trendHtml;
      container.appendChild(trendSection);

      var trendEls = trendSection.querySelectorAll('.sidebar-item');
      for (var te = 0; te < trendEls.length; te++) {
        (function (idx) {
          trendEls[idx].addEventListener('click', function () {
            handleCardClick(trendItems[idx]);
          });
        })(te);
      }
    }

    // [3] 금리 TOP 5
    var finItems = (state.data.finance || []).slice();
    var depositItems = [];
    for (var fi = 0; fi < finItems.length; fi++) {
      var ft = finItems[fi].type || '';
      if (ft === '정기예금' || ft === '적금') {
        depositItems.push(finItems[fi]);
      }
    }
    depositItems.sort(function (a, b) {
      return (parseFloat(b.rate_max) || 0) - (parseFloat(a.rate_max) || 0);
    });

    if (depositItems.length > 0) {
      var finSection = document.createElement('div');
      finSection.className = 'sidebar-section';
      var finHtml = '<div class="sidebar-title">💰 고금리 TOP 5</div>';
      var finMax = Math.min(depositItems.length, 5);
      for (var fj = 0; fj < finMax; fj++) {
        var fItem = depositItems[fj];
        var rMax = parseFloat(fItem.rate_max) || 0;
        finHtml += '<div class="sidebar-item" data-idx="' + fj + '" data-src="fin">';
        finHtml += '<span class="sidebar-rank">' + (fj + 1) + '</span>';
        finHtml += '<span class="sidebar-item-title">' + esc(fItem.name) + '</span>';
        finHtml += '<span class="badge badge-always">' + rMax.toFixed(2) + '%</span>';
        finHtml += '</div>';
      }
      finSection.innerHTML = finHtml;
      container.appendChild(finSection);

      var finEls = finSection.querySelectorAll('.sidebar-item');
      for (var fe = 0; fe < finEls.length; fe++) {
        (function (idx) {
          finEls[idx].addEventListener('click', function () {
            window.open(depositItems[idx].url, '_blank');
          });
        })(fe);
      }
    }

    // [4] 업데이트 시간
    if (state.meta && state.meta.updated_at) {
      var updateDiv = document.createElement('div');
      updateDiv.className = 'sidebar-update';
      updateDiv.textContent = '🕐 ' + state.meta.updated_at + ' 업데이트';
      container.appendChild(updateDiv);
    }
  }

  // ===== 전체 렌더링 =====
  function renderAll() {
    buildTabMenu();
    buildRegionFilter();
    renderCards();
    buildSidebar();
  }

  // ===== 메인 렌더 =====
  function render() {
    // 로딩 제거
    var loading = document.getElementById('loadingIndicator');
    if (loading) loading.classList.add('hidden');

    console.log('혜택존 v2 엔진 시작');
    console.log('  💰 정부지원:', state.data.subsidies.length);
    console.log('  🏢 소상공인:', state.data.business.length);
    console.log('  🏠 주거:', state.data.housing.length);
    console.log('  🏥 의료:', state.data.medical.length);
    console.log('  💡 금융:', state.data.finance.length);

    renderAll();
  }

  // ===== 초기화 =====
  function init() {
    initThemeToggle();
    loadAllData();
  }

  // ===== DOM 준비 후 실행 =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
