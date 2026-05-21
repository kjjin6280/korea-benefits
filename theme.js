// 전국민 혜택존 (korea-benefits) 실시간 구동 엔진
document.addEventListener("DOMContentLoaded", function() {
    console.log("전국민 혜택존 엔진 가동 시작");

    // 1. 한국 표준시(KST) 기준 오늘 날짜 구하기
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kstDate = new Date(utc + (9 * 60 * 60 * 1000));

    // 2. 마감일 카운트다운 연산 로직
    const postItems = document.querySelectorAll('.post-outer, .sidebar .widget-content li');
    
    postItems.forEach(item => {
        const dateMatch = item.innerText.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
            const endDate = new Date(dateMatch[0]);
            const timeDiff = endDate.getTime() - kstDate.getTime();
            const dayDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

            if (dayDiff < 0) {
                item.style.display = 'none'; // 마감 지난 글 숨김
            } 
            else if (dayDiff <= 7) {
                const badgeText = dayDiff === 0 ? "[오늘마감]" : `[-${dayDiff}일]`;
                const titleEl = item.querySelector('.post-title, a');
                if (titleEl && !titleEl.innerHTML.includes('badge')) {
                    titleEl.innerHTML = `<span class="badge" style="color:red; font-weight:bold;">${badgeText}</span> ` + titleEl.innerHTML;
                }
            }
        }
    });
});
