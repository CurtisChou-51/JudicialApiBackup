import { promises as fs } from 'node:fs';

const API_HOST = 'https://data.judicial.gov.tw';
const TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 5000;

// fetch 的網路層錯誤一律是 fetch failed，真正原因在 err.cause
function describeCause(err) {
    const parts = [];
    const seen = new Set();
    let cur = err;
    while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (cur !== err) {
            const code = cur.code ? ` code=${cur.code}` : '';
            const sys = cur.syscall ? ` syscall=${cur.syscall}` : '';
            const addr = cur.address ? ` address=${cur.address}${cur.port ? ':' + cur.port : ''}` : '';
            parts.push(`${cur.name}: ${cur.message}${code}${sys}${addr}`);
        }
        if (Array.isArray(cur.errors))
            for (const e of cur.errors) parts.push(`${e.name}: ${e.message}${e.code ? ` code=${e.code}` : ''}`);
        cur = cur.cause;
    }
    return parts.length ? parts.join(' <- ') : '(無 cause 資訊)';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 連線層失敗(含逾時)先隔 RETRY_DELAY_MS 重試一次，仍失敗才拋出。
// HTTP 4xx/5xx 不在此重試，交由呼叫端依 status 判斷。
async function postJson(url, payload, label) {
    let res;
    for (let attempt = 1; ; attempt++) {
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
            break;
        } catch (err) {
            const detail = err.name === 'TimeoutError'
                ? `連線逾時 (${TIMEOUT_MS}ms)`
                : `連線失敗 原因=${describeCause(err)}`;

            if (attempt === 1) {
                console.error(`${label} ${detail} url=${url}，${RETRY_DELAY_MS / 1000} 秒後重試一次`);
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            throw new Error(`${label} ${detail} url=${url} (已重試 1 次)`, { cause: err });
        }
    }

    let text;
    try {
        text = await res.text();
    } catch (err) {
        throw new Error(`${label} 讀取回應失敗 StatusCode=${res.status} 原因=${describeCause(err)}`, { cause: err });
    }
    return { res, text };
}

async function login(user, mima) {
    const { res, text } = await postJson(`${API_HOST}/jdg/api/Auth`, { user, password: mima }, 'Auth');
    if (!res.ok)
        throw new Error(`Auth 失敗 StatusCode=${res.status} resp=${text}`);

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Auth 回應無法解析: ${text}`);
    }
    if (!data.Token)
        throw new Error(`Auth 回應無 token: ${text}`);

    return data.Token;
}

async function fetchJList(token) {
    const { res, text } = await postJson(`${API_HOST}/jdg/api/JList`, { token }, 'JList');
    if (!res.ok)
        throw new Error(`JList 失敗 StatusCode=${res.status} resp=${text}`);

    return text;
}

function taipeiDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

async function main() {
    const user = process.env.API_USER;
    const mima = process.env.API_MIMA;
    if (!user || !mima)
        throw new Error('缺少 API_USER / API_MIMA 環境變數');

    const token = await login(user, mima);
    const jlistJson = await fetchJList(token);

    const date = taipeiDate();
    const dir = 'jlist';
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/${date}.json`, jlistJson, 'utf-8');
    console.log(`已儲存 ${dir}/${date}.json`);
}

main().catch(err => {
    console.error(err.stack || err.message);
    if (err.cause)
        console.error(`cause: ${describeCause(err)}`);
    process.exit(1);
});
