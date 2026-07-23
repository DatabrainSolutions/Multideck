using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdieventType
{
    public string EdieventTypeCode { get; set; } = null!;

    public string EdieventTypeName { get; set; } = null!;

    public string? EdieventTypeDescription { get; set; }

    public bool EdieventTypeIsActive { get; set; }

    public int EdieventTypeSortOrder { get; set; }

    public virtual ICollection<EdiProcessingEvent> EdiProcessingEvents { get; set; } = new List<EdiProcessingEvent>();
}
