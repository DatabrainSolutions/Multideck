using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceHsclassification
{
    public Guid TceclassId { get; set; }

    public string TceclassStatusCode { get; set; } = null!;

    public Guid? TceclassJobId { get; set; }

    public Guid? TceclassJobCargoId { get; set; }

    public Guid? TceclassCustomerOrgId { get; set; }

    public string? TceclassSourceRecordTypeCode { get; set; }

    public string? TceclassSourceTable { get; set; }

    public Guid? TceclassSourceId { get; set; }

    public string TceclassGoodsDescription { get; set; } = null!;

    public string? TceclassHscode { get; set; }

    public string? TceclassHscodeFormatted { get; set; }

    public string? TceclassNomenclatureCountryCode { get; set; }

    public string? TceclassEccncode { get; set; }

    public string? TceclassControlCode { get; set; }

    public decimal? TceclassConfidenceScore { get; set; }

    public string? TceclassRationale { get; set; }

    public Guid? TceclassAitaskRunId { get; set; }

    public Guid? TceclassReviewedBy { get; set; }

    public DateTime? TceclassReviewedAt { get; set; }

    public DateOnly? TceclassValidFrom { get; set; }

    public DateOnly? TceclassValidTo { get; set; }

    public string TceclassMetadataJson { get; set; } = null!;

    public DateTime TceclassCreatedAt { get; set; }

    public Guid? TceclassCreatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceHsclassificationCandidate> TceHsclassificationCandidates { get; set; } = new List<TceHsclassificationCandidate>();

    public virtual AiTaskRun? TceclassAitaskRun { get; set; }

    public virtual CmpUser? TceclassCreatedByNavigation { get; set; }

    public virtual OrgMaster? TceclassCustomerOrg { get; set; }

    public virtual JobHeader? TceclassJob { get; set; }

    public virtual JobCargo? TceclassJobCargo { get; set; }

    public virtual CmpUser? TceclassReviewedByNavigation { get; set; }

    public virtual SysWorkflowRecordType? TceclassSourceRecordTypeCodeNavigation { get; set; }

    public virtual SysTceclassificationStatus TceclassStatusCodeNavigation { get; set; } = null!;
}
