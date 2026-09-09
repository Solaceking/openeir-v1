// OpenEir shell — onboarding logic. The WebView loads this page only when no
// server has been configured yet. All server talking (validation + connect)
// happens through the native OpenEirBridge plugin, so CORS never gets in the
// way and HTTPS is enforced natively unless the user explicitly allows HTTP
// for their trusted LAN.
'use strict';

var $ = function (id) { return document.getElementById(id); };
var btn = $('connect');
var label = $('btn-label');
var spin = $('spin');
var errBox = $('error');
var statusLine = $('status');

function showError(msg) {
  errBox.textContent = msg;
  errBox.style.display = 'block';
}

function clearError() {
  errBox.style.display = 'none';
  errBox.textContent = '';
}

function setBusy(busy) {
  btn.disabled = busy;
  spin.style.display = busy ? 'inline-block' : 'none';
  label.textContent = busy ? 'Checking…' : 'Connect';
}

function normalizeUrl(raw) {
  var v = (raw || '').trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try {
    var u = new URL(v);
    if (u.pathname && u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '');
    return u.origin + (u.pathname === '/' ? '' : u.pathname);
  } catch (e) {
    return null;
  }
}

// Wait for Capacitor's bridge (injected asynchronously on cold start)
function bridgeReady(timeoutMs) {
  return new Promise(function (resolve) {
    var waited = 0;
    (function poll() {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OpenEirBridge) {
        resolve(window.Capacitor.Plugins.OpenEirBridge);
      } else if (waited > (timeoutMs || 6000)) {
        resolve(null);
      } else {
        waited += 100;
        setTimeout(poll, 100);
      }
    })();
  });
}

function connect() {
  clearError();
  statusLine.textContent = '';
  var base = normalizeUrl($('server-url').value);
  if (!base) {
    showError('That does not look like a server address — try https://your-openeir-url');
    return;
  }
  if (!/^http:\/\/|^https:\/\//i.test(base)) {
    showError('Unsupported address.');
    return;
  }
  if (/^http:\/\//i.test(base) && !$('allow-http').checked) {
    showError('Plain HTTP is only allowed for trusted LANs — tick the box if this is a home network address, otherwise use https://');
    return;
  }

  setBusy(true);
  bridgeReady().then(function (bridge) {
    if (!bridge) {
      setBusy(false);
      showError('Native bridge unavailable — restart the app and try again.');
      return;
    }
    statusLine.textContent = 'Checking ' + base + ' …';
    bridge.validate({ url: base, allowHttp: $('allow-http').checked })
      .then(function (res) {
        setBusy(false);
        if (!res || !res.value || !res.value.ok) {
          var why = (res && res.value && res.value.error) || 'No response';
          showError('Could not reach an OpenEir server there (' + why + '). Check the address and your connection.');
          return;
        }
        statusLine.textContent = 'Connected — opening…';
        return bridge.connect({ url: base, allowHttp: $('allow-http').checked });
      })
      .catch(function (e) {
        setBusy(false);
        showError('Something went wrong: ' + (e && e.message ? e.message : e));
      });
  });
}

btn.addEventListener('click', connect);
$('server-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') connect(); });
$('allow-http').addEventListener('change', clearError);

// ---------- QR pairing ----------

// Wait for the scanner plugin the same way we wait for OpenEirBridge.
function scannerReady(timeoutMs) {
  return new Promise(function (resolve) {
    var waited = 0;
    (function poll() {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BarcodeScanner) {
        resolve(window.Capacitor.Plugins.BarcodeScanner);
      } else if (waited > (timeoutMs || 4000)) {
        resolve(null);
      } else {
        waited += 100;
        setTimeout(poll, 100);
      }
    })();
  });
}

function scanQr() {
  clearError();
  statusLine.textContent = '';
  scannerReady().then(function (scanner) {
    if (!scanner) {
      showError('Scanner unavailable — make sure you are running the OpenEir app, not a browser.');
      return;
    }
    scanner.scan({ formats: ['QR_CODE'] }).then(function (res) {
      var value = res && res.barcodes && res.barcodes[0] && res.barcodes[0].rawValue;
      if (!value) return; // nothing readable — let the user type instead
      $('server-url').value = value.trim();
      // A LAN address in a QR implies plain HTTP on purpose — allow it here so
      // the connect() check does not force a second tap.
      if (/^http:\/\//i.test(value.trim())) $('allow-http').checked = true;
      connect();
    }).catch(function (e) {
      var msg = e && e.message ? String(e.message) : '';
      if (/cancel/i.test(msg)) return; // user closed the camera — not an error
      showError('Could not scan: ' + (msg || 'camera unavailable'));
    });
  });
}
$('scan').addEventListener('click', scanQr);

bridgeReady().then(function (bridge) {
  if (!bridge) return;
  // Pre-fill a previously used address (user changed their mind / cleared data)
  bridge.getServer().then(function (res) {
    if (res && res.value && res.value.url) {
      $('server-url').value = res.value.url;
      $('allow-http').checked = !!res.value.allowHttp;
    }
  }).catch(function () {});
});
