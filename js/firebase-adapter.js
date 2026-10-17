// Browser-only official modular SDK; tests inject an isolated adapter instead.
import { firebaseConfig, SDK_VERSION } from './firebase-config.js';

export async function connectFirebase() {
  if (globalThis.PocketEnvironment?.firebaseAllowed !== true) throw Error('测试环境或环境配置未就绪：禁止连接 Firebase。');
  const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/`;
  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')
  ]);
  const app = appSDK.initializeApp(firebaseConfig, 'pocket-backup');
  const auth = authSDK.getAuth(app);
  await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
  const db = dbSDK.getFirestore(app); // No persistent Firestore cache: server confirmation is mandatory.
  const root = uid => `users/${uid}`;
  const generationRef = uid => dbSDK.doc(db, root(uid) + '/backup/generation');
  const headRef = uid => dbSDK.doc(db, root(uid) + '/backup/head');
  const manifestRef = (uid, id) => dbSDK.doc(db, root(uid) + '/snapshots/' + id);
  const chunkRef = (uid, id, index) => dbSDK.doc(db, root(uid) + `/snapshots/${id}/chunks/${index}`);
  const stageRef = (uid, id) => dbSDK.doc(db, root(uid) + '/uploads/' + id);
  const data = async ref => { const snap = await dbSDK.getDocFromServer(ref); return snap.exists() ? snap.data() : null; };
  function assertUser(uid) { if (auth.currentUser?.uid !== uid) throw Error('账号不匹配，已停止云端操作。'); }
  const adapter = {
    async initializeGeneration(uid, generation, guard = () => {}, expectedGeneration) {
      assertUser(uid); guard();
      const claimRef = dbSDK.doc(db, root(uid) + '/backupCycles/' + generation);
      await dbSDK.runTransaction(db, async transaction => {
        assertUser(uid); guard();
        const previous = await transaction.get(generationRef(uid));
        const head = await transaction.get(headRef(uid));
        const claim = await transaction.get(claimRef);
        assertUser(uid); guard();
        if (head.exists()) throw Error('云端存在有效备份，请使用现有冲突处理；未修改学习记录。');
        if (expectedGeneration !== undefined && JSON.stringify(previous.exists() ? previous.data() : null) !== expectedGeneration) throw Error('云端周期在确认后已变化，未初始化，请重新检查。');
        if (claim.exists() || previous.data()?.generation === generation) throw Error('备份周期已使用，请重新检查。');
        transaction.set(claimRef, { uid, generation, createdAt: dbSDK.serverTimestamp() });
        transaction.set(generationRef(uid), { uid, generation, protocolVersion: 3, rulesVerified: true, lastRevision: 0 });
      });
      assertUser(uid); guard();
      const confirmed = await data(generationRef(uid)), claim = await data(claimRef);
      assertUser(uid); guard();
      if (confirmed?.generation !== generation || confirmed.protocolVersion !== 3 || confirmed.lastRevision !== 0 || claim?.uid !== uid || claim.generation !== generation || !claim.createdAt) throw Error('备份保护初始化读回失败，自动备份保持暂停。');
      return confirmed;
    },
    async generation(uid) { assertUser(uid); return data(generationRef(uid)); },
    async cycleClaim(uid, generation) { assertUser(uid); return data(dbSDK.doc(db, root(uid) + '/backupCycles/' + generation)); },
    async verifyWriteFence(uid, guard = () => {}) {
      assertUser(uid); guard();
      const current = await data(generationRef(uid));
      let stale = crypto.randomUUID(); while (stale === current?.generation) stale = crypto.randomUUID();
      // These denial probes use unique paths and contain no learning data.
      const probes = [
        { kind: '旧周期上传', ref: stageRef(uid, crypto.randomUUID()), value: { uid, generation: stale, createdAt: dbSDK.serverTimestamp() } },
        { kind: '旧格式分片', ref: chunkRef(uid, crypto.randomUUID(), 0), value: { uid, index: 0, content: 'Pocket security probe', hash: 'a'.repeat(64) } },
        { kind: '旧周期分片', ref: chunkRef(uid, crypto.randomUUID(), 0), value: { uid, generation: stale, index: 0, content: 'Pocket security probe', hash: 'a'.repeat(64) } }
      ];
      for (const probe of probes) {
        assertUser(uid); guard();
        if (await data(probe.ref)) throw Error('安全探测路径已存在，未执行，请重试。');
        let denied = false;
        try { await dbSDK.setDoc(probe.ref, probe.value); }
        catch (error) { if (error.code === 'permission-denied') denied = true; else throw error; }
        if (!denied) {
          let cleanup = '';
          try { assertUser(uid); await dbSDK.deleteDoc(probe.ref); } catch (_) { cleanup = ' 探测记录未清理，路径：' + probe.ref.path; }
          throw Error('旧写入保护验证失败：服务端允许' + probe.kind + '。请先核对并部署 Pocket protocol 3 Rules；未恢复备份。' + cleanup);
        }
      }
      assertUser(uid); guard(); return { legacyDenied: true, staleDenied: true };
    },
    async stage(uid, id, generation) { assertUser(uid); await dbSDK.setDoc(stageRef(uid, id), { uid, generation, createdAt: dbSDK.serverTimestamp() }); },
    async head(uid) { assertUser(uid); return data(headRef(uid)); },
    async manifest(uid, id) { assertUser(uid); return data(manifestRef(uid, id)); },
    async chunk(uid, id, index) { assertUser(uid); return data(chunkRef(uid, id, index)); },
    async writeChunk(uid, id, index, value) { assertUser(uid); await dbSDK.setDoc(chunkRef(uid, id, index), value); },
    async commit(uid, id, expectedRevision, value, guard = () => {}) {
      assertUser(uid);
      guard();
      await dbSDK.runTransaction(db, async transaction => {
        assertUser(uid);
        guard();
        const cycle = await transaction.get(generationRef(uid));
        const head = await transaction.get(headRef(uid));
        const c = cycle.exists() ? cycle.data() : null;
        if (!c || c.uid !== uid || ![2, 3].includes(c.protocolVersion) || c.rulesVerified !== true || c.generation !== value.generation || c.lastRevision !== expectedRevision || (head.exists() && head.data().generation !== c.generation)) throw Object.assign(Error("备份周期已变化或旧写入保护未就绪，请重新检查。"), { conflict: true });
        guard();
        if ((head.exists() ? head.data().revision : 0) !== expectedRevision) {
          throw Object.assign(Error('云端版本已变化，已停止过期上传。'), { conflict: true });
        }
        transaction.update(generationRef(uid), { lastRevision: value.revision });
        transaction.set(manifestRef(uid, id), { ...value, createdAt: dbSDK.serverTimestamp() });
        transaction.set(headRef(uid), { uid, generation: value.generation, revision: value.revision, snapshotId: id,
          dataHash: value.dataHash, updatedAt: dbSDK.serverTimestamp() });
      });
    },
    async list(uid) {
      assertUser(uid);
      const query = dbSDK.query(dbSDK.collection(db, root(uid) + '/snapshots'), dbSDK.orderBy('revision', 'desc'), dbSDK.limit(100));
      const result = await dbSDK.getDocsFromServer(query);
      return result.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAtMs: doc.data().createdAt?.toMillis() || null }));
    },
    async inspectCloudDeletion(uid) {
      assertUser(uid);
      const head = await data(headRef(uid));
      const snapshots = await dbSDK.getDocsFromServer(dbSDK.query(dbSDK.collection(db, root(uid) + '/snapshots'), dbSDK.limit(1)));
      const uploads = await dbSDK.getDocsFromServer(dbSDK.query(dbSDK.collection(db, root(uid) + '/uploads'), dbSDK.limit(1)));
      assertUser(uid);
      // Read-only probes, without the history UI's ordering or 100-version cap.
      // Orphan chunks under deleted parents are not enumerable by this client.
      return { remaining: !!head || !snapshots.empty || !uploads.empty,
        headEmpty: !head, snapshotsEmpty: snapshots.empty, uploadsEmpty: uploads.empty,
        complete: false };
    },
    async prune(uid) {
      assertUser(uid);
      // Published history is immutable, including deletion. Only abandoned uploads are cleaned up.
      // Interrupted attempts never become valid history; reclaim their staging data after 24h.
      const stale = await dbSDK.getDocsFromServer(dbSDK.query(dbSDK.collection(db, root(uid) + '/uploads'),
        dbSDK.orderBy('createdAt', 'asc'), dbSDK.limit(3)));
      for (const doc of stale.docs) {
        assertUser(uid);
        const sealed = await data(manifestRef(uid, doc.id));
        if (sealed) { await dbSDK.deleteDoc(doc.ref); continue; }
        if (!doc.data().createdAt || Date.now() - doc.data().createdAt.toMillis() <= 86400000) continue;
        const pieces = await dbSDK.getDocsFromServer(dbSDK.collection(db, root(uid) + `/snapshots/${doc.id}/chunks`));
        for (const piece of pieces.docs) { assertUser(uid); await dbSDK.deleteDoc(piece.ref); }
        await dbSDK.deleteDoc(doc.ref);
      }
    }
  };
  return { adapter, target: Object.freeze({ projectId: app.options.projectId, databaseId: '(default)' }),
    observe: handler => authSDK.onAuthStateChanged(auth, handler),
    login: (email, password) => authSDK.signInWithEmailAndPassword(auth, email, password),
    logout: () => authSDK.signOut(auth),
    forgot: email => authSDK.sendPasswordResetEmail(auth, email)
  };
}
