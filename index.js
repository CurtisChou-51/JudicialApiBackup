import { promises as fs } from 'node:fs';

const API_HOST = 'https://data.judicial.gov.tw';

async function login(user, mima) {
    const res = await fetch(`${API_HOST}/jdg/api/Auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password: mima })
    });
    const text = await res.text();
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
    const res = await fetch(`${API_HOST}/jdg/api/JList`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    });
    const text = await res.text();
    if (!res.ok)
        throw new Error(`JList 失敗 StatusCode=${res.status} resp=${text}`);

    return text;
}

async function main() {
    const user = process.env.API_USER;
    const mima = process.env.API_MIMA;
    if (!user || !mima)
        throw new Error('缺少 API_USER / API_MIMA 環境變數');

    const token = await login(user, mima);
    const jlistJson = await fetchJList(token);

    const date = new Date().toISOString().slice(0, 10);
    const dir = 'jlist';
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/${date}.json`, jlistJson, 'utf-8');
    console.log(`已儲存 ${dir}/${date}.json`);
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
