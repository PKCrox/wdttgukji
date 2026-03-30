import Phaser from 'phaser';
import { COLORS, COLORS_CSS, FONT_STYLES, FONTS, FACTION_COLORS } from '../utils/Theme.js';
import { CHAR_NAMES } from '../../engine/data/names.js';
import EventBus, { EVENTS } from '../utils/EventBus.js';

/**
 * BattleScene — 전투 결과 시각화 오버레이
 * ActionPanel에서 공격 성공 시 launch → 결과 표시 → 클릭/ESC 닫기
 */
export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.battleData = data; // { combat, fromCity, toCity, captured, oldOwner, attackerFaction, defenderFaction }
  }

  create() {
    const d = this.battleData;
    if (!d?.combat) { this.scene.stop(); return; }

    const combat = d.combat;
    const atkFc = FACTION_COLORS[d.attackerFaction] || FACTION_COLORS.neutral;
    const defFc = FACTION_COLORS[d.defenderFaction] || FACTION_COLORS.neutral;
    const isVictory = combat.winner === 'attacker';

    // 반투명 배경
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRect(0, 0, 1600, 900);

    // 패널
    const pw = 700, ph = 500;
    const px = (1600 - pw) / 2, py = (900 - ph) / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0x0e0e16, 0.97);
    panel.fillRoundedRect(px, py, pw, ph, 12);

    // 상단 결과 바
    const barColor = isVictory ? 0x4caf50 : 0xf44336;
    panel.fillStyle(barColor, 0.8);
    panel.fillRoundedRect(px, py, pw, 6, { tl: 12, tr: 12 });

    let cy = py + 30;

    // 제목
    const title = isVictory ? `${d.toCity} 점령!` : `${d.toCity} 공격 실패`;
    this.add.text(px + pw / 2, cy, title, {
      fontFamily: FONTS.title, fontSize: '28px', fontStyle: '700',
      color: isVictory ? '#4caf50' : '#f44336',
    }).setOrigin(0.5);
    cy += 40;

    // 라운드 / 진형
    this.add.text(px + pw / 2, cy, `${combat.rounds}라운드 · ${combat.formations.attacker} vs ${combat.formations.defender}`, {
      ...FONT_STYLES.bodyDim, fontSize: '13px',
    }).setOrigin(0.5);
    cy += 32;

    // ── 공격 vs 수비 비교 ──
    const midX = px + pw / 2;
    const leftX = px + pw * 0.25;
    const rightX = px + pw * 0.75;

    // 세력명
    this.add.text(leftX, cy, d.fromCity, {
      fontFamily: FONTS.ui, fontSize: '16px', fontStyle: '700', color: atkFc.css,
    }).setOrigin(0.5);
    this.add.text(midX, cy, 'VS', {
      fontFamily: FONTS.title, fontSize: '14px', fontStyle: '700', color: COLORS_CSS.textDim,
    }).setOrigin(0.5);
    this.add.text(rightX, cy, d.toCity, {
      fontFamily: FONTS.ui, fontSize: '16px', fontStyle: '700', color: defFc.css,
    }).setOrigin(0.5);
    cy += 30;

    // 장수
    const atkLead = combat.roundDetails?.[0]?.attackerGeneral;
    const defLead = combat.roundDetails?.[0]?.defenderGeneral;
    if (atkLead || defLead) {
      this.add.text(leftX, cy, CHAR_NAMES[atkLead] || atkLead || '-', {
        fontFamily: FONTS.ui, fontSize: '12px', color: COLORS_CSS.text,
      }).setOrigin(0.5);
      this.add.text(rightX, cy, CHAR_NAMES[defLead] || defLead || '-', {
        fontFamily: FONTS.ui, fontSize: '12px', color: COLORS_CSS.text,
      }).setOrigin(0.5);
      cy += 24;
    }

    // 손실 비교
    this.drawStatRow(leftX, midX, rightX, cy, '손실',
      `-${combat.attackerLoss.toLocaleString()}`, `-${combat.defenderLoss.toLocaleString()}`);
    cy += 28;

    this.drawStatRow(leftX, midX, rightX, cy, '잔여',
      combat.attackerRemaining.toLocaleString(), combat.defenderRemaining.toLocaleString());
    cy += 28;

    this.drawStatRow(leftX, midX, rightX, cy, '사기',
      `${combat.attackerMorale}`, `${combat.defenderMorale}`);
    cy += 36;

    // ── 특수 이벤트 ──
    if (combat.stratagemUsed) {
      const sColor = combat.stratagemUsed.success ? '#ffc107' : '#f44336';
      this.add.text(px + pw / 2, cy, `계략: ${combat.stratagemUsed.name} ${combat.stratagemUsed.success ? '성공!' : '실패'}`, {
        fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: sColor,
      }).setOrigin(0.5);
      cy += 28;
    }

    if (combat.duelOccurred) {
      this.add.text(px + pw / 2, cy, '일기토 발생!', {
        fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: '#ff9800',
      }).setOrigin(0.5);
      cy += 28;
    }

    // 포로
    if (d.captured?.length > 0) {
      const names = d.captured.map(id => CHAR_NAMES[id] || id).join(', ');
      this.add.text(px + pw / 2, cy, `포로: ${names}`, {
        fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '600', color: '#ce93d8',
      }).setOrigin(0.5);
      cy += 28;
    }

    // 구분선
    const lineGfx = this.add.graphics();
    lineGfx.lineStyle(1, COLORS.border, 0.2);
    lineGfx.lineBetween(px + 40, cy, px + pw - 40, cy);
    cy += 16;

    // 라운드 디테일 (요약)
    if (combat.roundDetails?.length) {
      this.add.text(px + pw / 2, cy, '라운드별 전투', {
        ...FONT_STYLES.bodyDim, fontSize: '11px',
      }).setOrigin(0.5);
      cy += 20;

      combat.roundDetails.slice(0, 5).forEach((rd, i) => {
        const rdText = `R${i + 1}: 공격 -${rd.attackerLoss || 0} · 방어 -${rd.defenderLoss || 0}${rd.duel ? ' ⚔' : ''}`;
        this.add.text(px + pw / 2, cy, rdText, {
          fontFamily: FONTS.ui, fontSize: '10px', color: COLORS_CSS.textDim,
        }).setOrigin(0.5);
        cy += 16;
      });
    }

    // 닫기 안내
    this.add.text(px + pw / 2, py + ph - 20, '클릭 또는 ESC로 닫기', {
      fontFamily: FONTS.ui, fontSize: '11px', color: COLORS_CSS.textDim,
    }).setOrigin(0.5);

    // 클릭/ESC 닫기
    this.input.once('pointerdown', () => this.closeBattle());
    this.input.keyboard.once('keydown-ESC', () => this.closeBattle());
    this.input.keyboard.once('keydown-SPACE', () => this.closeBattle());

    // 등장 애니메이션
    this.cameras.main.setAlpha(0);
    this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 300, ease: 'Sine.easeOut' });
  }

  drawStatRow(leftX, midX, rightX, cy, label, leftVal, rightVal) {
    this.add.text(midX, cy, label, {
      fontFamily: FONTS.ui, fontSize: '11px', color: COLORS_CSS.textDim,
    }).setOrigin(0.5);
    this.add.text(leftX, cy, leftVal, {
      fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: COLORS_CSS.text,
    }).setOrigin(0.5);
    this.add.text(rightX, cy, rightVal, {
      fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: COLORS_CSS.text,
    }).setOrigin(0.5);
  }

  closeBattle() {
    const returnCityId = this.battleData?.returnCityId;
    this.tweens.add({
      targets: this.cameras.main, alpha: 0, duration: 200,
      onComplete: () => {
        this.scene.stop('Battle');
        // 전투 후 ActionPanel 재오픈 (라이브 데이터로)
        if (returnCityId) {
          const gameplay = this.registry.get('gameplay');
          const city = gameplay?.state?.getCity(returnCityId);
          if (city) {
            this.scene.launch('ActionPanel', { cityId: returnCityId, city });
            this.scene.bringToTop('ActionPanel');
          }
        }
      },
    });
  }
}
