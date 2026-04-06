#!/usr/bin/env node

const RPC_URL =
  process.env.NIUMA_RPC_URL ||
  "https://solemn-burned-sponge.xlayer-testnet.quiknode.pro/9f767b4dcfe6de02065b222b585ffc2cbc3876d5/";

const TOKEN_ADDR = "0xad9e1ac142bb3c706c42a5bc4eceeb9364fd0939";
const STATS_ADDR = "0xe3647a175e78be6adfd7304f6c46e3615acdcf96";
const TASK_ADDR = "0xe7d9d979ebf376aad774768ae88ffe72863b2117";

const SELECTOR_TOTAL_TASKS = "0x58671730";
const SELECTOR_OPEN_TASKS = "0x5c41a3af";
const SELECTOR_TASK_PAGE = "0xac5f2f1f";

function pad64Hex(num) {
  return BigInt(num).toString(16).padStart(64, "0");
}

function encodeTaskPageCall(start, limit) {
  return `${SELECTOR_TASK_PAGE}${pad64Hex(start)}${pad64Hex(limit)}`;
}

async function rpcBatch(calls) {
  const body = calls.map((c, i) => ({
    jsonrpc: "2.0",
    id: i + 1,
    method: "eth_call",
    params: [{ to: c.to, data: c.data }, "latest"],
  }));

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`RPC request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function hexToBigInt(hex) {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

function readWord(hex, byteOffset) {
  const start = 2 + byteOffset * 2;
  return `0x${hex.slice(start, start + 64)}`;
}

function readUint(hex, byteOffset) {
  return BigInt(readWord(hex, byteOffset));
}

function readBytes(hex, byteOffset, len) {
  const start = 2 + byteOffset * 2;
  return hex.slice(start, start + len * 2);
}

function isLikelyAddressWord(wordHex) {
  const raw = wordHex.slice(2);
  const head = raw.slice(0, 24);
  const tail = raw.slice(24);
  return /^0+$/.test(head) && /[1-9a-f]/i.test(tail);
}

function decodeStringAt(itemHex, relativeOffset) {
  const itemBytes = (itemHex.length - 2) / 2;
  if (relativeOffset + 32 > itemBytes) return null;
  const len = Number(readUint(itemHex, relativeOffset));
  if (!Number.isFinite(len) || len <= 0 || len > 2000) return null;
  if (relativeOffset + 32 + len > itemBytes) return null;

  const bytesHex = readBytes(itemHex, relativeOffset + 32, len);
  const buf = Buffer.from(bytesHex, "hex");
  const s = buf.toString("utf8").replace(/\0/g, "").trim();
  if (!s) return null;

  const printable = s.replace(/[\x20-\x7E\u4e00-\u9fff]/g, "");
  if (printable.length > 0) return null;
  if (s.length < 2) return null;
  return s;
}

function parseTaskItems(resultHex) {
  const rootOffset = Number(readUint(resultHex, 0));
  const arrLen = Number(readUint(resultHex, rootOffset));
  const offsetsBase = rootOffset + 32;
  const items = [];

  for (let i = 0; i < arrLen; i++) {
    const rel = Number(readUint(resultHex, offsetsBase + i * 32));
    const itemStart = rootOffset + rel;
    const nextRel =
      i + 1 < arrLen ? Number(readUint(resultHex, offsetsBase + (i + 1) * 32)) : null;
    const itemEnd = nextRel ? rootOffset + nextRel : (resultHex.length - 2) / 2;
    const itemHex = `0x${readBytes(resultHex, itemStart, itemEnd - itemStart)}`;

    const words = Math.floor((itemHex.length - 2) / 64);
    const numbers = [];
    const addresses = [];
    const strings = [];

    for (let w = 0; w < words; w++) {
      const byteOffset = w * 32;
      const wordHex = readWord(itemHex, byteOffset);
      const v = BigInt(wordHex);
      if (v > 0n && v < 10_000_000_000n) numbers.push(v);
      if (isLikelyAddressWord(wordHex)) {
        addresses.push(`0x${wordHex.slice(-40)}`);
      }

      if (v > 0n && v < BigInt((itemHex.length - 2) / 2) && v % 32n === 0n) {
        const str = decodeStringAt(itemHex, Number(v));
        if (str && !strings.includes(str)) strings.push(str);
      }
    }

    items.push({
      index: i,
      idHint: numbers.find((n) => n > 0n && n < 10000n)?.toString() || null,
      ownerHint: addresses[0] || null,
      title: strings[0] || null,
      summary: strings[1] || null,
      rawStringCount: strings.length,
    });
  }

  return items;
}

async function main() {
  const start = Number(process.argv[2] || 8);
  const limit = Number(process.argv[3] || 30);

  const [tokenAndCounts, taskPage] = await Promise.all([
    rpcBatch([
      { to: TOKEN_ADDR, data: "0x18160ddd" },
      { to: STATS_ADDR, data: SELECTOR_TOTAL_TASKS },
      { to: TASK_ADDR, data: SELECTOR_OPEN_TASKS },
    ]),
    rpcBatch([{ to: TASK_ADDR, data: encodeTaskPageCall(start, limit) }]),
  ]);

  const totalMinted = hexToBigInt(tokenAndCounts[0].result);
  const totalTasks = Number(hexToBigInt(tokenAndCounts[1].result));
  const openTasks = Number(hexToBigInt(tokenAndCounts[2].result));
  const taskItems = parseTaskItems(taskPage[0].result);

  const output = {
    source: {
      rpc: RPC_URL,
      chain: "XLayer Testnet (chainId 1952)",
      taskContract: TASK_ADDR,
      selector: SELECTOR_TASK_PAGE,
      params: { start, limit },
    },
    stats: {
      totalMintedWei: totalMinted.toString(),
      totalTasks,
      openTasks,
      fetched: taskItems.length,
    },
    tasks: taskItems,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

