// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전국민 혜택존 - 블로그 UI 렌더링 엔진
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(function () {
  "use strict";

  // ── GitHub Pages 데이터 URL ──
  var BASE = "https://raw.githubusercontent.com/kjjin6280/korea-benefits/main/data";
  var URLS = {
    subsidies: BASE + "/subsidies.json",
    business: BASE + "/business.json",
    housing: BASE + "/housing.json",
    medical: BASE + "/medical.json",
    finance: BASE + "/finance.json",
    posted: BASE + "/posted_urls.json",
    meta: BASE + "/meta.json"
  };

  // ── 카테고리 정의 ──
  var TABS = [
    { key: "subsidies", label: "💰 정부지원·민생" },
    { key: "business", label: "🏢 소상공인·정책자금" },
    { key: "housing", label: "🏠 주거·부동산" },
    { key: "medical", label: "🏥 의료·건강" },
    { key: "finance", label: "💡 금융·재테크" }
  ];

  // ── 상태 관리 ──
  var state = {
    currentTab: "subsidies",
    data: {
      subsidies: [],
      business: [],
      housing: [],
      medical: [],
      finance: []
    },
    posted: {},
    loaded: 0,
    totalToLoad: 6  // 5개 데이터 + posted_urls
  };

  // ── 한국 표준시 오늘 날짜 ──
  function getToday() {
    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    var kst = new Date(utc + (9 * 60 * 60 * 1000));
    var y = kst.getFullYear();
    var m = String(kst.getMonth() + 1).padStart(2, "0");
    var d = String(kst.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  var TODAY = getToday();

  // ── HTML 이스케이프 ──
  function esc(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 다크/라이트 모드 토글
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function initThemeToggle() {
    // 토글 버튼 생성
    var btn = document.createElement("button");
    btn.className = "theme-toggle";
    btn.id = "themeToggle";
    document.body.appendChild(btn);

    // 저장된 테마 불러오기
    var saved = localStorage.getItem("benefits-theme");
    if (saved === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      btn.textContent = "☀️";
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      btn.textContent = "🌙";
    }

    // 클릭 이벤트
    btn.addEventListener("click", function () {
      var current = document.documentElement.getAttribute("data-theme");
      if (current === "dark") {
        document.documentElement.setAttribute("data-theme", "light");
        localStorage.setItem("benefits-theme", "light");
        btn.textContent = "🌙";
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("benefits-theme", "dark");
        btn.textContent = "☀️";
      }
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // JSON 데이터 로드
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function fetchJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            callback(JSON.parse(xhr.responseText));
          } catch (e) {
            console.warn("JSON 파싱 실패:", url, e);
            callback(null);
          }
        } else {
          console.warn("데이터 로드 실패:", url, xhr.status);
          callback(null);
        }
      }
    };
    xhr.send();
  }

  function loadAllData() {
    // 5개 카테고리 데이터 로드
    TABS.forEach(function (tab) {
      fetchJSON(URLS[tab.key], function (data) {
        state.data[tab.key] = data || [];
        checkReady();
      });
    });

    // posted_urls 로드
    fetchJSON(URLS.posted, function (data) {
      state.posted = data || {};
      checkReady();
    });
  }

  function checkReady() {
    state.loaded++;
    if (state.loaded >= state.totalToLoad) {
      render();
    }
  }
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 마감일 계산 엔진
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function calcDeadline(deadline) {
    // 반환: { type, label, daysLeft, badgeClass }
    if (!deadline) {
      return { type: "none", label: "", daysLeft: 9999, badgeClass: "" };
    }
    if (deadline === "예산소진시") {
      return { type: "budget", label: "예산소진시", daysLeft: -1, badgeClass: "badge-budget" };
    }
    if (deadline === "상시모집") {
      return { type: "always", label: "상시모집", daysLeft: 8888, badgeClass: "badge-always" };
    }

    // YYYY-MM-DD 형식 날짜 파싱
    var match = deadline.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      return { type: "none", label: "", daysLeft: 9999, badgeClass: "" };
    }

    var todayParts = TODAY.split("-");
    var todayMs = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
    var endMs = new Date(match[1], match[2] - 1, match[3]).getTime();
    var diff = Math.ceil((endMs - todayMs) / (1000 * 60 * 60 * 24));

    if (diff < 0) {
      // 마감 지남 → 숨김 대상
      return { type: "expired", label: "마감", daysLeft: diff, badgeClass: "" };
    }
    if (diff === 0) {
      return { type: "urgent", label: "오늘마감", daysLeft: 0, badgeClass: "badge-urgent" };
    }
    if (diff <= 7) {
      return { type: "urgent", label: "-" + diff + "일", daysLeft: diff, badgeClass: "badge-urgent" };
    }

    // 7일 초과 → 일반
    return { type: "normal", label: "D-" + diff, daysLeft: diff, badgeClass: "badge-region" };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 정렬 함수
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function sortItems(items) {
    // 마감 지난 항목 제거
    var filtered = [];
    for (var i = 0; i < items.length; i++) {
      var dl = calcDeadline(items[i].deadline);
      if (dl.type !== "expired") {
        items[i]._dl = dl;
        filtered.push(items[i]);
      }
    }

    // 정렬 우선순위:
    // 1순위: 마감임박 (urgent) → 남은 일수 적은 순
    // 2순위: 예산소진시 (budget)
    // 3순위: 상시모집 (always)
    // 4순위: 일반 → 트렌드 점수 높은 순
    filtered.sort(function (a, b) {
      var prioA = getSortPriority(a._dl);
      var prioB = getSortPriority(b._dl);

      if (prioA !== prioB) return prioA - prioB;

      // 같은 우선순위 내에서
      if (a._dl.type === "urgent" && b._dl.type === "urgent") {
        return a._dl.daysLeft - b._dl.daysLeft; // 남은 일수 적은 순
      }

      // 트렌드 점수 높은 순
      return (b.trend_score || 0) - (a.trend_score || 0);
    });

    return filtered;
  }

  function getSortPriority(dl) {
    if (dl.type === "urgent") return 1;
    if (dl.type === "budget") return 2;
    if (dl.type === "always") return 3;
    return 4;
  }

  // 금융상품 정렬: 최고금리 높은 순 (예금/적금), 최저금리 낮은 순 (대출)
  function sortFinance(items) {
    var deposits = []; // 예금, 적금
    var loans = [];    // 대출

    for (var i = 0; i < items.length; i++) {
      var type = items[i].type || "";
      if (type.indexOf("대출") >= 0) {
        loans.push(items[i]);
      } else {
        deposits.push(items[i]);
      }
    }

    deposits.sort(function (a, b) {
      return (parseFloat(b.rate_max) || 0) - (parseFloat(a.rate_max) || 0);
    });

    loans.sort(function (a, b) {
      return (parseFloat(a.rate_basic) || 99) - (parseFloat(b.rate_basic) || 99);
    });

    return deposits.concat(loans);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Toast 알림
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function showToast(msg) {
    var existing = document.getElementById("benefitsToast");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.id = "benefitsToast";
    toast.className = "toast";
    toast.textContent = msg;
    document.body.appendChild(toast);

    // 약간의 딜레이 후 표시 (CSS transition 작동 위해)
    setTimeout(function () { toast.classList.add("show"); }, 50);
    // 3초 후 자동 사라짐
    setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () { toast.remove(); }, 400);
    }, 3000);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 카드 클릭 핸들러
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function handleCardClick(item) {
    var id = item.id || "";
    var postedUrl = state.posted[id];

    if (postedUrl) {
      // 블로그 글 있음 → 같은 창에서 이동
      window.location.href = postedUrl;
    } else {
      // 블로그 글 없음 → 새 창으로 외부 사이트 + Toast
      var url = item.url || "";
      if (url) {
        window.open(url, "_blank");
      }
      showToast("📝 이 혜택의 상세 포스팅을 준비 중입니다!");
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 카드 HTML 생성
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function buildCard(item, isFinance) {
    var card = document.createElement("div");
    card.className = "card";

    var html = "";

    if (isFinance) {
      // 금융상품 카드
      html += '<div class="card-badges">';
      html += '<span class="badge badge-region">' + esc(item.type) + '</span>';
      html += '<span class="badge badge-region">' + esc(item.bank) + '</span>';
      html += '</div>';
      html += '<div class="card-title">' + esc(item.name) + '</div>';
      html += '<div class="card-desc">';
      if (item.rate_basic) {
        html += '<span class="rate-label">기본 </span>';
        html += '<span class="rate-highlight">' + esc(String(item.rate_basic)) + '%</span>';
      }
      if (item.rate_max) {
        html += ' <span class="rate-label">최고 </span>';
        html += '<span class="rate-highlight">' + esc(String(item.rate_max)) + '%</span>';
      }
      if (item.spcl_cnd) {
        html += '<br><span style="font-size:12px;color:var(--text-secondary)">우대: ' + esc(item.spcl_cnd).substring(0, 60) + '</span>';
      }
      html += '</div>';
      html += '<div class="card-meta">';
      if (item.join_way) html += '<span>' + esc(item.join_way).substring(0, 30) + '</span>';
      html += '</div>';

    } else {
      // 일반 혜택 카드
      var dl = item._dl || calcDeadline(item.deadline);

      html += '<div class="card-badges">';
      // 마감 배지
      if (dl.label && dl.badgeClass) {
        html += '<span class="badge ' + dl.badgeClass + '">[' + dl.label + ']</span>';
      }
      // 지역 배지
      if (item.region && item.region !== "전국") {
        html += '<span class="badge badge-region">' + esc(item.region) + '</span>';
      }
      html += '</div>';

      html += '<div class="card-title">' + esc(item.name) + '</div>';
      html += '<div class="card-desc">' + esc(item.desc) + '</div>';
      html += '<div class="card-meta">';
      if (item.org) html += '<span>' + esc(item.org) + '</span>';
      if (item.region === "전국") html += '<span>전국</span>';
      html += '</div>';
    }

    card.innerHTML = html;

    // 클릭 이벤트
    card.addEventListener("click", function () {
      handleCardClick(item);
    });

    return card;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 사이드바 HTML 생성
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function buildSidebar() {
    var container = document.getElementById("benefitsSidebar");
    if (!container) return;

    container.innerHTML = "";

    TABS.forEach(function (tab) {
      var items;
      if (tab.key === "finance") {
        items = sortFinance(state.data[tab.key]).slice(0, 5);
      } else {
        items = sortItems(state.data[tab.key].slice()).slice(0, 5);
      }

      if (items.length === 0) return;

      var section = document.createElement("div");
      section.className = "sidebar-section";

      var titleDiv = document.createElement("div");
      titleDiv.className = "sidebar-title";
      titleDiv.textContent = tab.label;
      section.appendChild(titleDiv);

      var list = document.createElement("ul");
      list.className = "sidebar-list";

      items.forEach(function (item) {
        var li = document.createElement("li");
        li.className = "sidebar-item";

        var html = "";

        if (tab.key === "finance") {
          // 금융상품 사이드바
          var rate = item.rate_max || item.rate_basic || "";
          if (rate) {
            html += '<span class="badge badge-region">' + esc(String(rate)) + '%</span>';
          }
          html += '<span class="sidebar-item-title">' + esc(item.bank) + ' ' + esc(item.name) + '</span>';
        } else {
          // 일반 혜택 사이드바
          var dl = calcDeadline(item.deadline);
          if (dl.label && dl.badgeClass) {
            html += '<span class="badge ' + dl.badgeClass + '">[' + dl.label + ']</span>';
          }
          html += '<span class="sidebar-item-title">' + esc(item.name) + '</span>';
        }

        li.innerHTML = html;
        li.addEventListener("click", function () {
          handleCardClick(item);
        });

        list.appendChild(li);
      });

      section.appendChild(list);
      container.appendChild(section);
    });
  }
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 탭 메뉴 생성
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function buildTabMenu() {
    var container = document.getElementById("benefitsTabs");
    if (!container) return;

    container.className = "nav-tabs";
    container.innerHTML = "";

    TABS.forEach(function (tab) {
      var btn = document.createElement("button");
      btn.className = "nav-tab" + (tab.key === state.currentTab ? " active" : "");
      btn.textContent = tab.label;
      btn.setAttribute("data-tab", tab.key);

      btn.addEventListener("click", function () {
        state.currentTab = tab.key;

        // 활성 탭 CSS 갱신
        var allBtns = container.querySelectorAll(".nav-tab");
        for (var i = 0; i < allBtns.length; i++) {
          allBtns[i].classList.remove("active");
        }
        btn.classList.add("active");

        // 카드 리스트 갱신
        renderCards();
      });

      container.appendChild(btn);
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 메인 카드 리스트 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function renderCards() {
    var container = document.getElementById("benefitsCards");
    if (!container) return;

    container.className = "card-list";
    container.innerHTML = "";

    var tabKey = state.currentTab;
    var isFinance = (tabKey === "finance");
    var rawData = state.data[tabKey] || [];

    if (rawData.length === 0) {
      container.innerHTML = '<div class="empty-state">데이터를 불러오는 중이거나 아직 수집된 정보가 없습니다.</div>';
      return;
    }

    var items;
    if (isFinance) {
      items = sortFinance(rawData);
    } else {
      items = sortItems(rawData.slice());
    }

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state">현재 표시할 혜택 정보가 없습니다.</div>';
      return;
    }

    // 최대 20개까지 표시 (성능 보호)
    var max = Math.min(items.length, 20);
    for (var i = 0; i < max; i++) {
      var card = buildCard(items[i], isFinance);
      container.appendChild(card);
    }

    // 20개 초과 시 더보기 안내
    if (items.length > 20) {
      var more = document.createElement("div");
      more.className = "empty-state";
      more.textContent = "총 " + items.length + "건 중 상위 20건을 표시 중입니다.";
      container.appendChild(more);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 업데이트 시각 표시
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function showUpdateTime() {
    var el = document.getElementById("benefitsUpdated");
    if (!el) return;

    fetchJSON(URLS.meta, function (meta) {
      if (meta && meta.updated_at) {
        el.textContent = "최근 업데이트: " + meta.updated_at + " KST";
        el.style.cssText = "font-size:11px;color:var(--text-muted);text-align:center;padding:8px;";
      }
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 전체 렌더링 (데이터 로드 완료 후 호출)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function render() {
    console.log("✅ 전국민 혜택존 렌더링 시작");

    // 각 카테고리별 로드 건수 콘솔 출력
    TABS.forEach(function (tab) {
      console.log("  " + tab.label + ": " + state.data[tab.key].length + "건");
    });

    buildTabMenu();
    renderCards();
    buildSidebar();
    showUpdateTime();

    console.log("✅ 렌더링 완료");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 초기화
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function init() {
    console.log("🚀 전국민 혜택존 엔진 가동");
    console.log("📅 오늘 날짜(KST): " + TODAY);

    // 다크/라이트 토글 초기화
    initThemeToggle();

    // 로딩 표시
    var cardsEl = document.getElementById("benefitsCards");
    if (cardsEl) {
      cardsEl.innerHTML = '<div class="loading">⏳ 혜택 정보를 불러오는 중...</div>';
    }

    // 데이터 로드 시작
    loadAllData();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DOM 로드 후 실행
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
