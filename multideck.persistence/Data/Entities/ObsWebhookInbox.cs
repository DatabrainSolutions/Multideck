using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsWebhookInbox
{
    public Guid ObswebhookId { get; set; }

    public string? ObswebhookModuleCode { get; set; }

    public string? ObswebhookProviderCode { get; set; }

    public string? ObswebhookEventType { get; set; }

    public string ObswebhookStatusCode { get; set; } = null!;

    public string? ObswebhookExternalEventId { get; set; }

    public bool? ObswebhookSignatureVerified { get; set; }

    public Guid? ObswebhookCredentialId { get; set; }

    public DateTime ObswebhookReceivedAt { get; set; }

    public DateTime? ObswebhookProcessedAt { get; set; }

    public string? ObswebhookPayloadHashSha256 { get; set; }

    public string ObswebhookPayloadSummaryJson { get; set; } = null!;

    public string? ObswebhookErrorMessage { get; set; }

    public virtual SecCredentialReference? ObswebhookCredential { get; set; }

    public virtual SysSubmoduleCode? ObswebhookModuleCodeNavigation { get; set; }

    public virtual SysObsqueueStatus ObswebhookStatusCodeNavigation { get; set; } = null!;
}
