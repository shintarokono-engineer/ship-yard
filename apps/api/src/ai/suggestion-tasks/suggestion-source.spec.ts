import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { pickSuggestions } from './suggestion-source';

/** 診断側の正常な提案 3 件(axis は DIAGNOSIS_AXES の値)。 */
const DIAGNOSIS_SUGGESTIONS = [
  { priority: 'HIGH', axis: 'differentiation', title: '差別化を明文化する', body: '本文 A' },
  { priority: 'MEDIUM', axis: 'targetClarity', title: 'ターゲットを絞る', body: '本文 B' },
  { priority: 'LOW', axis: 'releaseReadiness', title: 'リリース準備をする', body: '本文 C' },
];

describe('pickSuggestions', () => {
  it('指定した index の提案だけを取り出す', () => {
    const picked = pickSuggestions(DIAGNOSIS_SUGGESTIONS, [0, 2], 'DIAGNOSIS');
    expect(picked.map((s) => s.title)).toEqual(['差別化を明文化する', 'リリース準備をする']);
  });

  it('axis を日本語ラベルに解決する', () => {
    const picked = pickSuggestions(DIAGNOSIS_SUGGESTIONS, [0], 'DIAGNOSIS');
    expect(picked).toEqual([
      { priority: 'HIGH', axisLabel: '差別化', title: '差別化を明文化する', body: '本文 A' },
    ]);
  });

  it('indexes の並び順ではなく元配列の順で返す(優先度の並びを保つため)', () => {
    const picked = pickSuggestions(DIAGNOSIS_SUGGESTIONS, [2, 0], 'DIAGNOSIS');
    expect(picked.map((s) => s.title)).toEqual(['差別化を明文化する', 'リリース準備をする']);
  });

  it('検証側の軸も解決できる', () => {
    const validation = [
      { priority: 'HIGH', axis: 'marketPotential', title: '市場を調べる', body: '本文' },
    ];
    const picked = pickSuggestions(validation, [0], 'IDEA_VALIDATION');
    expect(picked.map((s) => s.axisLabel)).toEqual(['市場性']);
  });

  it('診断の軸を検証として解釈しようとしたらスキップされる(source ごとに軸集合が違う)', () => {
    // featureCompleteness は DIAGNOSIS_AXES にしか無い。
    const rows = [
      { priority: 'HIGH', axis: 'featureCompleteness', title: 'x', body: 'y' },
      { priority: 'LOW', axis: 'marketPotential', title: '残る', body: 'y' },
    ];
    const picked = pickSuggestions(rows, [0, 1], 'IDEA_VALIDATION');
    expect(picked.map((s) => s.title)).toEqual(['残る']);
  });

  it('Json が配列でないときは 400', () => {
    expect(() => pickSuggestions(null, [0], 'DIAGNOSIS')).toThrow(BadRequestException);
    expect(() => pickSuggestions({ items: [] }, [0], 'DIAGNOSIS')).toThrow(BadRequestException);
    expect(() => pickSuggestions('[]', [0], 'DIAGNOSIS')).toThrow(BadRequestException);
  });

  it('index が範囲外なら 400', () => {
    expect(() => pickSuggestions(DIAGNOSIS_SUGGESTIONS, [3], 'DIAGNOSIS')).toThrow(
      BadRequestException,
    );
    expect(() => pickSuggestions(DIAGNOSIS_SUGGESTIONS, [-1], 'DIAGNOSIS')).toThrow(
      BadRequestException,
    );
    expect(() => pickSuggestions(DIAGNOSIS_SUGGESTIONS, [0.5], 'DIAGNOSIS')).toThrow(
      BadRequestException,
    );
  });

  it('壊れた要素はスキップする(未知の priority / 未知の axis / 空 title / 空 body)', () => {
    const rows = [
      { priority: 'URGENT', axis: 'differentiation', title: 'x', body: 'y' },
      { priority: 'HIGH', axis: 'unknownAxis', title: 'x', body: 'y' },
      { priority: 'HIGH', axis: 'differentiation', title: '   ', body: 'y' },
      { priority: 'HIGH', axis: 'differentiation', title: 'x', body: '   ' },
      { priority: 'HIGH', axis: 'differentiation', title: '残る', body: '本文' },
    ];
    const picked = pickSuggestions(rows, [0, 1, 2, 3, 4], 'DIAGNOSIS');
    expect(picked.map((s) => s.title)).toEqual(['残る']);
  });

  it('要素がオブジェクトでないものをスキップする', () => {
    const rows = [null, '文字列', DIAGNOSIS_SUGGESTIONS[0]];
    const picked = pickSuggestions(rows, [0, 1, 2], 'DIAGNOSIS');
    expect(picked).toHaveLength(1);
  });

  it('title 60 字 / body 500 字で切り詰める(手編集された古い行への二重防御)', () => {
    const rows = [
      {
        priority: 'HIGH',
        axis: 'differentiation',
        title: 'あ'.repeat(100),
        body: 'い'.repeat(900),
      },
    ];
    const picked = pickSuggestions(rows, [0], 'DIAGNOSIS');
    expect(picked.map((s) => [s.title.length, s.body.length])).toEqual([[60, 500]]);
  });

  it('選択した提案がすべて壊れていたら 400(空配列でプロンプトを組ませない)', () => {
    const rows = [{ priority: 'URGENT', axis: 'differentiation', title: 'x', body: 'y' }];
    expect(() => pickSuggestions(rows, [0], 'DIAGNOSIS')).toThrow(BadRequestException);
  });
});
