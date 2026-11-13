const {test}=require('node:test'),assert=require('node:assert/strict');
if(!globalThis.crypto)globalThis.crypto=require('node:crypto').webcrypto;
const C=require('../app/public/health_vault_crypto.js');
test('vault encrypts full metadata and bytes, authenticates password/recovery, rejects tampering and rewraps keys',async()=>{
 const secret='une phrase de test vraiment longue 2026',next='une autre phrase longue pour le test 2027',data={version:1,documents:[{name:'Document confidentiel.pdf',bytes:C.base64(new TextEncoder().encode('Contenu médical témoin'))}],emergency:{firstName:'Prénom privé'},notes:{head:'Note secrète'}};
 const created=await C.create(secret,data);for(const word of ['Document confidentiel','Contenu médical','Prénom privé','Note secrète',secret,created.recoveryCode])assert.ok(!JSON.stringify(created.envelope).includes(word));
 assert.deepEqual((await C.unlock(created.envelope,secret)).data,data);
 assert.deepEqual((await C.unlock(created.envelope,created.recoveryCode,true)).data,data);
 await assert.rejects(C.unlock(created.envelope,'mauvais mot de passe'));
 const altered=structuredClone(created.envelope);const b=C.bytes(altered.payload.data);b[0]^=1;altered.payload.data=C.base64(b);await assert.rejects(C.unlock(altered,secret));
 const edited=await C.encrypt(created.envelope,created.key,{...data,notes:{head:'Correction'}});assert.notEqual(edited.payload.iv,created.envelope.payload.iv);assert.equal((await C.unlock(edited,secret)).data.notes.head,'Correction');
 const rewrapped=await C.password(edited,created.key,created.recoveryCode,next,true);await assert.rejects(C.unlock(rewrapped,secret));assert.equal((await C.unlock(rewrapped,next)).data.notes.head,'Correction');assert.deepEqual((await C.unlock(rewrapped,created.recoveryCode,true)).data,(await C.unlock(rewrapped,next)).data);
 for(const p of ['short','aaaaaaaaaaaaaaaaaaaa','motdepasse123456789'])assert.throws(()=>C.passwordCheck(p));C.passwordCheck(C.generatePassword());
 const modifiedKdf=structuredClone(created.envelope);modifiedKdf.kdf.iterations=1;await assert.rejects(C.unlock(modifiedKdf,secret));
});
