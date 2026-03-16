/**
 * 나무위키 HTML 파서 v2
 *
 * 나무위키 실제 구조:
 * - CSS 클래스: 난독화(해시). 클래스 기반 파싱 불가
 * - heading은 h2/h3/h4 태그 사용 (h2 = 대섹션, h3 = 소섹션)
 * - heading 텍스트에 "[편집]" 포함, 앞에 "1.2. " 같은 번호
 * - heading과 content는 같은 부모의 별도 자식 div (교차 배치)
 * - 긴 섹션은 하위 문서로 분리 (예: 조조/생애) — content에 리다이렉트 링크+이미지만 남음
 */
import * as cheerio from 'cheerio';

/**
 * 나무위키 HTML에서 본문을 파싱
 * @param {string} html
 * @returns {{ title: string, sections: ParsedSection[], subpageLinks: SubpageLink[], internalLinks: string[] }}
 *
 * @typedef {{ heading: string, level: number, content: string, subpageUrl?: string }} ParsedSection
 * @typedef {{ sectionName: string, url: string }} SubpageLink
 */
export function parseNamuHtml(html) {
  const $ = cheerio.load(html);
  const title = $('title').text().replace(/ - 나무위키$/, '').trim();

  // 메인 컨텐츠 컨테이너 찾기: 모든 h2를 포함하는 가장 깊은 조상
  const h2Count = $('h2').length;
  if (h2Count === 0) {
    // heading이 없으면 전체 body 텍스트를 하나의 섹션으로
    return {
      title,
      sections: [{ heading: '본문', level: 2, content: extractText($, $('body')) }],
      subpageLinks: [],
      internalLinks: extractLinks($),
    };
  }

  let container = $('h2').first().parent();
  while (container.length && container.find('h2').length < h2Count && container[0].tagName !== 'body') {
    container = container.parent();
  }

  // 컨테이너 자식들을 순서대로 순회하며 heading/content 매칭
  const sections = [];
  const subpageLinks = [];
  const children = container.children().toArray();

  let currentHeading = null;
  let currentLevel = 2;
  let introContent = [];

  for (const child of children) {
    const $child = $(child);

    // heading 감지: h2, h3, h4를 직접 포함하는 div
    const heading = $child.find('h2, h3, h4, h5, h6').first();
    const isDirectHeading = /^h[2-6]$/.test(child.tagName);

    if (heading.length || isDirectHeading) {
      const $h = isDirectHeading ? $child : heading;
      const rawText = $h.text().trim();
      const level = parseInt(($h[0]?.tagName || 'h2')[1]) || 2;
      const cleanHeading = rawText
        .replace(/\[편집\]/g, '')
        .replace(/^\d+(\.\d+)*\.?\s*/, '')
        .trim();

      if (!cleanHeading || cleanHeading === '둘러보기') continue;

      // 하위 문서 링크 감지 (heading 내 링크)
      const headingLink = $h.find('a[href^="/w/"]').first();
      const subpageUrl = headingLink.length
        ? decodeURIComponent(headingLink.attr('href').replace('/w/', ''))
        : null;

      currentHeading = cleanHeading;
      currentLevel = level;

      sections.push({
        heading: cleanHeading,
        level,
        content: '',
        ...(subpageUrl && subpageUrl.includes('/') ? { subpageUrl } : {}),
      });

    } else {
      // content div
      const text = extractText($, $child);

      // 하위 문서 리다이렉트 감지: 내용이 짧고 링크만 있는 경우
      const contentLinks = [];
      $child.find('a[href^="/w/"]').each((_, a) => {
        contentLinks.push(decodeURIComponent($(a).attr('href').replace('/w/', '')));
      });

      if (text.length < 50 && contentLinks.length > 0) {
        // 하위 문서 리다이렉트
        const subUrl = contentLinks.find(l => l.includes('/'));
        if (subUrl && sections.length > 0) {
          const lastSection = sections[sections.length - 1];
          lastSection.subpageUrl = subUrl;
          subpageLinks.push({ sectionName: lastSection.heading, url: subUrl });
        }
        continue;
      }

      if (text.length > 10) {
        if (sections.length > 0) {
          const lastSection = sections[sections.length - 1];
          lastSection.content += (lastSection.content ? '\n\n' : '') + text;
        } else {
          introContent.push(text);
        }
      }
    }
  }

  // intro (heading 이전 텍스트)를 첫 번째 섹션 앞에 추가
  if (introContent.length > 0) {
    sections.unshift({
      heading: '개요',
      level: 2,
      content: introContent.join('\n\n'),
    });
  }

  return {
    title,
    sections,
    subpageLinks,
    internalLinks: extractLinks($),
  };
}

/**
 * DOM 요소에서 깨끗한 텍스트 추출
 * - img 태그 제거
 * - 각주 번호 [N] 제거
 * - 불필요 공백 정리
 */
function extractText($, $el) {
  // clone 후 불필요한 요소 제거
  const $clone = $el.clone();
  $clone.find('img, svg, script, style, noscript').remove();

  let text = $clone.text().trim();

  // 각주 번호 제거
  text = text.replace(/\[\d+\]/g, '');
  // 연속 공백/개행 정리
  text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ');
  // 광고 텍스트 제거
  text = text.replace(/^(결혼피로연|광고|이 저작물은 CC).+$/gm, '');

  return text.trim();
}

/**
 * 내부 링크 추출 (관계 네트워크용)
 */
function extractLinks($) {
  const links = new Set();
  $('a[href^="/w/"]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const decoded = decodeURIComponent(href.replace('/w/', '').split('#')[0]);
    if (!decoded.startsWith('분류:') && !decoded.startsWith('틀:') && !decoded.startsWith('파일:')
        && !decoded.includes('편집') && decoded.length > 0) {
      links.add(decoded);
    }
  });
  return [...links];
}

/**
 * soul.md 생성에 필요한 핵심 섹션들을 추출
 */
export function extractSoulRelevant(sections) {
  const patterns = {
    overview: /^개요$/,
    biography: /생애|일대기|행적/,
    evaluation: /평가|업적|공과/,
    relationships: /인물|관계|교류/,
    anecdotes: /일화|에피소드|기타$/,
    quotes: /어록|명언|대사/,
    personality: /성격|인물됨|인품/,
    military: /군사|전투|전쟁|무공/,
    politics: /정치|행정|내치/,
    family: /가족|가계|후손/,
    death: /사망|최후|죽음|말년/,
    name: /이름|호칭|명칭/,
  };

  const result = {};
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = sections.find(s => pattern.test(s.heading));
    if (match && match.content) {
      result[key] = match.content;
    }
  }
  return result;
}
