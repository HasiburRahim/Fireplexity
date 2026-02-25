import { NextResponse } from 'next/server';
import { streamText } from 'ai'; // Removed StreamData
import { createGroq } from '@ai-sdk/groq';
import FirecrawlApp from '@mendable/firecrawl-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log(">>> Request Body:", JSON.stringify(body).slice(0, 100));

    let query: string | undefined;
    if (typeof body.query === 'string' && body.query.trim().length > 0) {
      query = body.query;
    } else if (typeof body.text === 'string' && body.text.trim().length > 0) {
      query = body.text;
    } else if (Array.isArray(body.messages) && body.messages.length > 0) {
      const lastUser =
        [...body.messages].reverse().find((m: any) => m?.role === 'user') ??
        body.messages[body.messages.length - 1];
      if (lastUser) {
        if (typeof lastUser.content === 'string' && lastUser.content.trim().length > 0) {
          query = lastUser.content;
        } else if (Array.isArray(lastUser.parts)) {
          const textParts = lastUser.parts
            .filter((p: any) => p?.type === 'text' && typeof p?.text === 'string')
            .map((p: any) => p.text);
          if (textParts.length > 0) {
            query = textParts.join('\n');
          }
        }
      }
    }

    if (!query) throw new Error("No query found in request");

    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    const firecrawlKey = req.headers.get('x-firecrawl-key') || process.env.FIRECRAWL_API_KEY;
    const app = new FirecrawlApp({ apiKey: firecrawlKey });

    // Search
    const searchResponse = await app.search(query, { limit: 3 });
    const anyRes = searchResponse as any;
    const sources =
      Array.isArray(anyRes?.data)
        ? (anyRes.data as any[])
        : Array.isArray(anyRes?.web)
        ? (anyRes.web as any[])
        : Array.isArray(anyRes?.results)
        ? (anyRes.results as any[])
        : [];

    const result = await streamText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `Context: ${JSON.stringify(sources)}\n\nUser Query: ${query}`,
    });

    return result.toTextStreamResponse(); 
  } catch (e: any) {
    console.error(">>> SERVER CRASH:", e.message); // This will show in your terminal
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
