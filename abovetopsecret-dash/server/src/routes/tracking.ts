/**
 * Tracking Routes — Public endpoints for the enhanced pixel
 *
 * These routes are mounted BEFORE auth middleware since they're called
 * from customer websites (not from the OpticData dashboard).
 *
 * Endpoints:
 *   GET  /t/pixel.js?token=ODT-xxx  — Serve the pixel script
 *   POST /t/event                    — Receive pixel events (batched)
 *   POST /t/identify                 — Link anonymous visitor to known identity
 *   GET  /t/ping.gif                 — 1x1 GIF fallback for noscript
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import {
  resolveVisitor,
  upsertSession,
  recordEvent,
  recordTouchpoint,
  identifyVisitor,
} from '../services/identity-graph';
import { resolveSiteByCustomDomain } from '../services/dns-pixel';

const router = Router();

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

// ── Resolve site token to user ───────────────────────────────

async function resolveSiteToken(
  token: string,
  hostname?: string,
): Promise<{ userId: number; siteId: number; customDomain?: string } | null> {
  // Try resolving by token first
  if (token) {
    const result = await pool.query(
      `SELECT id, user_id, custom_domain, dns_verified FROM pixel_sites WHERE site_token = $1 AND enabled = true`,
      [token],
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        userId: row.user_id,
        siteId: row.id,
        customDomain: row.dns_verified ? row.custom_domain : undefined,
      };
    }
  }

  // Fallback: try matching by verified custom domain from the Host header
  if (hostname) {
    const site = await resolveSiteByCustomDomain(hostname);
    if (site) {
      return {
        userId: site.userId,
        siteId: site.siteId,
        customDomain: hostname.toLowerCase().replace(/:\d+$/, ''),
      };
    }
  }

  return null;
}

// ── GET /t/pixel.js — Serve the tracking pixel script ────────

router.get('/pixel.js', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).type('text/javascript').send('// Missing token');
      return;
    }

    const hostname = String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^a-zA-Z0-9.\-:]/g, '');
    const site = await resolveSiteToken(token, hostname);
    if (!site) {
      res.status(404).type('text/javascript').send('// Invalid token');
      return;
    }

    // Determine the tracking endpoint base URL — sanitize header values
    const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https');
    const proto = /^https?$/.test(rawProto) ? rawProto : 'https';
    const baseUrl = `${proto}://${hostname}`;

    // If DNS is verified and the site has a custom domain, use it for event POSTs
    const customDomain = site.customDomain || undefined;
    const script = generatePixelScript(token, baseUrl, customDomain);

    res.set({
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',  // 5 min cache
      'Access-Control-Allow-Origin': '*',
    });
    res.send(script);
  } catch (err) {
    console.error('[Tracking] Error serving pixel.js:', err);
    res.status(500).type('text/javascript').send('// Error');
  }
});

// ── POST /t/event — Receive pixel events ─────────────────────

router.post('/event', async (req: Request, res: Response) => {
  try {
    const { token, aid, sid, fp, events, session, ts } = req.body;

    if (!token || !aid || !sid) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const hostname = String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^a-zA-Z0-9.\-:]/g, '');
    const site = await resolveSiteToken(token, hostname);
    if (!site) {
      res.status(404).json({ error: 'Invalid token' });
      return;
    }

    const { userId, siteId } = site;
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Resolve or create visitor
    const { visitorId } = await resolveVisitor(userId, siteId, {
      anonymousId: aid,
      fingerprint: fp || undefined,
    });

    // Upsert session if session data provided
    if (session) {
      await upsertSession(userId, {
        sessionId: sid,
        visitorId,
        referrer: session.ref || undefined,
        landingPage: session.lp || undefined,
        utmSource: session.us || undefined,
        utmMedium: session.um || undefined,
        utmCampaign: session.uc || undefined,
        utmContent: session.uo || undefined,
        utmTerm: session.ut || undefined,
        fbclid: session.fbc || undefined,
        gclid: session.gc || undefined,
        ttclid: session.ttc || undefined,
        sclid: session.sc || undefined,
        msclkid: session.msc || undefined,
        deviceType: session.dt || undefined,
        browser: session.br || undefined,
        os: session.os || undefined,
        screenWidth: session.sw || undefined,
        screenHeight: session.sh || undefined,
        timezone: session.tz || undefined,
        language: session.ln || undefined,
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      });

      // Record touchpoint if there's a click ID or UTM
      const hasClickId = session.fbc || session.gc || session.ttc || session.sc || session.msc;
      const hasUtm = session.us || session.uc;
      if (hasClickId || hasUtm) {
        await recordTouchpoint(
          userId, visitorId, sid,
          { fbclid: session.fbc, gclid: session.gc, ttclid: session.ttc, sclid: session.sc, msclkid: session.msc },
          { source: session.us, medium: session.um, campaign: session.uc, content: session.uo, term: session.ut },
        );
      }
    }

    // Process events
    if (Array.isArray(events)) {
      for (const evt of events) {
        await recordEvent(userId, visitorId, {
          sessionId: sid,
          eventName: evt.n,
          eventCategory: evt.c || undefined,
          pageUrl: evt.u || undefined,
          pageTitle: evt.t || undefined,
          pageReferrer: evt.r || undefined,
          orderId: evt.oid || undefined,
          revenue: evt.rev ? parseFloat(evt.rev) : undefined,
          currency: evt.cur || undefined,
          productIds: evt.pids || undefined,
          productNames: evt.pnames || undefined,
          quantity: evt.qty ? parseInt(evt.qty, 10) : undefined,
          fbclid: session?.fbc || undefined,
          gclid: session?.gc || undefined,
          ttclid: session?.ttc || undefined,
          properties: evt.p || undefined,
          eventId: evt.eid || undefined,
          clientTs: evt.ts || undefined,
        });
      }
    }

    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.status(200).json({ ok: true, vid: visitorId });
  } catch (err) {
    console.error('[Tracking] Error processing event:', err);
    res.status(500).json({ error: 'Failed to process' });
  }
});

// ── POST /t/identify — Link anonymous visitor to known identity

router.post('/identify', async (req: Request, res: Response) => {
  try {
    const { token, aid, email, phone, cid } = req.body;

    if (!token || !aid) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const hostname = String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^a-zA-Z0-9.\-:]/g, '');
    const site = await resolveSiteToken(token, hostname);
    if (!site) {
      res.status(404).json({ error: 'Invalid token' });
      return;
    }

    if (!email && !phone && !cid) {
      res.status(400).json({ error: 'At least one identifier (email, phone, cid) required' });
      return;
    }

    const result = await identifyVisitor(site.userId, aid, {
      email: email || undefined,
      phone: phone || undefined,
      customerId: cid || undefined,
    });

    res.set('Access-Control-Allow-Origin', '*');
    res.json({ ok: true, vid: result.visitorId, merged: result.merged });
  } catch (err) {
    console.error('[Tracking] Error identifying visitor:', err);
    res.status(500).json({ error: 'Failed to identify' });
  }
});

// ── GET /t/ping.gif — Noscript fallback (1x1 GIF) ───────────

router.get('/ping.gif', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    const page = req.query.page as string;

    if (token) {
      const hostname = String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/[^a-zA-Z0-9.\-:]/g, '');
      const site = await resolveSiteToken(token, hostname);
      if (site) {
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
        // Record a basic pageview event with minimal data
        const anonId = `noscript-${crypto.createHash('md5').update(`${ipAddress}${req.headers['user-agent']}`).digest('hex').slice(0, 16)}`;
        const { visitorId } = await resolveVisitor(site.userId, site.siteId, { anonymousId: anonId });
        await recordEvent(site.userId, visitorId, {
          sessionId: `ns-${Date.now()}`,
          eventName: 'PageView',
          pageUrl: page || req.headers.referer || undefined,
          eventId: `ns-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });
      }
    }
  } catch (err) {
    console.error('[Tracking] Error processing ping:', err);
  }

  // Always return the GIF regardless of errors
  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.send(TRANSPARENT_GIF);
});

// ── OPTIONS handler for CORS preflight ───────────────────────

router.options('*', (_req: Request, res: Response) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  });
  res.status(204).end();
});

// ── Generate the pixel JavaScript ────────────────────────────

function generatePixelScript(siteToken: string, baseUrl: string, customDomain?: string): string {
  // If a verified custom domain is configured, use it for event POSTs
  // This makes all tracking requests truly first-party (bypasses ITP, ad blockers)
  const apiBase = customDomain ? `https://${customDomain}/t` : `${baseUrl}/t`;

  return `// OpticData Pixel v2 — Enhanced First-Party Tracking
// https://opticdata.io
(function(w,d){
  "use strict";
  if(w.__odt)return;
  var Q=[],API="${apiBase}",TOKEN="${siteToken}";

  // ── Utility ──────────────────────────────────────────────
  function uuid(){
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){
      var r=Math.random()*16|0;return(c==="x"?r:r&0x3|0x8).toString(16);
    });
  }

  function getCookie(n){
    var m=d.cookie.match(new RegExp("(^| )"+n+"=([^;]+)"));
    return m?decodeURIComponent(m[2]):null;
  }

  function setCookie(n,v,days){
    var e=new Date();e.setTime(e.getTime()+days*864e5);
    d.cookie=n+"="+encodeURIComponent(v)+";expires="+e.toUTCString()+";path=/;SameSite=Lax;Secure";
  }

  // ── Visitor ID (persists 400 days via first-party cookie) ─
  var AID=getCookie("_odt_id");
  if(!AID){AID=uuid();setCookie("_odt_id",AID,400);}

  // ── Session ID (30 min inactivity timeout) ────────────────
  var SID=getCookie("_odt_sid");
  var lastActivity=parseInt(getCookie("_odt_la")||"0",10);
  var now=Date.now();
  var SESSION_TIMEOUT=30*60*1000;

  if(!SID||!lastActivity||(now-lastActivity>SESSION_TIMEOUT)){
    SID=uuid();
    setCookie("_odt_sid",SID,1);
    w.__odt_new_session=true;
  }
  setCookie("_odt_la",String(now),1);

  // ── URL params ────────────────────────────────────────────
  var params=new URLSearchParams(w.location.search);
  function p(k){return params.get(k)||"";}

  var clickIds={
    fbc:p("fbclid")||getCookie("_odt_fbc")||"",
    gc:p("gclid")||getCookie("_odt_gc")||"",
    ttc:p("ttclid")||getCookie("_odt_ttc")||"",
    sc:p("sclid")||getCookie("_odt_sc")||"",
    msc:p("msclkid")||getCookie("_odt_msc")||""
  };

  // Persist click IDs in cookies (90 days)
  if(p("fbclid"))setCookie("_odt_fbc",p("fbclid"),90);
  if(p("gclid"))setCookie("_odt_gc",p("gclid"),90);
  if(p("ttclid"))setCookie("_odt_ttc",p("ttclid"),90);
  if(p("sclid"))setCookie("_odt_sc",p("sclid"),90);
  if(p("msclkid"))setCookie("_odt_msc",p("msclkid"),90);

  var utms={
    us:p("utm_source")||getCookie("_odt_us")||"",
    um:p("utm_medium")||getCookie("_odt_um")||"",
    uc:p("utm_campaign")||getCookie("_odt_uc")||"",
    uo:p("utm_content")||getCookie("_odt_uo")||"",
    ut:p("utm_term")||getCookie("_odt_ut")||""
  };

  // Persist UTMs in cookies (90 days)
  if(p("utm_source"))setCookie("_odt_us",p("utm_source"),90);
  if(p("utm_medium"))setCookie("_odt_um",p("utm_medium"),90);
  if(p("utm_campaign"))setCookie("_odt_uc",p("utm_campaign"),90);
  if(p("utm_content"))setCookie("_odt_uo",p("utm_content"),90);
  if(p("utm_term"))setCookie("_odt_ut",p("utm_term"),90);

  // ── Device & Navigator ─────────────────────────────────────
  var nav=w.navigator||{};
  var ua=nav.userAgent||"";

  // ── Device fingerprint (lightweight, non-invasive) ────────
  var fp=(function(){
    var scr=w.screen||{};
    var raw=[
      scr.width,scr.height,scr.colorDepth,
      nav.language,nav.hardwareConcurrency,nav.maxTouchPoints,
      new Date().getTimezoneOffset(),
      nav.platform
    ].join("|");
    // Simple hash (djb2)
    var h=5381;
    for(var i=0;i<raw.length;i++){h=((h<<5)+h)+raw.charCodeAt(i);h=h&h;}
    return Math.abs(h).toString(36);
  })();

  // ── Device detection ──────────────────────────────────────
  var deviceType=/Mobi|Android/i.test(ua)?"mobile":/Tablet|iPad/i.test(ua)?"tablet":"desktop";

  function getBrowser(){
    if(ua.indexOf("Firefox")>-1)return"Firefox";
    if(ua.indexOf("SamsungBrowser")>-1)return"Samsung";
    if(ua.indexOf("Opera")>-1||ua.indexOf("OPR")>-1)return"Opera";
    if(ua.indexOf("Edge")>-1||ua.indexOf("Edg")>-1)return"Edge";
    if(ua.indexOf("Chrome")>-1)return"Chrome";
    if(ua.indexOf("Safari")>-1)return"Safari";
    return"Other";
  }

  function getOS(){
    if(ua.indexOf("Win")>-1)return"Windows";
    if(ua.indexOf("Mac")>-1)return"macOS";
    if(ua.indexOf("Linux")>-1)return"Linux";
    if(ua.indexOf("Android")>-1)return"Android";
    if(/iPhone|iPad|iPod/.test(ua))return"iOS";
    return"Other";
  }

  // ── Session data (sent once per new session) ──────────────
  var sessionData=null;
  if(w.__odt_new_session){
    sessionData={
      ref:d.referrer||"",
      lp:w.location.href,
      dt:deviceType,
      br:getBrowser(),
      os:getOS(),
      sw:(w.screen||{}).width||0,
      sh:(w.screen||{}).height||0,
      tz:Intl&&Intl.DateTimeFormat?Intl.DateTimeFormat().resolvedOptions().timeZone:"",
      ln:nav.language||""
    };
    // Merge click IDs and UTMs
    for(var k in clickIds)if(clickIds[k])sessionData[k]=clickIds[k];
    for(var k in utms)if(utms[k])sessionData[k]=utms[k];
  }

  // ── Event queue & batching ────────────────────────────────
  var batch=[];
  var batchTimer=null;
  var BATCH_INTERVAL=2000;
  var MAX_BATCH=20;

  function flush(){
    if(batch.length===0)return;
    var payload={
      token:TOKEN,
      aid:AID,
      sid:SID,
      fp:fp,
      events:batch.splice(0,MAX_BATCH),
      ts:Date.now()
    };
    if(sessionData){
      payload.session=sessionData;
      sessionData=null;
    }

    var body=JSON.stringify(payload);

    // Use sendBeacon for reliability (survives page unload)
    if(nav.sendBeacon){
      nav.sendBeacon(API+"/event",new Blob([body],{type:"application/json"}));
    }else{
      var xhr=new XMLHttpRequest();
      xhr.open("POST",API+"/event",true);
      xhr.setRequestHeader("Content-Type","application/json");
      xhr.send(body);
    }
  }

  function scheduleBatch(){
    if(batchTimer)return;
    batchTimer=setTimeout(function(){
      batchTimer=null;
      flush();
    },BATCH_INTERVAL);
  }

  // ── Public API ────────────────────────────────────────────
  var odt={
    // Track an event
    track:function(eventName,props){
      var evt={
        n:eventName,
        u:w.location.href,
        t:d.title,
        r:d.referrer||"",
        eid:uuid(),
        ts:new Date().toISOString()
      };
      if(props){
        // Extract known e-commerce fields
        if(props.order_id)evt.oid=props.order_id;
        if(props.revenue)evt.rev=String(props.revenue);
        if(props.currency)evt.cur=props.currency;
        if(props.product_ids)evt.pids=props.product_ids;
        if(props.product_names)evt.pnames=props.product_names;
        if(props.quantity)evt.qty=String(props.quantity);
        if(props.category)evt.c=props.category;
        // Everything else goes to properties
        var custom={};
        var reserved=["order_id","revenue","currency","product_ids","product_names","quantity","category"];
        for(var k in props){
          if(reserved.indexOf(k)===-1)custom[k]=props[k];
        }
        if(Object.keys(custom).length>0)evt.p=custom;
      }
      batch.push(evt);
      if(batch.length>=MAX_BATCH)flush();
      else scheduleBatch();
    },

    // Identify visitor (call when you know who they are)
    identify:function(data){
      if(!data)return;
      var body=JSON.stringify({
        token:TOKEN,
        aid:AID,
        email:data.email||undefined,
        phone:data.phone||undefined,
        cid:data.customer_id||undefined
      });
      if(nav.sendBeacon){
        nav.sendBeacon(API+"/identify",new Blob([body],{type:"application/json"}));
      }else{
        var xhr=new XMLHttpRequest();
        xhr.open("POST",API+"/identify",true);
        xhr.setRequestHeader("Content-Type","application/json");
        xhr.send(body);
      }
    },

    // E-commerce convenience methods
    pageView:function(props){odt.track("PageView",props);},
    viewContent:function(props){odt.track("ViewContent",Object.assign({category:"ecommerce"},props));},
    addToCart:function(props){odt.track("AddToCart",Object.assign({category:"ecommerce"},props));},
    initiateCheckout:function(props){odt.track("InitiateCheckout",Object.assign({category:"ecommerce"},props));},
    purchase:function(props){odt.track("Purchase",Object.assign({category:"ecommerce"},props));},
    lead:function(props){odt.track("Lead",Object.assign({category:"conversion"},props));},
    subscribe:function(props){odt.track("Subscribe",Object.assign({category:"conversion"},props));},

    // Internal
    _aid:AID,
    _sid:SID,
    _flush:flush
  };

  // ── Auto-track PageView ───────────────────────────────────
  odt.pageView();

  // ── SPA support: listen for history changes ───────────────
  var origPush=history.pushState;
  var origReplace=history.replaceState;

  function onRouteChange(){
    // Small delay to let the page title update
    setTimeout(function(){odt.pageView();},50);
  }

  if(origPush){
    history.pushState=function(){origPush.apply(this,arguments);onRouteChange();};
  }
  if(origReplace){
    history.replaceState=function(){origReplace.apply(this,arguments);onRouteChange();};
  }
  w.addEventListener("popstate",onRouteChange);

  // ── Flush on page unload ──────────────────────────────────
  w.addEventListener("visibilitychange",function(){
    if(d.visibilityState==="hidden")flush();
  });
  w.addEventListener("pagehide",flush);

  // ── Session heartbeat (update last activity) ──────────────
  setInterval(function(){
    setCookie("_odt_la",String(Date.now()),1);
  },60000);

  // ── Process any queued calls ──────────────────────────────
  w.__odt=odt;
  if(w.odtq&&w.odtq.length){
    for(var i=0;i<w.odtq.length;i++){
      var call=w.odtq[i];
      if(odt[call[0]])odt[call[0]].apply(odt,call.slice(1));
    }
  }
})(window,document);
`;
}

export default router;
