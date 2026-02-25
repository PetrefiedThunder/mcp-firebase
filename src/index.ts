#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const RATE_LIMIT_MS = 100;
let last = 0;

function getConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_API_KEY; // for REST API
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID required");
  return { projectId, apiKey, firestoreBase: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents` };
}

async function fsFetch(path: string, method = "GET", body?: any): Promise<any> {
  const now = Date.now(); if (now - last < RATE_LIMIT_MS) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - (now - last)));
  last = Date.now();
  const { firestoreBase, apiKey } = getConfig();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${firestoreBase}${path}${apiKey ? `${sep}key=${apiKey}` : ""}`;
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Firestore ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

function decodeValue(v: any): any {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue) return v.timestampValue;
  if (v.arrayValue) return v.arrayValue.values?.map(decodeValue) || [];
  if (v.mapValue) return decodeFields(v.mapValue.fields);
  if (v.nullValue !== undefined) return null;
  return v;
}

function decodeFields(fields: any): Record<string, any> {
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

const server = new McpServer({ name: "mcp-firebase", version: "1.0.0" });

server.tool("get_document", "Get a Firestore document.", {
  collection: z.string(), documentId: z.string(),
}, async ({ collection, documentId }) => {
  const d = await fsFetch(`/${collection}/${documentId}`);
  return { content: [{ type: "text" as const, text: JSON.stringify({ name: d.name, fields: decodeFields(d.fields), createTime: d.createTime, updateTime: d.updateTime }, null, 2) }] };
});

server.tool("list_documents", "List documents in a collection.", {
  collection: z.string(), pageSize: z.number().min(1).max(100).default(20),
  orderBy: z.string().optional(),
}, async ({ collection, pageSize, orderBy }) => {
  const p = new URLSearchParams({ pageSize: String(pageSize) });
  if (orderBy) p.set("orderBy", orderBy);
  const d = await fsFetch(`/${collection}?${p}`);
  const docs = d.documents?.map((doc: any) => ({
    id: doc.name?.split("/").pop(), fields: decodeFields(doc.fields),
  }));
  return { content: [{ type: "text" as const, text: JSON.stringify({ count: docs?.length, docs }, null, 2) }] };
});

server.tool("create_document", "Create a Firestore document.", {
  collection: z.string(), documentId: z.string().optional(),
  fields: z.string().describe("JSON object of field values"),
}, async ({ collection, documentId, fields }) => {
  const parsed = JSON.parse(fields);
  const fsFields: any = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string") fsFields[k] = { stringValue: v };
    else if (typeof v === "number") fsFields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === "boolean") fsFields[k] = { booleanValue: v };
    else fsFields[k] = { stringValue: JSON.stringify(v) };
  }
  const path = documentId ? `/${collection}?documentId=${documentId}` : `/${collection}`;
  const d = await fsFetch(path, "POST", { fields: fsFields });
  return { content: [{ type: "text" as const, text: JSON.stringify({ id: d.name?.split("/").pop(), fields: decodeFields(d.fields) }, null, 2) }] };
});

server.tool("delete_document", "Delete a Firestore document.", {
  collection: z.string(), documentId: z.string(),
}, async ({ collection, documentId }) => {
  await fsFetch(`/${collection}/${documentId}`, "DELETE");
  return { content: [{ type: "text" as const, text: JSON.stringify({ deleted: true, path: `${collection}/${documentId}` }) }] };
});

server.tool("list_collections", "List root collections (subcollection discovery).", {
  parentPath: z.string().default("").describe("Parent document path (empty for root)"),
}, async ({ parentPath }) => {
  const { projectId } = getConfig();
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const path = parentPath ? `/${parentPath}:listCollectionIds` : `:listCollectionIds`;
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const d = await res.json();
  return { content: [{ type: "text" as const, text: JSON.stringify(d.collectionIds || [], null, 2) }] };
});

async function main() { const t = new StdioServerTransport(); await server.connect(t); }
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
