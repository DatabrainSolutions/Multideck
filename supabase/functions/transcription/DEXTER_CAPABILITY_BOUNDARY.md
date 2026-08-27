# Dexter capability boundary

App-wide dictation is an input-assistance capability, not a Multideck business-data domain.

- Dexter does not receive recordings, transcript history, microphone identifiers, custom vocabulary, or allowance values.
- Audio and transcript text are not persisted by Multideck.
- Dexter must direct an operator to **Settings → Dexter → Transcription** when asked to change dictation settings.
- There is no allowlisted Dexter write action because the browser owns the selected text field and the operator reviews the inserted text in place.
- There is no **Watching for you** adapter because dictation has no meaningful operational record-change event to watch. Usage enforcement is request-driven and makes no recurring LLM calls.
