using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCustomsTransportMode
{
    public string CtmCode { get; set; } = null!;

    public string CtmName { get; set; } = null!;

    public string? CtmDescription { get; set; }

    public int CtmSortOrder { get; set; }

    public bool CtmIsActive { get; set; }

    public DateTime CtmCreatedAt { get; set; }

    public virtual ICollection<CdsTransport> CdsTransports { get; set; } = new List<CdsTransport>();

    public virtual ICollection<SysJobTransportMode> SysJobTransportModes { get; set; } = new List<SysJobTransportMode>();

    public virtual ICollection<T1Transport> T1Transports { get; set; } = new List<T1Transport>();
}
