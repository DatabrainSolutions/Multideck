using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDataCaptureResponse
{
    public Guid CrmdataCapRespId { get; set; }

    public Guid CrmdataCapRespSessionId { get; set; }

    public Guid CrmdataCapRespFieldDefId { get; set; }

    public string? CrmdataCapRespValueText { get; set; }

    public string? CrmdataCapRespValueJson { get; set; }

    public decimal? CrmdataCapRespConfidenceScore { get; set; }

    public bool CrmdataCapRespIsConfirmed { get; set; }

    public Guid? CrmdataCapRespFieldUpdateId { get; set; }

    public DateTime CrmdataCapRespCapturedAt { get; set; }

    public Guid? CrmdataCapRespCapturedBy { get; set; }

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual CmpUser? CrmdataCapRespCapturedByNavigation { get; set; }

    public virtual CrmAutomationFieldDefinition CrmdataCapRespFieldDef { get; set; } = null!;

    public virtual CrmFieldUpdateQueue? CrmdataCapRespFieldUpdate { get; set; }

    public virtual CrmDataCaptureSession CrmdataCapRespSession { get; set; } = null!;
}
