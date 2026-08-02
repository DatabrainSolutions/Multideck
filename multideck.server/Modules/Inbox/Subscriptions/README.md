# Inbox provider subscriptions

Provider notifications reduce perceived sync latency; they are not the source of truth. The normal Gmail history and Microsoft Graph delta workers continue polling every connected mailbox, and Microsoft delegated shared mailboxes intentionally use polling because delegated shared-mailbox change notifications are not supported.

Each tenant deployment runs `InboxProviderSubscriptionWorker` when `Inbox:EnableWorkers` is enabled. It:

- provisions and renews a Gmail `users.watch` lease for the connected personal mailbox;
- creates and renews Microsoft Graph message subscriptions for personal mailboxes;
- stores Microsoft `clientState` only in that tenant's Supabase Vault;
- revokes local leases and Vault client state when connections or mailboxes become inactive;
- purges expired, consumed, and abandoned OAuth/PKCE state at most once per day.

Provider-console setup remains tenant-specific. Google requires a Pub/Sub topic that grants Gmail publish access plus a push subscription pointed at `email-webhook?provider=gmail`. Configure the same full subscription name in `Inbox:Google:PubSubSubscriptionName` and `GMAIL_PUBSUB_SUBSCRIPTION`. Microsoft requires the exact deployed HTTPS `email-webhook?provider=outlook` URL in `Inbox:Microsoft:WebhookNotificationUrl`; Graph validates it during subscription creation.

No provider credentials belong in source control. Configure each tenant's topic, subscription, webhook, OAuth application, and Edge Function secrets independently. Keep the polling worker enabled even after notifications have been verified live.
