using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinKpirecommendation
{
    public Guid FinkpirecId { get; set; }

    public Guid? FinkpirecAiinsightId { get; set; }

    public string FinkpirecKpicode { get; set; } = null!;

    public string FinkpirecTitle { get; set; } = null!;

    public string FinkpirecDescription { get; set; } = null!;

    public string FinkpirecMeasureDefinitionJson { get; set; } = null!;

    public string FinkpirecTargetAudienceCode { get; set; } = null!;

    public string? FinkpirecTargetTable { get; set; }

    public Guid? FinkpirecTargetId { get; set; }

    public int FinkpirecPriority { get; set; }

    public string FinkpirecStatusCode { get; set; } = null!;

    public DateTime FinkpirecCreatedAt { get; set; }

    public Guid? FinkpirecCreatedBy { get; set; }

    public virtual FinAiinsight? FinkpirecAiinsight { get; set; }

    public virtual CmpUser? FinkpirecCreatedByNavigation { get; set; }
}
