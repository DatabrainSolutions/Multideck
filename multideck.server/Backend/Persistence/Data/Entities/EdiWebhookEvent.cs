using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiWebhookEvent
{
    public Guid EdiwebhookId { get; set; }

    public Guid? EdiwebhookConnectionId { get; set; }

    public Guid? EdiwebhookServiceProviderId { get; set; }

    public Guid? EdiwebhookMessageId { get; set; }

    public string? EdiwebhookProviderEventId { get; set; }

    public string? EdiwebhookEventType { get; set; }

    public string EdiwebhookStatusCode { get; set; } = null!;

    public string EdiwebhookRawHeadersJson { get; set; } = null!;

    public string EdiwebhookRawPayloadJson { get; set; } = null!;

    public DateTime EdiwebhookReceivedAt { get; set; }

    public DateTime? EdiwebhookProcessedAt { get; set; }

    public string? EdiwebhookErrorText { get; set; }

    public virtual EdiConnection? EdiwebhookConnection { get; set; }

    public virtual EdiMessage? EdiwebhookMessage { get; set; }

    public virtual EdiServiceProvider? EdiwebhookServiceProvider { get; set; }

    public virtual SysEdimessageStatus EdiwebhookStatusCodeNavigation { get; set; } = null!;
}
