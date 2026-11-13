/* Web Crypto envelope. Passwords, recovery codes and document plaintext never
   leave the browser. PBKDF2-SHA256 600k wraps a random AES-256-GCM data key. */
((root)=>{'use strict';
 const c=globalThis.crypto,enc=new TextEncoder(),dec=new TextDecoder(),iterations=600000;
 const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text)};
 const bytes=text=>Uint8Array.from(atob(text),ch=>ch.charCodeAt(0));
 const random=n=>c.getRandomValues(new Uint8Array(n));
 const aes=raw=>c.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
 async function derive(password,salt){const material=await c.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return c.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
 async function seal(key,plain,context){const iv=random(12),data=new Uint8Array(await c.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('atelier-health-vault-v1:'+context),tagLength:128},key,plain));return {iv:base64(iv),data:base64(data)}}
 async function open(key,part,context){return new Uint8Array(await c.subtle.decrypt({name:'AES-GCM',iv:bytes(part.iv),additionalData:enc.encode('atelier-health-vault-v1:'+context),tagLength:128},key,bytes(part.data)))}
 function passwordCheck(password){if(typeof password!=='string'||password.length<16||password.length>128||new Set(password).size<6||/^(password|motdepasse|azerty|qwerty|123456)/i.test(password))throw Error('Choisis une phrase de passe longue (16 à 128 caractères), personnelle et difficile à deviner, ou utilise le générateur.')}
 function check(e){if(!e||e.version!==1||e.kdf?.name!=='PBKDF2-SHA256'||e.kdf.iterations!==iterations||bytes(e.salt).length!==16)throw Error('Format de coffre non reconnu.')}
 async function create(password,data){passwordCheck(password);const raw=random(32),recovery=random(32),salt=random(16);try{const key=await aes(raw),envelope={version:1,kdf:{name:'PBKDF2-SHA256',iterations},salt:base64(salt),wrapped:await seal(await derive(password,salt),raw,'password'),recovery:await seal(await aes(recovery),raw,'recovery'),payload:await seal(key,enc.encode(JSON.stringify(data)),'payload')};return {key,envelope,recoveryCode:base64(recovery)}}finally{raw.fill(0);recovery.fill(0)}}
 async function unlock(e,secret,recover=false){check(e);let raw;try{raw=await open(recover?await aes(bytes(secret.trim())):await derive(secret,bytes(e.salt)),recover?e.recovery:e.wrapped,recover?'recovery':'password');const key=await aes(raw),plain=await open(key,e.payload,'payload');try{return {key,data:JSON.parse(dec.decode(plain))}}finally{plain.fill(0)}}finally{raw?.fill(0)}}
 async function encrypt(e,key,data){check(e);return {...e,payload:await seal(key,enc.encode(JSON.stringify(data)),'payload')}}
 async function password(e,key,oldSecret,newSecret,recover=false){passwordCheck(newSecret);const raw=await open(recover?await aes(bytes(oldSecret.trim())):await derive(oldSecret,bytes(e.salt)),recover?e.recovery:e.wrapped,recover?'recovery':'password'),salt=random(16);try{return {...e,salt:base64(salt),wrapped:await seal(await derive(newSecret,salt),raw,'password')}}finally{raw.fill(0)}}
 const api={base64,bytes,create,unlock,encrypt,password,passwordCheck,generatePassword:()=>base64(random(24))};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.AtelierVaultCrypto=api;
})(globalThis);
