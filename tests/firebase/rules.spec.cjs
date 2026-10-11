'use strict';
// Refuses production targets. No real project, credentials, or user records are used.
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, query, orderBy, limit, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp, Timestamp } = require('firebase/firestore');

(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Only run against the isolated Firestore emulator.');
  if (!/^(localhost|127\.0\.0\.1):8085$/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw Error('Only the local emulator on port 8085 is allowed.');
  const environment = await initializeTestEnvironment({ projectId: 'demo-pocket-backup-test',
    firestore: { rules: fs.readFileSync(path.join(__dirname, 'legacy.rules'), 'utf8') } });
  try {
    await environment.clearFirestore();
    const a = environment.authenticatedContext('A').firestore();
    const b = environment.authenticatedContext('B').firestore();
    const guest = environment.unauthenticatedContext().firestore();
    const hash = 'a'.repeat(64);
    const stage = (db, uid, id) => doc(db, `users/${uid}/uploads/${id}`);
    const manifest = (db, uid, id) => doc(db, `users/${uid}/snapshots/${id}`);
    const chunk = (db, uid, id) => doc(db, `users/${uid}/snapshots/${id}/chunks/0`);
    const head = (db, uid) => doc(db, `users/${uid}/backup/head`);
    const chunkData = { uid: 'A', index: 0, content: 'isolated fixture', hash };
    await assertFails(getDoc(head(guest, 'A')));
    await assertFails(setDoc(stage(guest, 'A', 'one'), { uid: 'A', createdAt: serverTimestamp() }));
    await assertFails(getDoc(head(a, 'B')));
    await assertFails(setDoc(stage(a, 'B', 'one'), { uid: 'B', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(stage(a, 'A', 'one'), { uid: 'A', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(chunk(a, 'A', 'one'), chunkData));
    await assertFails(updateDoc(chunk(a, 'A', 'one'), { content: 'overwrite' }));
    await assertFails(setDoc(head(a, 'A'), { uid: 'A', revision: 1, snapshotId: 'missing', dataHash: hash, updatedAt: serverTimestamp() }));
    async function commit(db, uid, id, revision) {
      return runTransaction(db, async transaction => {
        await transaction.get(head(db, uid));
        transaction.set(manifest(db, uid, id), { uid, formatVersion: 1, status: 'complete', chunkCount: 1,
          bytes: 16, payloadHash: hash, dataHash: hash, exportedAt: new Date().toISOString(),
          counts: { materials: 1, groups: 1, runs: 1 }, revision, createdAt: serverTimestamp() });
        transaction.set(head(db, uid), { uid, revision, snapshotId: id, dataHash: hash, updatedAt: serverTimestamp() });
      });
    }
    await assertSucceeds(commit(a, 'A', 'one', 1));
    await assertSucceeds(getDoc(head(a, 'A')));
    await assertSucceeds(getDoc(chunk(a, 'A', 'one')));
    await assertFails(getDoc(manifest(b, 'A', 'one')));
    await assertFails(updateDoc(manifest(b, 'A', 'one'), { bytes: 1 }));
    await assertFails(updateDoc(manifest(a, 'A', 'one'), { bytes: 1 }));
    await assertFails(deleteDoc(manifest(a, 'A', 'one')));
    await assertFails(deleteDoc(chunk(a, 'A', 'one')));
    await assertFails(setDoc(doc(a, 'users/A/snapshots/one/chunks/1'), { ...chunkData, index: 1 }));
    await assertSucceeds(setDoc(stage(a, 'A', 'two'), { uid: 'A', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(chunk(a, 'A', 'two'), chunkData));
    await assertFails(commit(a, 'A', 'two', 1)); // stale revision
    await assertSucceeds(commit(a, 'A', 'two', 2));
    const history = db => query(collection(db, 'users/A/snapshots'), orderBy('revision', 'desc'), limit(100));
    await assertSucceeds(getDocs(history(a)));
    await assertFails(getDocs(history(b)));
    await assertFails(getDocs(history(guest)));
    for (const db of [b, guest]) {
      await assertFails(getDoc(chunk(db, 'A', 'one')));
      await assertFails(setDoc(chunk(db, 'A', 'one'), chunkData));
      await assertFails(deleteDoc(chunk(db, 'A', 'one')));
      await assertFails(commit(db, 'A', 'intrusion', 3));
    }
    await assertSucceeds(getDoc(manifest(a, 'A', 'one'))); // restore an older version
    await assertSucceeds(getDoc(chunk(a, 'A', 'one')));
    await assertFails(setDoc(chunk(a, 'A', 'one'), chunkData));
    await assertFails(commit(a, 'A', 'one', 3)); // cannot overwrite old manifest
    await assertFails(updateDoc(head(a, 'A'), { snapshotId: 'one', revision: 3, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(head(a, 'A')));
    await assertFails(setDoc(doc(a, 'users/A/other/private'), { uid: 'A' }));
    await assertFails(setDoc(stage(a, 'A', 'spoof'), { uid: 'B', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(a, 'users/A/snapshots/two/chunks/1'), { ...chunkData, index: 1 }));
    // Even history older than 30 days / outside the latest 20 cannot be deleted.
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(manifest(db, 'A', 'ancient'), { uid: 'A', revision: 1, createdAt: Timestamp.fromMillis(Date.now() - 40 * 86400000) });
      await setDoc(chunk(db, 'A', 'ancient'), chunkData);
      await setDoc(head(db, 'A'), { uid: 'A', revision: 30, snapshotId: 'two', dataHash: hash });
      await setDoc(stage(db, 'A', 'abandoned'), { uid: 'A', createdAt: Timestamp.fromMillis(Date.now() - 2 * 86400000) });
      await setDoc(chunk(db, 'A', 'abandoned'), chunkData);
    });
    await assertFails(deleteDoc(manifest(a, 'A', 'ancient')));
    await assertFails(deleteDoc(chunk(a, 'A', 'ancient')));
    await assertFails(setDoc(chunk(a, 'A', 'ancient'), chunkData));
    await assertSucceeds(deleteDoc(stage(a, 'A', 'two'))); // removing marker never unseals history
    await assertFails(deleteDoc(chunk(a, 'A', 'two')));
    await assertFails(setDoc(stage(a, 'A', 'two'), { uid: 'A', createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(chunk(a, 'A', 'abandoned')));
    await assertSucceeds(deleteDoc(stage(a, 'A', 'abandoned')));
    await assertFails(deleteDoc(manifest(a, 'A', 'one'))); // recent history also protected
    await assertFails(setDoc(doc(a, 'users/A/snapshots/unsealed/chunks/0'), chunkData)); // no staging grant
    console.log('PASS: unauthenticated/cross-UID denial, legal staged atomic commit, stale pointers, immutable history/chunks, protected latest/recent snapshots.');
  } finally { await environment.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
