using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsigRequest
{
    public Guid DocsigreqId { get; set; }

    public Guid? DocsigreqJobDocumentId { get; set; }

    public Guid? DocsigreqGeneratedDocumentId { get; set; }

    public string DocsigreqTargetTable { get; set; } = null!;

    public Guid DocsigreqTargetId { get; set; }

    public Guid? DocsigreqBlid { get; set; }

    public string DocsigreqProviderCode { get; set; } = null!;

    public string? DocsigreqExternalEnvelopeId { get; set; }

    public string DocsigreqStatusCode { get; set; } = null!;

    public string? DocsigreqSubject { get; set; }

    public string? DocsigreqMessage { get; set; }

    public DateTime? DocsigreqExpiresAt { get; set; }

    public DateTime? DocsigreqSentAt { get; set; }

    public DateTime? DocsigreqCompletedAt { get; set; }

    public DateTime? DocsigreqCancelledAt { get; set; }

    public Guid? DocsigreqCancelledBy { get; set; }

    public string? DocsigreqCancellationReason { get; set; }

    public string DocsigreqMetadataJson { get; set; } = null!;

    public DateTime DocsigreqCreatedAt { get; set; }

    public Guid? DocsigreqCreatedBy { get; set; }

    public DateTime DocsigreqUpdatedAt { get; set; }

    public Guid? DocsigreqUpdatedBy { get; set; }

    public virtual ICollection<DocsigEvent> DocsigEvents { get; set; } = new List<DocsigEvent>();

    public virtual ICollection<DocsigField> DocsigFields { get; set; } = new List<DocsigField>();

    public virtual ICollection<DocsigRecipient> DocsigRecipients { get; set; } = new List<DocsigRecipient>();

    public virtual BlHeader? DocsigreqBl { get; set; }

    public virtual CmpUser? DocsigreqCancelledByNavigation { get; set; }

    public virtual CmpUser? DocsigreqCreatedByNavigation { get; set; }

    public virtual DocbGeneratedDocument? DocsigreqGeneratedDocument { get; set; }

    public virtual JobDocument? DocsigreqJobDocument { get; set; }

    public virtual SysDocumentSignatureStatus DocsigreqStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? DocsigreqUpdatedByNavigation { get; set; }
}
