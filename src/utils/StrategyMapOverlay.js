const OVERLAY_ID = 'wdttgukji-strategy-map-overlay';
const EMBED_URL = 'https://www.google.com/maps/d/embed?mid=1BO4HBVkJ3lpXbZ3igQBpZiLfPpc&ehbc=2E312F';
const VIEWER_URL = 'https://www.google.com/maps/d/u/0/viewer?mid=1BO4HBVkJ3lpXbZ3igQBpZiLfPpc&ll=32.76210115743599%2C117.35409260535701&z=7';

function buildOverlay() {
  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div data-role="backdrop" class="strategy-map-backdrop"></div>
    <section class="strategy-map-shell" role="dialog" aria-modal="true" aria-label="삼국 작전도">
      <header class="strategy-map-header">
        <div class="strategy-map-copy">
          <div class="strategy-map-kicker">작전 참조도</div>
          <strong class="strategy-map-title">후한-삼국 방면도</strong>
          <p data-role="context" class="strategy-map-context">현재 전장의 방면과 수로, 관문 흐름을 함께 봅니다.</p>
        </div>
        <div class="strategy-map-actions">
          <a data-role="link" class="strategy-map-link" href="${VIEWER_URL}" target="_blank" rel="noreferrer">새 탭</a>
          <button data-role="close" type="button" class="strategy-map-close">닫기</button>
        </div>
      </header>
      <div class="strategy-map-frame">
        <iframe
          data-role="iframe"
          title="후한-삼국 방면도"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          allowfullscreen
        ></iframe>
      </div>
    </section>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 28px;
      font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    #${OVERLAY_ID}[data-open="true"] {
      display: flex;
    }
    #${OVERLAY_ID} .strategy-map-backdrop {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 50% 20%, rgba(201, 168, 76, 0.14), transparent 34%),
        rgba(4, 5, 8, 0.8);
      backdrop-filter: blur(4px);
    }
    #${OVERLAY_ID} .strategy-map-shell {
      position: relative;
      width: min(1240px, calc(100vw - 56px));
      height: min(820px, calc(100vh - 56px));
      border-radius: 22px;
      overflow: hidden;
      border: 1px solid rgba(201, 168, 76, 0.28);
      background: rgba(8, 10, 16, 0.94);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42);
      display: flex;
      flex-direction: column;
    }
    #${OVERLAY_ID} .strategy-map-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      padding: 18px 22px 14px;
      border-bottom: 1px solid rgba(201, 168, 76, 0.14);
      background: linear-gradient(180deg, rgba(201, 168, 76, 0.08), rgba(8, 10, 16, 0));
    }
    #${OVERLAY_ID} .strategy-map-copy {
      min-width: 0;
    }
    #${OVERLAY_ID} .strategy-map-kicker {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #c9a84c;
      margin-bottom: 5px;
    }
    #${OVERLAY_ID} .strategy-map-title {
      display: block;
      font-family: 'Noto Serif KR', serif;
      font-size: 22px;
      color: #f0f0ff;
      margin-bottom: 6px;
    }
    #${OVERLAY_ID} .strategy-map-context {
      margin: 0;
      font-size: 12px;
      line-height: 1.45;
      color: #aeb4c6;
    }
    #${OVERLAY_ID} .strategy-map-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-shrink: 0;
    }
    #${OVERLAY_ID} .strategy-map-link,
    #${OVERLAY_ID} .strategy-map-close {
      border-radius: 999px;
      border: 1px solid rgba(201, 168, 76, 0.26);
      background: rgba(18, 22, 32, 0.9);
      color: #f0f0ff;
      text-decoration: none;
      font-size: 12px;
      font-weight: 700;
      padding: 10px 14px;
      cursor: pointer;
    }
    #${OVERLAY_ID} .strategy-map-close:hover,
    #${OVERLAY_ID} .strategy-map-link:hover {
      background: rgba(201, 168, 76, 0.14);
    }
    #${OVERLAY_ID} .strategy-map-frame {
      position: relative;
      flex: 1;
      background:
        linear-gradient(180deg, rgba(201, 168, 76, 0.06), transparent 18%),
        #0a0a0f;
    }
    #${OVERLAY_ID} iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #10141b;
    }
    @media (max-width: 900px) {
      #${OVERLAY_ID} {
        padding: 12px;
      }
      #${OVERLAY_ID} .strategy-map-shell {
        width: calc(100vw - 24px);
        height: calc(100vh - 24px);
      }
      #${OVERLAY_ID} .strategy-map-header {
        flex-direction: column;
        align-items: stretch;
      }
      #${OVERLAY_ID} .strategy-map-actions {
        justify-content: flex-end;
      }
    }
  `;
  root.appendChild(style);
  document.body.appendChild(root);

  const iframe = root.querySelector('[data-role="iframe"]');
  const context = root.querySelector('[data-role="context"]');
  const backdrop = root.querySelector('[data-role="backdrop"]');
  const close = root.querySelector('[data-role="close"]');

  const api = {
    root,
    open(nextContext) {
      if (nextContext) api.setContext(nextContext);
      if (!iframe.src) iframe.src = EMBED_URL;
      root.dataset.open = 'true';
      root.setAttribute('aria-hidden', 'false');
    },
    close() {
      root.dataset.open = 'false';
      root.setAttribute('aria-hidden', 'true');
    },
    toggle(nextContext) {
      if (root.dataset.open === 'true') api.close();
      else api.open(nextContext);
    },
    isOpen() {
      return root.dataset.open === 'true';
    },
    setContext(nextContext = '') {
      if (context) {
        context.textContent = nextContext || '현재 전장의 방면과 수로, 관문 흐름을 함께 봅니다.';
      }
    },
  };

  close?.addEventListener('click', () => api.close());
  backdrop?.addEventListener('click', () => api.close());
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && api.isOpen()) {
      api.close();
    }
  });

  return api;
}

export function ensureStrategyMapOverlay() {
  if (!window.__wdttgukjiStrategyMapOverlay) {
    window.__wdttgukjiStrategyMapOverlay = buildOverlay();
  }
  return window.__wdttgukjiStrategyMapOverlay;
}

export function getStrategyMapUrls() {
  return { embed: EMBED_URL, viewer: VIEWER_URL };
}
