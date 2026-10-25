import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateKnowledge as validateBeginner } from '../past-exams/knowledge-beginner.mjs';
import { validateKnowledge as validateLegacy } from '../past-exams/knowledge.mjs';

const root = new URL('../past-exams/', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const data = read('data/exams.json');
const questions = data.exams.flatMap(exam => exam.questions);
const question = questions.find(q => q.id === 'd2-20201004-am-22');
const authority = '電気設備の技術基準の解釈';

test('the reported grounding explanation names the external rule and the three-phase condition', () => {
  assert.equal(question.answer, 'ロ');
  assert.equal(question.historicalAnswer, 'ロ');
  assert.match(question.explanation.summary, /三相3線式200 V/);
  assert.ok(question.explanation.summary.includes(authority));
  assert.match(question.explanation.summary, /第159条第3項第四号/);
  assert.doesNotMatch(question.explanation.summary, /示された接地省略条件/);
  assert.match(question.explanation.reasoning, /交流対地電圧150 V以下/);
  assert.match(question.explanation.reasoning, /問題文が示しているのは/);
});

test('the four options identify the relevant object-specific grounding clauses', () => {
  const options = question.explanation.options;
  for (const text of Object.values(options)) assert.ok(text.includes(authority));
  assert.match(options.イ, /第158条第3項第五号イ（イ）/);
  assert.match(options.ハ, /第29条第2項第一号/);
  assert.match(options.ニ, /第159条第3項第四号ただし書ロ/);
  assert.doesNotMatch(JSON.stringify(options), /本問に示された低圧機器の省略条件/);
  const citations = JSON.stringify([...question.lawAudit.sources, ...question.explanation.sources]);
  assert.doesNotMatch(citations, /第158条第3項第六号/);
});

test('editorial changes preserve all 1250 question identities, grading decisions, exclusions and question images', () => {
  assert.equal(data.questionCount, 1250);
  assert.equal(questions.length, 1250);
  const contract = data.exams.flatMap(exam => exam.questions.map(q => ({
    examId: exam.id,
    id: q.id,
    answer: q.answer,
    historicalAnswer: q.historicalAnswer ?? null,
    excluded: q.excluded ?? null,
    auditStatus: q.lawAudit.status,
    normalPracticeIncluded: q.lawAudit.normalPracticeIncluded ?? null,
    currentCorrect: q.lawAudit.currentCorrect ?? null,
    historicalCorrect: q.lawAudit.historicalCorrect ?? null,
    images: q.images,
  })));
  assert.equal(hash(JSON.stringify(contract)), 'd089a86e4942c6d8768b9cc66d2de85c521a248e019e94322a545c386c36b270');
});

test('explanation-only correction keeps the saved-paper data version and both knowledge loaders compatible', () => {
  assert.equal(data.dataVersion, '2017-2026-study-25papers-positive-explanations-e676593e19d18960-v6');
  validateBeginner(read('data/knowledge-beginner.json'), questions, data.dataVersion);
  validateLegacy(read('data/knowledge.json'), questions, data.dataVersion);
});

test('the related learning cards distinguish equipment, conduit and electrical-appliance rules', () => {
  const cards = read('data/knowledge-beginner.json').cards;
  assert.match(cards['construction-earth-conduit-lengths'].firstPrinciple, /第159条第3項第四号/);
  assert.match(cards['construction-earth-decisions'].firstPrinciple, /第29条第2項/);
  assert.match(cards['design-tap-distance'].firstPrinciple, /第149条第1項第一号/);
  assert.match(cards['diagram-small-power-core'].details[0].body, /第181条第1項第二号/);
  assert.match(cards['equipment-overcurrent-time-grid'].firstPrinciple, /電気用品の技術上の基準を定める省令の解釈について/);
});

test('every published asset matches the release manifest', () => {
  const manifest = read('release-manifest.json');
  for (const [path, expected] of Object.entries(manifest.files)) {
    assert.equal(hash(fs.readFileSync(new URL(path, root))), expected, path);
  }
});
