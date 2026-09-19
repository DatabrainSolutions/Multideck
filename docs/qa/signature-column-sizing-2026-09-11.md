# Signature column and image sizing

Local implementation from the resize side conversation. No backend deployment or tenant data changes were made here.

- Rows support optional `columnWidths` percentages. Existing layouts default to equal columns; validation constrains two-column splits to 20–80%.
- Each email row renders its own fixed-layout table, so different rows retain independent proportions.
- Column dividers support pointer resizing, common-ratio snapping, arrow keys, Shift for larger steps, Home/End, and percentage feedback.
- Images have corner resize handles and keyboard sizing. Increasing image width expands its column within the available signature width. Aspect ratio is preserved.
- Pointer movement uses a transient preview; release creates one undo entry and one document update. Escape/pointer cancellation discards the gesture. A concurrent document update prevents the gesture from overwriting newer content.
- Chrome component preview: keyboard split 50→55, undo→50; pointer drag→75; image keyboard resize 120→130. This preview does not save tenant data.
- Both focused shared sizing tests passed. The initial full client build passed. Later broader checks were blocked by concurrent changes: a syntax error in `src/pages/signature-team-page.tsx`, and duplicate-property type errors in `supabase/functions/inbox-api/signatures.ts` around `profileValues`. Those unrelated edits were not changed or bypassed.

Release dependency: deploy the updated shared `email-signatures.ts` contract with every signature-consuming Edge Function before claiming connected persistence/delivery of column widths. Older deployed validators discard the new width property. This side conversation deliberately did not deploy over the main task's ongoing changes.
