using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAccountSegmentation
{
    public Guid CrmaccountSegmentId { get; set; }

    public Guid CrmaccountSegmentAccountId { get; set; }

    public string CrmaccountSegmentSegmentType { get; set; } = null!;

    public string CrmaccountSegmentSegmentValue { get; set; } = null!;

    public decimal? CrmaccountSegmentConfidence { get; set; }

    public string? CrmaccountSegmentSource { get; set; }

    public bool CrmaccountSegmentIsActive { get; set; }

    public DateTime CrmaccountSegmentCreatedAt { get; set; }

    public virtual CrmAccountProfile CrmaccountSegmentAccount { get; set; } = null!;
}
