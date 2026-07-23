using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsPackTask
{
    public Guid WmspackId { get; set; }

    public Guid? WmspackTaskId { get; set; }

    public Guid WmspackOrderId { get; set; }

    public Guid? WmspackHuId { get; set; }

    public string WmspackStatusCode { get; set; } = null!;

    public DateTime? WmspackPackedAt { get; set; }

    public Guid? WmspackPackedBy { get; set; }

    public string? WmspackNotes { get; set; }

    public virtual WmsHandlingUnit? WmspackHu { get; set; }

    public virtual WmsOrder WmspackOrder { get; set; } = null!;

    public virtual CmpUser? WmspackPackedByNavigation { get; set; }

    public virtual WmsTask? WmspackTask { get; set; }
}
