/* MDocify 템플릿: clean — 미리보기(.content)와 동일한 룩을 .docx 로 재현.
 * 단위: 폰트 size=half-point(21=10.5pt), spacing=twip(1440=1inch, 1mm≈56.7twip), 테두리 size=1/8pt.
 * 색상은 # 없는 hex. 미리보기 CSS(--brand #1D4ED8 / --accent #2563EB / --doc-size 14px)와 매칭.
 */
window.TPL_CLEAN = {
  id: 'clean',
  name: '표준 (편집용)',
  font: '맑은 고딕',
  codeFont: 'Consolas',
  brand: '1D4ED8',
  accent: '2563EB',
  bodySize: 21,            // 10.5pt (=14px)
  bodyColor: '1F2937',
  page: { margin: { top: 1020, bottom: 1020, left: 850, right: 850 } }, // 18mm / 15mm
  contentWidthPx: 660,
  para: { after: 120, line: 288 },   // 줄간격 1.2 (docx에서 1.6은 과하게 벌어져 1.2로)
  heading: {
    1: { size: 42, color: '1D4ED8', bold: true, before: 300, after: 150, badge: true, bottomBorder: true, bottomBorderColor: '1D4ED8', bottomBorderSize: 24 }, // 21pt + 브랜드 하단선
    2: { size: 30, color: '1D4ED8', bold: true, before: 300, after: 130, leftBar: '1D4ED8', bottomBorder: true, badge: true }, // 15pt
    3: { size: 24, color: '334155', bold: true, before: 240, after: 110, leftBar: '2563EB', badge: true },        // 12pt
    4: { size: 22, color: '334155', bold: true, before: 190, after: 90 },
    5: { size: 21, color: '334155', bold: true, before: 170, after: 70 },
    6: { size: 20, color: '64748B', bold: true, before: 170, after: 70 }
  },
  sn: { fill: '1D4ED8', color: 'FFFFFF' },   // 섹션 배지 (A/B/C…)
  code: {
    size: 17, fill: '0F172A', color: 'E2E8F0',   // 다크 코드블록
    syntax: { com: '6A9955', str: 'CE9178', num: 'B5CEA8', kw: '569CD6', fn: 'DCDCAA', lit: '569CD6' }
  },
  inlineCode: { fill: 'F1F5F9', color: '0F172A' },
  blockquote: { barColor: '2563EB', fill: 'EEF3FE', color: '1D4ED8', indent: 360 },
  link: { color: '2563EB' },
  del: { color: '94A3B8' },
  table: { headerFill: '1D4ED8', headerColor: 'FFFFFF', border: 'E2E8F0', evenFill: 'F8FAFC' },
  hrColor: 'E2E8F0',
  cover: { titleSize: 52, titleColor: '1D4ED8', subColor: '64748B', kickerColor: '2563EB', barColor: '2563EB', metaKColor: '94A3B8' }
};
