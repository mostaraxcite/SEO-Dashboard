import bitlyHandler from './bitly.js';

const EDGE_TTL_SECONDS=17280; // 4h 48m = max 5 upstream refreshes/day per query
const STALE_SECONDS=1800;

export default async function handler(req,res){
  const setHeader=res.setHeader.bind(res);
  setHeader('CDN-Cache-Control',`public, max-age=${EDGE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`);
  setHeader('Vercel-CDN-Cache-Control',`public, max-age=${EDGE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`);

  res.setHeader=(name,value)=>{
    if(String(name).toLowerCase()==='cache-control'){
      return setHeader('Cache-Control',`public, max-age=300, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`);
    }
    return setHeader(name,value);
  };

  return bitlyHandler(req,res);
}
