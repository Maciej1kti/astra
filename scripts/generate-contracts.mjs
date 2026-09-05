import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { compile } from 'json-schema-to-typescript';

const root = new URL('../', import.meta.url);
const schema = JSON.parse(await readFile(new URL('contracts/domain.schema.json', root), 'utf8'));
const output = new URL('apps/web/src/lib/domain.generated.ts', root);
const text = await compile(schema, 'DomainContract', {
  bannerComment: '/* Generated from contracts/domain.schema.json. Run npm run contracts. Types do not replace server validation. */',
  unreachableDefinitions: true,
});
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8').catch(() => '') !== text) {
    throw new Error('Domain types are stale. Run npm run contracts.');
  }
} else {
  await mkdir(new URL('apps/web/src/lib/', root), { recursive: true });
  await writeFile(output, text);
}
