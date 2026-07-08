using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmEvidenceItem
{
    public Guid ClmevidenceId { get; set; }

    public Guid? ClmevidenceIncidentId { get; set; }

    public Guid? ClmevidenceClaimId { get; set; }

    public string ClmevidenceDocumentTypeCode { get; set; } = null!;

    public Guid? ClmevidenceJobDocumentId { get; set; }

    public Guid? ClmevidenceCommMessageId { get; set; }

    public Guid? ClmevidenceAitaskRunId { get; set; }

    public string ClmevidenceTitle { get; set; } = null!;

    public string ClmevidenceSourceCode { get; set; } = null!;

    public string? ClmevidenceFileName { get; set; }

    public string? ClmevidenceFileUrl { get; set; }

    public string? ClmevidenceFileHash { get; set; }

    public DateTime? ClmevidenceCapturedAt { get; set; }

    public DateTime? ClmevidenceVerifiedAt { get; set; }

    public Guid? ClmevidenceVerifiedBy { get; set; }

    public bool ClmevidenceIsRequired { get; set; }

    public bool ClmevidenceIsSensitive { get; set; }

    public string ClmevidenceAiextractionStatusCode { get; set; } = null!;

    public string ClmevidenceAiextractedJson { get; set; } = null!;

    public string ClmevidenceChainOfCustodyJson { get; set; } = null!;

    public string ClmevidenceMetadataJson { get; set; } = null!;

    public DateTime ClmevidenceCreatedAt { get; set; }

    public Guid? ClmevidenceCreatedBy { get; set; }

    public virtual ICollection<ClmSurveyAppointment> ClmSurveyAppointments { get; set; } = new List<ClmSurveyAppointment>();

    public virtual AiTaskRun? ClmevidenceAitaskRun { get; set; }

    public virtual ClmClaim? ClmevidenceClaim { get; set; }

    public virtual CommMessage? ClmevidenceCommMessage { get; set; }

    public virtual CmpUser? ClmevidenceCreatedByNavigation { get; set; }

    public virtual SysClmdocumentType ClmevidenceDocumentTypeCodeNavigation { get; set; } = null!;

    public virtual ClmIncident? ClmevidenceIncident { get; set; }

    public virtual JobDocument? ClmevidenceJobDocument { get; set; }

    public virtual CmpUser? ClmevidenceVerifiedByNavigation { get; set; }
}
