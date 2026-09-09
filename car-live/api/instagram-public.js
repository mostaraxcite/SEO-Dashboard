const TIMEOUT_MS=5500;
const IG_APP_ID='936619743392459';

function asNum(v){
  if(v===null||v===undefined||v==='') return null;
  if(typeof v==='string'){
    const s=v.replace(/,/g,'').trim().toUpperCase();
    const m=s.match(/^([\d.]+)\s*([KMB])?$/);
    if(m){
      const mult={K:1e3,M:1e6,B:1e9}[m[2]]||1;
      const n=Number(m[1])*mult;
      return Number.isFinite(n)?Math.round(n):null;
    }
  }
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

function usernameFrom(value=''){
  const s=String(value).trim();
  try{
    const u=new URL(s);
    const parts=u.pathname.split('/').filter(Boolean);
    if(parts[0]&&!['reel','p','tv','stories'].includes(parts[0].toLowerCase())) return parts[0];
  }catch(_){}
  return s.replace(/^@/,'').split('/')[0].trim();
}

function shortcodeFrom(value=''){
  const s=String(value).trim();
  const m=s.match(/\/(?:reel|p|tv)\/([^/?#]+)/i);
  if(m) return m[1];
  return s.includes('/')?'':s;
}

function first(...vals){
  for(const v of vals){
    const n=asNum(v);
    if(n!==null) return n;
  }
  return null;
}

function statsFromNode(n){
  if(!n||typeof n!=='object') return null;
  const views=first(
    n.video_play_count,n.play_count,n.video_view_count,n.view_count,
    n.video_views,n.playCount,n.viewCount,
    n.insights?.play_count,n.insights?.video_view_count
  );
  const likes=first(
    n.like_count,n.likes_count,n.likeCount,
    n.edge_media_preview_like?.count,n.edge_liked_by?.count
  );
  const comments=first(
    n.comment_count,n.comments_count,n.commentCount,
    n.edge_media_to_comment?.count,n.edge_media_to_parent_comment?.count
  );
  const shares=first(n.share_count,n.shares_count,n.shareCount);
  const saves=first(n.save_count,n.saved_count,n.saves_count,n.collect_count);
  if([views,likes,comments,shares,saves].every(v=>v===null)) return null;
  return {views,likes,comments,shares,saves};
}

function nodeCode(n){
  if(!n||typeof n!=='object') return '';
  return String(n.shortcode??n.code??n.media_code??n.pk??'');
}

function findMatchingNode(root,shortcode){
  const seen=new Set();
  let best=null;
  function walk(node){
    if(!node||typeof node!=='object'||seen.has(node)) return false;
    seen.add(node);
    const code=nodeCode(node);
    const stats=statsFromNode(node);
    if(stats&&!best) best={node,stats};
    if(shortcode&&code===shortcode&&stats){
      best={node,stats,exact:true};
      return true;
    }
    if(Array.isArray(node)){
      for(const v of node) if(walk(v)) return true;
    }else{
      for(const v of Object.values(node)) if(v&&typeof v==='object'&&walk(v)) return true;
    }
    return false;
  }
  walk(root);
  return best;
}

function htmlDecode(s=''){
  return String(s)
    .replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'")
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/\\u002F/gi,'/').replace(/\\u003D/gi,'=').replace(/\\u0026/gi,'&');
}

function countFromText(text,shortcode=''){
  const raw=htmlDecode(text);
  const windows=[];
  if(shortcode){
    let idx=raw.indexOf(shortcode), guard=0;
    while(idx>=0&&guard<10){
      windows.push(raw.slice(Math.max(0,idx-70000),Math.min(raw.length,idx+70000)));
      idx=raw.indexOf(shortcode,idx+shortcode.length);
      guard++;
    }
  }
  if(!windows.length) windows.push(raw.slice(0,400000));
  const scoped=windows.join('\n');
  const get=patterns=>{
    for(const re of patterns){
      const m=scoped.match(re);
      if(m){ const n=asNum(m[1]); if(n!==null) return n; }
    }
    return null;
  };
  return {
    views:get([
      /["']?(?:video_play_count|play_count|video_view_count|view_count|video_views)["']?\s*[:=]\s*["']?([\d.,]+\s*[KMB]?)/i,
      /([\d.,]+\s*[KMB]?)\s+(?:views?|plays?)/i
    ]),
    likes:get([
      /["']?(?:like_count|likes_count)["']?\s*[:=]\s*["']?([\d.,]+\s*[KMB]?)/i,
      /edge_media_preview_like[\s\S]{0,400}?["']?count["']?\s*:\s*([\d.,]+)/i,
      /([\d.,]+\s*[KMB]?)\s+likes?/i
    ]),
    comments:get([
      /["']?(?:comment_count|comments_count)["']?\s*[:=]\s*["']?([\d.,]+\s*[KMB]?)/i,
      /edge_media_to_(?:parent_)?comment[\s\S]{0,400}?["']?count["']?\s*:\s*([\d.,]+)/i,
      /([\d.,]+\s*[KMB]?)\s+comments?/i
    ]),
    shares:null,
    saves:null
  };
}

function mergeStats(a={},b={}){
  return {
    views:first(a.views,b.views),
    likes:first(a.likes,b.likes),
    comments:first(a.comments,b.comments),
    shares:first(a.shares,b.shares),
    saves:first(a.saves,b.saves)
  };
}

function hasStats(s){
  return ['views','likes','comments','shares','saves'].some(k=>asNum(s?.[k])!==null);
}

function headers(username=''){
  return {
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152 Safari/537.36',
    'Accept':'*/*',
    'Accept-Language':'en-US,en;q=0.9,ar;q=0.8',
    'X-IG-App-ID':IG_APP_ID,
    'X-ASBD-ID':'129477',
    'X-Requested-With':'XMLHttpRequest',
    'Referer':username?`https://www.instagram.com/${username}/`:'https://www.instagram.com/'
  };
}

async function request(url,username='',json=false){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(url,{redirect:'follow',signal:ctrl.signal,headers:headers(username)});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    if(json) return {data:await r.json(),url:r.url};
    return {data:await r.text(),url:r.url};
  }finally{ clearTimeout(timer); }
}

async function resolveInstagram(username,shortcode,reelUrl,profileUrl){
  let out={views:null,likes:null,comments:null,shares:null,saves:null};
  const sources=[];

  if(shortcode){
    try{
      const media=await request(`https://www.instagram.com/api/v1/media/shortcode/${encodeURIComponent(shortcode)}/info/`,username,true);
      const hit=findMatchingNode(media.data,shortcode);
      if(hit?.stats){ out=mergeStats(out,hit.stats); sources.push('media-shortcode'); }
    }catch(_){}
  }

  if(username){
    try{
      const profile=await request(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,username,true);
      const hit=findMatchingNode(profile.data,shortcode);
      if(hit?.stats){ out=mergeStats(out,hit.stats); sources.push(hit.exact?'web-profile-exact':'web-profile'); }
    }catch(_){}
  }

  if(reelUrl&&!hasStats(out)){
    try{
      const reel=await request(reelUrl,username,false);
      out=mergeStats(out,countFromText(reel.data,shortcode));
      sources.push('reel-html');
    }catch(_){}
  }else if(reelUrl&&out.views===null){
    try{
      const reel=await request(reelUrl,username,false);
      out=mergeStats(out,countFromText(reel.data,shortcode));
      sources.push('reel-html');
    }catch(_){}
  }

  if(profileUrl&&out.views===null){
    try{
      const reelsUrl=`${profileUrl.replace(/\/+$/,'')}/reels/`;
      const page=await request(reelsUrl,username,false);
      out=mergeStats(out,countFromText(page.data,shortcode));
      sources.push('profile-reels-html');
    }catch(_){}
  }

  return {...out,source:sources.join('+')||'unavailable'};
}

export default async function handler(req,res){
  if(req.method&&req.method!=='GET'){
    res.setHeader('Allow','GET');
    res.status(405).json({ok:false,error:'Method not allowed'});return;
  }

  const profile=String(req.query?.profile||'').trim();
  const reel=String(req.query?.reel||'').trim();
  const username=usernameFrom(profile)||usernameFrom(reel);
  const shortcode=shortcodeFrom(reel)||shortcodeFrom(String(req.query?.shortcode||''));

  if(!username&&!shortcode){
    res.status(400).json({ok:false,error:'profile or reel/shortcode is required'});return;
  }

  const profileUrl=profile&&/^https?:\/\//i.test(profile)?profile:(username?`https://www.instagram.com/${username}/`:'');
  const reelUrl=reel&&/^https?:\/\//i.test(reel)?reel:(shortcode&&username?`https://www.instagram.com/${username}/reel/${shortcode}/`:'');

  try{
    const stats=await resolveInstagram(username,shortcode,reelUrl,profileUrl);
    const available=hasStats(stats);
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=900, stale-while-revalidate=300');
    res.status(200).json({
      ok:true,available,username,shortcode,reelUrl,profileUrl,
      views:stats.views,likes:stats.likes,comments:stats.comments,shares:stats.shares,saves:stats.saves,
      reach:null,engagement:null,source:stats.source,
      note:available?null:'Instagram returned no public counters to this server request.'
    });
  }catch(e){
    res.status(200).json({ok:true,available:false,username,shortcode,views:null,likes:null,comments:null,shares:null,saves:null,reach:null,engagement:null,source:'unavailable',note:String(e?.message||e)});
  }
}
