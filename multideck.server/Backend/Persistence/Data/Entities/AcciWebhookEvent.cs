using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciWebhookEvent
{
    public Guid AcciwhId { get; set; }

    public Guid? AcciwhConnectionId { get; set; }

    public string AcciwhProviderCode { get; set; } = null!;

    public string AcciwhEventType { get; set; } = null!;

    public string? AcciwhExternalObjectType { get; set; }

    public string? AcciwhExternalId { get; set; }

    public bool AcciwhSignatureVerified { get; set; }

    public string AcciwhProcessingStatusCode { get; set; } = null!;

    public string AcciwhRawPayloadJson { get; set; } = null!;

    public DateTime AcciwhReceivedAt { get; set; }

    public DateTime? AcciwhProcessedAt { get; set; }

    public string? AcciwhErrorMessage { get; set; }

    public virtual AcciConnection? AcciwhConnection { get; set; }

    public virtual SysAccountingSyncStatus AcciwhProcessingStatusCodeNavigation { get; set; } = null!;

    public virtual SysAccountingProvider AcciwhProviderCodeNavigation { get; set; } = null!;
}
