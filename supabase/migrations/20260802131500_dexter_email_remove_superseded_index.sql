-- The private combined search-document index supersedes the body-only message index.
drop index if exists public."IX_Comm_Messages_dexter_email_search";
