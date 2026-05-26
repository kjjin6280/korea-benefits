/* ===== v4 추가 스타일 ===== */

/* 🆕 신규 카드 하이라이트 */
.card-new {
  border-left: 4px solid #e53935;
  background: linear-gradient(135deg, var(--bg-card) 95%, #fee2e2 100%);
}
[data-theme="dark"] .card-new {
  background: linear-gradient(135deg, var(--bg-card) 95%, #451a1a 100%);
}

/* 🆕 배지 */
.badge-new {
  background: #fce4ec;
  color: #c62828;
  animation: badge-pulse 1.5s ease-in-out infinite;
}
[data-theme="dark"] .badge-new {
  background: #451a1a;
  color: #fca5a5;
}

/* 사이드바 🆕 */
.sidebar-new {
  font-size: 10px;
}

/* 금융 유형 배지 색상 */
.badge-finance-loan {
  background: #e3f2fd;
  color: #1565c0;
}
.badge-finance-rate {
  background: #e8f5e9;
  color: #2e7d32;
}
.badge-finance-youth {
  background: #f3e5f5;
  color: #6a1b9a;
}
.badge-finance-house {
  background: #fff3e0;
  color: #e65100;
}
.badge-finance-recovery {
  background: #fce4ec;
  color: #c62828;
}
.badge-finance-guarantee {
  background: #e0f2f1;
  color: #00695c;
}
.badge-finance-edu {
  background: #e8eaf6;
  color: #283593;
}

[data-theme="dark"] .badge-finance-loan     { background: #1e3a5f; color: #90caf9; }
[data-theme="dark"] .badge-finance-rate      { background: #1b3a1b; color: #a5d6a7; }
[data-theme="dark"] .badge-finance-youth     { background: #2a1a3e; color: #ce93d8; }
[data-theme="dark"] .badge-finance-house     { background: #3e2700; color: #ffb74d; }
[data-theme="dark"] .badge-finance-recovery  { background: #451a1a; color: #ef9a9a; }
[data-theme="dark"] .badge-finance-guarantee { background: #1a3a38; color: #80cbc4; }
[data-theme="dark"] .badge-finance-edu       { background: #1a237e; color: #9fa8da; }

/* 금융 요약 */
.finance-summary {
  font-size: 11px;
  color: var(--text-muted);
}
