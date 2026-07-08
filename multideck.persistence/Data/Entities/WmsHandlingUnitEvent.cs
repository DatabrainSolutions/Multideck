using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsHandlingUnitEvent
{
    public Guid WmshueventId { get; set; }

    public Guid WmshueventHuId { get; set; }

    public string WmshueventEventTypeCode { get; set; } = null!;

    public DateTime WmshueventEventAt { get; set; }

    public Guid? WmshueventLocationId { get; set; }

    public Guid? WmshueventOrderId { get; set; }

    public Guid? WmshueventJobId { get; set; }

    public string? WmshueventNotes { get; set; }

    public string WmshueventMetadataJson { get; set; } = null!;

    public Guid? WmshueventCreatedBy { get; set; }

    public virtual CmpUser? WmshueventCreatedByNavigation { get; set; }

    public virtual WmsHandlingUnit WmshueventHu { get; set; } = null!;

    public virtual JobHeader? WmshueventJob { get; set; }

    public virtual WmsLocation? WmshueventLocation { get; set; }
}
