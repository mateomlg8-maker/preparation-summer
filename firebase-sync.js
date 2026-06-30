/* ============================================================
   Préparation Summer — Synchronisation automatique (Firebase)
   ------------------------------------------------------------
   Synchronise ta progression (cases cochées + scores QCM) entre
   tous tes appareils via Firebase Realtime Database.

   >>> POUR ACTIVER : colle ta config Firebase ci-dessous <<<
   (Console Firebase → Paramètres du projet → "Vos applications" → Web)

   Tant que la config reste sur les valeurs "COLLE_..." la synchro
   est désactivée et le carnet fonctionne normalement en local.
   ============================================================ */

var FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDK6CPRNEBiUuEX2GLnzP9suYRfJ85OHZw",
  authDomain:        "dsba-8cdcf.firebaseapp.com",
  databaseURL:       "https://dsba-8cdcf-default-rtdb.firebaseio.com",
  projectId:         "dsba-8cdcf",
  storageBucket:     "dsba-8cdcf.firebasestorage.app",
  messagingSenderId: "634910154957",
  appId:             "1:634910154957:web:3411ad6e94c5b3e4408984",
  measurementId:     "G-JFGWNP8JF1"
};

(function(){
  "use strict";

  // Les 10 clés de progression des 5 matières
  var KEYS = [
    'dsba-ps-checks-v2','dsba-ps-qcm-v2',
    'dsba-alg-checks-v1','dsba-alg-qcm-v1',
    'dsba-ana-checks-v1','dsba-ana-qcm-v1',
    'dsba-sql-checks-v1','dsba-sql-qcm-v1',
    'dsba-py-checks-v1','dsba-py-qcm-v1'
  ];
  var CODE_KEY  = 'dsba-sync-code';   // identifiant perso (passphrase)
  var STAMP_KEY = 'dsba-sync-stamp';  // horodatage de la dernière écriture

  // setItem natif (non wrappé) pour usage interne
  var rawSet = localStorage.setItem.bind(localStorage);

  function configured(){
    return FIREBASE_CONFIG.apiKey &&
           FIREBASE_CONFIG.apiKey.indexOf('COLLE') !== 0 &&
           FIREBASE_CONFIG.databaseURL &&
           FIREBASE_CONFIG.databaseURL.indexOf('COLLE') === -1;
  }
  function getCode(){ return localStorage.getItem(CODE_KEY) || ''; }

  // --- API publique (utilisée par index.html) ---
  window.PREP_SYNC = {
    configured: configured(),
    code: getCode(),
    active: false,
    setCode: function(c){
      c = (c || '').trim();
      if(c){ rawSet(CODE_KEY, c); } else { localStorage.removeItem(CODE_KEY); }
      location.reload();
    },
    disable: function(){ localStorage.removeItem(CODE_KEY); location.reload(); },
    pushNow: function(){ if(window.__dsbaPush) window.__dsbaPush(); }
  };

  // --- Wrapper setItem : pousse toute modif de progression vers le cloud ---
  var pushTimer = null;
  localStorage.setItem = function(k, v){
    rawSet(k, v);
    if(window.__dsbaReady && k && k.indexOf('dsba-') === 0 &&
       k !== CODE_KEY && k !== STAMP_KEY){
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function(){ if(window.__dsbaPush) window.__dsbaPush(); }, 600);
    }
  };

  // Si pas configuré ou pas de code : mode 100% local, on s'arrête là.
  if(!configured() || !getCode()) return;

  // --- Chargement dynamique du SDK Firebase (compat) puis init ---
  function loadScript(src){
    return new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  var BASE = 'https://www.gstatic.com/firebasejs/10.12.0/';

  loadScript(BASE + 'firebase-app-compat.js')
    .then(function(){ return loadScript(BASE + 'firebase-database-compat.js'); })
    .then(init)
    .catch(function(e){ console.warn('[Préparation Summer sync] SDK non chargé :', e); });

  function snapshot(){
    var o = {};
    KEYS.forEach(function(k){ o[k] = localStorage.getItem(k) || '{}'; });
    return o;
  }

  function init(){
    try { firebase.initializeApp(FIREBASE_CONFIG); }
    catch(e){ /* déjà initialisé */ }
    var db   = firebase.database();
    var code = getCode();
    var ref  = db.ref('progress/' + encodeURIComponent(code));

    window.__dsbaPush = function(){
      var stamp = Date.now();
      rawSet(STAMP_KEY, String(stamp));
      ref.set({ stamp: stamp, data: snapshot() })
         .catch(function(e){ console.warn('[Préparation Summer sync] push échoué :', e); });
    };

    function applyRemote(remote){
      KEYS.forEach(function(k){ if(remote.data[k] != null) rawSet(k, remote.data[k]); });
      rawSet(STAMP_KEY, String(remote.stamp || 0));
    }

    // 1) Récupération initiale : on prend le plus récent (cloud vs local)
    ref.once('value').then(function(snap){
      var remote = snap.val();
      var localStamp = parseInt(localStorage.getItem(STAMP_KEY) || '0', 10);

      if(remote && remote.data && (remote.stamp || 0) > localStamp){
        applyRemote(remote);
        window.__dsbaReady = true;
        if(!sessionStorage.getItem('dsba-pulled')){
          sessionStorage.setItem('dsba-pulled', '1');
          location.reload();   // recharge pour afficher la progression du cloud
          return;
        }
      } else {
        window.__dsbaReady = true;
        window.__dsbaPush(); // le local est plus récent (ou cloud vide) → on publie
      }

      // 2) Écoute temps réel : si un autre appareil met à jour, on recharge
      ref.on('value', function(s){
        var r = s.val(); if(!r || !r.data) return;
        var ls = parseInt(localStorage.getItem(STAMP_KEY) || '0', 10);
        if((r.stamp || 0) > ls){
          applyRemote(r);
          location.reload();
        }
      });
    }).catch(function(e){
      console.warn('[Préparation Summer sync] lecture initiale échouée :', e);
      window.__dsbaReady = true;
    });
  }
})();
