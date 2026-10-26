import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const data=JSON.parse(fs.readFileSync(new URL('../past-exams/data/exams.json',import.meta.url)));
const qs=new Map(data.exams.flatMap(e=>e.questions).map(q=>[q.id,q]));
const ids=['d2-20180603-50','d2-20181007-50','d2-20201004-am-44','d2-20210530-am-49','d2-20210530-pm-49','d2-20210530-pm-50','d2-20211024-pm-16','d2-20231029-am-46','d2-20241027-50','d2-20251026-49','d2-20260524-49'];
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const currentText=q=>JSON.stringify({title:q.title,conceptTags:q.conceptTags,topic:q.topic,explanation:q.explanation,lawAudit:q.lawAudit});
test('all 11 scoped visual correction records retain valid provenance hashes',()=>{
 for(const id of ids){const q=qs.get(id);assert.ok(q,id);if(q.explanationReview.method==='scoped_visual_identification_correction')assert.equal(q.explanationReview.contentSha256,hash(q.explanation),id);assert.equal(q.visualCorrectionAudit.answerChanged,false);if(q.explanationReview.method==='scoped_visual_identification_correction' && q.explanationReview.lawAuditSha256)assert.equal(q.explanationReview.lawAuditSha256,hash(q.lawAudit),id);}
});
test('H30 upper 50 identifies the VVF junction box consistently across current record',()=>{
 const q=qs.get(ids[0]);assert.doesNotMatch(currentText(q),/リモコンセレクタ|2つの差込口/);assert.match(q.explanation.reasoning,/ロのVVF用ジョイントボックス/);assert.match(q.explanation.options.ロ,/VVF用ジョイントボックス/);assert.match(q.explanation.reasoning,/2つの電源用刃受け穴/);
});
test('R6 lower 50 separates FEP and PF connectors without stale grouping',()=>{
 const q=qs.get('d2-20241027-50');assert.doesNotMatch(currentText(q),/ハ・ニは合成樹脂製可とう|合成樹脂製可とう電線管用カップリング/);assert.match(q.explanation.reasoning,/ハはFEP管用、ニはPF管用のコネクタ/);assert.match(q.explanation.options.ハ,/FEP管用コネクタ/);assert.match(q.explanation.options.ニ,/PF管）用コネクタ/);assert.match(q.explanation.options.ニ,/カップリングではなく/);
});
test('R7 lower 49 audit note agrees with Prika knife explanation',()=>{
 const q=qs.get('d2-20251026-49');assert.doesNotMatch(currentText(q),/写真ロは合成樹脂管用のこぎり|1階屋外VE28/);for(const text of [q.lawAudit.note,q.explanation.summary,q.explanation.reasoning,q.explanation.options.ロ])assert.match(text,/プリカナイフ/);assert.match(q.lawAudit.note,/金属可とう電線管/);
});
