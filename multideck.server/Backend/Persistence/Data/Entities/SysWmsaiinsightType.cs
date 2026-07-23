using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsaiinsightType
{
    public string WmsaiinsightTypeCode { get; set; } = null!;

    public string WmsaiinsightTypeName { get; set; } = null!;

    public string? WmsaiinsightTypeDescription { get; set; }

    public bool WmsaiinsightTypeIsActionable { get; set; }

    public bool WmsaiinsightTypeIsActive { get; set; }

    public int WmsaiinsightTypeSortOrder { get; set; }

    public virtual ICollection<WmsAiinsight> WmsAiinsights { get; set; } = new List<WmsAiinsight>();
}
