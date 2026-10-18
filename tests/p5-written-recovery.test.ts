import test from 'node:test';
import assert from 'node:assert/strict';
import { createSentenceSession } from '../src/features/sentences/session';
import { SentenceFixtureVoice } from '../src/features/sentences/__fixtures__/voice';
import { createVerbSession } from '../src/features/verbs/session';
import { createRealtimeVoiceAdapter } from '../src/voice';
import { parseWrittenSnapshot } from '../src/features/progress/written-snapshot-store';
import { createWrittenPracticeBinding } from '../src/features/progress/written-practice-binding';
import type { PracticeEvent, ProgressSink } from '../src/contracts';

function setup(userId = 'user', sessionId = 'session') {
  const events: PracticeEvent[] = []; const voice = new SentenceFixtureVoice();
  const sink: ProgressSink = { submit: async batch => { events.push(...batch); return { status: 'committed', acknowledgments: batch.map(e => ({ eventId:e.eventId, status:'accepted', committedRevision:events.length })), current:{sessionId,journalRevision:events.length} }; }, flush: async () => ({sessionId,journalRevision:events.length}) };
  const session = createSentenceSession({ voice, sessionId, writtenPracticeUserId:userId, difficulty:{grammar:1,vocabulary:1}, random:()=>0, progressSink:sink, onComplete:()=>assert.fail('written cannot complete oral') });
  const context = session.getSnapshot().assessment.context;
  assert.equal(context.mode,'sentence'); if(context.mode !== 'sentence') throw Error();
  return {session,voice,events,sink,answer:context.sentence.alternatives[0]!};
}
test('written translation and tense survive restore with exact IDs; dependent edits invalidate only written work', () => {
  const a=setup();a.session.editWritten(a.answer.text);a.session.finalizeWritten();a.session.selectWrittenTense(a.answer.tense);
  assert.deepEqual(a.events.map(e=>e.ref.obligation),['written:translation','written:tense']);
  const snapshot=a.session.snapshotWrittenPractice()!;const b=setup();
  assert.equal(b.session.restoreWrittenPractice(snapshot),true);
  assert.deepEqual(b.session.snapshotWrittenPractice(),snapshot);assert.equal(b.events.length,0);
  assert.deepEqual(b.session.getSnapshot().assessment.evidence,{});assert.equal(b.voice.connects,0);assert.equal(b.voice.inputs.length,0);
  b.session.editWritten('a different draft'); b.session.finalizeWritten();
  assert.deepEqual(b.events.map(e=>[e.kind,e.ref.obligation,e.ref.revision]),[
    ['attempt-invalidated','written:translation',2],['attempt-invalidated','written:tense',2],['attempt-result','written:translation',3],
  ]);
  assert.equal(b.events[2]!.kind==='attempt-result' && b.events[2]!.result,'uncertain');
  assert.ok(b.events.every(e=>e.ref.exerciseId===snapshot.identity.exerciseId&&e.ref.generation===snapshot.identity.generation));
  assert.doesNotMatch(JSON.stringify(b.events),/different draft|draft|text|audio/);
  a.session.dispose();b.session.dispose();
});
test('malformed, other-user/session, oral and inconsistent snapshots are rejected without mutating current practice', () => {
  const a=setup();a.session.editWritten(a.answer.text);a.session.finalizeWritten();const saved=a.session.snapshotWrittenPractice()!;
  const b=setup(); const untouched=b.session.snapshotWrittenPractice();
  for(const invalid of [{...saved,userId:'other'},{...saved,identity:{...saved.identity,sessionId:'other'}},{...saved,microphoneMuted:false},{...saved,finalized:false},{...saved,events:[]},{...saved,selectedTense:'future-simple'},{...saved,events:a.events.map(e=>({...e,ref:{...e.ref,obligation:'translation'}}))}]) {
    assert.equal(b.session.restoreWrittenPractice(invalid),false);assert.deepEqual(b.session.snapshotWrittenPractice(),untouched);
  }
  assert.equal(parseWrittenSnapshot({userId:'other',sessionId:'session'},saved),null);
  assert.equal(parseWrittenSnapshot({userId:'user',sessionId:'session'},{...saved,utterances:['private']}),null);
  a.session.dispose();b.session.dispose();
});
test('unfinalized sentence draft restores without a result or any emitted event',()=>{
  const a=setup();a.session.editWritten('local private draft');const b=setup();
  assert.equal(b.session.restoreWrittenPractice(a.session.snapshotWrittenPractice()),true);
  assert.equal(b.session.getSnapshot().written.draft,'local private draft');assert.equal(b.session.getSnapshot().written.result,undefined);assert.equal(b.events.length,0);
  a.session.dispose();b.session.dispose();
});
test('sentence restore resets oral evidence and refuses late pre-reload assessments',()=>{
  const a=setup();a.session.setInteraction({connection:'ready'});a.voice.transcript('fixture');const old=a.voice.inputs.at(-1)!;
  const saved=a.session.snapshotWrittenPractice();const b=setup();assert.equal(b.session.restoreWrittenPractice(saved),true);
  b.session.setInteraction({connection:'ready'});b.voice.transcript('fresh');b.voice.assess('accepted',old);
  assert.notEqual(b.session.getSnapshot().assessment.evidence.translation?.status,'accepted');
  b.voice.assess();assert.equal(b.session.getSnapshot().assessment.evidence.translation?.status,'accepted');a.session.dispose();b.session.dispose();
});
test('Pictures restores photo, drafts and processed spelling with monotonic refs and no duplicate events or oral gates',()=>{
  const {sink,events,session:unused}=setup();unused.dispose();
  const make=()=>createVerbSession({voice:createRealtimeVoiceAdapter(),mode:'verb-image',sessionId:'session',writtenPracticeUserId:'user',progressSink:sink,random:()=>0,onComplete:()=>assert.fail('no oral completion')});
  const a=make();a.edit('past','was');a.finalize('past','was');a.edit('base','b');
  const saved=a.snapshotWrittenPractice()!;const b=make();const count=events.length;
  assert.equal(b.restoreWrittenPractice(saved),true);assert.deepEqual(b.snapshotWrittenPractice(),saved);assert.equal(events.length,count);
  assert.equal(b.getSnapshot().assessment.evidence['spelling:past']?.status,'accepted');assert.equal(b.getSnapshot().assessment.evidence.meaning,undefined);assert.equal(b.getSnapshot().muted,true);
  b.edit('past','were');b.finalize('past','were');
  assert.ok(events.slice(count).every(e=>e.ref.revision>events[0]!.ref.revision&&e.ref.exerciseId===saved.identity.exerciseId));
  assert.deepEqual(events.slice(count).map(e=>e.kind),['attempt-invalidated','attempt-result']);
  a.dispose();b.dispose();
});
test('binding never writes construction or rejected restore state over a saved snapshot',()=>{
  const a=setup();const saved=a.session.snapshotWrittenPractice()!;let writes=0,rejections=0;
  const binding=createWrittenPracticeBinding({userId:'user',initialSnapshot:{...saved,userId:'wrong'},register:()=>()=>{},onSnapshot:()=>writes++,onRestoreRejected:()=>rejections++});
  binding.changed(saved);const release=binding.attach(a.session);binding.changed(saved);
  assert.equal(writes,0);assert.equal(rejections,1);release();a.session.dispose();
});
