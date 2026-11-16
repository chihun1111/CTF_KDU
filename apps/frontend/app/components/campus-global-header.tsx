export function CampusGlobalHeader() {
  return (
    <header className="campusGlobalHeader">
      <div className="campusGlobalHeaderInner">
        <a className="campusGlobalBrand" href="/" aria-label="문제 목록으로 돌아가기">
          <span className="campusGlobalBrandMark">KDU</span>
          <span className="campusGlobalBrandCopy">
            <strong className="campusGlobalBrandText">교내 CTF</strong>
            <small>2026 참가자 메인</small>
          </span>
        </a>
        <a className="campusGlobalHomeLink" href="/">
          문제 목록
        </a>
      </div>
    </header>
  );
}
