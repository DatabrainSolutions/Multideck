using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TcePreferenceClaim
{
    public Guid TceprefId { get; set; }

    public string TceprefStatusCode { get; set; } = null!;

    public Guid? TceprefJobId { get; set; }

    public Guid? TceprefJobCargoId { get; set; }

    public Guid? TceprefFtaid { get; set; }

    public Guid? TceprefOriginId { get; set; }

    public Guid? TceprefOriginRuleId { get; set; }

    public string? TceprefHscode { get; set; }

    public string? TceprefOriginCountryCode { get; set; }

    public string? TceprefDestinationCountryCode { get; set; }

    public decimal? TceprefDutyRateStandardPercent { get; set; }

    public decimal? TceprefDutyRatePreferencePercent { get; set; }

    public decimal? TceprefEstimatedDutySavingAmount { get; set; }

    public string TceprefCurrencyCodeSnapshot { get; set; } = null!;

    public Guid? TceprefEvidenceDocumentId { get; set; }

    public string? TceprefRationale { get; set; }

    public Guid? TceprefAitaskRunId { get; set; }

    public Guid? TceprefReviewedBy { get; set; }

    public DateTime? TceprefReviewedAt { get; set; }

    public string TceprefMetadataJson { get; set; } = null!;

    public DateTime TceprefCreatedAt { get; set; }

    public Guid? TceprefCreatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual AiTaskRun? TceprefAitaskRun { get; set; }

    public virtual CmpUser? TceprefCreatedByNavigation { get; set; }

    public virtual JobDocument? TceprefEvidenceDocument { get; set; }

    public virtual TceFtaagreement? TceprefFta { get; set; }

    public virtual JobHeader? TceprefJob { get; set; }

    public virtual JobCargo? TceprefJobCargo { get; set; }

    public virtual TceOriginDeclaration? TceprefOrigin { get; set; }

    public virtual TceOriginRule? TceprefOriginRule { get; set; }

    public virtual CmpUser? TceprefReviewedByNavigation { get; set; }

    public virtual SysTceftacheckStatus TceprefStatusCodeNavigation { get; set; } = null!;
}
