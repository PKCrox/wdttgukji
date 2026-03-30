// EventUI — 이벤트 모달: 서사 텍스트 + 선택지 버튼

export class EventUI {
  constructor() {
    this.modal = document.getElementById('event-modal');
    this.title = document.getElementById('event-title');
    this.narrative = document.getElementById('event-narrative');
    this.flavor = document.getElementById('event-flavor');
    this.choicesContainer = document.getElementById('event-choices');
    this.continueBtn = document.getElementById('event-continue');
    this._resolve = null;
  }

  // 이벤트를 표시하고 플레이어 선택을 기다림
  // 반환: 선택된 choiceId (선택지 없으면 null)
  show(event) {
    return new Promise(resolve => {
      this._resolve = resolve;

      this.title.textContent = event.name;
      this.narrative.textContent = event.narrative?.text || '';

      if (event.narrative?.flavor) {
        this.flavor.textContent = event.narrative.flavor;
        this.flavor.classList.remove('hidden');
      } else {
        this.flavor.classList.add('hidden');
      }

      // 선택지
      this.choicesContainer.innerHTML = '';
      if (event.choices && event.choices.length > 0) {
        this.continueBtn.classList.add('hidden');
        for (const choice of event.choices) {
          const btn = document.createElement('button');
          btn.className = 'choice-btn';
          btn.textContent = choice.text;
          btn.addEventListener('click', () => this._select(choice.id));
          this.choicesContainer.appendChild(btn);
        }
      } else {
        // 선택지 없으면 "계속" 버튼
        this.continueBtn.classList.remove('hidden');
        this.continueBtn.onclick = () => this._select(null);
      }

      this.modal.classList.remove('hidden');
    });
  }

  _select(choiceId) {
    this.modal.classList.add('hidden');
    if (this._resolve) {
      this._resolve(choiceId);
      this._resolve = null;
    }
  }

  hide() {
    this.modal.classList.add('hidden');
  }
}
