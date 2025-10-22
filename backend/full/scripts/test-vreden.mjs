import axios from 'axios';

const http = axios.create({ timeout: 20000, validateStatus: (s) => s >= 200 && s < 500 });

function log(title, data) {
  console.log('---');
  console.log(title);
  console.log(JSON.stringify(data, null, 2));
}

async function run() {
  const results = [];
  const tests = [
    {
      name: 'tiktok',
      url: (u) => `https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(u)}`,
      sample: 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
      pick: (d) => ({ ok: !!(d?.status && (d?.result?.video || d?.result?.download)), video: d?.result?.video || d?.result?.download, title: d?.result?.title })
    },
    {
      name: 'instagram',
      url: (u) => `https://api.vreden.my.id/api/instagram?url=${encodeURIComponent(u)}`,
      sample: 'https://www.instagram.com/p/CwZVfUTx3YZ/',
      pick: (d) => ({ ok: !!(d?.status && (d?.result?.image || d?.result?.video || d?.result?.url)), type: d?.result?.type, url: d?.result?.url || d?.result?.image || d?.result?.video })
    },
    {
      name: 'facebook',
      url: (u) => `https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(u)}`,
      sample: 'https://fb.watch/7LKrK9yJVy/',
      pick: (d) => ({ ok: !!(d?.status && (d?.result?.video || d?.result?.download || d?.result?.url)), video: d?.result?.video || d?.result?.download || d?.result?.url, title: d?.result?.title })
    },
    {
      name: 'twitter',
      url: (u) => `https://api.vreden.my.id/api/twitter?url=${encodeURIComponent(u)}`,
      sample: 'https://twitter.com/Interior/status/463440424141459456',
      pick: (d) => ({ ok: !!(d?.status && (d?.result?.video || d?.result?.image || d?.result?.url)), type: d?.result?.type, url: d?.result?.video || d?.result?.image || d?.result?.url })
    },
    {
      name: 'youtube ytdl',
      url: (u) => `https://api.vreden.my.id/api/ytdl?url=${encodeURIComponent(u)}&type=audio`,
      sample: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      pick: (d) => ({ ok: !!(d?.status && d?.result?.download?.url), download: d?.result?.download?.url, quality: d?.result?.download?.quality, title: d?.result?.title })
    },
    {
      name: 'youtube search',
      url: (q) => `https://api.vreden.my.id/api/ytsearch?query=${encodeURIComponent(q)}`,
      sample: 'tears sabrina carpenter',
      pick: (d) => ({ ok: !!(d?.status && Array.isArray(d?.result) && d.result.length > 0),
        first: d?.result?.[0] ? { title: d?.result?.[0]?.title, url: d?.result?.[0]?.url } : null })
    },
    {
      name: 'pinterest',
      url: (u) => `https://api.vreden.my.id/api/pinterest?url=${encodeURIComponent(u)}`,
      sample: 'https://www.pinterest.com/pin/304133781094756442/',
      pick: (d) => ({ ok: !!(d?.status && (d?.result?.image || d?.result?.url)), image: d?.result?.image || d?.result?.url, title: d?.result?.title })
    },
    {
      name: 'spotify search',
      url: (q) => `https://api.vreden.my.id/api/spotify/search?query=${encodeURIComponent(q)}`,
      sample: 'tears sabrina carpenter',
      pick: (d) => ({ ok: !!(d?.status && d?.result?.preview_url), title: d?.result?.title, artists: d?.result?.artists, preview: d?.result?.preview_url })
    }
  ];

  for (const t of tests) {
    try {
      const url = t.url(t.sample);
      const { data, status } = await http.get(url);
      const picked = t.pick(data);
      const entry = { name: t.name, status, ok: picked.ok, sample: t.sample, info: picked };
      results.push(entry);
      log(`[vreden] ${t.name}`, entry);
    } catch (err) {
      const msg = err?.message || String(err);
      const entry = { name: t.name, ok: false, error: msg, sample: t.sample };
      results.push(entry);
      log(`[vreden] ${t.name} ERROR`, entry);
    }
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length
  };
  console.log('---');
  console.log('Summary:', summary);
}

run();
