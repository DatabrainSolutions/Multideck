using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAiinsightRule
{
    public Guid FinairuleId { get; set; }

    public string FinairuleCode { get; set; } = null!;

    public string FinairuleName { get; set; } = null!;

    public string FinairuleInsightTypeCode { get; set; } = null!;

    public string FinairuleStatusCode { get; set; } = null!;

    public string FinairuleTriggerJson { get; set; } = null!;

    public string FinairuleScoringJson { get; set; } = null!;

    public string FinairuleActionJson { get; set; } = null!;

    public decimal FinairuleMinConfidenceScore { get; set; }

    public bool FinairuleIsHumanReviewRequired { get; set; }

    public DateTime FinairuleCreatedAt { get; set; }

    public Guid? FinairuleCreatedBy { get; set; }

    public virtual ICollection<FinAiinsight> FinAiinsights { get; set; } = new List<FinAiinsight>();

    public virtual CmpUser? FinairuleCreatedByNavigation { get; set; }

    public virtual SysFinanceInsightType FinairuleInsightTypeCodeNavigation { get; set; } = null!;
}
