(function() {
  'use strict';

  // Configuration from script tag data attributes
  var script = document.currentScript;
  var apiKey = script && script.getAttribute('data-api-key');
  var host = script && script.getAttribute('data-host');
  var containerId = (script && script.getAttribute('data-container')) || 'opticdata-widget';
  var theme = (script && script.getAttribute('data-theme')) || 'dark';
  var metricsAttr = script && script.getAttribute('data-metrics');
  var positionAttr = (script && script.getAttribute('data-position')) || 'bottom-right';

  if (!apiKey || !host) {
    console.error('[OpticData Widget] data-api-key and data-host are required');
    return;
  }

  // Parse which metrics to show (default: all)
  var ALL_METRICS = ['spend', 'revenue', 'roas', 'cpa', 'conversions'];
  var visibleMetrics = ALL_METRICS;
  if (metricsAttr) {
    var requested = metricsAttr.split(',').map(function(s) { return s.trim().toLowerCase(); });
    visibleMetrics = requested.filter(function(m) { return ALL_METRICS.indexOf(m) !== -1; });
    if (visibleMetrics.length === 0) visibleMetrics = ALL_METRICS;
  }

  // Styles
  var isDark = theme === 'dark';
  var styles = {
    container: 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'background:' + (isDark ? '#0a0b0e' : '#ffffff') + ';' +
      'color:' + (isDark ? '#f9fafb' : '#111827') + ';' +
      'border:1px solid ' + (isDark ? '#1f2937' : '#e5e7eb') + ';' +
      'border-radius:12px;padding:16px;max-width:400px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.3);',
    title: 'font-size:13px;font-weight:700;margin-bottom:12px;' +
      'color:' + (isDark ? '#9ca3af' : '#6b7280') + ';text-transform:uppercase;letter-spacing:0.05em;',
    grid: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;',
    card: 'background:' + (isDark ? '#111318' : '#f9fafb') + ';' +
      'border:1px solid ' + (isDark ? '#1f2937' : '#e5e7eb') + ';' +
      'border-radius:8px;padding:10px;transition:background-color 0.6s ease;',
    label: 'font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;' +
      'color:' + (isDark ? '#6b7280' : '#9ca3af') + ';',
    value: 'font-size:18px;font-weight:700;font-family:ui-monospace,monospace;' +
      'transition:color 0.3s ease;',
    status: 'font-size:9px;margin-top:8px;text-align:right;' +
      'color:' + (isDark ? '#4b5563' : '#9ca3af') + ';',
    green: 'color:#10b981;',
    red: 'color:#ef4444;',
  };

  // Position styles for fixed overlay modes
  var positionStyles = {
    'bottom-right': 'position:fixed;bottom:16px;right:16px;z-index:9999;',
    'bottom-left': 'position:fixed;bottom:16px;left:16px;z-index:9999;',
    'inline': '',
  };

  // Track previous values for change detection
  var prevValues = {};

  function fmt(n) {
    if (n == null || isNaN(n)) return '$0.00';
    return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'K' : '$' + n.toFixed(2);
  }

  function getMetricValue(data, key) {
    switch (key) {
      case 'spend': return data.total_spend || 0;
      case 'revenue': return data.total_revenue || 0;
      case 'roas': return data.total_roi || 0;
      case 'cpa': return data.total_cpa || 0;
      case 'conversions': return data.total_conversions || 0;
      default: return 0;
    }
  }

  function formatMetricValue(key, value) {
    switch (key) {
      case 'spend': return fmt(value);
      case 'revenue': return fmt(value);
      case 'roas': return value.toFixed(2) + 'x';
      case 'cpa': return fmt(value);
      case 'conversions': return String(Math.round(value));
      default: return String(value);
    }
  }

  function getMetricLabel(key) {
    switch (key) {
      case 'spend': return 'Spend';
      case 'revenue': return 'Revenue';
      case 'roas': return 'ROAS';
      case 'cpa': return 'CPA';
      case 'conversions': return 'Orders';
      default: return key;
    }
  }

  function getMetricColor(key, value) {
    if (key === 'revenue') return styles.green;
    if (key === 'roas') {
      if (value >= 2) return styles.green;
      if (value >= 1) return 'color:#f59e0b;';
      return styles.red;
    }
    return '';
  }

  // Determine direction of value change for flash effect
  function getChangeDirection(key, newValue) {
    if (prevValues[key] === undefined) return 'none';
    if (newValue > prevValues[key]) return 'up';
    if (newValue < prevValues[key]) return 'down';
    return 'none';
  }

  function render(container, data, isUpdate) {
    // Build metric cards HTML
    var cardsHtml = '';
    for (var i = 0; i < visibleMetrics.length; i++) {
      var key = visibleMetrics[i];
      var value = getMetricValue(data, key);
      var formatted = formatMetricValue(key, value);
      var colorStyle = getMetricColor(key, value);
      var direction = isUpdate ? getChangeDirection(key, value) : 'none';

      // Flash background on change
      var flashBg = '';
      if (direction === 'up') flashBg = 'background-color:rgba(16,185,129,0.15);';
      if (direction === 'down') flashBg = 'background-color:rgba(239,68,68,0.15);';

      cardsHtml +=
        '<div data-metric="' + key + '" style="' + styles.card + flashBg + '">' +
          '<div style="' + styles.label + '">' + getMetricLabel(key) + '</div>' +
          '<div data-value="' + key + '" style="' + styles.value + colorStyle + '">' + formatted + '</div>' +
        '</div>';

      // Store for next comparison
      prevValues[key] = value;
    }

    container.innerHTML =
      '<div style="' + styles.container + '">' +
        '<div style="' + styles.title + '">OpticData Live</div>' +
        '<div style="' + styles.grid + '">' +
          cardsHtml +
        '</div>' +
        '<div style="' + styles.status + '">Updated ' + new Date().toLocaleTimeString() + '</div>' +
      '</div>';

    // After a brief delay, remove the flash background by resetting transition
    if (isUpdate) {
      setTimeout(function() {
        var cards = container.querySelectorAll('[data-metric]');
        for (var j = 0; j < cards.length; j++) {
          cards[j].style.backgroundColor = '';
        }
      }, 600);
    }
  }

  // DOM setup -- only called once
  var container = null;
  var wsInstance = null;

  function createContainer() {
    container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      if (script && script.parentNode) {
        script.parentNode.insertBefore(container, script.nextSibling);
      } else {
        document.body.appendChild(container);
      }
    }

    // Apply position styles to container
    var posStyle = positionStyles[positionAttr] || positionStyles['bottom-right'];
    if (posStyle) {
      container.setAttribute('style', posStyle);
    }

    return container;
  }

  function connectWebSocket() {
    var protocol = host.replace(/^http/, 'ws');
    var ws = new WebSocket(protocol + '/ws?apiKey=' + encodeURIComponent(apiKey));
    var reconnectDelay = 1000;

    ws.onmessage = function(event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'snapshot' && msg.data && msg.data.summary) {
          render(container, msg.data.summary, true);
        } else if (msg.type === 'metrics_update' && msg.data) {
          render(container, msg.data, true);
        }
      } catch (e) { /* ignore */ }
    };

    ws.onclose = function() {
      wsInstance = null;
      // Only reconnect WebSocket, do NOT recreate the DOM
      setTimeout(function() {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connectWebSocket();
      }, reconnectDelay);
    };

    ws.onopen = function() {
      reconnectDelay = 1000; // Reset delay on successful connection
    };

    wsInstance = ws;
  }

  function init() {
    createContainer();

    // Initial fetch via REST
    fetch(host + '/api/metrics/summary', {
      headers: { 'X-API-Key': apiKey }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) { render(container, data, false); })
    .catch(function() {
      container.innerHTML = '<div style="' + styles.container + '">Unable to load metrics</div>';
    });

    // WebSocket for live updates
    connectWebSocket();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
