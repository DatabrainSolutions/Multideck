import {
  bytesToBase64,
  maximumVocabularyTermLength,
  maximumVocabularyTerms,
  normalizeDurationSeconds,
  normalizeMimeType,
  normalizeVocabulary,
  readTranscriptText,
} from "../functions/transcription/contract.ts"

function equal(actual: unknown, expected: unknown, label: string) {
  const received = JSON.stringify(actual)
  const wanted = JSON.stringify(expected)
  if (received !== wanted) throw new Error(`${label}: expected ${wanted}, received ${received}`)
}

Deno.test("transcription vocabulary is trimmed, deduplicated and bounded", () => {
  equal(normalizeVocabulary(["  BOL  1042 ", "bol 1042", "", null, "CFS"]), ["BOL 1042", "CFS"], "normalised terms")

  const longTerm = "x".repeat(maximumVocabularyTermLength + 12)
  equal(normalizeVocabulary([longTerm]), ["x".repeat(maximumVocabularyTermLength)], "term length")

  const manyTerms = Array.from({ length: maximumVocabularyTerms + 12 }, (_, index) => `Term ${index}`)
  equal(normalizeVocabulary(manyTerms).length, maximumVocabularyTerms, "term count")
})

Deno.test("recording duration and MIME validation enforce the server boundary", () => {
  equal(normalizeDurationSeconds("249"), null, "too short")
  equal(normalizeDurationSeconds("250"), 0.25, "minimum duration")
  equal(normalizeDurationSeconds("180000"), 180, "maximum duration")
  equal(normalizeDurationSeconds("180001"), null, "too long")
  equal(normalizeDurationSeconds("not-a-number"), null, "invalid duration")
  equal(normalizeMimeType("audio/wav; codecs=1"), "audio/wav", "WAV MIME")
  equal(normalizeMimeType("text/plain"), "", "unsupported MIME")
})

Deno.test("Gemini transcript text is read from every supported Interactions shape", () => {
  equal(readTranscriptText({ output_text: "  Direct transcript  " }), "Direct transcript", "output text")
  equal(readTranscriptText({
    steps: [{ type: "model_output", content: [{ type: "text", text: "First line" }, { type: "text", text: "Second line" }] }],
  }), "First line\nSecond line", "steps output")
  equal(readTranscriptText({ outputs: [{ type: "text", text: "Fallback output" }] }), "Fallback output", "outputs fallback")
  equal(readTranscriptText({ steps: [{ type: "tool", content: [{ type: "text", text: "Ignore me" }] }] }), "", "non-model output")
})

Deno.test("audio bytes use the base64 shape expected by inline Interactions input", () => {
  equal(bytesToBase64(new Uint8Array([1, 2, 3, 254, 255])), "AQID/v8=", "base64 audio")
})
