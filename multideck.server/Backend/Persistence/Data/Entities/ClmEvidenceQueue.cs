using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmEvidenceQueue
{
    public Guid? ClmevidenceId { get; set; }

    public Guid? ClmevidenceIncidentId { get; set; }

    public string? ClmincidentNumber { get; set; }

    public Guid? ClmevidenceClaimId { get; set; }

    public string? ClmclaimNumber { get; set; }

    public string? ClmevidenceDocumentTypeCode { get; set; }

    public string? ClmdocumentTypeName { get; set; }

    public string? ClmevidenceTitle { get; set; }

    public string? ClmevidenceSourceCode { get; set; }

    public string? ClmevidenceFileName { get; set; }

    public bool? ClmevidenceIsRequired { get; set; }

    public bool? ClmevidenceIsSensitive { get; set; }

    public string? ClmevidenceAiextractionStatusCode { get; set; }

    public DateTime? ClmevidenceCapturedAt { get; set; }

    public DateTime? ClmevidenceVerifiedAt { get; set; }

    public DateTime? ClmevidenceCreatedAt { get; set; }
}
