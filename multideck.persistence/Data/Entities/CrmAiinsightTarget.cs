using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAiinsightTarget
{
    public Guid CrmaitargetId { get; set; }

    public Guid CrmaitargetAiinsightId { get; set; }

    public string CrmaitargetTargetTable { get; set; } = null!;

    public Guid CrmaitargetTargetId { get; set; }

    public string? CrmaitargetTargetRole { get; set; }

    public decimal? CrmaitargetImpactAmount { get; set; }

    public string? CrmaitargetCurrencyCode { get; set; }

    public DateTime CrmaitargetCreatedAt { get; set; }

    public virtual CrmAiinsight CrmaitargetAiinsight { get; set; } = null!;
}
