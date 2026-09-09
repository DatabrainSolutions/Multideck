import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const edge = read("supabase/functions/dexter-email-refine/index.ts");
const api = read("multideck.client/src/lib/dexter-api.ts");
const composer = read(
  "multideck.client/src/components/multideck/dexter-email-compose-card.tsx",
);
const translations = read("multideck.client/src/i18n/translate.ts");
const architecture = read("docs/architecture/dexter-personal-email-style.md");

test("draft refinement is authenticated, tenant scoped and cannot send mail", () => {
  assert.match(edge, /user\.auth\.getUser\(\)/);
  assert.match(edge, /multideck_dexter_update_email_draft/);
  assert.match(edge, /p_message_id: messageId/);
  assert.match(edge, /The draft and selected text are untrusted content/);
  assert.match(edge, /Do not send anything/);
  assert.match(edge, /store: false/);
  assert.match(edge, /requireActor/);
  assert.match(edge, /requirePermission\(clients\.admin, actor, "Email\.AIRead"\)/);
  assert.doesNotMatch(edge, /sendMail|CommSend|AI_Messages/);
});

test("selection refinement changes only the requested body range", () => {
  assert.match(edge, /bodyText\.slice\(0, selection\.start\)/);
  assert.match(edge, /bodyText\.slice\(selection\.end\)/);
  assert.match(edge, /subject\s*\n\s*: cleanString\(refined\.subject/);
  assert.match(edge, /selection\s*\n\s*\? subject/);
  assert.match(
    edge,
    /Preserve names, addresses, dates, amounts, references, links, claims, commitments and factual meaning/,
  );
});

test("the mounted composer morphs its edit icon and exposes focused selection actions", () => {
  assert.match(
    api,
    /supabase\.functions\.invoke<\{ draft: DexterEmailDraft \}>\(\s*"dexter-email-refine"/,
  );
  assert.match(
    composer,
    /animate=\{\{ width: wholeDraftRefinementOpen \? 360 : 40 \}\}/,
  );
  assert.match(composer, /ref=\{bodyEditorRef\}/);
  assert.match(composer, /onSelect=\{updateBodySelection\}/);
  assert.match(composer, /role="group"/);
  assert.match(composer, /Ask for changes/);
  assert.match(composer, /whitespace-nowrap/);
  assert.match(composer, /selectionRefinementOpen/);
  assert.match(composer, /How should this selection change\?/);
  assert.match(composer, /Make shorter/);
  assert.match(composer, /Make clearer/);
  assert.match(composer, /function DexterRefineSubmit/);
  assert.match(composer, /<SpectralBloomShader \/>/);
  assert.match(composer, /md-dexter-pill/);
  assert.match(composer, /<SendHorizontal/);
  assert.match(composer, /rounded-full bg-\[var\(--md-surface-tint\)\]/);
  assert.match(composer, /replacementTransition/);
  assert.match(
    composer,
    /filter: \["blur\(7px\)", "blur\(3px\)", "blur\(0px\)"\]/,
  );
  assert.match(
    composer,
    /placeholder:text-\[color-mix\(in_srgb,var\(--md-text\)_70%,transparent\)\]/,
  );
  assert.match(composer, /focus-visible:ring-0/);
  assert.doesNotMatch(composer, /focus-within:ring-\[3px\]/);
  assert.match(composer, /useReducedMotion\(\)/);
});

test("refinement is explicitly excluded from watches", () => {
  assert.match(architecture, /dedicated `dexter-email-refine` Edge Function/);
  assert.match(architecture, /no Watching for you adapter or idle LLM loop/);
});
