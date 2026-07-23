using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocBuilderQaissueType
{
    public string DocbqaitCode { get; set; } = null!;

    public string DocbqaitName { get; set; } = null!;

    public string? DocbqaitDescription { get; set; }

    public string? DocbqaitDefaultSeverityCode { get; set; }

    public int DocbqaitSortOrder { get; set; }

    public bool DocbqaitIsActive { get; set; }

    public DateTime DocbqaitCreatedAt { get; set; }

    public virtual ICollection<DocbTemplateQaissue> DocbTemplateQaissues { get; set; } = new List<DocbTemplateQaissue>();
}
