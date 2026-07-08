using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsOrderReference
{
    public Guid WmsorderRefId { get; set; }

    public Guid WmsorderRefOrderId { get; set; }

    public string WmsorderRefTypeCode { get; set; } = null!;

    public string WmsorderRefValue { get; set; } = null!;

    public string? WmsorderRefSourceSystem { get; set; }

    public bool WmsorderRefIsPrimary { get; set; }

    public DateTime WmsorderRefCreatedAt { get; set; }

    public virtual WmsOrder WmsorderRefOrder { get; set; } = null!;
}
