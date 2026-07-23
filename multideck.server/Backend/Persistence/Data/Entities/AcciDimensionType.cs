using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciDimensionType
{
    public string AccidtCode { get; set; } = null!;

    public string AccidtName { get; set; } = null!;

    public string? AccidtDescription { get; set; }

    public int AccidtSortOrder { get; set; }

    public bool AccidtIsActive { get; set; }

    public DateTime AccidtCreatedAt { get; set; }

    public virtual ICollection<AcciDimensionMapping> AcciDimensionMappings { get; set; } = new List<AcciDimensionMapping>();
}
