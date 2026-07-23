using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCommissionItem
{
    public Guid FincommItemId { get; set; }

    public Guid FincommItemRunId { get; set; }

    public Guid? FincommItemSchemeId { get; set; }

    public Guid? FincommItemRuleId { get; set; }

    public Guid? FincommItemUserId { get; set; }

    public Guid? FincommItemJobId { get; set; }

    public Guid? FincommItemDocumentId { get; set; }

    public decimal FincommItemBasisAmount { get; set; }

    public decimal FincommItemCommissionAmount { get; set; }

    public string FincommItemStatusCode { get; set; } = null!;

    public virtual ICollection<FinCommissionAdjustment> FinCommissionAdjustments { get; set; } = new List<FinCommissionAdjustment>();

    public virtual FinDocument? FincommItemDocument { get; set; }

    public virtual JobHeader? FincommItemJob { get; set; }

    public virtual FinCommissionRule? FincommItemRule { get; set; }

    public virtual FinCommissionRun FincommItemRun { get; set; } = null!;

    public virtual FinCommissionScheme? FincommItemScheme { get; set; }

    public virtual CmpUser? FincommItemUser { get; set; }
}
