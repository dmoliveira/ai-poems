// IDs, rather than display names, identify catalogue groups. An anonymous
// group is a browsing aid and does not assert a shared author.
export function groupPoets(poems) {
  const groups = new Map();
  for (const poem of poems) {
    if (typeof poem.authorId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(poem.authorId)) throw new Error(`Invalid author ID: ${poem.authorId}`);
    if (typeof poem.author !== 'string' || !poem.author.trim()) throw new Error(`Invalid author name: ${poem.authorId}`);
    const anonymous = Boolean(poem.anonymous);
    const group = groups.get(poem.authorId);
    if (group && (group.name !== poem.author || group.anonymous !== anonymous)) throw new Error(`Conflicting author identity: ${poem.authorId}`);
    if (group) group.poems.push(poem);
    else groups.set(poem.authorId, { id: poem.authorId, name: poem.author, anonymous, poems: [poem] });
  }
  const nameCounts = new Map();
  for (const group of groups.values()) nameCounts.set(group.name, (nameCounts.get(group.name) || 0) + 1);
  return [...groups.values()].map(group => ({ ...group, uniqueName: nameCounts.get(group.name) === 1 }))
    .toSorted((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
