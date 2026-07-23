using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class DocsigRequestSummary
{
    public Guid? DocsigreqId { get; set; }

    public string? DocsigreqTargetTable { get; set; }

    public Guid? DocsigreqTargetId { get; set; }

    public Guid? DocsigreqBlid { get; set; }

    public string? Blnumber { get; set; }

    public Guid? DocsigreqJobDocumentId { get; set; }

    public string? JobDocumentTitle { get; set; }

    public Guid? DocsigreqGeneratedDocumentId { get; set; }

    public string? GeneratedFileName { get; set; }

    public string? DocsigreqProviderCode { get; set; }

    public string? DocsigreqExternalEnvelopeId { get; set; }

    public string? DocsigreqStatusCode { get; set; }

    public string? StatusName { get; set; }

    public bool? StatusIsFinal { get; set; }

    public bool? StatusIsSuccessful { get; set; }

    public string? DocsigreqSubject { get; set; }

    public DateTime? DocsigreqExpiresAt { get; set; }

    public DateTime? DocsigreqSentAt { get; set; }

    public DateTime? DocsigreqCompletedAt { get; set; }

    public int? RecipientCount { get; set; }

    public int? SignedRecipientCount { get; set; }

    public int? SignatureFieldCount { get; set; }
}
