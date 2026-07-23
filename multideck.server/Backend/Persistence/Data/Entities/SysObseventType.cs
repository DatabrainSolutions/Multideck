using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysObseventType
{
    public string ObseventTypeCode { get; set; } = null!;

    public string ObseventTypeName { get; set; } = null!;

    public string? ObseventTypeDescription { get; set; }

    public bool ObseventTypeIsActive { get; set; }

    public int ObseventTypeSortOrder { get; set; }

    public virtual ICollection<ObsIntegrationEvent> ObsIntegrationEvents { get; set; } = new List<ObsIntegrationEvent>();
}
