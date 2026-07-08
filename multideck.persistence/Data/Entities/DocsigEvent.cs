using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsigEvent
{
    public Guid DocsigeId { get; set; }

    public Guid DocsigeRequestId { get; set; }

    public Guid? DocsigeRecipientId { get; set; }

    public string DocsigeEventType { get; set; } = null!;

    public string? DocsigeStatusCode { get; set; }

    public string? DocsigeProviderEventId { get; set; }

    public DateTime DocsigeEventAt { get; set; }

    public string? DocsigeIpaddressHashSha256 { get; set; }

    public string? DocsigeUserAgent { get; set; }

    public string? DocsigeMessage { get; set; }

    public string DocsigeMetadataJson { get; set; } = null!;

    public virtual DocsigRecipient? DocsigeRecipient { get; set; }

    public virtual DocsigRequest DocsigeRequest { get; set; } = null!;

    public virtual SysDocumentSignatureStatus? DocsigeStatusCodeNavigation { get; set; }
}
