// Generates TypeScript types from the committed OpenAPI snapshot.
// The Pydantic models in backend/app/models/schemas.py are the source of truth.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(root, '../shared/api-contracts/openapi.json');
const outputPath = resolve(root, 'src/types/api.generated.ts');

const generated = astToString(await openapiTS(pathToFileURL(schemaPath).href, { cwd: root }));
const output = `// GENERATED FILE — do not edit. Run: npm run generate:api-types\n${generated}`;

if (process.argv.includes('--check')) {
  const current = readFileSync(outputPath, 'utf8');
  if (current !== output) {
    console.error('Generated API types are outdated. Run: npm run generate:api-types');
    process.exit(1);
  }
  console.log('API types are up to date.');
} else {
  writeFileSync(outputPath, output);
  console.log(`Generated ${outputPath}`);
}
