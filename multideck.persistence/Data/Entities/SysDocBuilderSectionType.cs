using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderSectionType
{
    public string DocbsectCode { get; set; } = null!;

    public string DocbsectName { get; set; } = null!;

    public string? DocbsectDescription { get; set; }

    public bool DocbsectIsRepeating { get; set; }

    public int DocbsectSortOrder { get; set; }

    public bool DocbsectIsActive { get; set; }

    public DateTime DocbsectCreatedAt { get; set; }

    public virtual ICollection<DocbSectionDefinition> DocbSectionDefinitions { get; set; } = new List<DocbSectionDefinition>();
}
