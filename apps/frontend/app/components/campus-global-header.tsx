export function CampusGlobalHeader() {
  return (
    <header className="campusGlobalHeader">
      <div className="campusGlobalHeaderInner">
        <a className="campusGlobalBrand" href="/hub" aria-label="교내 서비스 목록으로 돌아가기">
          <span className="campusGlobalBrandMark">KDU</span>
          <span className="campusGlobalBrandCopy">
            <strong className="campusGlobalBrandText">교내 서비스</strong>
            <small>통합 안내 포털</small>
          </span>
        </a>
        <a className="campusGlobalHomeLink" href="/hub">
          전체 서비스 보기
        </a>
      </div>
    </header>
  );
}
