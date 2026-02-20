(function() {
  'use strict';

  // Configuration from script tag data attributes
  var script = document.currentScript;
  var apiKey = script && script.getAttribute('data-api-key');
  var host = script && script.getAttribute('data-host');
  var containerId = (script && script.getAttribute('data-container')) || 'opticdata-widget';
  var theme = (script && script.getAttribute('data-theme')) || 'dark';

  if (!apiKey || !host) {
    console.error('[OpticData Widget] data-api-key and data-host are required');
    return;
  }

  // Styles
  var isDark = theme === 'dark';
  var styles = {
    container: 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'background:' + (isDark ? '#0a0b0e' : '#ffffff') + ';' +
      'color:' + (isDark ? '#f9fafb' : '#111827') + ';' +
      'border:1px solid ' + (isDark ? '#1f2937' : '#e5e7eb') + ';' +
      'border-radius:12px;padding:16px;max-width:400px;',
    title: 'font-size:13px;font-weight:700;margin-bottom:12px;' +
      'color:' + (isDark ? '#9ca3af' : '#6b7280') + ';text-transform:uppercase;letter-spacing:0.05em;',
    grid: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;',
    card: 'background:' + (isDark ? '#111318' : '#f9fafb') + ';' +
      'border:1px solid ' + (isDark ? '#1f2937' : '#e5e7eb') + ';' +
      'border-radius:8px;padding:10px;',
    label: 'font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;' +
      'color:' + (isDark ? '#6b7280' : '#9ca3af') + ';',
    value: 'font-size:18px;font-weight:700;font-family:ui-monospace,monospace;',
    status: 'font-size:9px;margin-top:8px;text-align:right;' +
      'color:' + (isDark ? '#4b5563' : '#9ca3af') + ';',
    green: 'color:#10b981;',
    red: 'color:#ef4444;',
  };

  function fmt(n) {
    return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'K' : '$' + n.toFixed(2);
  }

  function render(container, data) {
    var roas = data.total_roi || 0;
    var roasColor = roas >= 2 ? styles.green : roas >= 1 ? 'color:#f59e0b;' : styles.red;

    container.innerHTML =
      '<div style="' + styles.container + '">' +
        '<div style="' + styles.title + '">OpticData Live</div>' +
        '<div style="' + styles.grid + '">' +
          '<div style="' + styles.card + '">' +
            '<div style="' + styles.label + '">Spend</div>' +
            '<div style="' + styles.value + '">' + fmt(data.total_spend || 0) + '</div>' +
          '</div>' +
          '<div style="' + styles.card + '">' +
            '<div style="' + styles.label + '">Revenue</div>' +
            '<div style="' + styles.value + styles.green + '">' + fmt(data.total_revenue || 0) + '</div>' +
          '</div>' +
          '<div style="' + styles.card + '">' +
            '<div style="' + styles.label + '">ROAS</div>' +
            '<div style="' + styles.value + roasColor + '">' + roas.toFixed(2) + 'x</div>' +
          '</div>' +
          '<div style="' + styles.card + '">' +
            '<div style="' + styles.label + '">Orders</div>' +
            '<div style="' + styles.value + '">' + (data.total_conversions || 0) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="' + styles.status + '">Updated ' + new Date().toLocaleTimeString() + '</div>' +
      '</div>';
  }

  function init() {
    var container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      if (script && script.parentNode) {
        script.parentNode.insertBefore(container, script.nextSibling);
      } else {
        document.body.appendChild(container);
      }
    }

    // Initial fetch via REST
    fetch(host + '/api/metrics/summary', {
      headers: { 'X-API-Key': apiKey }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) { render(container, data); })
    .catch(function() {
      container.innerHTML = '<div style="' + styles.container + '">Unable to load metrics</div>';
    });

    // WebSocket for live updates
    var protocol = host.replace(/^http/, 'ws');
    var ws = new WebSocket(protocol + '/ws?apiKey=' + encodeURIComponent(apiKey));
    var reconnectDelay = 1000;

    ws.onmessage = function(event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'snapshot' && msg.data && msg.data.summary) {
          render(container, msg.data.summary);
        } else if (msg.type === 'metrics_update' && msg.data) {
          render(container, msg.data);
        }
      } catch (e) { /* ignore */ }
    };

    ws.onclose = function() {
      setTimeout(function() {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        init();
      }, reconnectDelay);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
