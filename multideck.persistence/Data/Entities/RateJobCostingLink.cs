using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateJobCostingLink
{
    public Guid RatejobCostLinkId { get; set; }

    public Guid? RatejobCostLinkRequestId { get; set; }

    public Guid RatejobCostLinkResultId { get; set; }

    public Guid? RatejobCostLinkResultLineId { get; set; }

    public Guid RatejobCostLinkJobId { get; set; }

    public Guid? RatejobCostLinkChargeInId { get; set; }

    public Guid? RatejobCostLinkChargeOutId { get; set; }

    public string RatejobCostLinkLinkType { get; set; } = null!;

    public DateTime RatejobCostLinkCreatedAt { get; set; }

    public Guid? RatejobCostLinkCreatedBy { get; set; }

    public virtual JobCostingChargesIn? RatejobCostLinkChargeIn { get; set; }

    public virtual JobCostingChargesOut? RatejobCostLinkChargeOut { get; set; }

    public virtual CmpUser? RatejobCostLinkCreatedByNavigation { get; set; }

    public virtual JobHeader RatejobCostLinkJob { get; set; } = null!;

    public virtual RateRateRequest? RatejobCostLinkRequest { get; set; }

    public virtual RateRateResult RatejobCostLinkResult { get; set; } = null!;

    public virtual RateRateResultLine? RatejobCostLinkResultLine { get; set; }
}
