function withoutArenaReplay(replay) {
  if (!replay || typeof replay !== 'object') return replay;
  const legacyReplay = { ...replay };
  delete legacyReplay.arenaReplay;
  return legacyReplay;
}

export function stripArenaReplayFromEntry(entry) {
  const replay = entry?.metadata?.battleReplay;
  if (!replay) return entry;
  return {
    ...entry,
    metadata: {
      ...entry.metadata,
      battleReplay: withoutArenaReplay(replay),
    },
  };
}

export async function fulfillLegacyReplay(route) {
  try {
    const response = await route.fetch();
    const payload = await response.json();
    const body = {
      ...payload,
      ...(payload.battleReplay ? { battleReplay: withoutArenaReplay(payload.battleReplay) } : {}),
      ...(Array.isArray(payload.entries)
        ? { entries: payload.entries.map(stripArenaReplayFromEntry) }
        : {}),
    };
    await route.fulfill({ response, body: JSON.stringify(body) });
  } catch (error) {
    // A page can close with a stream read still in flight. Let that request
    // finish normally; it is not part of the replay assertion under test.
    if (!/disposed|closed|aborted/i.test(String(error))) throw error;
    try { await route.continue(); } catch {}
  }
}
